from datetime import date, timedelta


def iso(d):
    return d.isoformat()


# ---- notes ----------------------------------------------------------------------
def test_notes_crud_search_tags_pin(client, user):
    a = client.post("/api/notes", json={"title": "Shopping", "content": "milk", "tags": ["home", "home"]}).get_json()
    assert a["tags"] == ["home"]
    client.post("/api/notes", json={"title": "Idea", "content": "build onmi", "tags": ["dev"], "pinned": True})
    items = client.get("/api/notes").get_json()["items"]
    assert items[0]["title"] == "Idea"  # fijadas primero
    assert [n["title"] for n in client.get("/api/notes?q=milk").get_json()["items"]] == ["Shopping"]
    assert [n["title"] for n in client.get("/api/notes?tag=DEV").get_json()["items"]] == ["Idea"]
    assert {t["tag"] for t in client.get("/api/notes/tags").get_json()["items"]} == {"home", "dev"}
    upd = client.patch(f"/api/notes/{a['id']}", json={"pinned": True, "content": "eggs"}).get_json()
    assert upd["pinned"] and upd["content"] == "eggs" and upd["title"] == "Shopping"
    assert client.delete(f"/api/notes/{a['id']}").status_code == 200
    assert client.get(f"/api/notes/{a['id']}").status_code == 404


def test_notes_are_private_between_users(client, other_client, user):
    note = client.post("/api/notes", json={"title": "Secret"}).get_json()
    assert other_client.get(f"/api/notes/{note['id']}").status_code == 404
    assert other_client.patch(f"/api/notes/{note['id']}", json={"title": "hacked"}).status_code == 404
    assert other_client.delete(f"/api/notes/{note['id']}").status_code == 404
    assert other_client.get("/api/notes").get_json()["items"] == []


def test_cannot_link_note_to_foreign_project(client, other_client, user):
    project = other_client.post("/api/projects", json={"name": "Bob's"}).get_json()
    r = client.post("/api/notes", json={"title": "x", "project_id": project["id"]})
    assert r.status_code == 404


def test_note_validation(client, user):
    assert client.post("/api/notes", json={"content": "no title"}).status_code == 422
    assert client.post("/api/notes", data="not json", content_type="text/plain").status_code == 400


# ---- projects (kanban) ------------------------------------------------------------
def _names(client, status):
    items = client.get("/api/projects").get_json()["items"]
    return [p["name"] for p in sorted(items, key=lambda p: p["position"]) if p["status"] == status]


def test_kanban_move_and_reorder(client, user):
    ids = {n: client.post("/api/projects", json={"name": n}).get_json()["id"] for n in ("A", "B", "C")}
    assert _names(client, "todo") == ["A", "B", "C"]
    client.patch(f"/api/projects/{ids['A']}", json={"status": "in_progress"})
    assert _names(client, "todo") == ["B", "C"] and _names(client, "in_progress") == ["A"]
    client.patch(f"/api/projects/{ids['C']}", json={"position": 0})
    assert _names(client, "todo") == ["C", "B"]
    client.patch(f"/api/projects/{ids['B']}", json={"status": "in_progress", "position": 0})
    assert _names(client, "in_progress") == ["B", "A"] and _names(client, "todo") == ["C"]
    client.delete(f"/api/projects/{ids['B']}")
    assert _names(client, "in_progress") == ["A"]


def test_project_progress_from_goals_and_due_date(client, user):
    due = iso(date.today() + timedelta(days=3))
    p = client.post("/api/projects", json={"name": "P", "due_date": due, "priority": "high"}).get_json()
    g1 = client.post("/api/goals", json={"title": "g1", "project_id": p["id"]}).get_json()
    client.post("/api/goals", json={"title": "g2", "project_id": p["id"]})
    done = client.patch(f"/api/goals/{g1['id']}", json={"done": True}).get_json()
    assert done["done"] and done["completed_at"]
    got = client.get(f"/api/projects/{p['id']}").get_json()
    assert got["goals_total"] == 2 and got["goals_done"] == 1 and got["progress"] == 50
    assert client.patch(f"/api/projects/{p['id']}", json={"status": "bogus"}).status_code == 422
    cleared = client.patch(f"/api/projects/{p['id']}", json={"due_date": None}).get_json()
    assert cleared["due_date"] is None


# ---- goals ------------------------------------------------------------------------
def test_goals_filters_and_ownership(client, other_client, user):
    g = client.post("/api/goals", json={"title": "Run"}).get_json()
    client.post("/api/goals", json={"title": "Read"})
    client.patch(f"/api/goals/{g['id']}", json={"done": True})
    assert len(client.get("/api/goals?done=1").get_json()["items"]) == 1
    assert len(client.get("/api/goals?done=0").get_json()["items"]) == 1
    assert other_client.delete(f"/api/goals/{g['id']}").status_code == 404
    client.patch(f"/api/goals/{g['id']}", json={"done": False})
    assert client.get(f"/api/goals/{g['id']}").get_json()["completed_at"] is None


