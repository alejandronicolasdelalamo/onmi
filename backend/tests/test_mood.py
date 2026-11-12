from datetime import date, timedelta

from .conftest import register

TODAY = date.today()


def day(n: int) -> str:
    return (TODAY - timedelta(days=n)).isoformat()


def put(client, mood, d=None, **kw):
    body = {"mood": mood, **kw}
    if d:
        body["date"] = d
    return client.put("/api/moods", json=body)


def test_changing_an_already_recorded_mood_replaces_it(client, user):
    first = put(client, "sad", note="mal día", tags=["work"]).get_json()
    assert first["mood"] == "sad" and first["tags"] == ["work"] and first["updated_at"]
    second = put(client, "happy", note="mejoró", tags=["friends", "exercise"]).get_json()
    assert second["id"] == first["id"] and second["mood"] == "happy"
    items = client.get("/api/moods").get_json()["items"]
    assert len(items) == 1 and items[0]["note"] == "mejoró" and items[0]["tags"] == ["friends", "exercise"]


def test_past_days_can_be_recorded_edited_and_deleted_but_not_the_future(client, user):
    assert put(client, "love", day(3)).status_code == 200
    assert put(client, "mad", day(3), note="corregido").get_json()["mood"] == "mad"
    assert put(client, "happy", (TODAY + timedelta(days=5)).isoformat()).status_code == 422
    assert client.delete(f"/api/moods/{day(3)}").status_code == 200
    assert client.get("/api/moods").get_json()["items"] == []
    assert client.delete(f"/api/moods/{day(3)}").status_code == 404
    assert client.delete("/api/moods/ayer").status_code == 422


def test_tags_are_validated_deduplicated_and_limited(client, user):
    assert put(client, "happy", tags=["inventada"]).status_code == 422
    assert put(client, "happy", tags=["work"] * 3).get_json()["tags"] == ["work"]
    assert (
        put(client, "happy", tags=["sleep", "work", "study", "family", "friends", "partner", "health"]).status_code
        == 422
    )


def test_only_my_own_moods(client, other_client, user):
    put(client, "happy", note="privado")
    assert other_client.get("/api/moods").get_json()["items"] == []
    assert other_client.delete(f"/api/moods/{TODAY.isoformat()}").status_code == 404


def test_stats_streak_average_and_what_lifts_or_lowers_your_mood(client, user):
    for n, (mood, tags) in enumerate(
        [("love", ["friends"]), ("happy", ["friends", "exercise"]), ("sad", ["work"]), ("mad", ["work"])]
    ):
        put(client, mood, day(n), tags=tags)
    stats = client.get("/api/moods").get_json()["stats"]
    assert stats["logged_days"] == 4 and stats["streak"] == 4
    assert stats["average"] == round((5 + 4 + 1 + 2) / 4, 2)
    by_tag = {t["tag"]: t for t in stats["by_tag"]}
    assert by_tag["friends"]["average"] == 4.5 and by_tag["work"]["average"] == 1.5
    assert stats["by_tag"][0]["tag"] == "friends" and stats["by_tag"][-1]["tag"] == "work"


def test_streak_counts_from_yesterday_when_today_is_not_logged_and_breaks_on_gaps(client, user):
    for n in (1, 2, 4):
        put(client, "happy", day(n))
    assert client.get("/api/moods").get_json()["stats"]["streak"] == 2
    put(client, "happy", day(0))
    assert client.get("/api/moods").get_json()["stats"]["streak"] == 3


def test_empty_stats(client, user):
    stats = client.get("/api/moods").get_json()["stats"]
    assert stats == {"logged_days": 0, "streak": 0, "average": None, "by_tag": []}


def test_unused_register_import():
    assert register
