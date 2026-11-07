"""Compañeros de hábitos: códigos de invitación, vista segura de los hábitos compartidos y aviso de ánimo.

Privacidad por diseño: un compañero ve únicamente el nombre y el avatar de la otra persona y, de sus hábitos, solo los
que ella marcó como `shared` (nombre, color, racha y progreso). Nunca notas, ánimo, proyectos, metas ni el correo.
"""

from __future__ import annotations

import logging
import re
import secrets
from datetime import UTC, date, datetime, timedelta

from ..extensions import db
from ..models import User
from . import push
from .reminders import user_zone
from .stats import habit_streaks, week_count

log = logging.getLogger("onmi.buddies")

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O/1/I: se dicta y se copia sin confusión
CODE_LEN = 8

CHEER_TEXTS = {
    "en": {"plain": "{name} cheered you on.", "habit": "{name} cheered you on for {habit}."},
    "es": {"plain": "{name} te ha animado.", "habit": "{name} te ha animado con {habit}."},
}


def new_code() -> str:
    """Código aleatorio (8 caracteres, ~40 bits) que no usa ningún otro usuario."""
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))
        if db.session.scalar(db.select(User.id).filter_by(invite_code=code)) is None:
            return code


def ensure_invite_code(user: User) -> str:
    if not user.invite_code:
        user.invite_code = new_code()
        db.session.commit()
    return user.invite_code


def format_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def normalize_code(raw: str) -> str | None:
    """Acepta minúsculas, espacios y guiones («abcd efgh», «ABCD-EFGH»). None si no puede ser un código válido."""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
    return cleaned if len(cleaned) == CODE_LEN and set(cleaned) <= set(ALPHABET) else None


def local_today(user: User, now: datetime | None = None) -> date:
    """Hoy en la zona horaria de esa persona (para saber si ya cumplió el hábito de hoy)."""
    now = now or datetime.now(UTC).replace(tzinfo=None)
    return now.replace(tzinfo=UTC).astimezone(user_zone(user)).date()


def public_user(user: User) -> dict:
    return {"id": user.id, "name": user.name, "avatar": user.avatar}


def shared_habits_view(friend: User, now: datetime | None = None) -> list[dict]:
    """Los hábitos que `friend` ha decidido compartir, con su racha y progreso. Nada más."""
    today = local_today(friend, now)
    out = []
    for habit in sorted(friend.habits, key=lambda h: h.id):
        if not habit.shared or habit.archived:
            continue
        days = habit.completed_days()
        done = set(days)
        streak, _, unit = habit_streaks(days, habit.target_per_week, today)
        out.append(
            {
                "id": habit.id,
                "name": habit.name,
                "color": habit.color,
                "target_per_week": habit.target_per_week,
                "streak": streak,
                "streak_unit": unit,
                "done_today": today in done,
                "week_count": week_count(days, today),
                "last7": [(today - timedelta(days=6 - i)) in done for i in range(7)],
            }
        )
    return out


def notify_cheer(to_user: User, from_user: User, habit_name: str | None) -> None:
    """Notificación push al recibir ánimo. Es opcional: cualquier fallo se ignora (el ánimo ya está guardado)."""
    texts = CHEER_TEXTS.get(to_user.locale, CHEER_TEXTS["en"])
    body = (
        texts["habit"].format(name=from_user.name, habit=habit_name)
        if habit_name
        else texts["plain"].format(name=from_user.name)
    )
    payload = {"title": "ONMi", "body": body, "tag": f"cheer-{from_user.id}", "url": "/buddies"}
    for sub in list(to_user.push_subscriptions):
        try:
            push.send(sub.to_webpush(), payload)
        except push.Gone:
            db.session.delete(sub)
        except Exception:
            log.warning("No se pudo enviar el aviso de ánimo", exc_info=True)
    db.session.commit()
