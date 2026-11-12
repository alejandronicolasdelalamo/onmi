from datetime import timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from ..extensions import db, limiter
from ..models import Calendar, CalendarViewer, Cheer, Friendship, Habit, User
from ..openapi import doc
from ..schemas import BuddyRequestIn, CheerIn
from ..services import buddies as svc
from ..utils import ApiError, client_today, current_user, parse_body, utcnow

bp = Blueprint("buddies", __name__, url_prefix="/api/buddies")


def _not_demo(user: User) -> None:
    """La cuenta demo es compartida por todos los visitantes: puede ver compañeros de ejemplo, no cambiarlos."""
    if user.is_demo:
        raise ApiError("The demo account cannot change buddies", 403, "forbidden")


def _member_friendship(user: User, friendship_id: int) -> Friendship:
    f = db.session.get(Friendship, friendship_id)
    if f is None or user.id not in (f.requester_id, f.addressee_id):
        raise ApiError("Buddy not found", 404, "not_found")  # no se revela la existencia de relaciones ajenas
    return f


def _accepted_friend(user: User, friend_id: int) -> User:
    f = db.session.scalar(db.select(Friendship).filter_by(pair_key=Friendship.key_for(user.id, friend_id)))
    friend = db.session.get(User, friend_id)
    if f is None or f.status != "accepted" or friend is None or not friend.is_active:
        raise ApiError("Buddy not found", 404, "not_found")
    return friend


@bp.get("")
@jwt_required()
@doc(
    "Mis compañeros, solicitudes pendientes y ánimos recibidos",
    "Buddies",
    description=(
        "De cada compañero aceptado solo se devuelven nombre, avatar y los hábitos que marcó como compartidos. "
        "`code` es tu código personal (null en la cuenta demo)."
    ),
)
def overview():
    user = current_user()
    code = None if user.is_demo else svc.format_code(svc.ensure_invite_code(user))

    relations = db.session.scalars(
        db.select(Friendship)
        .where(or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id))
        .order_by(Friendship.created_at)
    ).all()
    today = client_today()
    cheered_today = set(
        db.session.scalars(db.select(Cheer.to_user_id).filter_by(from_user_id=user.id, day=today)).all()
    )

    friends, incoming, outgoing = [], [], []
    for rel in relations:
        other = db.session.get(User, rel.other_id(user.id))
        if other is None or not other.is_active:
            continue
        entry = {"friendship_id": rel.id, "user": svc.public_user(other), "created_at": rel.created_at.isoformat()}
        if rel.status == "accepted":
            friends.append(
                {
                    **entry,
                    "habits": svc.shared_habits_view(other),
                    "cheered_today": other.id in cheered_today,
                }
            )
        elif rel.addressee_id == user.id:
            incoming.append(entry)
        else:
            outgoing.append(entry)

    received = db.session.scalars(
        db.select(Cheer)
        .filter(Cheer.to_user_id == user.id, Cheer.created_at >= utcnow() - timedelta(days=14))
        .order_by(Cheer.created_at.desc())
        .limit(20)
    ).all()
    cheers = []
    for c in received:
        sender = db.session.get(User, c.from_user_id)
        habit = db.session.get(Habit, c.habit_id) if c.habit_id else None
        if sender:
            cheers.append(
                {
                    "id": c.id,
                    "from": svc.public_user(sender),
                    "habit": habit.name if habit else None,
                    "created_at": c.created_at.isoformat(),
                }
            )
    return jsonify({"code": code, "friends": friends, "incoming": incoming, "outgoing": outgoing, "cheers": cheers})


@bp.post("/request")
@jwt_required()
@limiter.limit("10 per hour")
@doc(
    "Pedir ser compañero con el código de otra persona",
    "Buddies",
    body=BuddyRequestIn,
    description=(
        "Un código inválido o desconocido responde siempre igual (`invalid_code`). Si esa persona ya te había pedido "
        "conectar, la solicitud se acepta al instante."
    ),
)
def request_buddy():
    user = current_user()
    _not_demo(user)
    data = parse_body(BuddyRequestIn)
    code = svc.normalize_code(data.code)
    target = db.session.scalar(db.select(User).filter_by(invite_code=code)) if code else None
    if target is None or not target.is_active:
        raise ApiError("That code is not valid", 404, "invalid_code")
    if target.id == user.id:
        raise ApiError("That is your own code", 400, "own_code")

    existing = db.session.scalar(db.select(Friendship).filter_by(pair_key=Friendship.key_for(user.id, target.id)))
    if existing:
        if existing.status == "accepted":
            raise ApiError("You are already buddies", 409, "already_connected")
        if existing.requester_id == user.id:
            raise ApiError("Your request is already waiting for an answer", 409, "already_pending")
        # Ya te había escrito esa persona: las dos partes quieren conectar.
        existing.status, existing.accepted_at = "accepted", utcnow()
        db.session.commit()
        return jsonify({"status": "accepted", "user": svc.public_user(target)})

    db.session.add(
        Friendship(requester_id=user.id, addressee_id=target.id, pair_key=Friendship.key_for(user.id, target.id))
    )
    db.session.commit()
    return jsonify({"status": "pending", "user": svc.public_user(target)}), 201


