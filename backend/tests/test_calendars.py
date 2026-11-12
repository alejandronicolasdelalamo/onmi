"""Calendarios con nombre: el Personal es privado y cada calendario se comparte con las personas que elijas."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import sqlalchemy as sa
from flask_migrate import upgrade

from app import create_app
from app.extensions import db
from app.models import Calendar, CalendarEvent, CalendarViewer

from .test_buddies import carol, connect, my_id  # noqa: F401

Q = "from=2026-03-02&to=2026-03-08"
MIGRATIONS = str(Path(__file__).resolve().parent.parent / "migrations")


def new_cal(client, name="Familia", viewers=(), **kw):
    return client.post("/api/calendar/calendars", json={"name": name, "user_ids": list(viewers), **kw})


def new_event(client, **kw):
    return client.post("/api/calendar/events", json={"title": "Cena", "start_date": "2026-03-02", **kw})


def shared_titles(client):
    cals = client.get(f"/api/calendar/shared?{Q}").get_json()["calendars"]
    return {c["calendar"]["name"]: [o["title"] for o in c["occurrences"]] for c in cals}


# ---- calendario personal --------------------------------------------------------------------------------
def test_everyone_has_a_private_personal_calendar(client, user):
    mine = client.get("/api/calendar/calendars").get_json()["mine"]
    assert [(c["name"], c["is_default"], c["viewers"]) for c in mine] == [("Personal", True, [])]
    pid = mine[0]["id"]
    assert new_event(client).get_json()["calendar_id"] == pid
    assert client.delete(f"/api/calendar/calendars/{pid}").status_code == 409
    assert client.patch(f"/api/calendar/calendars/{pid}", json={"name": "Otro"}).status_code == 409


def test_personal_can_never_be_shared(client, other_client, user):
    connect(client, other_client)
    pid = client.get("/api/calendar/calendars").get_json()["mine"][0]["id"]
    r = client.patch(f"/api/calendar/calendars/{pid}", json={"user_ids": [my_id(other_client)]})
    assert r.status_code == 409 and r.get_json()["error"]["code"] == "personal_is_private"
    new_event(client, title="Mío")
    assert other_client.get(f"/api/calendar/shared?{Q}").get_json()["calendars"] == []


# ---- varios calendarios y con quién se comparten --------------------------------------------------------------
def test_several_calendars_each_shared_with_different_people(client, other_client, carol, user):  # noqa: F811
    connect(client, other_client)
    connect(client, carol)
    bob, car = my_id(other_client), my_id(carol)
    fam = new_cal(client, "Familia", [bob, car]).get_json()  # un calendario con varias personas
    work = new_cal(client, "Trabajo", [bob]).get_json()  # otro solo con una
    solo = new_cal(client, "Solo yo").get_json()  # y otro privado
    new_event(client, title="Cumple", calendar_id=fam["id"])
    new_event(client, title="Reunión", calendar_id=work["id"])
    new_event(client, title="Diario", calendar_id=solo["id"])
    new_event(client, title="Personal")

    assert shared_titles(other_client) == {"Familia": ["Cumple"], "Trabajo": ["Reunión"]}
    assert shared_titles(carol) == {"Familia": ["Cumple"]}
    assert shared_titles(client) == {}  # quien comparte no se ve a sí mismo
    # Yo veo todo lo mío junto, con el calendario de cada evento.
    occ = client.get(f"/api/calendar?{Q}").get_json()["occurrences"]
    assert {o["title"]: o["shared"] for o in occ} == {
        "Cumple": True,
        "Reunión": True,
        "Diario": False,
        "Personal": False,
    }


def test_shared_events_never_expose_notes_and_only_to_viewers(client, other_client, carol, user):  # noqa: F811
    connect(client, other_client)
    connect(client, carol)
    cal = new_cal(client, "Pareja", [my_id(other_client)]).get_json()
    new_event(client, title="Cita", notes="secreto", calendar_id=cal["id"])
    got = other_client.get(f"/api/calendar/shared?{Q}").get_json()
    assert "notes" not in got["calendars"][0]["occurrences"][0] and "secreto" not in str(got)
    assert shared_titles(carol) == {}  # compañera, pero no es parte de este calendario


def test_calendars_can_only_be_shared_with_accepted_buddies(client, other_client, user):
    assert new_cal(client, "X", [my_id(other_client)]).status_code == 404
    connect(client, other_client)
    assert new_cal(client, "X", [my_id(other_client)]).status_code == 201
    assert new_cal(client, "Y", [99999]).status_code == 404


def test_change_who_a_calendar_is_shared_with(client, other_client, carol, user):  # noqa: F811
    connect(client, other_client)
    connect(client, carol)
    bob, car = my_id(other_client), my_id(carol)
    cal = new_cal(client, "Club", [bob]).get_json()
    new_event(client, title="Partido", calendar_id=cal["id"])
    assert shared_titles(other_client) == {"Club": ["Partido"]} and shared_titles(carol) == {}

    r = client.patch(
        f"/api/calendar/calendars/{cal['id']}", json={"user_ids": [car], "name": "Club 2", "color": "#ef4444"}
    )
    assert r.status_code == 200 and [v["id"] for v in r.get_json()["viewers"]] == [car]
    assert shared_titles(other_client) == {} and shared_titles(carol) == {"Club 2": ["Partido"]}

    client.patch(f"/api/calendar/calendars/{cal['id']}", json={"user_ids": []})
    assert shared_titles(carol) == {}


def test_moving_an_event_between_calendars_changes_who_sees_it(client, other_client, user):
    connect(client, other_client)
    cal = new_cal(client, "Equipo", [my_id(other_client)]).get_json()
    ev = new_event(client, title="Daily").get_json()
    assert shared_titles(other_client) == {"Equipo": []}
    moved = client.patch(f"/api/calendar/events/{ev['id']}", json={"calendar_id": cal["id"]})
    assert moved.status_code == 200 and moved.get_json()["shared"] is True
    assert shared_titles(other_client) == {"Equipo": ["Daily"]}
    client.patch(f"/api/calendar/events/{ev['id']}", json={"calendar_id": None})  # vuelve al Personal
    assert shared_titles(other_client) == {"Equipo": []}


def test_cannot_use_or_edit_someone_elses_calendar(client, other_client, user):
    mine = new_cal(client, "Mío").get_json()
    assert new_event(other_client, calendar_id=mine["id"]).status_code == 404
    assert other_client.patch(f"/api/calendar/calendars/{mine['id']}", json={"name": "x"}).status_code == 404
    assert other_client.delete(f"/api/calendar/calendars/{mine['id']}").status_code == 404
    ev = new_event(client, calendar_id=mine["id"]).get_json()
    theirs = new_cal(other_client, "Suyo").get_json()
    assert client.patch(f"/api/calendar/events/{ev['id']}", json={"calendar_id": theirs["id"]}).status_code == 404


def test_deleting_a_calendar_keeps_its_events_in_personal(client, other_client, user):
    connect(client, other_client)
    cal = new_cal(client, "Temporal", [my_id(other_client)]).get_json()
    new_event(client, title="Se queda", calendar_id=cal["id"])
    r = client.delete(f"/api/calendar/calendars/{cal['id']}")
    assert r.get_json() == {"ok": True, "moved_events": 1}
    got = client.get(f"/api/calendar?{Q}").get_json()
    assert [(o["title"], o["shared"]) for o in got["occurrences"]] == [("Se queda", False)]
    assert shared_titles(other_client) == {}


def test_breaking_the_friendship_stops_the_sharing(client, other_client, user):
    connect(client, other_client)
    cal = new_cal(client, "A", [my_id(other_client)]).get_json()
    new_event(client, calendar_id=cal["id"])
    assert shared_titles(other_client) == {"A": ["Cena"]}
    fid = client.get("/api/buddies").get_json()["friends"][0]["friendship_id"]
    client.delete(f"/api/buddies/{fid}")
    assert shared_titles(other_client) == {}
    assert (
        client.get("/api/calendar/calendars").get_json()["mine"][1]["viewers"] == []
    )  # y la persona ya no figura como destinataria


def test_shared_with_me_lists_calendars_and_their_owners(client, other_client, user):
    connect(client, other_client)
    new_cal(client, "Plan", [my_id(other_client)])
    s = other_client.get("/api/calendar/calendars").get_json()
    assert [(c["name"], c["owner"]["id"]) for c in s["shared_with_me"]] == [("Plan", my_id(client))]
    assert [b["id"] for b in s["buddies"]] == [my_id(client)]


def test_calendar_limit_and_validation(client, user):
    assert new_cal(client, "").status_code == 422
    assert new_cal(client, "x" * 61).status_code == 422
    assert new_cal(client, "C", color="rojo").status_code == 422
    for i in range(19):
        assert new_cal(client, f"c{i}").status_code == 201
    assert new_cal(client, "uno más").status_code == 409


def test_demo_cannot_share_but_sees_the_example_shared_calendar(app):
    c = app.test_client()
    assert c.post("/api/auth/demo").status_code == 200
    sam = c.get("/api/calendar/calendars").get_json()["buddies"][0]["id"]
    assert new_cal(c, "Mi plan", [sam]).status_code == 403
    assert new_cal(c, "Solo yo").status_code == 201  # un calendario privado extra sí
    shared = c.get("/api/calendar/shared").get_json()["calendars"]
    assert [x["calendar"]["name"] for x in shared] == ["Running"]
    assert all(o["title"] != "Therapy" for x in shared for o in x["occurrences"])  # el personal de Sam no se ve


def test_an_old_demo_without_calendars_gets_them_back_once(app):
    c = app.test_client()
    assert c.post("/api/auth/demo").status_code == 200
    db.session.execute(db.delete(CalendarViewer))
    db.session.execute(db.delete(CalendarEvent))
    db.session.execute(db.delete(Calendar))
    db.session.commit()
    app.test_client().post("/api/auth/demo")
    c2 = app.test_client()
    c2.post("/api/auth/demo")
    mine = c2.get("/api/calendar?from=2026-01-01&to=2026-02-15").get_json()
    assert {e["title"] for e in mine["events"]} == {"Deep work", "Gym", "Study Spanish", "Dentist"}
    assert [s["calendar"]["name"] for s in c2.get("/api/calendar/shared").get_json()["calendars"]] == ["Running"]
    c2.post("/api/auth/demo")
    assert db.session.scalar(db.select(db.func.count(CalendarEvent.id))) == 6


# ---- datos privados de ONMi sobre el calendario ---------------------------------------------------------------
def test_activity_layers_show_my_habits_goals_projects_mood_and_focus(client, other_client, user):
    today = datetime.now(timezone.utc).date()  # el servidor cuenta los días en UTC
    h = client.post("/api/habits", json={"name": "Leer"}).get_json()
    client.post(f"/api/habits/{h['id']}/toggle", json={"date": today.isoformat()})
    client.post("/api/goals", json={"title": "Entregar", "due_date": today.isoformat()})
    client.post("/api/projects", json={"name": "Web", "due_date": (today + timedelta(days=1)).isoformat()})
    client.put("/api/moods", json={"mood": "happy", "note": "bien", "date": today.isoformat()})
    client.post("/api/pomodoro", json={"kind": "work", "duration_seconds": 1500, "completed": True})
    rng = f"from={today.isoformat()}&to={(today + timedelta(days=2)).isoformat()}&today={today.isoformat()}"
    items = client.get(f"/api/calendar/activity?{rng}").get_json()["items"]
    kinds = {i["kind"] for i in items}
    assert {"habit", "goal_due", "project_due", "mood", "focus"} <= kinds
    assert next(i for i in items if i["kind"] == "focus")["minutes"] == 25
    # Es privado: otra persona no ve nada de esto, y lo compartido nunca lo incluye.
    assert other_client.get(f"/api/calendar/activity?{rng}").get_json()["items"] == []


def test_activity_range_is_validated_and_needs_login(app, client, user):
    assert client.get("/api/calendar/activity?from=2026-01-01&to=2027-01-01").status_code == 422
    assert app.test_client().get("/api/calendar/activity").status_code == 401


# ---- migración de datos existentes -----------------------------------------------------------------------
def test_migration_moves_old_shared_events_to_a_shared_calendar(tmp_path, monkeypatch):
    """Quien ya compartía eventos conserva exactamente lo que veían los demás; lo privado pasa al Personal."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'mig.db').as_posix()}")
    app = create_app("development")
    with app.app_context():
        upgrade(directory=MIGRATIONS, revision="f7a8b9c0d1e2")
        conn = db.engine.connect()
        now = "2026-03-01 00:00:00"
        cols = (
            "name, email, role, is_active, email_verified, is_demo, failed_logins, locale, timezone, "
            "ai_coach_enabled, bio, created_at"
        )
        for uid, name in ((1, "Ana"), (2, "Bob")):
            conn.execute(
                sa.text(
                    f"INSERT INTO users (id, {cols}) VALUES (:i, :n, :e, 'USER', 1, 1, 0, 0, 'en', 'UTC', 0, '', :now)"
                ),
                {"i": uid, "n": name, "e": f"{name}@x.io", "now": now},
            )
        ev = (
            "INSERT INTO calendar_events (user_id, title, notes, color, start_date, repeat, weekdays, every_weeks, "
            "shared, created_at) VALUES (1, :t, '', '#6366f1', '2026-03-02', 'none', '', 1, :s, :now)"
        )
        conn.execute(sa.text(ev), {"t": "Privado", "s": 0, "now": now})
        conn.execute(sa.text(ev), {"t": "Compartido", "s": 1, "now": now})
        conn.execute(
            sa.text("INSERT INTO calendar_shares (owner_id, viewer_id, created_at) VALUES (1, 2, :now)"), {"now": now}
        )
        conn.commit()
        conn.close()

        upgrade(directory=MIGRATIONS)
        rows = db.session.execute(
            sa.text(
                "SELECT e.title, c.name, c.is_default FROM calendar_events e JOIN calendars c ON c.id = e.calendar_id "
                "ORDER BY e.title"
            )
        ).all()
        assert [tuple(r) for r in rows] == [("Compartido", "Shared", 0), ("Privado", "Personal", 1)]
        viewers = db.session.execute(
            sa.text(
                "SELECT v.viewer_id FROM calendar_viewers v JOIN calendars c ON c.id = v.calendar_id "
                "WHERE c.name = 'Shared'"
            )
        ).all()
        assert [r[0] for r in viewers] == [2]


