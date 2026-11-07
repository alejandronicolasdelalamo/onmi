from datetime import date, timedelta

from app.services import insights as calc

T = date(2025, 3, 10)


def d(n: int) -> date:
    return T - timedelta(days=n)


# ---- lógica pura ----------------------------------------------------------------------
def test_habit_mood_effect_compares_days_with_and_without():
    done = {d(0), d(1), d(2), d(3)}
    moods = {d(0): 5, d(1): 4, d(2): 5, d(3): 4, d(4): 2, d(5): 3, d(6): 2, d(7): 3}
    effect = calc.habit_mood_effect(done, moods)
    assert effect == {"avg_with": 4.5, "avg_without": 2.5, "diff": 2.0, "days_with": 4, "days_without": 4}


def test_habit_mood_effect_needs_enough_days_in_both_groups():
    moods = {d(i): 3 for i in range(10)}
    assert calc.habit_mood_effect({d(0), d(1)}, moods) is None  # solo 2 días con el hábito
    assert calc.habit_mood_effect(set(), moods) is None  # ninguno
    assert calc.habit_mood_effect({d(i) for i in range(10)}, moods) is None  # ninguno sin el hábito


def test_habit_mood_effect_ignores_days_without_mood():
    done = {d(i) for i in range(20)}  # muchos días hechos, pero solo 4+4 con ánimo
    moods = {d(0): 5, d(1): 5, d(2): 5, d(3): 5, d(30): 1, d(31): 1, d(32): 1, d(33): 1}
    assert calc.habit_mood_effect(done, moods)["diff"] == 4.0


def test_best_weekday_and_threshold():
    mondays = [date(2025, 3, 3) + timedelta(weeks=i) for i in range(4)]  # lunes
    others = [date(2025, 3, 5), date(2025, 3, 6), date(2025, 3, 7)]
    result = calc.best_weekday(mondays + others)
    assert result["weekday"] == 0 and result["completions"] == 4
    assert calc.best_weekday(mondays) is None  # menos de 7 cumplimientos


def test_pct_change_and_window_summary():
    assert calc.pct_change(150, 100) == 0.5
    assert calc.pct_change(50, 100) == -0.5
    assert calc.pct_change(10, 0) is None and calc.pct_change(None, 5) is None
    s = calc.window_summary(habit_completions=14, habit_count=4, goals_done=1, focus_minutes=90, mood_scores=[4, 5])
    assert s["habit_rate"] == 0.5 and s["avg_mood"] == 4.5 and s["mood_days"] == 2
    empty = calc.window_summary(habit_completions=0, habit_count=0, goals_done=0, focus_minutes=0, mood_scores=[])
    assert empty["habit_rate"] is None and empty["avg_mood"] is None


# ---- API ----------------------------------------------------------------------------------
def _log_mood(client, back: int, mood: str):
    day = (date.today() - timedelta(days=back)).isoformat()
    assert client.put("/api/moods", json={"mood": mood, "date": day}).status_code == 200


def _toggle(client, habit_id: int, back: int):
    day = (date.today() - timedelta(days=back)).isoformat()
    assert client.post(f"/api/habits/{habit_id}/toggle", json={"date": day}).status_code == 200


def test_insights_requires_auth(app):
    assert app.test_client().get("/api/insights").status_code == 401


def test_insights_without_data_is_empty_but_valid(client, user):
    data = client.get("/api/insights").get_json()
    assert data["habit_effects"] == [] and data["best_weekday"] is None and data["top_streak"] is None
    assert data["unlock"] == {"mood_days": 0, "target": 14}
    assert data["week"]["current"]["habit_rate"] is None


def test_insights_detects_the_mood_effect_of_a_habit(client, user):
    run = client.post("/api/habits", json={"name": "Run", "color": "#ff0000"}).get_json()
    for back in range(10):
        done = back % 2 == 0
        if done:
            _toggle(client, run["id"], back)
        _log_mood(client, back, "love" if done else "sad")
    data = client.get("/api/insights").get_json()
    [effect] = data["habit_effects"]
    assert effect["name"] == "Run" and effect["diff"] == 4.0
    assert effect["days_with"] == 5 and effect["days_without"] == 5
    assert data["unlock"]["mood_days"] == 10
    assert data["week"]["current"]["avg_mood"] is not None


def test_insights_week_comparison(client, user):
    habit = client.post("/api/habits", json={"name": "Read"}).get_json()
    for back in (0, 1, 2):  # esta semana: 3
        _toggle(client, habit["id"], back)
    _toggle(client, habit["id"], 8)  # semana anterior: 1
    client.post("/api/pomodoro", json={"duration_seconds": 1500})
    week = client.get("/api/insights").get_json()["week"]
    assert week["current"]["habit_completions"] == 3 and week["previous"]["habit_completions"] == 1
    assert week["current"]["habit_rate"] == round(3 / 7, 3)
    assert week["deltas"]["habit_rate"] == round(3 / 7 - 1 / 7, 3)
    assert week["current"]["focus_minutes"] == 25


def test_insights_is_private_between_users(client, other_client, user):
    habit = client.post("/api/habits", json={"name": "Run"}).get_json()
    for back in range(8):
        _toggle(client, habit["id"], back)
    other = other_client.get("/api/insights").get_json()
    assert other["top_streak"] is None and other["week"]["current"]["habit_completions"] == 0


def test_insights_today_param_is_clamped_and_validated(client, user):
    assert client.get("/api/insights?today=not-a-date").status_code == 200
    far = (date.today() + timedelta(days=30)).isoformat()
    assert client.get(f"/api/insights?today={far}").status_code == 200  # se ignora, no rompe


# ---- exportación ----------------------------------------------------------------------------
def test_export_contains_only_my_data_and_no_secrets(client, other_client, user):
    client.post("/api/notes", json={"title": "Mine", "tags": ["a"]})
    client.post("/api/habits", json={"name": "Run"})
    other_client.post("/api/notes", json={"title": "Not mine"})
    r = client.get("/api/auth/export")
    assert r.status_code == 200 and "attachment" in r.headers["Content-Disposition"]
    data = r.get_json()
    assert [n["title"] for n in data["notes"]] == ["Mine"]
    assert data["habits"][0]["name"] == "Run" and data["user"]["email"] == "ana@example.com"
    assert "password_hash" not in str(data) and "bob@example.com" not in str(data)
    assert {"projects", "goals", "moods", "pomodoro_sessions", "exported_at"} <= data.keys()


def test_export_requires_auth(app):
    assert app.test_client().get("/api/auth/export").status_code == 401