# ---- habits -----------------------------------------------------------------------
def test_habit_toggle_and_streaks(client, user):
    h = client.post("/api/habits", json={"name": "Run", "color": "#ff0000"}).get_json()
    today = date.today()
    for back in (0, 1, 2, 5):
        client.post(f"/api/habits/{h['id']}/toggle", json={"date": iso(today - timedelta(days=back))})
    got = client.get(f"/api/habits/{h['id']}").get_json()
    assert got["count"] == 4 and got["current_streak"] == 3 and got["longest_streak"] == 3
    assert got["done_today"] is True
    off = client.post(f"/api/habits/{h['id']}/toggle", json={"date": iso(today)}).get_json()
    assert off["count"] == 3 and off["done_today"] is False and off["current_streak"] == 2


def test_habit_toggle_defaults_to_today_and_rejects_future(client, user):
    h = client.post("/api/habits", json={"name": "Read"}).get_json()
    assert client.post(f"/api/habits/{h['id']}/toggle").get_json()["done_today"] is True
    future = iso(date.today() + timedelta(days=1))
    assert client.post(f"/api/habits/{h['id']}/toggle", json={"date": future}).status_code == 422


def test_habit_update_archive_delete_and_privacy(client, other_client, user):
    h = client.post("/api/habits", json={"name": "Yoga"}).get_json()
    assert other_client.post(f"/api/habits/{h['id']}/toggle").status_code == 404
    assert client.patch(f"/api/habits/{h['id']}", json={"archived": True}).get_json()["archived"] is True
    assert client.get("/api/habits").get_json()["items"] == []
    assert len(client.get("/api/habits?archived=1").get_json()["items"]) == 1
    assert client.post("/api/habits", json={"name": "x", "color": "red"}).status_code == 422
    assert client.delete(f"/api/habits/{h['id']}").status_code == 200


def test_heatmap(client, user):
    h = client.post("/api/habits", json={"name": "Run"}).get_json()
    client.post(f"/api/habits/{h['id']}/toggle")
    hm = client.get("/api/habits/heatmap?days=30").get_json()
    assert len(hm["series"]) == 30 and hm["series"][-1]["count"] == 1
    assert hm["habits"][0]["rate_30d"] > 0


# ---- mood / pomodoro / dashboard ----------------------------------------------------
def test_mood_upsert_and_history(client, user):
    assert client.put("/api/moods", json={"mood": "happy", "note": "great"}).status_code == 200
    client.put("/api/moods", json={"mood": "sad"})  # reemplaza el de hoy
    yesterday = iso(date.today() - timedelta(days=1))
    client.put("/api/moods", json={"mood": "love", "date": yesterday})
    data = client.get("/api/moods?days=7").get_json()
    assert len(data["items"]) == 2 and data["today"]["mood"] == "sad"
    assert data["counts"]["sad"] == 1 and data["counts"]["love"] == 1 and data["counts"]["happy"] == 0
    assert client.put("/api/moods", json={"mood": "angry"}).status_code == 422


def test_pomodoro_save_and_stats(client, user):
    p = client.post("/api/projects", json={"name": "Focus"}).get_json()
    client.post("/api/pomodoro", json={"duration_seconds": 1500, "project_id": p["id"]})
    client.post("/api/pomodoro", json={"duration_seconds": 1500})
    client.post("/api/pomodoro", json={"duration_seconds": 300, "kind": "break"})
    client.post("/api/pomodoro", json={"duration_seconds": 600, "completed": False})
    stats = client.get("/api/pomodoro/stats").get_json()
    assert stats["total_sessions"] == 2 and stats["total_minutes"] == 50
    assert stats["today_sessions"] == 2 and len(stats["series"]) == 14
    assert len(client.get("/api/pomodoro").get_json()["items"]) == 4
    assert client.post("/api/pomodoro", json={"duration_seconds": 0}).status_code == 422


def test_dashboard_aggregates(client, user):
    h = client.post("/api/habits", json={"name": "Run"}).get_json()
    client.post(f"/api/habits/{h['id']}/toggle")
    client.post("/api/projects", json={"name": "Active", "status": "in_progress"})
    client.post("/api/notes", json={"title": "N"})
    client.post("/api/goals", json={"title": "G"})
    client.put("/api/moods", json={"mood": "happy"})
    client.post("/api/pomodoro", json={"duration_seconds": 1500})
    d = client.get("/api/dashboard").get_json()
    assert d["habits"]["done_today"] == 1 and d["habits"]["best_streak"] == 1
    assert len(d["habits"]["week"]) == 7
    assert d["projects"]["counts"]["in_progress"] == 1 and len(d["projects"]["active"]) == 1
    assert len(d["notes"]) == 1 and len(d["goals"]) == 1
    assert d["mood_today"]["mood"] == "happy" and d["focus_minutes_today"] == 25
