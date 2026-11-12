"""Calendario: expande eventos (únicos o repetidos) en las ocurrencias de un rango de fechas.

Tipos de repetición (`CalendarEvent.repeat`):
- `none`: solo el día de inicio.
- `daily`: todos los días.
- `weekdays`: los días de la semana elegidos (p. ej. martes y jueves), cada 1-4 semanas.
- `weekly_count`: N días por semana a tu elección (p. ej. 4): aparece cada día de la semana hasta que marcas N como
  hechos; los días que no hacen falta desaparecen.

Un día marcado `skipped` no aparece (se salta solo ese día) y uno `done` aparece como hecho.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta

from ..models import CalendarEvent, EventLog

MAX_RANGE_DAYS = 93  # un trimestre: suficiente para mes, semana o agenda


def monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def log_map(logs: Iterable[EventLog]) -> dict[int, dict[date, str]]:
    out: dict[int, dict[date, str]] = {}
    for log in logs:
        out.setdefault(log.event_id, {})[log.day] = log.status
    return out


def _occurs(event: CalendarEvent, day: date) -> bool:
    if day < event.start_date or (event.until and day > event.until):
        return False
    if event.repeat == "none":
        return day == event.start_date
    if event.repeat in ("daily", "weekly_count"):
        return True
    if event.repeat == "weekdays":
        if day.weekday() not in event.weekday_list():
            return False
        weeks_apart = (monday(day) - monday(event.start_date)).days // 7
        return weeks_apart % max(event.every_weeks, 1) == 0
    return False


def occurrences(
    event: CalendarEvent, start: date, end: date, days: dict[date, str], *, with_notes: bool = True
) -> list[dict]:
    """Ocurrencias de `event` entre `start` y `end` (ambos incluidos). `days` = marcas hecho/saltado del evento."""
    out: list[dict] = []
    day = max(start, event.start_date)
    last = min(end, event.until) if event.until else end
    while day <= last:
        status = days.get(day)
        if _occurs(event, day) and status != "skipped":
            item = {
                "event_id": event.id,
                "day": day.isoformat(),
                "title": event.title,
                "color": event.color,
                "start_time": event.start_time,
                "duration_min": event.duration_min,
                "done": status == "done",
                "calendar_id": event.calendar_id,
                "shared": event.is_shared,
                "repeat": event.repeat,
                "flexible": event.repeat == "weekly_count",
                "per_week": event.per_week if event.repeat == "weekly_count" else None,
            }
            if with_notes:
                item["notes"] = event.notes
            if event.repeat == "weekly_count":
                week = monday(day)
                done_this_week = sum(1 for d, s in days.items() if s == "done" and monday(d) == week)
                item["week_done"] = done_this_week
                # Cuota semanal cumplida: los días que sobran dejan de aparecer.
                if done_this_week >= (event.per_week or 1) and status != "done":
                    day += timedelta(days=1)
                    continue
            out.append(item)
        day += timedelta(days=1)
    out.sort(key=lambda o: (o["day"], o["start_time"] or "", o["title"].lower()))
    return out
