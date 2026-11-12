from datetime import timedelta

from app.extensions import db
from app.models import Note, NoteImage
from app.services import notes_extras
from app.utils import utcnow

from .conftest import PASSWORD

H = "X-Notes-Unlock"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


def note(client, **kw):
    r = client.post("/api/notes", json={"title": "N", **kw})
    assert r.status_code == 201, r.get_json()
    return r.get_json()


# ---- papelera ---------------------------------------------------------------------------------------
def test_delete_moves_to_trash_and_restore_brings_it_back(client, user):
    n = note(client, title="Idea", content="c", pinned=True)
    assert client.delete(f"/api/notes/{n['id']}").status_code == 200
    assert client.get("/api/notes").get_json()["items"] == []
    assert client.get(f"/api/notes/{n['id']}").status_code == 404
    assert client.patch(f"/api/notes/{n['id']}", json={"title": "x"}).status_code == 404
    trash = client.get("/api/notes?trash=1").get_json()["items"]
    assert [t["title"] for t in trash] == ["Idea"] and trash[0]["deleted_at"]
    assert "Idea" not in client.get("/api/dashboard").get_data(as_text=True)
    assert "Idea" not in client.get("/api/auth/export").get_data(as_text=True)

    back = client.post(f"/api/notes/{n['id']}/restore")
    assert back.status_code == 200 and back.get_json()["deleted_at"] is None
    assert [x["title"] for x in client.get("/api/notes").get_json()["items"]] == ["Idea"]
    assert client.post(f"/api/notes/{n['id']}/restore").status_code == 404  # ya no está en la papelera


def test_second_delete_is_permanent_and_empty_trash(client, user):
    a, b = note(client, title="A"), note(client, title="B")
    for n in (a, b):
        client.delete(f"/api/notes/{n['id']}")
    assert client.delete(f"/api/notes/{a['id']}").status_code == 200
    assert [t["title"] for t in client.get("/api/notes?trash=1").get_json()["items"]] == ["B"]
    assert client.delete("/api/notes/trash").get_json() == {"removed": 1, "skipped": 0}
    assert client.get("/api/notes?trash=1").get_json()["items"] == []


def test_trash_is_private_and_expires_after_30_days(app, client, other_client, user):
    n = note(client, title="Vieja")
    client.delete(f"/api/notes/{n['id']}")
    assert other_client.post(f"/api/notes/{n['id']}/restore").status_code == 404
    assert other_client.get("/api/notes?trash=1").get_json()["items"] == []
    row = db.session.get(Note, n["id"])
    row.deleted_at = utcnow() - timedelta(days=31)
    db.session.commit()
    assert notes_extras.purge_expired()["notes_purged"] == 1
    assert db.session.get(Note, n["id"]) is None


def test_hidden_notes_in_trash_stay_masked_and_need_unlock_to_purge(client, user):
    token = client.post("/api/notes/lock/password", json={"password": "ocultas1"}).get_json()["token"]
    n = note(client, title="Secreta", content="dentro", locked=True)
    assert client.delete(f"/api/notes/{n['id']}").status_code == 403  # borrar una oculta exige desbloquear
    assert client.delete(f"/api/notes/{n['id']}", headers={H: token}).status_code == 200
    raw = client.get("/api/notes?trash=1")
    assert "Secreta" not in raw.get_data(as_text=True) and "dentro" not in raw.get_data(as_text=True)
    assert client.delete("/api/notes/trash").get_json() == {"removed": 0, "skipped": 1}
    assert client.delete("/api/notes/trash", headers={H: token}).get_json() == {"removed": 1, "skipped": 0}


# ---- enlaces ----------------------------------------------------------------------------------------
def test_links_and_backlinks(client, user):
    a = note(client, title="Proyecto X", content="plan")
    b = note(client, title="Reunión", content="Hablamos de [[proyecto x]] y de [[Inexistente]] y [[Proyecto X]]")
    out = client.get(f"/api/notes/{b['id']}/links").get_json()
    assert out["outgoing"] == [{"title": "proyecto x", "id": a["id"]}, {"title": "Inexistente", "id": None}]
    back = client.get(f"/api/notes/{a['id']}/links").get_json()
    assert back["backlinks"] == [{"id": b["id"], "title": "Reunión"}] and back["outgoing"] == []


