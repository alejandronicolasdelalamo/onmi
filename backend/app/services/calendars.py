"""Calendarios con nombre: el Personal (privado) y los que se comparten con personas concretas."""

from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import Calendar, CalendarEvent, User

PERSONAL_NAME = "Personal"
PERSONAL_COLOR = "#6366f1"
MAX_CALENDARS = 20


def ensure_personal(user: User) -> Calendar:
    """El calendario Personal del usuario (se crea la primera vez). Nunca se comparte."""
    cal = db.session.scalar(db.select(Calendar).filter_by(user_id=user.id, is_default=True))
    if cal is None:
        try:
            with db.session.begin_nested():
                cal = Calendar(user_id=user.id, name=PERSONAL_NAME, color=PERSONAL_COLOR, is_default=True)
                db.session.add(cal)
        except IntegrityError:
            # Otra petición simultánea lo acaba de crear: se usa ese.
            cal = db.session.scalar(db.select(Calendar).filter_by(user_id=user.id, is_default=True))
    # Eventos anteriores a los calendarios con nombre: van al Personal.
    orphans = db.session.scalars(db.select(CalendarEvent).filter_by(user_id=user.id, calendar_id=None)).all()
    for ev in orphans:
        ev.calendar_id = cal.id
    return cal


def create_calendar(user: User, name: str, color: str, viewer_ids: list[int]) -> Calendar:
    from ..models import CalendarViewer

    cal = Calendar(user_id=user.id, name=name, color=color)
    db.session.add(cal)
    db.session.flush()
    for vid in dict.fromkeys(viewer_ids):
        db.session.add(CalendarViewer(calendar_id=cal.id, viewer_id=vid))
    return cal
