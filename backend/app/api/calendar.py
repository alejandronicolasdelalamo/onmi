from datetime import date, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from pydantic import ValidationError
from sqlalchemy import or_

from ..extensions import db
from ..models import CalendarEvent, CalendarShare, EventLog, Friendship, User
from ..openapi import doc
from ..schemas import CalendarEventIn, CalendarSharingIn, EventDayIn
from ..services import buddies as buddies_svc
from ..services import calendar as svc
from ..utils import ApiError, client_today, current_user, get_owned, parse_body

bp = Blueprint("calendar", __name__, url_prefix="/api/calendar")


def _range() -> tuple[date, date]:
    """`?from=&to=` (por defecto, el mes en curso). Máximo un trimestre."""
    today = client_today()
    try:
        start = date.fromisoformat(request.args["from"]) if "from" in request.args else today.replace(day=1)
        end = date.fromisoformat(request.args["to"]) if "to" in request.args else start + timedelta(days=30)
    except ValueError as exc:
        raise ApiError("Dates must be YYYY-MM-DD", 422, "validation_error") from exc
    if end < start or (end - start).days > svc.MAX_RANGE_DAYS:
        raise ApiError(f"The range must be between 0 and {svc.MAX_RANGE_DAYS} days", 422, "invalid_range")
    return start, end


def _logs_for(events: list[CalendarEvent], start: date, end: date) -> dict[int, dict[date, str]]:
    """Marcas de los eventos; se amplían a semanas completas para contar bien los «N días por semana»."""
    if not events:
        return {}
    rows = db.session.scalars(
        db.select(EventLog).where(
            EventLog.event_id.in_([e.id for e in events]),
            EventLog.day >= svc.monday(start),
            EventLog.day <= svc.monday(end) + timedelta(days=6),
        )
    ).all()
    return svc.log_map(rows)


def _validated(payload: dict) -> CalendarEventIn:
    try:
        return CalendarEventIn.model_validate(payload).check()
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        raise ApiError("Invalid data", 422, "validation_error", details) from exc
    except ValueError as exc:
        raise ApiError("Invalid data", 422, "validation_error", [{"field": "repeat", "message": str(exc)}]) from exc


def _apply(event: CalendarEvent, data: CalendarEventIn) -> None:
    event.title = data.title
    event.notes = data.notes
    event.color = data.color
    event.start_date = data.start_date
    event.start_time = data.start_time
    event.duration_min = data.duration_min if data.start_time else None
    event.repeat = data.repeat
    event.weekdays = ",".join(str(d) for d in data.weekdays) if data.repeat == "weekdays" else ""
    event.per_week = data.per_week if data.repeat == "weekly_count" else None
    event.every_weeks = data.every_weeks if data.repeat == "weekdays" else 1
    event.until = data.until if data.repeat != "none" else None
    event.shared = data.shared


def _not_demo(user: User) -> None:
    if user.is_demo:
        raise ApiError("The demo account cannot share its calendar", 403, "forbidden")


def _accepted_buddies(user: User) -> list[User]:
    rels = db.session.scalars(
        db.select(Friendship).where(
            Friendship.status == "accepted", or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)
        )
    ).all()
    users = (db.session.get(User, r.other_id(user.id)) for r in rels)
    return sorted((u for u in users if u and u.is_active), key=lambda u: u.name.lower())


@bp.get("")
@jwt_required()
@doc(
    "Mi calendario: eventos y sus ocurrencias en un rango",
    "Calendar",
    description="`from` y `to` (YYYY-MM-DD, máximo 93 días). Los eventos repetidos se expanden en `occurrences`.",
)
def my_calendar():
    user = current_user()
    start, end = _range()
    events = db.session.scalars(
        db.select(CalendarEvent).filter_by(user_id=user.id).order_by(CalendarEvent.start_date, CalendarEvent.id)
    ).all()
    logs = _logs_for(events, start, end)
    items = []
    for e in events:
        items += svc.occurrences(e, start, end, logs.get(e.id, {}))
    items.sort(key=lambda o: (o["day"], o["start_time"] or "", o["title"].lower()))
    return jsonify({"events": [e.to_dict() for e in events], "occurrences": items})


@bp.post("/events")
@jwt_required()
@doc("Crear evento", "Calendar", body=CalendarEventIn)
def create_event():
    user = current_user()
    data = _validated(parse_body(CalendarEventIn).model_dump())
    event = CalendarEvent(user_id=user.id)
    _apply(event, data)
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@bp.patch("/events/<int:event_id>")
@jwt_required()
@doc("Editar evento (parcial)", "Calendar")
def update_event(event_id):
    user = current_user()
    event = get_owned(CalendarEvent, event_id, user)
    patch = request.get_json(silent=True)
    if not isinstance(patch, dict):
        raise ApiError("The body must be a JSON object", 400, "invalid_body")
    if extra := set(patch) - set(CalendarEventIn.model_fields):
        raise ApiError(
            "Invalid data", 422, "validation_error", [{"field": f, "message": "Unknown field"} for f in sorted(extra)]
        )
    merged = {**event.to_dict(), **patch}
    merged.pop("id", None)
    _apply(event, _validated(merged))
    db.session.commit()
    return jsonify(event.to_dict())


