from datetime import date, datetime

import pytest

from app.extensions import db
from app.models import Cheer, Friendship, User
from app.services import buddies as svc
from app.services import push

from .conftest import register


@pytest.fixture()
def carol(app):
    c = app.test_client()
    register(c, "carol@example.com", "Carol")
    return c


def code_of(client) -> str:
    return client.get("/api/buddies").get_json()["code"]


def connect(asker, owner):
    """`asker` introduce el código de `owner` y `owner` acepta."""
    assert asker.post("/api/buddies/request", json={"code": code_of(owner)}).status_code == 201
    incoming = owner.get("/api/buddies").get_json()["incoming"]
    assert owner.post(f"/api/buddies/{incoming[0]['friendship_id']}/accept").status_code == 200


def my_id(client) -> int:
    return client.get("/api/auth/me").get_json()["user"]["id"]


# ---- códigos -------------------------------------------------------------------------------------------
def test_each_user_gets_a_stable_well_formed_code(client, other_client, user):
    a, b = code_of(client), code_of(other_client)
    assert a == code_of(client) and a != b  # estable entre llamadas, distinto entre usuarios
    first, second = a.split("-")
    assert len(first) == len(second) == 4 and set(first + second) <= set(svc.ALPHABET)
    assert not set("01OI") & set(a)  # sin caracteres ambiguos


@pytest.mark.parametrize(
    ("raw", "ok"),
    [
        ("ABCD-EFGH", True),
        ("abcd efgh", True),
        ("  abcdefgh ", True),
        ("ABCD-EFG", False),
        ("ABCD-EFG0", False),
        ("", False),
        ("ABCD-EFGHJ", False),
    ],
)
def test_code_normalisation(raw, ok):
    assert (svc.normalize_code(raw) is not None) is ok


def test_regenerating_the_code_invalidates_the_old_one(client, other_client, user):
    old = code_of(client)
    new = client.post("/api/buddies/code/regenerate").get_json()["code"]
    assert new != old
    assert other_client.post("/api/buddies/request", json={"code": old}).get_json()["error"]["code"] == "invalid_code"
    assert other_client.post("/api/buddies/request", json={"code": new}).status_code == 201


# ---- solicitudes ---------------------------------------------------------------------------------------
def test_full_connection_flow(client, other_client, user):
    r = other_client.post("/api/buddies/request", json={"code": code_of(client).lower()})  # el código admite minúsculas
    assert r.status_code == 201 and r.get_json()["status"] == "pending"
    mine = client.get("/api/buddies").get_json()
    assert [i["user"]["name"] for i in mine["incoming"]] == ["Bob"] and mine["friends"] == []
    assert [o["user"]["name"] for o in other_client.get("/api/buddies").get_json()["outgoing"]] == ["Ana"]

    client.post(f"/api/buddies/{mine['incoming'][0]['friendship_id']}/accept")
    assert [f["user"]["name"] for f in client.get("/api/buddies").get_json()["friends"]] == ["Bob"]
    assert [f["user"]["name"] for f in other_client.get("/api/buddies").get_json()["friends"]] == ["Ana"]


def test_invalid_codes_all_look_the_same(client, user):
    for code in ("ZZZZ-ZZZZ", "nonsense", "ABCD-EFG"):
        r = client.post("/api/buddies/request", json={"code": code})
        assert r.status_code == 404 and r.get_json()["error"]["code"] == "invalid_code"  # no revela qué códigos existen


def test_cannot_use_your_own_code_or_duplicate_requests(client, other_client, user):
    assert client.post("/api/buddies/request", json={"code": code_of(client)}).get_json()["error"]["code"] == "own_code"
    other_client.post("/api/buddies/request", json={"code": code_of(client)})
    again = other_client.post("/api/buddies/request", json={"code": code_of(client)})
    assert again.status_code == 409 and again.get_json()["error"]["code"] == "already_pending"