@bp.post("/<int:friendship_id>/accept")
@jwt_required()
@doc("Aceptar una solicitud recibida", "Buddies")
def accept(friendship_id):
    user = current_user()
    _not_demo(user)
    f = _member_friendship(user, friendship_id)
    if f.addressee_id != user.id:
        raise ApiError("Only the person who was asked can accept", 403, "forbidden")
    if f.status == "pending":
        f.status, f.accepted_at = "accepted", utcnow()
        db.session.commit()
    return jsonify({"ok": True})


@bp.delete("/<int:friendship_id>")
@jwt_required()
@doc(
    "Rechazar, cancelar o dejar de ser compañeros",
    "Buddies",
    description="Cualquiera de las dos partes puede hacerlo. También se borran los ánimos entre ambos "
    "y se dejan de compartir los calendarios.",
)
def remove(friendship_id):
    user = current_user()
    _not_demo(user)
    f = _member_friendship(user, friendship_id)
    db.session.execute(
        db.delete(Cheer).where(
            or_(
                (Cheer.from_user_id == f.requester_id) & (Cheer.to_user_id == f.addressee_id),
                (Cheer.from_user_id == f.addressee_id) & (Cheer.to_user_id == f.requester_id),
            )
        )
    )
    # Dejar de ser compañeros también cierra los calendarios que se compartían en ambos sentidos (si luego volvéis
    # a conectar, nadie recupera el acceso sin que se vuelva a compartir a propósito).
    for owner, viewer in ((f.requester_id, f.addressee_id), (f.addressee_id, f.requester_id)):
        ids = db.select(Calendar.id).where(Calendar.user_id == owner)
        db.session.execute(
            db.delete(CalendarViewer).where(CalendarViewer.viewer_id == viewer, CalendarViewer.calendar_id.in_(ids))
        )
    db.session.delete(f)
    db.session.commit()
    return jsonify({"ok": True})


@bp.get("/<int:friend_id>/profile")
@jwt_required()
@doc(
    "Mini perfil de un compañero",
    "Buddies",
    description="Nombre, frase, metas compartidas y hábitos compartidos. Solo entre compañeros aceptados.",
)
def profile(friend_id):
    user = current_user()
    friend = _accepted_friend(user, friend_id)
    today = client_today()
    cheered = bool(
        db.session.scalar(db.select(Cheer.id).filter_by(from_user_id=user.id, to_user_id=friend.id, day=today))
    )
    return jsonify({**svc.profile_view(friend), "cheered_today": cheered})


@bp.post("/<int:friend_id>/cheer")
@jwt_required()
@limiter.limit("60 per hour")
@doc(
    "Animar a un compañero",
    "Buddies",
    body=CheerIn,
    description="Máximo un ánimo por día y compañero. `habit_id` debe ser un hábito compartido de esa persona.",
)
def cheer(friend_id):
    user = current_user()
    _not_demo(user)
    friend = _accepted_friend(user, friend_id)
    data = parse_body(CheerIn)

    habit = None
    if data.habit_id is not None:
        habit = db.session.get(Habit, data.habit_id)
        if habit is None or habit.user_id != friend.id or not habit.shared or habit.archived:
            raise ApiError("Habit not found", 404, "not_found")

    today = client_today()
    if db.session.scalar(db.select(Cheer.id).filter_by(from_user_id=user.id, to_user_id=friend.id, day=today)):
        raise ApiError("You already cheered this buddy today", 409, "already_cheered")
    db.session.add(Cheer(from_user_id=user.id, to_user_id=friend.id, habit_id=habit.id if habit else None, day=today))
    db.session.commit()
    svc.notify_cheer(friend, user, habit.name if habit else None)
    return jsonify({"ok": True}), 201


@bp.post("/code/regenerate")
@jwt_required()
@limiter.limit("5 per hour")
@doc(
    "Generar un código nuevo (el anterior deja de funcionar)",
    "Buddies",
    description="Útil si compartiste el código con quien no debías. Los compañeros ya aceptados no se ven afectados.",
)
def regenerate_code():
    user = current_user()
    _not_demo(user)
    user.invite_code = svc.new_code()
    db.session.commit()
    return jsonify({"code": svc.format_code(user.invite_code)})