@bp.delete("/events/<int:event_id>")
@jwt_required()
@doc("Borrar evento (y todas sus repeticiones)", "Calendar")
def delete_event(event_id):
    event = get_owned(CalendarEvent, event_id, current_user())
    db.session.delete(event)
    db.session.commit()
    return jsonify({"ok": True})


@bp.put("/events/<int:event_id>/days/<day>")
@jwt_required()
@doc(
    "Marcar un día de un evento como hecho, saltado o sin marca",
    "Calendar",
    body=EventDayIn,
    description="`status`: `done`, `skipped` (ese día no cuenta) o `null` para quitar la marca.",
)
def mark_day(event_id, day):
    event = get_owned(CalendarEvent, event_id, current_user())
    try:
        when = date.fromisoformat(day)
    except ValueError as exc:
        raise ApiError("The day must be YYYY-MM-DD", 422, "validation_error") from exc
    if when < event.start_date:
        raise ApiError("That day is before the event starts", 422, "validation_error")
    data = parse_body(EventDayIn)
    log = db.session.scalar(db.select(EventLog).filter_by(event_id=event.id, day=when))
    if data.status is None:
        if log:
            db.session.delete(log)
    elif log:
        log.status = data.status
    else:
        db.session.add(EventLog(event_id=event.id, day=when, status=data.status))
    db.session.commit()
    return jsonify({"ok": True})


@bp.get("/sharing")
@jwt_required()
@doc(
    "Con quién comparto mi calendario y quién comparte el suyo conmigo",
    "Calendar",
    description="Solo se puede compartir con compañeros ya aceptados.",
)
def sharing():
    user = current_user()
    given = set(db.session.scalars(db.select(CalendarShare.viewer_id).filter_by(owner_id=user.id)).all())
    buddies = _accepted_buddies(user)
    mine = {b.id for b in buddies}
    incoming = db.session.scalars(db.select(CalendarShare.owner_id).filter_by(viewer_id=user.id)).all()
    owners = (db.session.get(User, i) for i in incoming if i in mine)
    return jsonify(
        {
            "buddies": [{"user": buddies_svc.public_user(b), "shared": b.id in given} for b in buddies],
            "shared_with_me": [buddies_svc.public_user(o) for o in owners if o and o.is_active],
        }
    )


@bp.put("/sharing")
@jwt_required()
@doc(
    "Elegir con quién comparto mi calendario (sustituye la lista)",
    "Calendar",
    body=CalendarSharingIn,
    description="Lista vacía = no lo comparto con nadie. Cada persona ve solo los eventos marcados como compartidos.",
)
def set_sharing():
    user = current_user()
    _not_demo(user)
    data = parse_body(CalendarSharingIn)
    allowed = {b.id for b in _accepted_buddies(user)}
    wanted = set(data.user_ids)
    if not wanted <= allowed:
        raise ApiError("Buddy not found", 404, "not_found")
    current = {s.viewer_id: s for s in db.session.scalars(db.select(CalendarShare).filter_by(owner_id=user.id))}
    for viewer_id, share in current.items():
        if viewer_id not in wanted:
            db.session.delete(share)
    for viewer_id in wanted - set(current):
        db.session.add(CalendarShare(owner_id=user.id, viewer_id=viewer_id))
    db.session.commit()
    return jsonify({"ok": True, "user_ids": sorted(wanted)})


@bp.get("/shared")
@jwt_required()
@doc(
    "Calendarios que mis compañeros comparten conmigo",
    "Calendar",
    description="Solo eventos marcados como compartidos; sin notas. Deja de verse si la amistad se rompe.",
)
def shared_with_me():
    user = current_user()
    start, end = _range()
    buddies = {b.id for b in _accepted_buddies(user)}
    owners = db.session.scalars(db.select(CalendarShare.owner_id).filter_by(viewer_id=user.id)).all()
    people = []
    for owner_id in sorted(set(owners) & buddies):
        owner = db.session.get(User, owner_id)
        events = db.session.scalars(
            db.select(CalendarEvent).filter_by(user_id=owner_id, shared=True).order_by(CalendarEvent.id)
        ).all()
        logs = _logs_for(events, start, end)
        items = []
        for e in events:
            items += svc.occurrences(e, start, end, logs.get(e.id, {}), with_notes=False)
        items.sort(key=lambda o: (o["day"], o["start_time"] or "", o["title"].lower()))
        people.append({"user": buddies_svc.public_user(owner), "occurrences": items})
    return jsonify({"people": people})
