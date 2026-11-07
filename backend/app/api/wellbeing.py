"""Estado de ánimo y sesiones pomodoro."""

from collections import Counter
from datetime import datetime, time, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import MoodEntry, MoodKind, PomodoroSession, Project
from ..openapi import doc
from ..schemas import MoodIn, PomodoroIn
from ..utils import ApiError, check_ref, current_user, parse_body, today, utcnow

bp = Blueprint("wellbeing", __name__, url_prefix="/api")


# ---- mood -------------------------------------------------------------------
@bp.get("/moods")
@jwt_required()
@doc("Mood history", "Mood", description="`days` (1-365, default 90).")
def list_moods():
    days = min(max(request.args.get("days", 90, type=int), 1), 365)
    since = today() - timedelta(days=days - 1)
    entries = db.session.scalars(
        db.select(MoodEntry)
        .filter(MoodEntry.user_id == current_user().id, MoodEntry.day >= since)
        .order_by(MoodEntry.day)
    ).all()
    counts = Counter(e.mood.value for e in entries)
    return jsonify(
        {
            "items": [e.to_dict() for e in entries],
            "counts": {k.value: counts.get(k.value, 0) for k in MoodKind},
            "today": next((e.to_dict() for e in entries if e.day == today()), None),
        }
    )


@bp.put("/moods")
@jwt_required()
@doc("Record (or replace) the mood of a day; defaults to today", "Mood", body=MoodIn)
def set_mood():
    user = current_user()
    data = parse_body(MoodIn)
    day = data.date or today()
    if day > today() + timedelta(days=1):  # margen de zona horaria
        raise ApiError("Cannot record a future day", 422, "validation_error")
    entry = db.session.scalar(db.select(MoodEntry).filter_by(user_id=user.id, day=day))
    if entry is None:
        entry = MoodEntry(user_id=user.id, day=day, mood=MoodKind(data.mood), note=data.note)
        db.session.add(entry)
    else:
        entry.mood, entry.note = MoodKind(data.mood), data.note
    db.session.commit()
    return jsonify(entry.to_dict())


# ---- pomodoro -----------------------------------------------------------------
@bp.post("/pomodoro")
@jwt_required()
@doc("Save a finished pomodoro session", "Pomodoro", body=PomodoroIn)
def create_session():
    user = current_user()
    data = parse_body(PomodoroIn)
    session = PomodoroSession(
        user_id=user.id,
        kind=data.kind,
        duration_seconds=data.duration_seconds,
        completed=data.completed,
        project_id=check_ref(Project, data.project_id, user),
        started_at=utcnow() - timedelta(seconds=data.duration_seconds),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@bp.get("/pomodoro")
@jwt_required()
@doc("Recent sessions", "Pomodoro", description="`days` (1-90, default 14).")
def list_sessions():
    days = min(max(request.args.get("days", 14, type=int), 1), 90)
    since = datetime.combine(today() - timedelta(days=days - 1), time.min)
    items = db.session.scalars(
        db.select(PomodoroSession)
        .filter(PomodoroSession.user_id == current_user().id, PomodoroSession.started_at >= since)
        .order_by(PomodoroSession.started_at.desc())
    ).all()
    return jsonify({"items": [s.to_dict() for s in items]})


@bp.get("/pomodoro/stats")
@jwt_required()
@doc("Focus stats: today, week, total and daily series", "Pomodoro")
def pomodoro_stats():
    user = current_user()
    t = today()
    since = datetime.combine(t - timedelta(days=13), time.min)
    sessions = db.session.scalars(
        db.select(PomodoroSession).filter(
            PomodoroSession.user_id == user.id,
            PomodoroSession.kind == "work",
            PomodoroSession.completed.is_(True),
            PomodoroSession.started_at >= since,
        )
    ).all()
    by_day: Counter = Counter()
    for s in sessions:
        by_day[s.started_at.date()] += s.duration_seconds
    series = [
        {"date": (t - timedelta(days=i)).isoformat(), "minutes": by_day.get(t - timedelta(days=i), 0) // 60}
        for i in range(13, -1, -1)
    ]
    total_sessions = db.session.scalar(
        db.select(db.func.count(PomodoroSession.id)).filter_by(user_id=user.id, kind="work", completed=True)
    )
    total_seconds = db.session.scalar(
        db.select(db.func.coalesce(db.func.sum(PomodoroSession.duration_seconds), 0)).filter_by(
            user_id=user.id, kind="work", completed=True
        )
    )
    week_days = {t - timedelta(days=i) for i in range(7)}
    return jsonify(
        {
            "today_sessions": sum(1 for s in sessions if s.started_at.date() == t),
            "today_minutes": by_day.get(t, 0) // 60,
            "week_minutes": sum(v for d, v in by_day.items() if d in week_days) // 60,
            "total_sessions": total_sessions,
            "total_minutes": int(total_seconds) // 60,
            "series": series,
        }
    )