# ---- un solo Personal por usuario ------------------------------------------------------------------------
def test_database_refuses_a_second_personal_calendar(client, user):
    import pytest
    from sqlalchemy.exc import IntegrityError

    client.get("/api/calendar/calendars")
    uid = my_id(client)
    with pytest.raises(IntegrityError):
        db.session.add(Calendar(user_id=uid, name="Otro", is_default=True))
        db.session.commit()
    db.session.rollback()
    # Los calendarios normales no tienen límite por esa regla.
    db.session.add(Calendar(user_id=uid, name="Normal", is_default=False))
    db.session.commit()


def test_a_lost_race_creating_personal_falls_back_to_the_existing_one(app, client, user):
    """Si otra petición se adelanta y crea el Personal, se usa ese en vez de fallar o duplicar."""
    from app.models import User
    from app.services import calendars as cals

    uid = my_id(client)
    first = cals.ensure_personal(db.session.get(User, uid))
    db.session.commit()
    again = cals.ensure_personal(db.session.get(User, uid))
    assert again.id == first.id
    assert db.session.scalar(db.select(db.func.count(Calendar.id)).filter_by(user_id=uid, is_default=True)) == 1


def test_migration_merges_duplicate_personal_calendars(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'mig.db').as_posix()}")
    app = create_app("development")
    with app.app_context():
        upgrade(directory=MIGRATIONS, revision="g8b9c0d1e2f3")
        conn = db.engine.connect()
        now = "2026-03-01 00:00:00"
        conn.execute(
            sa.text(
                "INSERT INTO users (id, name, email, role, is_active, email_verified, is_demo, failed_logins, locale, "
                "timezone, ai_coach_enabled, bio, created_at) "
                "VALUES (1, 'Ana', 'a@x.io', 'USER', 1, 1, 0, 0, 'en', 'UTC', 0, '', :now)"
            ),
            {"now": now},
        )
        for cid in (10, 11):
            conn.execute(
                sa.text(
                    "INSERT INTO calendars (id, user_id, name, color, is_default, created_at) "
                    "VALUES (:c, 1, 'Personal', '#6366f1', 1, :now)"
                ),
                {"c": cid, "now": now},
            )
            conn.execute(
                sa.text(
                    "INSERT INTO calendar_events (user_id, title, notes, color, start_date, repeat, weekdays, "
                    "every_weeks, shared, calendar_id, created_at) "
                    "VALUES (1, :t, '', '#6366f1', '2026-03-02', 'none', '', 1, 0, :c, :now)"
                ),
                {"t": f"Evento {cid}", "c": cid, "now": now},
            )
        conn.commit()
        conn.close()

        upgrade(directory=MIGRATIONS)
        cals_left = db.session.execute(sa.text("SELECT id FROM calendars")).all()
        assert [r[0] for r in cals_left] == [10]
        events = db.session.execute(sa.text("SELECT title, calendar_id FROM calendar_events ORDER BY title")).all()
        assert [tuple(r) for r in events] == [("Evento 10", 10), ("Evento 11", 10)]