def test_mutual_requests_connect_immediately(client, other_client, user):
    other_client.post("/api/buddies/request", json={"code": code_of(client)})
    r = client.post("/api/buddies/request", json={"code": code_of(other_client)})  # Ana también le escribe a Bob
    assert r.status_code == 200 and r.get_json()["status"] == "accepted"
    assert len(client.get("/api/buddies").get_json()["friends"]) == 1
    assert db.session.scalar(db.select(db.func.count(Friendship.id))) == 1  # una sola fila por pareja
    assert (
        client.post("/api/buddies/request", json={"code": code_of(other_client)}).get_json()["error"]["code"]
        == "already_connected"
    )


def test_only_the_asked_person_can_accept(client, other_client, carol, user):
    other_client.post("/api/buddies/request", json={"code": code_of(client)})
    fid = client.get("/api/buddies").get_json()["incoming"][0]["friendship_id"]
    assert other_client.post(f"/api/buddies/{fid}/accept").status_code == 403  # quien pidió no se acepta a sí mismo
    assert carol.post(f"/api/buddies/{fid}/accept").status_code == 404  # un tercero ni siquiera ve que existe
    assert carol.delete(f"/api/buddies/{fid}").status_code == 404


def test_decline_cancel_and_remove(client, other_client, user):
    other_client.post("/api/buddies/request", json={"code": code_of(client)})
    fid = client.get("/api/buddies").get_json()["incoming"][0]["friendship_id"]
    assert client.delete(f"/api/buddies/{fid}").status_code == 200  # rechazar
    assert client.get("/api/buddies").get_json()["incoming"] == []
    connect(other_client, client)
    fid = other_client.get("/api/buddies").get_json()["friends"][0]["friendship_id"]
    assert other_client.delete(f"/api/buddies/{fid}").status_code == 200  # cualquiera de los dos puede dejar de serlo
    assert client.get("/api/buddies").get_json()["friends"] == []
    assert (
        other_client.post("/api/buddies/request", json={"code": code_of(client)}).status_code == 201
    )  # y volver a pedirlo


# ---- privacidad ----------------------------------------------------------------------------------------
def test_buddies_only_see_habits_that_were_explicitly_shared(client, other_client, user):
    connect(other_client, client)
    client.post("/api/habits", json={"name": "Public run", "shared": True})
    client.post("/api/habits", json={"name": "Private therapy"})
    view = other_client.get("/api/buddies").get_json()["friends"][0]
    assert [h["name"] for h in view["habits"]] == ["Public run"]
    assert "Private therapy" not in str(other_client.get("/api/buddies").get_json())


def test_buddies_never_see_notes_mood_projects_or_email(client, other_client, user):
    client.post("/api/notes", json={"title": "Diary", "content": "SECRET-BODY"})
    client.post("/api/projects", json={"name": "Secret project"})
    client.put("/api/moods", json={"mood": "sad", "note": "SECRET-MOOD"})
    client.post("/api/habits", json={"name": "Shared one", "shared": True})
    connect(other_client, client)
    blob = str(other_client.get("/api/buddies").get_json())
    for private in ("SECRET-BODY", "Diary", "Secret project", "SECRET-MOOD", "ana@example.com"):
        assert private not in blob, private
    assert set(other_client.get("/api/buddies").get_json()["friends"][0]["user"]) == {"id", "name", "avatar"}


def test_pending_or_unrelated_people_see_nothing(client, other_client, carol, user):
    client.post("/api/habits", json={"name": "Shared one", "shared": True})
    other_client.post("/api/buddies/request", json={"code": code_of(client)})  # solicitud aún pendiente
    assert "Shared one" not in str(other_client.get("/api/buddies").get_json())
    assert carol.get("/api/buddies").get_json()["friends"] == []


def test_shared_habit_progress_is_exposed_correctly(client, other_client, user):
    h = client.post("/api/habits", json={"name": "Gym", "shared": True, "target_per_week": 3}).get_json()
    client.post(f"/api/habits/{h['id']}/toggle")
    connect(other_client, client)
    seen = other_client.get("/api/buddies").get_json()["friends"][0]["habits"][0]
    assert seen["name"] == "Gym" and seen["target_per_week"] == 3 and seen["streak_unit"] == "week"
    assert (
        seen["done_today"] is True and seen["week_count"] == 1 and seen["last7"][-1] is True and len(seen["last7"]) == 7
    )


