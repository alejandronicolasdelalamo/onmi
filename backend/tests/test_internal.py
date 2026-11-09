def test_tick_disabled_without_token(client):
    assert client.post("/api/internal/tick").status_code == 404


def test_tick_rejects_bad_token(app, client):
    app.config["CRON_TOKEN"] = "secreto"
    assert client.post("/api/internal/tick").status_code == 401
    assert client.post("/api/internal/tick", headers={"Authorization": "Bearer otro"}).status_code == 401


def test_tick_runs_reminders(app, client):
    app.config["CRON_TOKEN"] = "secreto"
    r = client.post("/api/internal/tick", headers={"Authorization": "Bearer secreto"})
    assert r.status_code == 200
    assert r.get_json() == {"ok": True, "checked": 0, "sent": 0, "subscriptions_removed": 0}
