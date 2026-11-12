from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from pydantic import ValidationError
from sqlalchemy import or_

from ..extensions import db
from ..models import (
    Calendar,
    CalendarEvent,
    CalendarViewer,
    EventLog,
    Friendship,
    Goal,
    Habit,
    HabitLog,
    MoodEntry,
    PomodoroSession,
    Project,
    User,
)
from ..openapi import doc
from ..schemas import CalendarEventIn, CalendarIn, CalendarPatch, EventDayIn
from ..services import buddies as buddies_svc
from ..services import calendar as svc
from ..services import calendars as cals
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
        field = getattr(exc, "field", "repeat")
        raise ApiError("Invalid data", 422, "validation_error", [{"field": field, "message": str(exc)}]) from exc


def _apply(event: CalendarEvent, data: CalendarEventIn, calendar: Calendar) -> None:
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
    event.calendar_id = calendar.id
    event.calendar = calendar


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


def _calendar_dict(cal: Calendar) -> dict:
    viewers = [db.session.get(User, v.viewer_id) for v in cal.viewers]
    return {
        "id": cal.id,
        "name": cal.name,
        "color": cal.color,
        "is_default": cal.is_default,
        "events": len(cal.events),
        "viewers": [buddies_svc.public_user(u) for u in viewers if u and u.is_active],
    }


def _owned_calendar(calendar_id: int, user: User) -> Calendar:
    cal = get_owned(Calendar, calendar_id, user)
    return cal


def _check_viewers(user: User, ids: list[int]) -> list[int]:
    allowed = {b.id for b in _accepted_buddies(user)}
    wanted = list(dict.fromkeys(ids))
    if not set(wanted) <= allowed:
        raise ApiError("Buddy not found", 404, "not_found")
    return wanted


def _event_calendar(user: User, calendar_id: int | None) -> Calendar:
    personal = cals.ensure_personal(user)
    if calendar_id is None or calendar_id == personal.id:
        return personal
    return _owned_calendar(calendar_id, user)


# ---- mi calendario (todos mis calendarios) ------------------------------------------------------------------
@bp.get("")
@jwt_required()
@doc(
    "Mi calendario: eventos y sus ocurrencias en un rango",
    "Calendar",
    description="`from` y `to` (YYYY-MM-DD, máximo 93 días). Incluye los eventos de todos mis calendarios; los "
    "repetidos se expanden en `occurrences`. `calendars` lista mis calendarios.",
)
def my_calendar():
    user = current_user()
    cals.ensure_personal(user)
    db.session.commit()
    start, end = _range()
    events = db.session.scalars(
        db.select(CalendarEvent).filter_by(user_id=user.id).order_by(CalendarEvent.start_date, CalendarEvent.id)
    ).all()
    logs = _logs_for(events, start, end)
    items = []
    for e in events:
        items += svc.occurrences(e, start, end, logs.get(e.id, {}))
    items.sort(key=lambda o: (o["day"], o["start_time"] or "", o["title"].lower()))
    return jsonify(
        {
            "events": [e.to_dict() for e in events],
            "occurrences": items,
            "calendars": [_calendar_dict(c) for c in user.calendars],
        }
    )


