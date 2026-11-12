from datetime import timedelta

from app.api.auth import device_label
from app.extensions import db
from app.models import Note, UserSession
from app.utils import utcnow

from .conftest import PASSWORD, register

H = "X-Notes-Unlock"


# ---- metas: hitos y elementos vinculados ----------------------------------------------------------------
def test_milestones_crud_and_progress(client, user):
    g = client.post("/api/goals", json={"title": "Correr 10k"}).get_json()
    for title in ("Correr 5k", "Correr 8k"):
        r = client.post(f"/api/goals/{g['id']}/milestones", json={"title": title})
        assert r.status_code == 201
    goal = r.get_json()
    assert [m["title"] for m in goal["milestones"]] == ["Correr 5k", "Correr 8k"] and goal["milestones_done"] == 0
    mid = goal["milestones"][0]["id"]
    ticked = client.patch(f"/api/goals/milestones/{mid}", json={"done": True}).get_json()
    assert ticked["milestones_done"] == 1
    gone = client.delete(f"/api/goals/milestones/{mid}").get_json()
    assert [m["position"] for m in gone["milestones"]] == [0] and gone["milestones_done"] == 0


def test_milestones_are_private_and_limited(client, other_client, user):
    g = client.post("/api/goals", json={"title": "G"}).get_json()
    ms = client.post(f"/api/goals/{g['id']}/milestones", json={"title": "h"}).get_json()["milestones"][0]
    assert other_client.post(f"/api/goals/{g['id']}/milestones", json={"title": "x"}).status_code == 404
    assert other_client.patch(f"/api/goals/milestones/{ms['id']}", json={"done": True}).status_code == 404
    assert other_client.delete(f"/api/goals/milestones/{ms['id']}").status_code == 404
    for i in range(29):
        assert client.post(f"/api/goals/{g['id']}/milestones", json={"title": f"h{i}"}).status_code == 201
    assert client.post(f"/api/goals/{g['id']}/milestones", json={"title": "uno más"}).status_code == 409


def test_goal_shows_linked_habits_and_visible_notes_only(client, user):
    token = client.post("/api/notes/lock/password", json={"password": "ocultas1"}).get_json()["token"]
    g = client.post("/api/goals", json={"title": "Salud"}).get_json()
    client.post("/api/habits", json={"name": "Caminar", "goal_id": g["id"]})
    client.post("/api/notes", json={"title": "Plan", "goal_id": g["id"]})
    client.post("/api/notes", json={"title": "Secreta", "goal_id": g["id"], "locked": True})
    trashed = client.post("/api/notes", json={"title": "Vieja", "goal_id": g["id"]}).get_json()
    client.delete(f"/api/notes/{trashed['id']}")
    linked = client.get(f"/api/goals/{g['id']}").get_json()["linked"]
    assert [h["name"] for h in linked["habits"]] == ["Caminar"]
    assert [n["title"] for n in linked["notes"]] == ["Plan"]
    assert token


def test_project_activity(client, other_client, user):
    p = client.post("/api/projects", json={"name": "Web"}).get_json()
    g = client.post("/api/goals", json={"title": "Diseño", "project_id": p["id"]}).get_json()
    client.patch(f"/api/goals/{g['id']}", json={"done": True})
    client.post("/api/notes", json={"title": "Idea", "project_id": p["id"]})
    kinds = [i["kind"] for i in client.get(f"/api/projects/{p['id']}/activity").get_json()["items"]]
    assert {"goal_created", "goal_done", "note"} <= set(kinds)
    assert other_client.get(f"/api/projects/{p['id']}/activity").status_code == 404


