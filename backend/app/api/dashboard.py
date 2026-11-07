from datetime import datetime, time, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Goal, Habit, MoodEntry, Note, PomodoroSession, Project, ProjectStatus
from ..openapi import doc
from ..services.stats import daily_counts
from ..utils import current_user, today

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@bp.get("")
@jwt_required()
@doc("Summary for the home screen", "Dashboard")
def summary():
    user = current_user()
    t = today()
    week_start = t - timedelta(days=6)

    habits = db.session.scalars(db.select(Habit).filter_by(user_id=user.id, archived=False)).all()
    habit_dicts = [h.to_dict(t) for h in habits]
    week_days = [d for h in habits for d in h.completed_days() if week_start <= d <= t]

    projects = db.session.scalars(
        db.select(Project)
        .filter(Project.user_id == user.id, Project.status != ProjectStatus.DONE)
        .order_by(Project.status.desc(), Project.position)
        .limit(5)
    ).all()
    status_counts = dict(
        db.session.execute(
            db.select(Project.status, db.func.count()).filter_by(user_id=user.id).group_by(Project.status)
        ).all()
    )

    notes = db.session.scalars(
        db.select(Note).filter_by(user_id=user.id).order_by(Note.pinned.desc(), Note.updated_at.desc()).limit(4)
    ).all()
    goals = db.session.scalars(
        db.select(Goal).filter_by(user_id=user.id, done=False).order_by(Goal.due_date.is_(None), Goal.due_date).limit(4)
    ).all()
    mood = db.session.scalar(db.select(MoodEntry).filter_by(user_id=user.id, day=t))

    since = datetime.combine(t, time.min)
    seconds_today = db.session.scalar(
        db.select(db.func.coalesce(db.func.sum(PomodoroSession.duration_seconds), 0)).filter(
            PomodoroSession.user_id == user.id,
            PomodoroSession.kind == "work",
            PomodoroSession.completed.is_(True),
            PomodoroSession.started_at >= since,
        )
    )
    return jsonify(
        {
            "habits": {
                "total": len(habits),
                "done_today": sum(1 for h in habit_dicts if h["done_today"]),
                "best_streak": max((h["current_streak"] for h in habit_dicts), default=0),
                "today": habit_dicts,
                "week": daily_counts(week_days, week_start, t),
            },
            "projects": {
                "counts": {s.value: status_counts.get(s, 0) for s in ProjectStatus},
                "active": [p.to_dict() for p in projects],
            },
            "notes": [n.to_dict() for n in notes],
            "goals": [g.to_dict() for g in goals],
            "mood_today": mood.to_dict() if mood else None,
            "focus_minutes_today": int(seconds_today) // 60,
        }
    )