@bp.get("/activity")
@jwt_required()
@doc(
    "Mis datos de ONMi sobre el calendario (siempre privado)",
    "Calendar",
    description="Hábitos hechos, metas y proyectos con fecha, ánimo y minutos de enfoque por día. "
    "Nunca se comparte con nadie, ni siquiera desde un calendario compartido.",
)
def activity():
    user = current_user()
    start, end = _range()
    items: list[dict] = []

    rows = db.session.execute(
        db.select(HabitLog.day, Habit.id, Habit.name, Habit.color)
        .join(Habit, Habit.id == HabitLog.habit_id)
        .where(Habit.user_id == user.id, HabitLog.day >= start, HabitLog.day <= end)
    ).all()
    items += [
        {"kind": "habit", "day": d.isoformat(), "id": hid, "title": name, "color": color}
        for d, hid, name, color in rows
    ]

    for g in db.session.scalars(
        db.select(Goal).filter_by(user_id=user.id).where(Goal.due_date >= start, Goal.due_date <= end)
    ):
        items.append(
            {"kind": "goal_done" if g.done else "goal_due", "day": g.due_date.isoformat(), "id": g.id, "title": g.title}
        )
    for p in db.session.scalars(
        db.select(Project).filter_by(user_id=user.id).where(Project.due_date >= start, Project.due_date <= end)
    ):
        items.append({"kind": "project_due", "day": p.due_date.isoformat(), "id": p.id, "title": p.name})

    for m in db.session.scalars(
        db.select(MoodEntry).filter_by(user_id=user.id).where(MoodEntry.day >= start, MoodEntry.day <= end)
    ):
        items.append({"kind": "mood", "day": m.day.isoformat(), "id": m.id, "title": m.mood.value, "note": m.note})

    minutes: dict[date, int] = {}
    for s in db.session.scalars(
        db.select(PomodoroSession)
        .filter_by(user_id=user.id, kind="work", completed=True)
        .where(
            PomodoroSession.started_at >= datetime.combine(start, time.min),
            PomodoroSession.started_at <= datetime.combine(end, time.max),
        )
    ):
        minutes[s.started_at.date()] = minutes.get(s.started_at.date(), 0) + s.duration_seconds // 60
    items += [{"kind": "focus", "day": d.isoformat(), "title": str(m), "minutes": m} for d, m in minutes.items() if m]

    items.sort(key=lambda i: (i["day"], i["kind"]))
    return jsonify({"items": items})


# ---- eventos -------------------------------------------------------------------------------------------------
@bp.post("/events")
@jwt_required()
@doc("Crear evento", "Calendar", body=CalendarEventIn)
def create_event():
    user = current_user()
    data = _validated(parse_body(CalendarEventIn).model_dump())
    calendar = _event_calendar(user, data.calendar_id)
    event = CalendarEvent(user_id=user.id)
    _apply(event, data, calendar)
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
    patch.pop("shared", None)  # campo de solo lectura: se deduce del calendario
    if extra := set(patch) - set(CalendarEventIn.model_fields):
        raise ApiError(
            "Invalid data", 422, "validation_error", [{"field": f, "message": "Unknown field"} for f in sorted(extra)]
        )
    merged = {**event.to_dict(), **patch}
    merged.pop("id", None)
    merged.pop("shared", None)  # se deduce del calendario
    # Quitar la hora (evento de todo el día) quita también la duración, que no tiene sentido sin hora.
    if "start_time" in patch and not patch["start_time"] and "duration_min" not in patch:
        merged["duration_min"] = None
    data = _validated(merged)
    _apply(event, data, _event_calendar(user, data.calendar_id))
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


# ---- calendarios con nombre y con quién se comparten -----------------------------------------------------
MAX_NOTES = None  # (los calendarios compartidos nunca llevan notas)


@bp.get("/calendars")
@jwt_required()
@doc(
    "Mis calendarios y los que otras personas comparten conmigo",
    "Calendar",
    description="El calendario Personal es siempre privado. Solo se puede compartir con compañeros ya aceptados.",
)
def list_calendars():
    user = current_user()
    cals.ensure_personal(user)
    db.session.commit()
    buddies = _accepted_buddies(user)
    mine_ids = {b.id for b in buddies}
    incoming = db.session.scalars(
        db.select(Calendar)
        .join(CalendarViewer, CalendarViewer.calendar_id == Calendar.id)
        .where(CalendarViewer.viewer_id == user.id)
    ).all()
    shared = []
    for c in incoming:
        owner = db.session.get(User, c.user_id)
        if owner and owner.is_active and owner.id in mine_ids:
            shared.append({"id": c.id, "name": c.name, "color": c.color, "owner": buddies_svc.public_user(owner)})
    return jsonify(
        {
            "mine": [_calendar_dict(c) for c in sorted(user.calendars, key=lambda c: (not c.is_default, c.id))],
            "shared_with_me": shared,
            "buddies": [buddies_svc.public_user(b) for b in buddies],
        }
    )


