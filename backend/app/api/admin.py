from datetime import timedelta

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Habit, MoodEntry, Note, PomodoroSession, Project, Role, User
from ..openapi import doc
from ..schemas import AdminUserUpdate
from ..utils import ApiError, admin_required, current_user, paginate, parse_body, today, utcnow

bp = Blueprint("admin_api", __name__, url_prefix="/api/admin")


@bp.get("/metrics")
@admin_required
@doc("Global platform metrics", "Admin")
def metrics():
    def count(model, *where):
        return db.session.scalar(db.select(db.func.count(model.id)).where(*where))

    now = utcnow()
    signups = [
        {
            "date": (today() - timedelta(days=i)).isoformat(),
            "count": db.session.scalar(
                db.select(db.func.count(User.id)).where(
                    db.func.date(User.created_at) == (today() - timedelta(days=i)).isoformat()
                )
            ),
        }
        for i in range(13, -1, -1)
    ]
    return jsonify(
        {
            "users": {
                "total": count(User),
                "active": count(User, User.is_active.is_(True)),
                "admins": count(User, User.role == Role.ADMIN),
                "verified": count(User, User.email_verified.is_(True)),
                "new_7d": count(User, User.created_at >= now - timedelta(days=7)),
                "active_7d": count(User, User.last_login_at >= now - timedelta(days=7)),
            },
            "content": {
                "notes": count(Note),
                "projects": count(Project),
                "habits": count(Habit),
                "moods": count(MoodEntry),
                "pomodoros": count(PomodoroSession),
            },
            "signups": signups,
        }
    )


@bp.get("/users")
@admin_required
@doc("List users (paginated)", "Admin", description="Filter `q` by name or email.")
def list_users():
    query = db.select(User).order_by(User.created_at.desc())
    if q := request.args.get("q", "").strip():
        like = f"%{q}%"
        query = query.where(User.name.ilike(like) | User.email.ilike(like))
    items, meta = paginate(query, default_size=20)
    return jsonify({"items": [u.to_admin_dict() for u in items], **meta})


@bp.patch("/users/<int:user_id>")
@admin_required
@doc("Change role or activate/deactivate a user", "Admin", body=AdminUserUpdate)
def update_user(user_id):
    me = current_user()
    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError("User not found", 404, "not_found")
    data = parse_body(AdminUserUpdate)
    if user.id == me.id:
        raise ApiError("You cannot modify your own account here", 400, "forbidden")
    if data.role is not None:
        user.role = Role(data.role)
    if data.is_active is not None:
        user.is_active = data.is_active
    db.session.commit()
    return jsonify({"user": user.to_admin_dict()})


@bp.delete("/users/<int:user_id>")
@admin_required
@doc("Delete a user and all their data", "Admin")
def delete_user(user_id):
    me = current_user()
    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError("User not found", 404, "not_found")
    if user.id == me.id:
        raise ApiError("You cannot delete your own account here", 400, "forbidden")
    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True})
