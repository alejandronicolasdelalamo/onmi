from datetime import date, datetime, timedelta

import pytest

from app.extensions import db
from app.models import Habit, HabitLog, PushSubscription, User
from app.services import push, reminders
from app.services import stats as st

MON = date(2025, 3, 3)  # lunes


def d(week: int, weekday: int) -> date:
    """Día `weekday` (0=lunes) de la semana `week` contada desde MON."""
    return MON + timedelta(weeks=week, days=weekday)


# ---- rachas semanales (lógica pura) ------------------------------------------------------------
def test_week_start_and_count():
    assert st.week_start(date(2025, 3, 9)) == MON  # domingo
    assert st.week_start(MON) == MON
    days = [d(0, 0), d(0, 2), d(0, 2), d(1, 0)]
    assert st.week_count(days, d(0, 5)) == 2  # días distintos de la semana 0
    assert st.week_count(days, d(1, 3)) == 1


def test_weekly_streak_counts_consecutive_weeks_meeting_target():
    days = [d(0, 0), d(0, 2), d(0, 4), d(1, 1), d(1, 3), d(1, 5), d(2, 0), d(2, 1)]  # 3, 3 y 2 días
    # Semana 2 aún en curso (2/3): no rompe, la racha son las 2 anteriores.
    assert st.current_weekly_streak(days, 3, d(2, 2)) == 2
    # Si la semana 2 ya cumple, son 3.
    assert st.current_weekly_streak(days + [d(2, 4)], 3, d(2, 4)) == 3


def test_weekly_streak_breaks_after_a_missed_week_and_keeps_best():
    days = [d(0, 0), d(0, 1), d(1, 0), d(1, 1), d(3, 0), d(3, 1)]  # la semana 2 falló
    assert st.longest_weekly_streak(days, 2) == 2
    assert st.current_weekly_streak(days, 2, d(3, 3)) == 1
    assert st.current_weekly_streak(days, 2, d(4, 3)) == 1  # semana 4 en curso, la 3 cumplida
    assert st.current_weekly_streak(days, 2, d(5, 3)) == 0  # la 4 se perdió


def test_habit_streaks_picks_unit_by_target():
    days = [d(0, i) for i in range(7)]
    assert st.habit_streaks(days, 7, d(0, 6)) == (7, 7, "day")
    assert st.habit_streaks(days, 3, d(0, 6)) == (1, 1, "week")
    assert st.habit_streaks([], 3, d(0, 0)) == (0, 0, "week")


# ---- API de hábitos ------------------------------------------------------------------------------
def test_habit_frequency_and_reminder_validation(client, user):
    ok = client.post("/api/habits", json={"name": "Gym", "target_per_week": 3, "reminder_time": "07:30"})
    assert ok.status_code == 201
    h = ok.get_json()
    assert h["target_per_week"] == 3 and h["reminder_time"] == "07:30" and h["streak_unit"] == "week"
    assert h["week_count"] == 0
    for bad in ({"target_per_week": 0}, {"target_per_week": 8}, {"reminder_time": "25:00"}, {"reminder_time": "7:30"}):
        assert client.post("/api/habits", json={"name": "x", **bad}).status_code == 422, bad
    default = client.post("/api/habits", json={"name": "Daily"}).get_json()
    assert default["target_per_week"] == 7 and default["streak_unit"] == "day" and default["reminder_time"] is None


def test_habit_update_frequency_and_clear_reminder(client, user):
    h = client.post("/api/habits", json={"name": "Gym", "reminder_time": "07:30"}).get_json()
    upd = client.patch(f"/api/habits/{h['id']}", json={"target_per_week": 2, "reminder_time": None}).get_json()
    assert upd["target_per_week"] == 2 and upd["reminder_time"] is None
    assert client.patch(f"/api/habits/{h['id']}", json={"target_per_week": None}).status_code == 422


def test_weekly_habit_progress_through_the_api(client, user):
    h = client.post("/api/habits", json={"name": "Gym", "target_per_week": 2}).get_json()
    monday = date.today() - timedelta(days=date.today().weekday())
    for offset in (0, 1):
        day = monday + timedelta(days=offset)
        if day <= date.today():
            client.post(f"/api/habits/{h['id']}/toggle", json={"date": day.isoformat()})
    got = client.get(f"/api/habits/{h['id']}").get_json()
    assert got["week_count"] == (2 if date.today().weekday() >= 1 else 1)


