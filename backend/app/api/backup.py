"""Importar una copia de seguridad (el JSON que descarga «Exportar mis datos»)."""

from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db, limiter
from ..models import Goal, Habit, HabitLog, MoodEntry, MoodKind, Note, Priority, Project, ProjectStatus
from ..openapi import doc
from ..utils import ApiError, current_user

bp = Blueprint("backup", __name__, url_prefix="/api/backup")

MAX_BYTES = 5_000_000
MAX_ITEMS = 5000
MAX_LOG_DAYS = 3700


def _text(value, limit: int) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _day(value) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if isinstance(value, str) else None
    except ValueError:
        return None


def _list(payload: dict, key: str) -> list[dict]:
    items = payload.get(key)
    if not isinstance(items, list):
        return []
    return [i for i in items[:MAX_ITEMS] if isinstance(i, dict)]


@bp.post("/import")
@jwt_required()
@limiter.limit("10 per hour")
@doc(
    "Import a backup",
    "Auth",
    description="Body: the JSON file from `GET /api/auth/export`. Adds what is missing (never overwrites or deletes). "
    "Hidden notes are not part of exports, so they are not imported.",
)
def import_backup():
    user = current_user()
    if user.is_demo:
        raise ApiError("The demo account cannot import data", 403, "forbidden")
    if (request.content_length or 0) > MAX_BYTES:
        raise ApiError("The file is too large", 413, "file_too_large")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not any(
        k in payload for k in ("notes", "projects", "goals", "habits", "moods")
    ):
        raise ApiError("This does not look like an ONMi backup", 422, "invalid_backup")

    counts = {"notes": 0, "projects": 0, "goals": 0, "habits": 0, "moods": 0, "skipped": 0}

    # ---- proyectos
    existing_projects = {p.name.lower(): p for p in user.projects}
    project_map: dict[int, Project] = {}
    for raw in _list(payload, "projects"):
        name = _text(raw.get("name"), 120)
        if not name:
            counts["skipped"] += 1
            continue
        project = existing_projects.get(name.lower())
        if project is None:
            try:
                status = ProjectStatus(raw.get("status", "todo"))
                priority = Priority(raw.get("priority", "medium"))
            except ValueError:
                status, priority = ProjectStatus.TODO, Priority.MEDIUM
            project = Project(
                user_id=user.id,
                name=name,
                description=(_text(raw.get("description"), 5000) or ""),
                category=_text(raw.get("category"), 60),
                status=status,
                priority=priority,
                due_date=_day(raw.get("due_date")),
            )
            db.session.add(project)
            existing_projects[name.lower()] = project
            counts["projects"] += 1
        if isinstance(raw.get("id"), int):
            project_map[raw["id"]] = project
    db.session.flush()

    # ---- metas
    existing_goals = {(g.title.lower(), g.project_id): g for g in user.goals}
    goal_map: dict[int, Goal] = {}
    for raw in _list(payload, "goals"):
        title = _text(raw.get("title"), 200)
        if not title:
            counts["skipped"] += 1
            continue
        project = project_map.get(raw.get("project_id")) if isinstance(raw.get("project_id"), int) else None
        key = (title.lower(), project.id if project else None)
        goal = existing_goals.get(key)
        if goal is None:
            goal = Goal(
                user_id=user.id,
                title=title,
                description=(_text(raw.get("description"), 2000) or ""),
                done=bool(raw.get("done")),
                due_date=_day(raw.get("due_date")),
                project_id=project.id if project else None,
            )
            db.session.add(goal)
            existing_goals[key] = goal
            counts["goals"] += 1
        if isinstance(raw.get("id"), int):
            goal_map[raw["id"]] = goal
    db.session.flush()

    # ---- hábitos (con su historial)
    existing_habits = {h.name.lower(): h for h in user.habits}
    for raw in _list(payload, "habits"):
        name = _text(raw.get("name"), 100)
        if not name:
            counts["skipped"] += 1
            continue
        habit = existing_habits.get(name.lower())
        if habit is None:
            target = raw.get("target_per_week")
            goal = goal_map.get(raw.get("goal_id")) if isinstance(raw.get("goal_id"), int) else None
            habit = Habit(
                user_id=user.id,
                name=name,
                description=(_text(raw.get("description"), 500) or ""),
                category=_text(raw.get("category"), 60),
                color=_text(raw.get("color"), 16) or "#6366f1",
                target_per_week=target if isinstance(target, int) and 1 <= target <= 7 else 7,
                goal_id=goal.id if goal else None,
            )
            db.session.add(habit)
            db.session.flush()
            existing_habits[name.lower()] = habit
            counts["habits"] += 1
        have = {log.day for log in habit.logs}
        dates = raw.get("dates") if isinstance(raw.get("dates"), list) else []
        for d in dates[:MAX_LOG_DAYS]:
            day = _day(d)
            if day and day not in have:
                db.session.add(HabitLog(habit_id=habit.id, day=day))
                have.add(day)

    # ---- notas (las repetidas, con el mismo título y contenido, no se duplican)
    seen = {
        (n.title, n.content)
        for n in db.session.scalars(db.select(Note).filter_by(user_id=user.id, deleted_at=None, locked=False))
    }
    for raw in _list(payload, "notes"):
        title = _text(raw.get("title"), 150)
        content = raw.get("content") if isinstance(raw.get("content"), str) else ""
        if not title or raw.get("locked") or len(content) > 20000 or "onmi-image:" in content:
            counts["skipped"] += 1  # las imágenes no viajan en la copia, así que esa nota quedaría rota
            continue
        if (title, content) in seen:
            continue
        tags = raw.get("tags") if isinstance(raw.get("tags"), list) else []
        clean = list(dict.fromkeys(t.strip()[:30] for t in tags if isinstance(t, str) and t.strip()))[:10]
        goal = goal_map.get(raw.get("goal_id")) if isinstance(raw.get("goal_id"), int) else None
        project = project_map.get(raw.get("project_id")) if isinstance(raw.get("project_id"), int) else None
        db.session.add(
            Note(
                user_id=user.id,
                title=title,
                content=content,
                tags=clean,
                pinned=bool(raw.get("pinned")),
                goal_id=goal.id if goal else None,
                project_id=project.id if project else None,
            )
        )
        seen.add((title, content))
        counts["notes"] += 1

    # ---- ánimo
    have_days = {m.day for m in user.moods}
    for raw in _list(payload, "moods"):
        day = _day(raw.get("date"))
        try:
            mood = MoodKind(raw.get("mood"))
        except ValueError:
            counts["skipped"] += 1
            continue
        if day and day not in have_days:
            db.session.add(MoodEntry(user_id=user.id, day=day, mood=mood, note=(_text(raw.get("note"), 300) or "")))
            have_days.add(day)
            counts["moods"] += 1

    db.session.commit()
    return jsonify(counts)
