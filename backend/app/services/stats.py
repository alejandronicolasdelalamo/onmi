"""Cálculos puros (sin BD) de rachas y agregados, fáciles de testear."""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta


def current_streak(days: list[date], today: date) -> int:
    """Días consecutivos hasta hoy. Si hoy aún no se ha hecho, la racha de ayer sigue viva."""
    done = set(days)
    cursor = today if today in done else today - timedelta(days=1)
    streak = 0
    while cursor in done:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(days: list[date]) -> int:
    best = run = 0
    prev: date | None = None
    for d in sorted(set(days)):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def completion_rate(days: list[date], since: date, today: date) -> float:
    span = (today - since).days + 1
    if span <= 0:
        return 0.0
    hits = sum(1 for d in set(days) if since <= d <= today)
    return round(hits / span, 3)


def daily_counts(days: list[date], start: date, end: date) -> list[dict]:
    """Serie diaria [{date, count}] entre start y end, ambos incluidos."""
    counts = Counter(days)
    out, cursor = [], start
    while cursor <= end:
        out.append({"date": cursor.isoformat(), "count": counts.get(cursor, 0)})
        cursor += timedelta(days=1)
    return out


# ---- hábitos con frecuencia semanal -------------------------------------------------------------
def week_start(day: date) -> date:
    """Lunes de la semana de `day`."""
    return day - timedelta(days=day.weekday())


def week_count(days: list[date], today: date) -> int:
    """Días distintos cumplidos en la semana (lunes a domingo) de `today`."""
    start = week_start(today)
    end = start + timedelta(days=6)
    return len({d for d in days if start <= d <= end})


def _weeks_met(days: list[date], target: int) -> set[date]:
    counts = Counter(week_start(d) for d in set(days))
    return {week for week, n in counts.items() if n >= target}


def current_weekly_streak(days: list[date], target: int, today: date) -> int:
    """Semanas seguidas cumpliendo el objetivo. La semana en curso aún puede cumplirse: no rompe la racha."""
    met = _weeks_met(days, target)
    week = week_start(today)
    if week not in met:
        week -= timedelta(days=7)
    streak = 0
    while week in met:
        streak += 1
        week -= timedelta(days=7)
    return streak


def longest_weekly_streak(days: list[date], target: int) -> int:
    best = run = 0
    prev: date | None = None
    for week in sorted(_weeks_met(days, target)):
        run = run + 1 if prev and week - prev == timedelta(days=7) else 1
        best = max(best, run)
        prev = week
    return best


def habit_streaks(days: list[date], target: int, today: date) -> tuple[int, int, str]:
    """(racha actual, mejor racha, unidad). Diario (7/7): días. Con objetivo semanal (<7): semanas cumplidas."""
    if target >= 7:
        return current_streak(days, today), longest_streak(days), "day"
    return current_weekly_streak(days, target, today), longest_weekly_streak(days, target), "week"