# ---- recordatorios -------------------------------------------------------------------------------
@pytest.fixture()
def setup_reminder(app, client, user):
    """Usuario de Madrid con un hábito a las 21:00 y una suscripción push."""
    u = db.session.scalar(db.select(User).filter_by(email="ana@example.com"))
    u.timezone = "Europe/Madrid"
    habit = Habit(user_id=u.id, name="Read", reminder_time="21:00")
    db.session.add_all(
        [habit, PushSubscription(user_id=u.id, endpoint="https://push.example/1", p256dh="p" * 20, auth="a" * 10)]
    )
    db.session.commit()
    return u, habit


class Sender:
    def __init__(self, result=True, gone=False):
        self.calls, self.result, self.gone = [], result, gone

    def __call__(self, subscription, payload):
        self.calls.append((subscription, payload))
        if self.gone:
            raise push.Gone
        return self.result


NOW = datetime(2025, 1, 15, 20, 30)  # 21:30 en Madrid (UTC+1 en enero)


def test_reminder_is_sent_once_when_due(setup_reminder):
    _, habit = setup_reminder
    sender = Sender()
    assert reminders.send_due_reminders(NOW, sender)["sent"] == 1
    sub, payload = sender.calls[0]
    assert sub["endpoint"] == "https://push.example/1" and "Read" in payload["body"] and payload["url"] == "/habits"
    assert habit.last_reminded_on == date(2025, 1, 15)
    assert reminders.send_due_reminders(NOW + timedelta(minutes=5), sender)["sent"] == 0  # no se repite el mismo día


@pytest.mark.parametrize(
    ("now", "why"),
    [
        (datetime(2025, 1, 15, 19, 30), "antes de la hora (20:30 locales)"),
        (datetime(2025, 1, 15, 23, 30), "fuera de la ventana: ya es 00:30 del día siguiente"),
        (datetime(2025, 1, 16, 0, 30), "pasaron más de 3 horas de las 21:00 locales"),
    ],
)
def test_reminder_respects_user_time_zone_and_window(setup_reminder, now, why):
    assert reminders.send_due_reminders(now, Sender())["sent"] == 0, why


def test_reminder_skipped_when_habit_already_done_today(setup_reminder):
    _, habit = setup_reminder
    db.session.add(HabitLog(habit_id=habit.id, day=date(2025, 1, 15)))
    db.session.commit()
    assert reminders.send_due_reminders(NOW, Sender())["sent"] == 0


def test_reminder_skipped_when_weekly_goal_is_already_met(setup_reminder):
    _, habit = setup_reminder
    habit.target_per_week = 2
    db.session.add_all(
        [HabitLog(habit_id=habit.id, day=date(2025, 1, 13)), HabitLog(habit_id=habit.id, day=date(2025, 1, 14))]
    )
    db.session.commit()
    assert reminders.send_due_reminders(NOW, Sender())["sent"] == 0


def test_weekly_reminder_text_shows_progress_and_respects_locale(setup_reminder):
    u, habit = setup_reminder
    habit.target_per_week = 3
    u.locale = "es"
    db.session.add(HabitLog(habit_id=habit.id, day=date(2025, 1, 13)))
    db.session.commit()
    sender = Sender()
    reminders.send_due_reminders(NOW, sender)
    assert sender.calls[0][1]["body"] == "Hora de Read. 1/3 esta semana."


def test_failed_delivery_is_retried_and_gone_subscriptions_are_removed(setup_reminder):
    u, habit = setup_reminder
    assert reminders.send_due_reminders(NOW, Sender(result=False))["sent"] == 0
    assert habit.last_reminded_on is None  # no entregado: se reintenta en la siguiente pasada
    stats = reminders.send_due_reminders(NOW, Sender(gone=True))
    assert stats["subscriptions_removed"] == 1 and stats["sent"] == 0
    assert db.session.scalar(db.select(db.func.count(PushSubscription.id))) == 0


