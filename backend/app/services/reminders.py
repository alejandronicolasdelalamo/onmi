"""Recordatorios de hábitos por Web Push. Pensado para ejecutarse cada pocos minutos (`flask send-reminders`)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ..extensions import db
from ..models import Habit, User
from ..utils import utcnow
from . import push
from .stats import week_count

# Si el servicio estuvo parado, se avisa con retraso solo dentro de esta ventana (no a las 23:00 un aviso de las 08:00).
WINDOW = timedelta(hours=3)

TEXTS = {
    "en": {"daily": "Time for {name}.", "weekly": "Time for {name}. {done}/{target} this week."},
    "es": {"daily": "Hora de {name}.", "weekly": "Hora de {name}. {done}/{target} esta semana."},
}


def user_zone(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def is_due(habit: Habit, now_utc: datetime, tz: ZoneInfo) -> bool:
    """¿Toca avisar ahora de este hábito? (hora de aviso alcanzada, hábito pendiente y sin aviso hoy)"""
    if habit.archived or not habit.reminder_time:
        return False
    local = now_utc.replace(tzinfo=UTC).astimezone(tz)
    hour, minute = map(int, habit.reminder_time.split(":"))
    due_at = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if not (due_at <= local < due_at + WINDOW):
        return False
    day = local.date()
    if habit.last_reminded_on == day:
        return False
    done = habit.completed_days()
    if day in done:
        return False
    # Con objetivo semanal ya cumplido no se insiste.
    return not (habit.target_per_week < 7 and week_count(done, day) >= habit.target_per_week)


def message_for(habit: Habit, user: User, today) -> dict:
    texts = TEXTS.get(user.locale, TEXTS["en"])
    if habit.target_per_week < 7:
        body = texts["weekly"].format(
            name=habit.name, done=week_count(habit.completed_days(), today), target=habit.target_per_week
        )
    else:
        body = texts["daily"].format(name=habit.name)
    return {"title": "ONMi", "body": body, "tag": f"habit-{habit.id}", "url": "/habits"}


def send_due_reminders(now: datetime | None = None, sender=push.send) -> dict:
    """Recorre los hábitos con recordatorio de usuarios suscritos y envía los que tocan. Devuelve contadores."""
    now = now or utcnow()
    habits = db.session.scalars(
        db.select(Habit)
        .join(User, Habit.user_id == User.id)
        .where(Habit.reminder_time.is_not(None), Habit.archived.is_(False), User.is_active.is_(True))
    ).all()
    stats = {"checked": 0, "sent": 0, "subscriptions_removed": 0}
    for habit in habits:
        user = habit.user
        if not user.push_subscriptions:
            continue
        stats["checked"] += 1
        tz = user_zone(user)
        if not is_due(habit, now, tz):
            continue
        local_day = now.replace(tzinfo=UTC).astimezone(tz).date()
        payload = message_for(habit, user, local_day)
        delivered = False
        for sub in list(user.push_subscriptions):
            try:
                delivered = bool(sender(sub.to_webpush(), payload)) or delivered
            except push.Gone:
                db.session.delete(sub)
                stats["subscriptions_removed"] += 1
        if delivered:
            habit.last_reminded_on = local_day
            stats["sent"] += 1
    db.session.commit()
    return stats