def test_unsharing_or_archiving_hides_a_habit_immediately(client, other_client, user):
    h = client.post("/api/habits", json={"name": "Gym", "shared": True}).get_json()
    connect(other_client, client)
    client.patch(f"/api/habits/{h['id']}", json={"shared": False})
    assert other_client.get("/api/buddies").get_json()["friends"][0]["habits"] == []
    client.patch(f"/api/habits/{h['id']}", json={"shared": True})
    client.patch(f"/api/habits/{h['id']}", json={"archived": True})
    assert other_client.get("/api/buddies").get_json()["friends"][0]["habits"] == []


def test_a_user_only_sees_their_own_relations(client, other_client, carol, user):
    connect(other_client, client)
    assert carol.get("/api/buddies").get_json()["friends"] == []
    assert len(other_client.get("/api/buddies").get_json()["friends"]) == 1


def test_local_today_uses_the_buddys_time_zone():
    u = User(name="Aki", email="aki@example.com", timezone="Asia/Tokyo")
    now = datetime(2025, 1, 1, 20, 0)  # 05:00 del 2 de enero en Tokio
    assert svc.local_today(u, now) == date(2025, 1, 2)
    assert svc.local_today(User(name="x", email="x@x", timezone="Mars/Olympus"), now) == date(
        2025, 1, 1
    )  # zona inválida: UTC


# ---- ánimos ------------------------------------------------------------------------------------------------
@pytest.fixture()
def pushed(monkeypatch):
    sent = []
    monkeypatch.setattr(push, "send", lambda sub, payload: sent.append(payload) or True)
    return sent


def test_cheering_a_buddy_records_it_and_sends_a_push(client, other_client, user, pushed):
    h = client.post("/api/habits", json={"name": "Gym", "shared": True}).get_json()
    client.post(
        "/api/push/subscribe",
        json={"endpoint": "https://push.example/a", "keys": {"p256dh": "p" * 20, "auth": "a" * 10}},
    )
    connect(other_client, client)
    r = other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={"habit_id": h["id"]})
    assert r.status_code == 201
    assert pushed[0]["body"] == "Bob cheered you on for Gym." and pushed[0]["url"] == "/buddies"
    feed = client.get("/api/buddies").get_json()["cheers"]
    assert feed[0]["from"]["name"] == "Bob" and feed[0]["habit"] == "Gym"
    assert other_client.get("/api/buddies").get_json()["friends"][0]["cheered_today"] is True


def test_only_one_cheer_per_day_per_buddy(client, other_client, user, pushed):
    connect(other_client, client)
    uid = my_id(client)
    assert other_client.post(f"/api/buddies/{uid}/cheer", json={}).status_code == 201
    again = other_client.post(f"/api/buddies/{uid}/cheer", json={})
    assert again.status_code == 409 and again.get_json()["error"]["code"] == "already_cheered"
    assert db.session.scalar(db.select(db.func.count(Cheer.id))) == 1
    assert client.get("/api/buddies").get_json()["cheers"][0]["habit"] is None  # ánimo sin hábito concreto


def test_cannot_cheer_strangers_or_pending_requests(client, other_client, carol, user, pushed):
    assert other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={}).status_code == 404  # no son compañeros
    other_client.post("/api/buddies/request", json={"code": code_of(client)})
    assert other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={}).status_code == 404  # solicitud pendiente
    assert pushed == []


def test_cheer_habit_must_be_a_shared_habit_of_that_buddy(client, other_client, user, pushed):
    private = client.post("/api/habits", json={"name": "Private"}).get_json()
    mine = other_client.post("/api/habits", json={"name": "Mine", "shared": True}).get_json()
    connect(other_client, client)
    uid = my_id(client)
    assert other_client.post(f"/api/buddies/{uid}/cheer", json={"habit_id": private["id"]}).status_code == 404
    assert (
        other_client.post(f"/api/buddies/{uid}/cheer", json={"habit_id": mine["id"]}).status_code == 404
    )  # es suyo, no de ella
    assert other_client.post(f"/api/buddies/{uid}/cheer", json={"habit_id": 99999}).status_code == 404