def test_no_reminder_without_subscription_or_for_archived_habits(setup_reminder):
    _, habit = setup_reminder
    habit.archived = True
    db.session.commit()
    assert reminders.send_due_reminders(NOW, Sender())["sent"] == 0
    habit.archived = False
    db.session.execute(db.delete(PushSubscription))
    db.session.commit()
    assert reminders.send_due_reminders(NOW, Sender())["checked"] == 0


def test_invalid_time_zone_falls_back_to_utc(setup_reminder):
    u, habit = setup_reminder
    u.timezone = "Mars/Olympus"
    db.session.commit()
    assert str(reminders.user_zone(u)) == "UTC"


def test_changing_reminder_time_allows_a_new_reminder_today(client, setup_reminder):
    _, habit = setup_reminder
    habit.last_reminded_on = date(2025, 1, 15)
    db.session.commit()
    client.post("/api/auth/login", json={"email": "ana@example.com", "password": "Sup3rsecret!"})
    client.patch(f"/api/habits/{habit.id}", json={"reminder_time": "20:45"})
    db.session.refresh(habit)
    assert habit.last_reminded_on is None


# ---- API push ------------------------------------------------------------------------------------
SUB = {
    "endpoint": "https://push.example/abc",
    "keys": {"p256dh": "p" * 20, "auth": "a" * 10},
    "timezone": "Europe/Madrid",
}


def test_push_status_requires_auth_and_reports_public_key(client, app, user):
    assert app.test_client().get("/api/push/status").status_code == 401
    status = client.get("/api/push/status").get_json()
    assert status["public_key"] == "test-public-key" and status["subscriptions"] == 0


def test_push_status_hides_key_when_not_configured(client, user, app):
    app.config["VAPID_PUBLIC_KEY"] = ""
    assert client.get("/api/push/status").get_json()["public_key"] is None


def test_subscribe_is_idempotent_and_stores_time_zone(client, user):
    assert client.post("/api/push/subscribe", json=SUB).status_code == 201
    assert client.post("/api/push/subscribe", json=SUB).get_json()["subscriptions"] == 1
    assert client.get("/api/push/status").get_json()["timezone"] == "Europe/Madrid"
    bad_tz = client.post("/api/push/subscribe", json={**SUB, "timezone": "Mars/Olympus"})
    assert bad_tz.status_code == 201 and client.get("/api/push/status").get_json()["timezone"] == "Europe/Madrid"


def test_subscribe_validates_payload(client, user):
    assert client.post("/api/push/subscribe", json={**SUB, "endpoint": "http://insecure.example/x"}).status_code == 422
    assert client.post("/api/push/subscribe", json={"endpoint": SUB["endpoint"]}).status_code == 422


def test_subscription_moves_to_the_new_account_on_the_same_browser(client, other_client, user):
    client.post("/api/push/subscribe", json=SUB)
    other_client.post("/api/push/subscribe", json=SUB)
    assert client.get("/api/push/status").get_json()["subscriptions"] == 0
    assert other_client.get("/api/push/status").get_json()["subscriptions"] == 1


def test_unsubscribe_only_removes_own_subscription(client, other_client, user):
    client.post("/api/push/subscribe", json=SUB)
    other_client.post("/api/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert client.get("/api/push/status").get_json()["subscriptions"] == 1
    client.post("/api/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert client.get("/api/push/status").get_json()["subscriptions"] == 0


def test_push_test_endpoint(client, user, app, monkeypatch):
    client.post("/api/push/subscribe", json=SUB)
    sent = []
    monkeypatch.setattr(push, "send", lambda sub, payload: sent.append(payload) or True)
    assert client.post("/api/push/test").get_json() == {"sent": 1} and sent[0]["tag"] == "test"
    app.config["VAPID_PRIVATE_KEY"] = ""
    assert client.post("/api/push/test").status_code == 501


def test_push_send_is_noop_without_keys(app):
    app.config["VAPID_PRIVATE_KEY"] = ""
    assert push.send({"endpoint": "https://x.example", "keys": {}}, {"title": "t"}) is False
