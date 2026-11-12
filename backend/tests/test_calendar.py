from datetime import date, timedelta

import pytest

from app.models import CalendarEvent
from app.services import calendar as svc

from .test_buddies import carol, connect, my_id  # noqa: F401

MON = date(2026, 3, 2)  # un lunes


def event(**kw) -> CalendarEvent:
    base = {
        "id": 1,
        "title": "Work",
        "start_date": MON,
        "repeat": "none",
        "weekdays": "",
        "color": "#6366f1",
        "notes": "",
        "every_weeks": 1,
        "shared": False,
    }
    base.update(kw)
    return CalendarEvent(**base)


def days(items) -> list[str]:
    return [o["day"] for o in items]


# ---- expansión de repeticiones (lógica pura) -----------------------------------------------------------
def test_single_event_appears_once():
    out = svc.occurrences(event(), MON - timedelta(days=5), MON + timedelta(days=30), {})
    assert days(out) == [MON.isoformat()]


def test_daily_covers_the_whole_range_and_respects_until():
    out = svc.occurrences(event(repeat="daily", until=MON + timedelta(days=4)), MON, MON + timedelta(days=30), {})
    assert len(out) == 5


def test_chosen_weekdays_only():
    out = svc.occurrences(event(repeat="weekdays", weekdays="1,3"), MON, MON + timedelta(days=13), {})
    assert days(out) == ["2026-03-03", "2026-03-05", "2026-03-10", "2026-03-12"]  # martes y jueves


def test_every_other_week():
    out = svc.occurrences(event(repeat="weekdays", weekdays="0", every_weeks=2), MON, MON + timedelta(days=27), {})
    assert days(out) == ["2026-03-02", "2026-03-16"]


def test_skipped_day_disappears_and_done_is_marked():
    marks = {MON + timedelta(days=1): "skipped", MON + timedelta(days=2): "done"}
    out = svc.occurrences(event(repeat="daily"), MON, MON + timedelta(days=3), marks)
    assert days(out) == ["2026-03-02", "2026-03-04", "2026-03-05"]
    assert [o["done"] for o in out] == [False, True, False]


def test_n_days_per_week_stops_showing_days_once_the_quota_is_done():
    marks = {MON + timedelta(days=i): "done" for i in (0, 2, 4)}  # lunes, miércoles y viernes hechos (3 de 3)
    out = svc.occurrences(event(repeat="weekly_count", per_week=3), MON, MON + timedelta(days=13), marks)
    this_week = [o for o in out if o["day"] < "2026-03-09"]
    assert days(this_week) == ["2026-03-02", "2026-03-04", "2026-03-06"]  # solo los hechos
    assert all(o["flexible"] and o["week_done"] == 3 for o in this_week)
    next_week = [o for o in out if o["day"] >= "2026-03-09"]
    assert len(next_week) == 7 and next_week[0]["week_done"] == 0  # la semana siguiente empieza de cero


# ---- API -----------------------------------------------------------------------------------------------
def new_event(client, **kw):
    body = {"title": "Deep work", "start_date": "2026-03-02", **kw}
    return client.post("/api/calendar/events", json=body)


def test_create_list_update_delete(client, user):
    r = new_event(client, start_time="09:00", duration_min=60, repeat="daily")
    assert r.status_code == 201
    eid = r.get_json()["id"]
    got = client.get("/api/calendar?from=2026-03-02&to=2026-03-08").get_json()
    assert len(got["occurrences"]) == 7 and got["events"][0]["start_time"] == "09:00"

    r = client.patch(f"/api/calendar/events/{eid}", json={"repeat": "weekdays", "weekdays": [1, 3], "color": "#ef4444"})
    assert r.status_code == 200 and r.get_json()["weekdays"] == [1, 3]
    got = client.get("/api/calendar?from=2026-03-02&to=2026-03-08").get_json()
    assert days(got["occurrences"]) == ["2026-03-03", "2026-03-05"]

    assert client.delete(f"/api/calendar/events/{eid}").status_code == 200
    assert client.get("/api/calendar?from=2026-03-02&to=2026-03-08").get_json()["events"] == []


@pytest.mark.parametrize(
    "bad",
    [
        {"repeat": "weekdays"},  # sin días elegidos
        {"repeat": "weekly_count"},  # sin cuántos por semana
        {"repeat": "daily", "until": "2026-01-01"},  # termina antes de empezar
        {"duration_min": 30},  # duración sin hora
        {"color": "red"},
        {"repeat": "weekdays", "weekdays": [7]},
        {"title": ""},
        {"every_weeks": 9},
    ],
)
def test_invalid_events_are_rejected(client, user, bad):
    assert new_event(client, **bad).status_code == 422


def test_patch_cannot_make_event_invalid_or_use_unknown_fields(client, user):
    eid = new_event(client).get_json()["id"]
    assert client.patch(f"/api/calendar/events/{eid}", json={"repeat": "weekdays"}).status_code == 422
    assert client.patch(f"/api/calendar/events/{eid}", json={"user_id": 5}).status_code == 422


def test_cross_field_errors_name_the_field_that_is_wrong(client, user):
    r = new_event(client, repeat="daily", until="2026-01-01")
    assert r.status_code == 422 and r.get_json()["error"]["details"][0]["field"] == "until"
    r = new_event(client, repeat="weekdays")
    assert r.get_json()["error"]["details"][0]["field"] == "weekdays"
    r = new_event(client, duration_min=30)
    assert r.get_json()["error"]["details"][0]["field"] == "duration_min"


def test_patch_removing_the_time_also_drops_the_duration(client, user):
    eid = new_event(client, start_time="09:00", duration_min=60).get_json()["id"]
    r = client.patch(f"/api/calendar/events/{eid}", json={"start_time": None})
    assert r.status_code == 200
    assert r.get_json()["start_time"] is None and r.get_json()["duration_min"] is None