@bp.post("/calendars")
@jwt_required()
@doc("Crear un calendario y elegir con quién compartirlo", "Calendar", body=CalendarIn)
def create_calendar():
    user = current_user()
    data = parse_body(CalendarIn)
    if data.user_ids:
        _not_demo(user)
    viewers = _check_viewers(user, data.user_ids)
    cals.ensure_personal(user)
    if len(user.calendars) >= cals.MAX_CALENDARS:
        raise ApiError("You can have up to 20 calendars", 409, "limit_reached")
    cal = cals.create_calendar(user, data.name, data.color, viewers)
    db.session.commit()
    return jsonify(_calendar_dict(cal)), 201


@bp.patch("/calendars/<int:calendar_id>")
@jwt_required()
@doc("Renombrar, recolorear o cambiar con quién se comparte un calendario", "Calendar", body=CalendarPatch)
def update_calendar(calendar_id):
    user = current_user()
    cal = _owned_calendar(calendar_id, user)
    data = parse_body(CalendarPatch)
    fields = data.model_fields_set
    if "user_ids" in fields and data.user_ids is not None:
        if cal.is_default and data.user_ids:
            raise ApiError("The Personal calendar is always private", 409, "personal_is_private")
        if data.user_ids:
            _not_demo(user)
        wanted = set(_check_viewers(user, data.user_ids))
        current = {v.viewer_id: v for v in cal.viewers}
        for vid, v in current.items():
            if vid not in wanted:
                cal.viewers.remove(v)
        for vid in wanted - set(current):
            db.session.add(CalendarViewer(calendar_id=cal.id, viewer_id=vid))
    if "name" in fields and data.name is not None:
        if cal.is_default:
            raise ApiError("The Personal calendar cannot be renamed", 409, "personal_is_private")
        cal.name = data.name
    if "color" in fields and data.color is not None:
        cal.color = data.color
    db.session.commit()
    return jsonify(_calendar_dict(cal))


@bp.delete("/calendars/<int:calendar_id>")
@jwt_required()
@doc(
    "Borrar un calendario",
    "Calendar",
    description="Sus eventos no se pierden: pasan al calendario Personal (privado). El Personal no se puede borrar.",
)
def delete_calendar(calendar_id):
    user = current_user()
    cal = _owned_calendar(calendar_id, user)
    if cal.is_default:
        raise ApiError("The Personal calendar cannot be deleted", 409, "personal_is_private")
    personal = cals.ensure_personal(user)
    moved = 0
    for ev in list(cal.events):
        ev.calendar = personal
        ev.calendar_id = personal.id
        moved += 1
    db.session.flush()
    db.session.delete(cal)
    db.session.commit()
    return jsonify({"ok": True, "moved_events": moved})


@bp.get("/shared")
@jwt_required()
@doc(
    "Calendarios que mis compañeros comparten conmigo",
    "Calendar",
    description="Un bloque por calendario compartido (de una o varias personas). Sin notas. Deja de verse si la "
    "amistad se rompe o si se deja de compartir.",
)
def shared_with_me():
    user = current_user()
    start, end = _range()
    buddy_ids = {b.id for b in _accepted_buddies(user)}
    incoming = db.session.scalars(
        db.select(Calendar)
        .join(CalendarViewer, CalendarViewer.calendar_id == Calendar.id)
        .where(CalendarViewer.viewer_id == user.id)
        .order_by(Calendar.id)
    ).all()
    out = []
    for c in incoming:
        if c.user_id not in buddy_ids:
            continue
        owner = db.session.get(User, c.user_id)
        events = list(c.events)
        logs = _logs_for(events, start, end)
        items = []
        for e in events:
            items += svc.occurrences(e, start, end, logs.get(e.id, {}), with_notes=False)
        items.sort(key=lambda o: (o["day"], o["start_time"] or "", o["title"].lower()))
        out.append(
            {
                "calendar": {"id": c.id, "name": c.name, "color": c.color},
                "user": buddies_svc.public_user(owner),
                "occurrences": items,
            }
        )
    return jsonify({"calendars": out})
