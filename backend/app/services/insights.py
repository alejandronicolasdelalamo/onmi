"""Cálculos puros (sin BD) para los insights: correlaciones prudentes entre hábitos, ánimo y enfoque.

Son patrones observados, no causas: por eso se exige un mínimo de días en cada grupo y un efecto mínimo.
"""

from __future__ import annotations

from collections import Counter
from datetime import date

# Escala de ánimo de 1 (peor) a 5 (mejor).
MOOD_SCORE = {"sad": 1, "mad": 2, "neutral": 3, "happy": 4, "love": 5}
MIN_DAYS_EACH = 4  # días con ánimo registrado necesarios con y sin el hábito
MIN_EFFECT = 0.3  # diferencia mínima de ánimo (en puntos) para considerarla relevante
MIN_COMPLETIONS_FOR_WEEKDAY = 7
UNLOCK_TARGET_DAYS = 14  # días de ánimo registrados para empezar a ver patrones fiables


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def habit_mood_effect(done_days: set[date], mood_by_day: dict[date, int], min_each: int = MIN_DAYS_EACH) -> dict | None:
    """Ánimo medio los días que se hizo el hábito frente a los que no (solo días con ánimo registrado)."""
    with_habit = [score for day, score in mood_by_day.items() if day in done_days]
    without = [score for day, score in mood_by_day.items() if day not in done_days]
    if len(with_habit) < min_each or len(without) < min_each:
        return None
    avg_with, avg_without = mean(with_habit), mean(without)
    assert avg_with is not None and avg_without is not None
    return {
        "avg_with": round(avg_with, 2),
        "avg_without": round(avg_without, 2),
        "diff": round(avg_with - avg_without, 2),
        "days_with": len(with_habit),
        "days_without": len(without),
    }


def best_weekday(days: list[date]) -> dict | None:
    """Día de la semana (0 = lunes) con más cumplimientos, si hay datos suficientes."""
    if len(days) < MIN_COMPLETIONS_FOR_WEEKDAY:
        return None
    counts = Counter(d.weekday() for d in days)
    weekday, n = max(counts.items(), key=lambda kv: (kv[1], -kv[0]))
    return {"weekday": weekday, "completions": n, "share": round(n / len(days), 2)}


def pct_change(current: float | None, previous: float | None) -> float | None:
    """Variación relativa; None si no hay base de comparación."""
    if current is None or not previous:
        return None
    return round((current - previous) / previous, 3)


def window_summary(
    *,
    habit_completions: int,
    habit_count: int,
    goals_done: int,
    focus_minutes: int,
    mood_scores: list[int],
    days: int = 7,
) -> dict:
    possible = habit_count * days
    return {
        "habit_completions": habit_completions,
        "habit_rate": round(habit_completions / possible, 3) if possible else None,
        "goals_done": goals_done,
        "focus_minutes": focus_minutes,
        "avg_mood": round(mean(mood_scores), 2) if mood_scores else None,
        "mood_days": len(mood_scores),
    }
