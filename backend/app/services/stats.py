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
