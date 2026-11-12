"""Estado de ánimo y sesiones pomodoro."""

from collections import Counter
from datetime import date, datetime, time, timedelta
from statistics import mean

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import MoodEntry, MoodKind, PomodoroSession, Project
from ..openapi import doc
from ..schemas import FocusIn, MoodIn, PomodoroIn
from ..services.insights import MOOD_SCORE
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
    by_tag: dict[str, list[int]] = {}
    for e in entries:
        for tag in e.tags or []:
            by_tag.setdefault(tag, []).append(MOOD_SCORE[e.mood.value])
    return jsonify(
        {
            "items": [e.to_dict() for e in entries],
            "counts": {k.value: counts.get(k.value, 0) for k in MoodKind},
            "today": next((e.to_dict() for e in entries if e.day == today()), None),
            "stats": {
                "logged_days": len(entries),
                "streak": _streak({e.day for e in entries}),
                "average": round(mean(MOOD_SCORE[e.mood.value] for e in entries), 2) if entries else None,
                # Qué se repite en tus días buenos y malos: media de ánimo de los días con cada etiqueta.
                "by_tag": sorted(
                    ({"tag": t, "count": len(v), "average": round(mean(v), 2)} for t, v in by_tag.items()),
                    key=lambda x: (-x["average"], -x["count"]),
                ),
            },
        }
    )


def _streak(days: set) -> int:
    """Días seguidos con ánimo registrado hasta hoy (si hoy aún no, se cuenta desde ayer)."""
    cursor = today()
    if cursor not in days:
        cursor -= timedelta(days=1)
    n = 0
    while cursor in days:
        n += 1
        cursor -= timedelta(days=1)
    return n


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
    tags = list(dict.fromkeys(data.tags))
    if entry is None:
        entry = MoodEntry(user_id=user.id, day=day, mood=MoodKind(data.mood), note=data.note, tags=tags)
        db.session.add(entry)
    else:  # cambiar de opinión sobre un día ya registrado es normal: se reemplaza
        entry.mood, entry.note, entry.tags = MoodKind(data.mood), data.note, tags
    entry.updated_at = utcnow()
    db.session.commit()
    return jsonify(entry.to_dict())


@bp.delete("/moods/<day>")
@jwt_required()
@doc("Delete the mood recorded for a day", "Mood")
def delete_mood(day):
    try:
        when = date.fromisoformat(day)
    except ValueError as exc:
        raise ApiError("The day must be YYYY-MM-DD", 422, "validation_error") from exc
    entry = db.session.scalar(db.select(MoodEntry).filter_by(user_id=current_user().id, day=when))
    if entry is None:
        raise ApiError("No mood recorded that day", 404, "not_found")
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True})


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


@bp.put("/pomodoro/focus")
@jwt_required()
@doc(
    "Start (or extend) focus mode",
    "Pomodoro",
    body=FocusIn,
    description="Mientras dure, ONMi no envía notificaciones push (recordatorios ni ánimos).",
)
def start_focus():
    user = current_user()
    data = parse_body(FocusIn)
    user.focus_until = utcnow() + timedelta(seconds=data.seconds)
    db.session.commit()
    return jsonify({"focus_until": user.focus_until.isoformat() + "Z"})


@bp.delete("/pomodoro/focus")
@jwt_required()
@doc("End focus mode", "Pomodoro")
def end_focus():
    user = current_user()
    user.focus_until = None
    db.session.commit()
    return jsonify({"focus_until": None})


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
