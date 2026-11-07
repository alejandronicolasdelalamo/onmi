import re
from unittest import mock

from app.extensions import db
from app.models import AuthToken, User

from .conftest import PASSWORD, register


def _token(outbox):
    return re.search(r"token=([\w-]+)", outbox[-1].text).group(1)


def test_register_sets_httponly_cookies_and_hides_hash(client, outbox):
    r = client.post("/api/auth/register", json={"name": "Ana", "email": "A@Example.com", "password": PASSWORD})
    assert r.status_code == 201
    body = r.get_json()["user"]
    assert body["email"] == "a@example.com" and "password_hash" not in body
    cookies = r.headers.getlist("Set-Cookie")
    assert any("access_token_cookie" in c and "HttpOnly" in c for c in cookies)
    assert any("refresh_token_cookie" in c and "HttpOnly" in c for c in cookies)
    assert "access_token" not in r.get_json()  # nunca en el cuerpo
    assert len(outbox) == 1 and "verify-email" in outbox[0].text


def test_register_validation_and_duplicates(client, user):
    bad = client.post("/api/auth/register", json={"name": "X", "email": "nope", "password": "short"})
    assert bad.status_code == 422 and bad.get_json()["error"]["code"] == "validation_error"
    weak = client.post("/api/auth/register", json={"name": "X", "email": "x@x.io", "password": "onlyletters"})
    assert weak.status_code == 422
    dup = client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    assert dup.status_code == 409
    extra = client.post(
        "/api/auth/register",
        json={"name": "X", "email": "y@y.io", "password": PASSWORD, "role": "admin"},
    )
    assert extra.status_code == 422  # no se acepta role desde el cliente


def test_me_requires_auth_and_works_with_cookie(client, app):
    assert app.test_client().get("/api/auth/me").status_code == 401
    register(client)
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.get_json()["user"]["email"] == "ana@example.com"


def test_login_logout_refresh(client, user):
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    bad = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong-pass1"})
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert client.post("/api/auth/refresh").status_code == 200


def test_lockout_after_failed_attempts(client, user):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong-pass1"})
    r = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert r.status_code == 423 and r.get_json()["error"]["code"] == "locked"


def test_password_reset_flow(client, user, outbox):
    outbox.clear()
    unknown = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert unknown.status_code == 200 and not outbox  # no revela si existe
    assert client.post("/api/auth/forgot-password", json={"email": "ana@example.com"}).status_code == 200
    token = _token(outbox)

    r = client.post("/api/auth/reset-password", json={"token": token, "password": "N3wpassword!"})
    assert r.status_code == 200
    reuse = client.post("/api/auth/reset-password", json={"token": token, "password": "An0therpass!"})
    assert reuse.status_code == 400  # un solo uso
    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "N3wpassword!"})
    assert login.status_code == 200


def test_reset_token_is_hashed_at_rest(client, user, outbox):
    outbox.clear()
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    token = _token(outbox)
    stored = db.session.scalars(db.select(AuthToken)).all()
    assert stored and all(t.token_hash != token for t in stored)


def test_new_reset_invalidates_previous_token(client, user, outbox):
    outbox.clear()
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    first = _token(outbox)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    r = client.post("/api/auth/reset-password", json={"token": first, "password": "N3wpassword!"})
    assert r.status_code == 400


def test_verify_email(client, outbox):
    outbox.clear()
    register(client)
    token = _token(outbox)
    assert client.get("/api/auth/me").get_json()["user"]["email_verified"] is False
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    assert client.get("/api/auth/me").get_json()["user"]["email_verified"] is True
    assert client.post("/api/auth/verify-email", json={"token": "x" * 20}).status_code == 400


def test_change_password(client, user):
    r = client.post("/api/auth/change-password", json={"current_password": "bad", "new_password": "N3wpassword!"})
    assert r.status_code == 401
    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "N3wpassword!"},
    )
    assert ok.status_code == 200


def test_update_profile_and_delete_account(client, user):
    r = client.patch("/api/auth/me", json={"name": "Ana B", "locale": "es", "avatar": "female_happy"})
    assert r.get_json()["user"]["name"] == "Ana B" and r.get_json()["user"]["locale"] == "es"
    assert client.delete("/api/auth/me").status_code == 200
    assert db.session.scalar(db.select(db.func.count(User.id))) == 0


def _google_response(payload, status=200):
    m = mock.Mock(status_code=status)
    m.json.return_value = payload
    return m


def test_google_login_creates_user(client):
    info = {
        "aud": "test-client-id",
        "email_verified": "true",
        "email": "g@example.com",
        "sub": "123",
        "name": "Gina",
    }
    with mock.patch("app.api.auth.requests.get", return_value=_google_response(info)):
        r = client.post("/api/auth/google", json={"credential": "x" * 20})
    assert r.status_code == 200 and r.get_json()["user"]["email_verified"] is True
    assert client.get("/api/auth/me").get_json()["user"]["name"] == "Gina"


def test_google_rejects_wrong_audience(client):
    info = {"aud": "other-app", "email_verified": "true", "email": "g@example.com", "sub": "123"}
    with mock.patch("app.api.auth.requests.get", return_value=_google_response(info)):
        r = client.post("/api/auth/google", json={"credential": "x" * 20})
    assert r.status_code == 401


def test_demo_login_seeds_data(client):
    r = client.post("/api/auth/demo")
    assert r.status_code == 200 and r.get_json()["user"]["is_demo"] is True
    assert len(client.get("/api/habits").get_json()["items"]) == 5
    assert len(client.get("/api/projects").get_json()["items"]) == 6
    assert client.delete("/api/auth/me").status_code == 403
    # el demo no tiene contraseña: no se puede entrar por el login normal
    bad = client.post("/api/auth/login", json={"email": "demo@onmi.app", "password": PASSWORD})
    assert bad.status_code == 401


def test_public_config(client):
    cfg = client.get("/api/auth/config").get_json()
    assert cfg["google_client_id"] == "test-client-id" and cfg["demo_enabled"] is True
