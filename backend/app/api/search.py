from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import CalendarEvent, Goal, Habit, Note, Project
from ..openapi import doc
from ..utils import current_user

bp = Blueprint("search", __name__, url_prefix="/api/search")

LIMIT = 5


def _like(q: str) -> str:
    # Los comodines de LIKE escritos por el usuario se tratan como texto.
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@bp.get("")
@jwt_required()
@doc(
    "Search everything",
    "Search",
    description="`q` (min. 2 characters). Notes, habits, projects, goals and calendar events. "
    "Hidden and deleted notes are never searched here.",
)
def search():
    user = current_user()
    q = request.args.get("q", "").strip()[:80]
    if len(q) < 2:
        return jsonify({"notes": [], "habits": [], "projects": [], "goals": [], "events": []})
    like = _like(q)

    notes = db.session.scalars(
        db.select(Note)
        .filter_by(user_id=user.id, locked=False, deleted_at=None)
        .where(Note.title.ilike(like, escape="\\") | Note.content.ilike(like, escape="\\"))
        .order_by(Note.pinned.desc(), Note.updated_at.desc())
        .limit(LIMIT)
    ).all()
    habits = db.session.scalars(
        db.select(Habit)
        .filter_by(user_id=user.id, archived=False)
        .where(Habit.name.ilike(like, escape="\\"))
        .limit(LIMIT)
    ).all()
    projects = db.session.scalars(
        db.select(Project).filter_by(user_id=user.id).where(Project.name.ilike(like, escape="\\")).limit(LIMIT)
    ).all()
    goals = db.session.scalars(
        db.select(Goal).filter_by(user_id=user.id).where(Goal.title.ilike(like, escape="\\")).limit(LIMIT)
    ).all()
    events = db.session.scalars(
        db.select(CalendarEvent)
        .filter_by(user_id=user.id)
        .where(CalendarEvent.title.ilike(like, escape="\\"))
        .limit(LIMIT)
    ).all()
    return jsonify(
        {
            "notes": [{"id": n.id, "title": n.title} for n in notes],
            "habits": [{"id": h.id, "name": h.name} for h in habits],
            "projects": [{"id": p.id, "name": p.name} for p in projects],
            "goals": [{"id": g.id, "title": g.title} for g in goals],
            "events": [{"id": e.id, "title": e.title} for e in events],
        }
    )