# ---- búsqueda global --------------------------------------------------------------------------------------
def test_search_across_everything_but_never_hidden_or_trashed(client, user):
    client.post("/api/notes/lock/password", json={"password": "ocultas1"})
    client.post("/api/notes", json={"title": "Receta de pan", "content": "harina"})
    client.post("/api/notes", json={"title": "Pan secreto", "content": "x", "locked": True})
    gone = client.post("/api/notes", json={"title": "Pan viejo"}).get_json()
    client.delete(f"/api/notes/{gone['id']}")
    client.post("/api/habits", json={"name": "Hacer pan"})
    client.post("/api/projects", json={"name": "Panadería"})
    client.post("/api/goals", json={"title": "Pan casero"})
    client.post(
        "/api/calendar/events",
        json={"title": "Curso de pan", "start_date": "2026-11-12", "repeat": "none"},
    )
    out = client.get("/api/search?q=pan").get_json()
    assert [n["title"] for n in out["notes"]] == ["Receta de pan"]
    assert [h["name"] for h in out["habits"]] == ["Hacer pan"]
    assert [p["name"] for p in out["projects"]] == ["Panadería"]
    assert [g["title"] for g in out["goals"]] == ["Pan casero"]
    assert len(out["events"]) == 1
    assert "secreto" not in client.get("/api/search?q=secreto").get_data(as_text=True)


def test_search_needs_two_chars_is_private_and_escapes_wildcards(client, other_client, user):
    client.post("/api/notes", json={"title": "100% seguro"})
    client.post("/api/notes", json={"title": "Otra cosa"})
    assert client.get("/api/search?q=a").get_json()["notes"] == []
    assert [n["title"] for n in client.get("/api/search?q=%25 s").get_json()["notes"]] == ["100% seguro"]
    assert client.get("/api/search?q=%25%25").get_json()["notes"] == []  # "%%" no es un comodín
    assert other_client.get("/api/search?q=seguro").get_json()["notes"] == []


# ---- importar copia de seguridad ------------------------------------------------------------------------
def test_export_then_import_round_trip_and_idempotent(client, other_client, user):
    p = client.post("/api/projects", json={"name": "Web", "status": "in_progress"}).get_json()
    g = client.post("/api/goals", json={"title": "Lanzar", "project_id": p["id"]}).get_json()
    h = client.post("/api/habits", json={"name": "Leer", "goal_id": g["id"]}).get_json()
    client.post(f"/api/habits/{h['id']}/toggle", json={"date": "2026-11-10"})
    client.post("/api/notes", json={"title": "Nota", "content": "hola", "tags": ["a", "a", "b"], "pinned": True})
    client.put("/api/moods", json={"mood": "happy", "date": "2026-11-10"})
    backup = client.get("/api/auth/export").get_json()

    first = other_client.post("/api/backup/import", json=backup)
    assert first.status_code == 200
    assert first.get_json() == {"notes": 1, "projects": 1, "goals": 1, "habits": 1, "moods": 1, "skipped": 0}
    n = other_client.get("/api/notes").get_json()["items"][0]
    assert n["tags"] == ["a", "b"] and n["pinned"] is True
    hab = other_client.get("/api/habits").get_json()["items"][0]
    assert hab["dates"] == ["2026-11-10"]
    assert other_client.get("/api/goals").get_json()["items"][0]["project_id"] is not None

    again = other_client.post("/api/backup/import", json=backup).get_json()
    assert again == {"notes": 0, "projects": 0, "goals": 0, "habits": 0, "moods": 0, "skipped": 0}


def test_import_rejects_garbage_and_skips_bad_items(client, user):
    assert client.post("/api/backup/import", json={"hola": 1}).status_code == 422
    assert client.post("/api/backup/import", json=[1, 2]).status_code == 422
    r = client.post(
        "/api/backup/import",
        json={
            "notes": [
                {"title": "ok", "content": "x"},
                {"title": "", "content": "x"},
                {"title": "con foto", "content": "![](onmi-image:3)"},
                {"title": "oculta", "content": "x", "locked": True},
                "no soy un objeto",
            ],
            "moods": [{"date": "2026-11-01", "mood": "enfadadisimo"}],
        },
    )
    assert r.get_json()["notes"] == 1 and r.get_json()["skipped"] == 4


def test_demo_cannot_import(client):
    client.post("/api/auth/demo")
    assert client.post("/api/backup/import", json={"notes": []}).status_code == 403