def test_patch_to_a_single_event_ignores_an_old_end_date(client, user):
    eid = new_event(client, repeat="daily", until="2026-03-10").get_json()["id"]
    r = client.patch(f"/api/calendar/events/{eid}", json={"repeat": "none", "start_date": "2026-06-01"})
    assert r.status_code == 200
    assert r.get_json()["until"] is None and r.get_json()["start_date"] == "2026-06-01"
    # Si sigue repitiéndose, la fecha final anterior al inicio sí es un error y se atribuye a `until`.
    r = client.patch(f"/api/calendar/events/{eid}", json={"repeat": "daily", "until": "2026-01-01"})
    assert r.status_code == 422 and r.get_json()["error"]["details"][0]["field"] == "until"


def test_edit_every_kind_of_event_after_creating_it(client, user):
    """Lo que hace el formulario al editar: reenviar el evento entero (sin id) con algún cambio."""
    bodies = [
        {},
        {"start_time": "10:30", "duration_min": 90},
        {"repeat": "daily", "until": "2026-12-31"},
        {"repeat": "weekdays", "weekdays": [0, 2, 4], "every_weeks": 2},
        {"repeat": "weekly_count", "per_week": 3},
        {"notes": "x", "color": "#ef4444"},
    ]
    for body in bodies:
        created = new_event(client, **body).get_json()
        eid = created.pop("id")
        created["title"] = "Renamed"
        r = client.patch(f"/api/calendar/events/{eid}", json=created)
        assert r.status_code == 200, (body, r.get_json())
        assert r.get_json()["title"] == "Renamed"


def test_mark_days_done_skipped_and_cleared(client, user):
    eid = new_event(client, repeat="daily").get_json()["id"]
    q = "/api/calendar?from=2026-03-02&to=2026-03-04"
    assert client.put(f"/api/calendar/events/{eid}/days/2026-03-03", json={"status": "done"}).status_code == 200
    assert client.put(f"/api/calendar/events/{eid}/days/2026-03-04", json={"status": "skipped"}).status_code == 200
    occ = client.get(q).get_json()["occurrences"]
    assert [(o["day"], o["done"]) for o in occ] == [("2026-03-02", False), ("2026-03-03", True)]
    assert client.put(f"/api/calendar/events/{eid}/days/2026-03-03", json={"status": None}).status_code == 200
    assert client.put(f"/api/calendar/events/{eid}/days/2026-03-01", json={"status": "done"}).status_code == 422
    assert client.put(f"/api/calendar/events/{eid}/days/nope", json={"status": "done"}).status_code == 422


def test_range_is_validated(client, user):
    assert client.get("/api/calendar?from=2026-03-10&to=2026-03-01").status_code == 422
    assert client.get("/api/calendar?from=2026-01-01&to=2026-12-31").status_code == 422
    assert client.get("/api/calendar?from=banana").status_code == 422


def test_events_are_private_to_their_owner(client, other_client, user):
    eid = new_event(client).get_json()["id"]
    assert other_client.patch(f"/api/calendar/events/{eid}", json={"title": "x"}).status_code == 404
    assert other_client.delete(f"/api/calendar/events/{eid}").status_code == 404
    assert other_client.put(f"/api/calendar/events/{eid}/days/2026-03-02", json={"status": "done"}).status_code == 404
    assert other_client.get("/api/calendar?from=2026-03-02&to=2026-03-08").get_json()["events"] == []


def test_calendar_requires_login(app):
    assert app.test_client().get("/api/calendar").status_code == 401


# ---- mini perfil y metas compartidas -------------------------------------------------------------------
def test_buddy_profile_shows_only_shared_goals(client, other_client, user):
    connect(client, other_client)
    client.post("/api/goals", json={"title": "Correr 10K", "description": "privado", "shared": True})
    client.post("/api/goals", json={"title": "Cambiar de trabajo"})
    client.patch("/api/auth/me", json={"bio": "Hola, soy Ana"})
    r = other_client.get(f"/api/buddies/{my_id(client)}/profile")
    assert r.status_code == 200
    body = r.get_json()
    assert body["user"]["bio"] == "Hola, soy Ana"
    assert [g["title"] for g in body["goals"]] == ["Correr 10K"]
    assert "description" not in body["goals"][0] and "email" not in str(body)


def test_profile_is_hidden_from_strangers_and_self_requests(client, other_client, user):
    client.post("/api/goals", json={"title": "Meta", "shared": True})
    assert other_client.get(f"/api/buddies/{my_id(client)}/profile").status_code == 404


def test_goal_shared_flag_can_be_toggled(client, user):
    g = client.post("/api/goals", json={"title": "Meta"}).get_json()
    assert g["shared"] is False
    assert client.patch(f"/api/goals/{g['id']}", json={"shared": True}).get_json()["shared"] is True
    assert client.patch(f"/api/goals/{g['id']}", json={"shared": None}).status_code == 422


def test_bio_is_limited_and_can_be_cleared(client, user):
    assert client.patch("/api/auth/me", json={"bio": "x" * 161}).status_code == 422
    client.patch("/api/auth/me", json={"bio": "hola"})
    assert client.patch("/api/auth/me", json={"bio": ""}).get_json()["user"]["bio"] == ""


def test_config_tells_the_client_whether_mail_works(app):
    c = app.test_client()
    assert c.get("/api/auth/config").get_json()["mail_enabled"] is False
    app.config["SENDGRID_API_KEY"] = "SG.x"
    assert c.get("/api/auth/config").get_json()["mail_enabled"] is True
