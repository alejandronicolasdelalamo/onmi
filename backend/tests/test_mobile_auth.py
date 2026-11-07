"""Autenticación para apps nativas: tokens Bearer bajo petición explícita; el navegador sigue con cookies + CSRF."""

import pytest

from .conftest import PASSWORD

MOBILE = {"X-Client": "mobile"}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def tokens(app, user):
    """Inicia sesión como app móvil con un cliente SIN cookies (como lo haría un dispositivo)."""
    c = app.test_client()
    r = c.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD}, headers=MOBILE)
    assert r.status_code == 200
    return r.get_json()


def test_mobile_login_returns_tokens_in_the_body_and_sets_no_cookies(app, user):
    r = app.test_client().post(
        "/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD}, headers=MOBILE
    )
    body = r.get_json()
    assert r.status_code == 200 and body["access_token"] and body["refresh_token"]
    assert body["user"]["email"] == "ana@example.com"
    assert r.headers.getlist("Set-Cookie") == []


def test_web_login_never_leaks_tokens_into_the_body(app, user):
    r = app.test_client().post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert "access_token" not in r.get_json() and "refresh_token" not in r.get_json()
    assert any("access_token_cookie" in c for c in r.headers.getlist("Set-Cookie"))


def test_register_and_demo_also_support_mobile_clients(app):
    c = app.test_client()
    reg = c.post(
        "/api/auth/register", json={"name": "Mo", "email": "mo@example.com", "password": PASSWORD}, headers=MOBILE
    )
    assert reg.status_code == 201 and reg.get_json()["access_token"] and not reg.headers.getlist("Set-Cookie")
    demo = app.test_client().post("/api/auth/demo", headers=MOBILE)
    assert demo.status_code == 200 and demo.get_json()["user"]["is_demo"] and demo.get_json()["refresh_token"]


def test_bearer_token_authenticates_requests_without_csrf(app, tokens):
    app.config["JWT_COOKIE_CSRF_PROTECT"] = True  # como en producción
    c = app.test_client()
    me = c.get("/api/auth/me", headers=bearer(tokens["access_token"]))
    assert me.status_code == 200 and me.get_json()["user"]["email"] == "ana@example.com"
    created = c.post("/api/notes", json={"title": "From my phone"}, headers=bearer(tokens["access_token"]))
    assert created.status_code == 201  # POST sin cabecera CSRF: los tokens Bearer no la necesitan
    assert (
        c.get("/api/notes", headers=bearer(tokens["access_token"])).get_json()["items"][0]["title"] == "From my phone"
    )


def test_cookie_sessions_still_require_csrf(app, user):
    """Aceptar Bearer no debe debilitar la protección CSRF de las sesiones por cookie."""
    app.config["JWT_COOKIE_CSRF_PROTECT"] = True
    c = app.test_client()
    c.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert c.get("/api/notes").status_code == 200  # lecturas: sin CSRF
    assert c.post("/api/notes", json={"title": "x"}).status_code == 401  # escritura por cookie sin token CSRF
    csrf = c.get_cookie("csrf_access_token").value
    assert c.post("/api/notes", json={"title": "x"}, headers={"X-CSRF-TOKEN": csrf}).status_code == 201


def test_refresh_with_the_refresh_token_returns_a_new_access_token(app, tokens):
    c = app.test_client()
    r = c.post("/api/auth/refresh", headers={**bearer(tokens["refresh_token"]), **MOBILE})
    assert r.status_code == 200 and r.get_json()["access_token"]
    assert c.get("/api/auth/me", headers=bearer(r.get_json()["access_token"])).status_code == 200


def test_token_types_are_not_interchangeable(app, tokens):
    c = app.test_client()
    assert c.post("/api/auth/refresh", headers=bearer(tokens["access_token"])).status_code == 401
    assert c.get("/api/auth/me", headers=bearer(tokens["refresh_token"])).status_code == 401


@pytest.mark.parametrize("header", ["Bearer garbage", "Bearer ", "Basic abc", "Bearer a.b.c"])
def test_invalid_bearer_tokens_get_the_standard_json_error(app, user, header):
    r = app.test_client().get("/api/auth/me", headers={"Authorization": header})
    assert r.status_code == 401 and r.get_json()["error"]["code"] in {"invalid_token", "unauthorized"}


def test_deactivated_users_lose_access_with_bearer_tokens_too(app, tokens, admin_client):
    uid = tokens["user"]["id"]
    assert admin_client.patch(f"/api/admin/users/{uid}", json={"is_active": False}).status_code == 200
    assert app.test_client().get("/api/auth/me", headers=bearer(tokens["access_token"])).status_code == 401


def test_mobile_login_keeps_the_brute_force_lockout(app, user):
    c = app.test_client()
    for _ in range(5):
        c.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong-pass1"}, headers=MOBILE)
    r = c.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD}, headers=MOBILE)
    assert r.status_code == 423