# ---- sesiones por dispositivo -----------------------------------------------------------------------------
def test_device_labels():
    iphone = (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1"
    )
    assert device_label(iphone) == "iPhone · Safari"
    assert device_label("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537") == "Windows · Chrome"
    assert device_label("", mobile_app=True) == "ONMi app"
    assert device_label("curl/8") == "?"


def login(app, email="ana@example.com", ua="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604"):
    c = app.test_client()
    r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD}, headers={"User-Agent": ua})
    assert r.status_code == 200
    return c


def test_sessions_list_and_revoke_other_device(app, client, user):
    phone = login(app)
    sessions = client.get("/api/auth/sessions").get_json()["items"]
    assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
    other = next(s for s in sessions if not s["current"])
    assert other["device"] == "iPhone · Safari"

    assert phone.get("/api/auth/me").status_code == 200
    assert client.delete(f"/api/auth/sessions/{other['id']}").status_code == 200
    # El dispositivo cerrado deja de funcionar al instante (sin esperar a que caduque su token).
    gone = phone.get("/api/auth/me")
    assert gone.status_code == 401 and gone.get_json()["error"]["code"] == "session_revoked"
    assert phone.post("/api/auth/refresh").status_code == 401
    assert client.get("/api/auth/me").status_code == 200  # la sesión actual sigue
    assert len(client.get("/api/auth/sessions").get_json()["items"]) == 1


def test_cannot_revoke_current_or_foreign_sessions_and_revoke_all_others(app, client, other_client, user):
    mine = client.get("/api/auth/sessions").get_json()["items"][0]
    assert client.delete(f"/api/auth/sessions/{mine['id']}").status_code == 400
    theirs = other_client.get("/api/auth/sessions").get_json()["items"][0]
    assert client.delete(f"/api/auth/sessions/{theirs['id']}").status_code == 404
    login(app), login(app)
    assert client.delete("/api/auth/sessions").get_json() == {"revoked": 2}
    assert other_client.get("/api/auth/me").status_code == 200


def test_logout_revokes_the_session_and_refresh_keeps_it(app, client, user):
    before = client.get("/api/auth/sessions").get_json()["items"]
    assert client.post("/api/auth/refresh").status_code == 200
    after = client.get("/api/auth/sessions").get_json()["items"]
    assert [s["id"] for s in after] == [s["id"] for s in before]  # renovar no crea otra sesión
    sid = after[0]["id"]
    client.post("/api/auth/logout")
    assert db.session.get(UserSession, sid).revoked_at is not None


def test_legacy_tokens_without_session_still_refresh(app, client, user):
    from flask_jwt_extended import create_refresh_token

    legacy = app.test_client()
    legacy.set_cookie("refresh_token_cookie", create_refresh_token(identity="1"), path="/api/auth/refresh")
    r = legacy.post("/api/auth/refresh")
    assert r.status_code == 200
    assert legacy.get("/api/auth/me").status_code == 200


def test_old_sessions_are_pruned_on_login(app, client, user):
    row = db.session.scalar(db.select(UserSession))
    row.last_used_at = utcnow() - timedelta(days=40)
    db.session.commit()
    stale_id = row.id
    login(app)
    assert db.session.get(UserSession, stale_id) is None


def test_queued_resend_does_not_duplicate_a_note_that_already_arrived(client, user):
    body = {"title": "Sin red", "content": "texto"}
    first = client.post("/api/notes", json=body)
    assert first.status_code == 201
    again = client.post("/api/notes", json={**body, "queued": True})
    assert again.status_code == 200 and again.get_json()["id"] == first.get_json()["id"]
    assert len(client.get("/api/notes").get_json()["items"]) == 1
    # Sin el marcador de reenvío, dos notas iguales sí son dos notas (es legítimo).
    assert client.post("/api/notes", json=body).status_code == 201
    other = client.post("/api/notes", json={"title": "Otra", "content": "x", "queued": True})
    assert other.status_code == 201


def test_unused_imports_guard():
    assert Note and register