def test_a_failing_push_never_breaks_the_cheer(client, other_client, user, monkeypatch):
    client.post(
        "/api/push/subscribe",
        json={"endpoint": "https://push.example/a", "keys": {"p256dh": "p" * 20, "auth": "a" * 10}},
    )
    connect(other_client, client)

    def boom(*_):
        raise RuntimeError("push service down")

    monkeypatch.setattr(push, "send", boom)
    assert other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={}).status_code == 201


def test_removing_a_buddy_deletes_the_cheers_between_them(client, other_client, user, pushed):
    connect(other_client, client)
    other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={})
    fid = client.get("/api/buddies").get_json()["friends"][0]["friendship_id"]
    client.delete(f"/api/buddies/{fid}")
    assert client.get("/api/buddies").get_json()["cheers"] == []
    assert db.session.scalar(db.select(db.func.count(Cheer.id))) == 0


def test_cheer_notification_follows_the_receivers_language(client, other_client, user, pushed):
    client.patch("/api/auth/me", json={"locale": "es"})
    client.post(
        "/api/push/subscribe",
        json={"endpoint": "https://push.example/a", "keys": {"p256dh": "p" * 20, "auth": "a" * 10}},
    )
    connect(other_client, client)
    other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={})
    assert pushed[0]["body"] == "Bob te ha animado."


# ---- cuenta demo y borrado ---------------------------------------------------------------------------------
def test_demo_account_can_look_but_not_change_buddies(client, user):
    client.post("/api/auth/demo")
    view = client.get("/api/buddies").get_json()
    assert view["code"] is None  # sin código: nadie puede conectar con una cuenta compartida
    assert [f["user"]["name"] for f in view["friends"]] == ["Sam Rivera"]
    assert view["friends"][0]["habits"] and view["cheers"]
    for call in (
        lambda: client.post("/api/buddies/request", json={"code": "ABCD-EFGH"}),
        lambda: client.post(f"/api/buddies/{view['friends'][0]['user']['id']}/cheer", json={}),
        lambda: client.delete(f"/api/buddies/{view['friends'][0]['friendship_id']}"),
        lambda: client.post("/api/buddies/code/regenerate"),
    ):
        assert call().status_code == 403


def test_deleting_an_account_cleans_up_relations_and_cheers(client, other_client, user, pushed):
    connect(other_client, client)
    other_client.post(f"/api/buddies/{my_id(client)}/cheer", json={})
    assert client.delete("/api/auth/me").status_code == 200
    assert other_client.get("/api/buddies").get_json()["friends"] == []
    assert db.session.scalar(db.select(db.func.count(Friendship.id))) == 0
    assert db.session.scalar(db.select(db.func.count(Cheer.id))) == 0


def test_validation_and_auth(app, client, user):
    assert app.test_client().get("/api/buddies").status_code == 401
    assert app.test_client().post("/api/buddies/request", json={"code": "ABCD-EFGH"}).status_code == 401
    assert client.post("/api/buddies/request", json={}).status_code == 422
    assert client.post("/api/buddies/request", json={"code": "x"}).status_code == 422
    assert client.post("/api/buddies/request", json={"code": "ABCD-EFGH", "extra": 1}).status_code == 422
    assert client.post("/api/habits", json={"name": "x", "shared": "maybe"}).status_code == 422


def test_habits_are_private_by_default(client, user):
    assert client.post("/api/habits", json={"name": "Quiet"}).get_json()["shared"] is False
    h = client.post("/api/habits", json={"name": "Loud", "shared": True}).get_json()
    assert h["shared"] is True and client.patch(f"/api/habits/{h['id']}", json={"shared": None}).status_code == 422