def test_links_do_not_leak_hidden_notes(client, user):
    token = client.post("/api/notes/lock/password", json={"password": "ocultas1"}).get_json()["token"]
    hidden = note(client, title="Diario", content="x", locked=True)
    pub = note(client, title="Pública", content="mira [[Diario]]")
    assert client.get(f"/api/notes/{pub['id']}/links").get_json()["outgoing"] == [{"title": "Diario", "id": None}]
    assert client.get(f"/api/notes/{hidden['id']}/links").status_code == 403
    visible = client.get(f"/api/notes/{hidden['id']}/links", headers={H: token}).get_json()
    assert visible["backlinks"] == [{"id": pub["id"], "title": "Pública"}]


# ---- imágenes ---------------------------------------------------------------------------------------
def upload(client, data=PNG, ctype="image/png"):
    return client.post("/api/notes/images", data=data, content_type=ctype)


def test_image_upload_validation(client, user):
    ok = upload(client)
    assert ok.status_code == 201 and ok.get_json()["ref"] == f"onmi-image:{ok.get_json()['id']}"
    assert upload(client, b"<svg onload=alert(1)>", "image/png").status_code == 415  # no se fía del Content-Type
    assert upload(client, b"GIF89a....", "image/gif").status_code == 415
    assert upload(client, b"").status_code == 400
    assert upload(client, JPEG + b"0" * 1_600_000, "image/jpeg").status_code == 413


def test_image_is_served_only_to_its_owner_with_safe_headers(client, other_client, user):
    img = upload(client).get_json()
    r = client.get(f"/api/notes/images/{img['id']}")
    assert r.status_code == 200 and r.data == PNG and r.mimetype == "image/png"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert other_client.get(f"/api/notes/images/{img['id']}").status_code == 404


def test_image_links_to_note_and_follows_its_lock(client, user):
    token = client.post("/api/notes/lock/password", json={"password": "ocultas1"}).get_json()["token"]
    img = upload(client).get_json()
    n = note(client, content=f"![foto]({img['ref']})", locked=True)
    assert db.session.get(NoteImage, img["id"]).note_id == n["id"]
    r = client.get(f"/api/notes/images/{img['id']}")
    assert r.status_code == 403
    ok = client.get(f"/api/notes/images/{img['id']}", headers={H: token})
    assert ok.status_code == 200 and ok.headers["Cache-Control"] == "no-store"


def test_image_quota_orphans_and_cascade(app, client, user):
    for _ in range(3):
        upload(client)
    old = db.session.scalars(db.select(NoteImage)).first()
    old.created_at = utcnow() - timedelta(days=2)
    img = upload(client).get_json()
    n = note(client, content=f"![]({img['ref']})")
    db.session.commit()
    assert notes_extras.purge_expired()["images_purged"] == 1  # solo la huérfana antigua
    # Quitar la imagen del texto la suelta; borrar la nota para siempre la elimina.
    client.patch(f"/api/notes/{n['id']}", json={"content": "sin imagen"})
    assert db.session.get(NoteImage, img["id"]).note_id is None
    client.patch(f"/api/notes/{n['id']}", json={"content": f"![]({img['ref']})"})
    client.delete(f"/api/notes/{n['id']}")
    client.delete(f"/api/notes/{n['id']}")
    assert db.session.get(NoteImage, img["id"]) is None


def test_cannot_claim_someone_elses_image(client, other_client, user):
    theirs = upload(other_client).get_json()
    n = note(client, content=f"![]({theirs['ref']})")
    assert db.session.get(NoteImage, theirs["id"]).note_id is None
    assert client.get(f"/api/notes/images/{theirs['id']}").status_code == 404
    assert n["id"]


def test_delete_account_removes_images(client, user):
    img = upload(client).get_json()
    assert client.delete("/api/auth/me").status_code == 200
    assert db.session.get(NoteImage, img["id"]) is None
    assert PASSWORD
