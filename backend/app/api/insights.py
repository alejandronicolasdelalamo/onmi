from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Goal, Habit, MoodEntry, PomodoroSession
from ..openapi import doc
from ..services import insights as calc
from ..services.stats import habit_streaks
from ..utils import current_user, today

bp = Blueprint("insights", __name__, url_prefix="/api/insights")


def _client_today() -> date:
    """Día del usuario (su zona horaria) si lo manda el cliente; acotado a ±1 día del servidor."""
    server = today()
    raw = request.args.get("today")
    try:
        day = date.fromisoformat(raw) if raw else server
    except ValueError:
        return server
    return day if abs((day - server).days) <= 1 else server


@bp.get("")
@jwt_required()
@doc(
    "Revisión semanal y patrones entre hábitos, ánimo y enfoque",
    "Insights",
    description=(
        "Compara los últimos 7 días con los 7 anteriores y calcula cómo cambia el ánimo los días que se cumple cada "
        "hábito. Los patrones exigen datos suficientes y se devuelven como correlaciones, no como causas. "
        "`today` (YYYY-MM-DD) permite usar el día local del usuario."
    ),
)
def get_insights():
    user = current_user()
    t = _client_today()
    cur_start, prev_start, prev_end = t - timedelta(days=6), t - timedelta(days=13), t - timedelta(days=7)
    history_start = t - timedelta(days=89)

    habits = db.session.scalars(db.select(Habit).filter_by(user_id=user.id, archived=False)).all()
    moods = db.session.scalars(
        db.select(MoodEntry).filter(MoodEntry.user_id == user.id, MoodEntry.day >= history_start, MoodEntry.day <= t)
    ).all()
    mood_by_day = {m.day: calc.MOOD_SCORE[m.mood.value] for m in moods}
    habit_days = {h.id: [d for d in h.completed_days() if history_start <= d <= t] for h in habits}

    def window(start: date, end: date) -> dict:
        goals_done = db.session.scalar(
            db.select(db.func.count(Goal.id)).where(
                Goal.user_id == user.id,
                Goal.completed_at >= datetime.combine(start, time.min),
                Goal.completed_at <= datetime.combine(end, time.max),
            )
        )
        focus_seconds = db.session.scalar(
            db.select(db.func.coalesce(db.func.sum(PomodoroSession.duration_seconds), 0)).where(
                PomodoroSession.user_id == user.id,
                PomodoroSession.kind == "work",
                PomodoroSession.completed.is_(True),
                PomodoroSession.started_at >= datetime.combine(start, time.min),
                PomodoroSession.started_at <= datetime.combine(end, time.max),
            )
        )
        return calc.window_summary(
            habit_completions=sum(1 for days in habit_days.values() for d in days if start <= d <= end),
            habit_count=len(habits),
            goals_done=goals_done or 0,
            focus_minutes=int(focus_seconds) // 60,
            mood_scores=[s for d, s in mood_by_day.items() if start <= d <= end],
        )

    current, previous = window(cur_start, t), window(prev_start, prev_end)
    deltas = {
        "habit_rate": None
        if current["habit_rate"] is None or previous["habit_rate"] is None
        else round(current["habit_rate"] - previous["habit_rate"], 3),
        "focus_minutes": calc.pct_change(current["focus_minutes"], previous["focus_minutes"]),
        "avg_mood": None
        if current["avg_mood"] is None or previous["avg_mood"] is None
        else round(current["avg_mood"] - previous["avg_mood"], 2),
        "goals_done": current["goals_done"] - previous["goals_done"],
    }

    effects = []
    for h in habits:
        effect = calc.habit_mood_effect(set(habit_days[h.id]), mood_by_day)
        if effect and abs(effect["diff"]) >= calc.MIN_EFFECT:
            effects.append({"habit_id": h.id, "name": h.name, "color": h.color, **effect})
    effects.sort(key=lambda e: -abs(e["diff"]))

    # Para comparar rachas en días con rachas en semanas se usa su equivalente en días.
    streaks = []
    for h in habits:
        count, _, unit = habit_streaks(habit_days[h.id], h.target_per_week, t)
        streaks.append((h.name, count, unit, count * (7 if unit == "week" else 1)))
    top = max(streaks, key=lambda s: s[3], default=None)

    return jsonify(
        {
            "week": {"current": current, "previous": previous, "deltas": deltas},
            "habit_effects": effects[:3],
            "best_weekday": calc.best_weekday([d for days in habit_days.values() for d in days]),
            "top_streak": {"name": top[0], "count": top[1], "unit": top[2]} if top and top[1] > 0 else None,
            "unlock": {"mood_days": len(mood_by_day), "target": calc.UNLOCK_TARGET_DAYS},
        }
    )
