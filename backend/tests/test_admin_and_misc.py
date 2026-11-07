from datetime import date, timedelta

from app.services.stats import completion_rate, current_streak, daily_counts, longest_streak

T = date(2025, 3, 10)


def d(n):
    return T - timedelta(days=n)


def test_streak_functions():
    assert current_streak([], T) == 0
    assert current_streak([d(0), d(1), d(2)], T) == 3
    assert current_streak([d(1), d(2)], T) == 2  # hoy aún no, la racha sigue viva
    assert current_streak([d(2), d(3)], T) == 0
    assert longest_streak([d(0), d(1), d(4), d(5), d(6), d(7)]) == 4
    assert longest_streak([d(0), d(0)]) == 1
    assert completion_rate([d(0), d(1)], d(3), T) == 0.5
    series = daily_counts([d(0), d(0), d(2)], d(2), T)
    assert [x["count"] for x in series] == [1, 0, 2]


def test_admin_endpoints_forbidden_for_regular_user(client, user):
    for path in ("/api/admin/metrics", "/api/admin/users"):
        assert client.get(path).status_code == 403
    assert client.delete("/api/admin/users/1").status_code == 403


def test_admin_requires_auth(app):
    assert app.test_client().get("/api/admin/users").status_code == 401


def test_admin_metrics_and_user_management(admin_client, other_client):
    m = admin_client.get("/api/admin/metrics").get_json()
    assert m["users"]["total"] == 2 and m["users"]["admins"] == 1 and len(m["signups"]) == 14
    users = admin_client.get("/api/admin/users?q=bob").get_json()
    assert users["total"] == 1 and "password_hash" not in str(users)
    bob = users["items"][0]
    off = admin_client.patch(f"/api/admin/users/{bob['id']}", json={"is_active": False}).get_json()
    assert off["user"]["is_active"] is False
    # un usuario desactivado ya no puede usar su sesión
    assert other_client.get("/api/auth/me").status_code == 401
    assert admin_client.delete(f"/api/admin/users/{bob['id']}").status_code == 200
    me = admin_client.get("/api/auth/me").get_json()["user"]
    assert admin_client.patch(f"/api/admin/users/{me['id']}", json={"role": "user"}).status_code == 400


def test_openapi_spec_and_docs(client):
    spec = client.get("/api/openapi.json").get_json()
    assert spec["openapi"].startswith("3.")
    assert "/api/auth/login" in spec["paths"]
    assert "/api/habits/{habit_id}/toggle" in spec["paths"]
    assert "LoginIn" in spec["components"]["schemas"]
    assert client.get("/docs").status_code == 200


def test_error_shape_and_health(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.get_json()["error"]["code"] == "not_found"
    assert client.get("/api/health").get_json() == {"status": "ok"}
    assert client.get("/api/health").headers["X-Content-Type-Options"] == "nosniff"


def test_spa_is_served_with_history_fallback(tmp_path, monkeypatch):
    from app import create_app

    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<div id=root>SPA</div>")
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    monkeypatch.setenv("FRONTEND_DIST", str(tmp_path))
    client = create_app("testing").test_client()

    assert b"SPA" in client.get("/").data
    deep = client.get("/habits/anything")  # ruta del router de React
    assert deep.status_code == 200 and b"SPA" in deep.data
    assert deep.headers["Cache-Control"] == "no-cache"
    asset = client.get("/assets/app-abc123.js")
    assert "immutable" in asset.headers["Cache-Control"]
    # La API y la documentación no se tragan por el fallback.
    assert client.get("/api/health").get_json() == {"status": "ok"}
    assert client.get("/api/does-not-exist").get_json()["error"]["code"] == "not_found"
    assert client.get("/docs").status_code == 200 and b"swagger" in client.get("/docs").data.lower()
