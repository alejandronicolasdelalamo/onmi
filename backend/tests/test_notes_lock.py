import time

from .conftest import PASSWORD

H = "X-Notes-Unlock"


def setup_lock(client, password="ocultas1"):
    r = client.post("/api/notes/lock/password", json={"password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["token"]


def hidden_note(client):
    r = client.post("/api/notes", json={"title": "Diario", "content": "secreto", "tags": ["yo"], "locked": True})
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def test_cannot_hide_without_password(client, user):
    r = client.post("/api/notes", json={"title": "x", "locked": True})
    assert r.status_code == 409 and r.get_json()["error"]["code"] == "no_notes_password"
    n = client.post("/api/notes", json={"title": "x"}).get_json()
    assert client.patch(f"/api/notes/{n['id']}", json={"locked": True}).status_code == 409
    assert client.patch(f"/api/notes/{n['id']}", json={"locked": None}).status_code == 422


def test_hidden_note_is_masked_until_unlocked(client, user):
    token = setup_lock(client)
    note = hidden_note(client)
    client.post("/api/notes", json={"title": "Normal", "content": "hola", "tags": ["pub"]})

    raw = client.get("/api/notes")
    masked = next(n for n in raw.get_json()["items"] if n["id"] == note["id"])
    assert masked["locked"] is True
    assert masked["title"] == "" and masked["content"] == "" and masked["tags"] == []
    assert "secreto" not in raw.get_data(as_text=True)

    shown = next(n for n in client.get("/api/notes", headers={H: token}).get_json()["items"] if n["id"] == note["id"])
    assert shown["title"] == "Diario" and shown["content"] == "secreto"


def test_search_and_tags_do_not_leak_hidden_notes(client, user):
    token = setup_lock(client)
    hidden_note(client)
    assert client.get("/api/notes?q=secreto").get_json()["items"] == []
    assert client.get("/api/notes?tag=yo").get_json()["items"] == []
    assert client.get("/api/notes?q=Diario").get_json()["items"] == []
    assert client.get("/api/notes/tags").get_json()["items"] == []
    assert len(client.get("/api/notes?q=secreto", headers={H: token}).get_json()["items"]) == 1
    assert [t["tag"] for t in client.get("/api/notes/tags", headers={H: token}).get_json()["items"]] == ["yo"]


def test_hidden_note_cannot_be_read_edited_or_deleted_while_locked(client, user):
    token = setup_lock(client)
    note = hidden_note(client)
    got = client.get(f"/api/notes/{note['id']}").get_json()
    assert got["content"] == "" and got["title"] == ""
    for r in (
        client.patch(f"/api/notes/{note['id']}", json={"content": "x"}),
        client.patch(f"/api/notes/{note['id']}", json={"locked": False}),
        client.delete(f"/api/notes/{note['id']}"),
    ):
        assert r.status_code == 403 and r.get_json()["error"]["code"] == "notes_locked"
    # Fijar sí se puede sin desbloquear (no revela nada).
    pinned = client.patch(f"/api/notes/{note['id']}", json={"pinned": True})
    assert pinned.status_code == 200 and pinned.get_json()["content"] == ""
    # Con el desbloqueo vigente se puede volver a mostrar.
    r = client.patch(f"/api/notes/{note['id']}", json={"locked": False}, headers={H: token})
    assert r.status_code == 200 and r.get_json()["locked"] is False
    assert client.get(f"/api/notes/{note['id']}").get_json()["content"] == "secreto"


def test_dashboard_and_export_omit_hidden_content(client, user):
    setup_lock(client)
    hidden_note(client)
    dash = client.get("/api/dashboard").get_data(as_text=True)
    assert "secreto" not in dash and "Diario" not in dash
    exported = client.get("/api/auth/export").get_data(as_text=True)
    assert "secreto" not in exported and "Diario" not in exported


def test_unlock_requires_right_password_and_valid_token(client, user):
    setup_lock(client, "ocultas1")
    assert client.post("/api/notes/unlock", json={"password": "mal-mal"}).status_code == 401
    # La contraseña de la cuenta NO sirve para desbloquear (solo para recuperar o cambiar la de notas).
    assert client.post("/api/notes/unlock", json={"password": PASSWORD}).status_code == 401
    ok = client.post("/api/notes/unlock", json={"password": "ocultas1"})
    assert ok.status_code == 200 and ok.get_json()["token"]
    note = client.post("/api/notes", json={"title": "N", "locked": True}).get_json()
    got = client.get(f"/api/notes/{note['id']}", headers={H: "inventado"}).get_json()
    assert got["title"] == ""


def test_token_is_tied_to_user_and_expires(app, client, other_client, user):
    token = setup_lock(client)
    note = client.post("/api/notes", json={"title": "Mia", "locked": True}).get_json()
    assert other_client.get(f"/api/notes/{note['id']}", headers={H: token}).status_code == 404
    app.config["NOTES_UNLOCK_MINUTES"] = 0
    time.sleep(1.1)
    assert client.get(f"/api/notes/{note['id']}", headers={H: token}).get_json()["title"] == ""


def test_change_password_invalidates_old_token_and_accepts_account_password(client, user):
    token = setup_lock(client, "ocultas1")
    note = client.post("/api/notes", json={"title": "Mia", "locked": True}).get_json()
    wrong = client.put("/api/notes/lock/password", json={"current_password": "nope-nope", "new_password": "nuevas22"})
    assert wrong.status_code == 401
    # Si olvidó la de notas, la de la cuenta permite fijar una nueva.
    r = client.put("/api/notes/lock/password", json={"current_password": PASSWORD, "new_password": "nuevas22"})
    assert r.status_code == 200
    assert client.get(f"/api/notes/{note['id']}", headers={H: token}).get_json()["title"] == ""
    assert client.get(f"/api/notes/{note['id']}", headers={H: r.get_json()["token"]}).get_json()["title"] == "Mia"
    assert client.post("/api/notes/unlock", json={"password": "ocultas1"}).status_code == 401
    assert client.post("/api/notes/unlock", json={"password": "nuevas22"}).status_code == 200


def test_cannot_set_password_twice_and_remove_unhides_everything(client, user):
    setup_lock(client)
    assert client.post("/api/notes/lock/password", json={"password": "otra-otra"}).status_code == 409
    note = client.post("/api/notes", json={"title": "Mia", "content": "c", "locked": True}).get_json()
    assert client.delete("/api/notes/lock/password", json={"current_password": "mal-mal"}).status_code == 401
    r = client.delete("/api/notes/lock/password", json={"current_password": "ocultas1"})
    assert r.status_code == 200 and r.get_json()["user"]["notes_lock_enabled"] is False
    shown = client.get(f"/api/notes/{note['id']}").get_json()
    assert shown["locked"] is False and shown["content"] == "c"


def test_short_password_rejected_and_flag_in_profile(client, user):
    assert client.post("/api/notes/lock/password", json={"password": "abc"}).status_code == 422
    assert client.get("/api/auth/me").get_json()["user"]["notes_lock_enabled"] is False
    setup_lock(client)
    assert client.get("/api/auth/me").get_json()["user"]["notes_lock_enabled"] is True


def test_demo_account_cannot_hide_notes(client):
    client.post("/api/auth/demo")
    assert client.post("/api/notes/lock/password", json={"password": "ocultas1"}).status_code == 403
