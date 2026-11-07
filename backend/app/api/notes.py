from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Goal, Note, Project
from ..openapi import doc
from ..schemas import NoteIn, NoteUpdate
from ..utils import ApiError, apply_updates, check_ref, current_user, get_owned, parse_body

bp = Blueprint("notes", __name__, url_prefix="/api/notes")


@bp.get("")
@jwt_required()
@doc("List notes", "Notes", description="Filters: `q` (text), `tag`, `pinned`, `project_id`, `goal_id`.")
def list_notes():
    user = current_user()
    query = db.select(Note).filter_by(user_id=user.id)
    if q := request.args.get("q", "").strip():
        like = f"%{q}%"
        query = query.where(Note.title.ilike(like) | Note.content.ilike(like))
    if request.args.get("pinned") in {"1", "true"}:
        query = query.where(Note.pinned.is_(True))
    for key in ("project_id", "goal_id"):
        if (val := request.args.get(key, type=int)) is not None:
            query = query.filter_by(**{key: val})
    query = query.order_by(Note.pinned.desc(), Note.updated_at.desc())
    notes = db.session.scalars(query).all()
    if tag := request.args.get("tag", "").strip().lower():
        notes = [n for n in notes if tag in [t.lower() for t in (n.tags or [])]]
    return jsonify({"items": [n.to_dict() for n in notes]})


@bp.get("/tags")
@jwt_required()
@doc("Tags in use with their note count", "Notes")
def list_tags():
    counts: dict[str, int] = {}
    for (tags,) in db.session.execute(db.select(Note.tags).filter_by(user_id=current_user().id)):
        for t in tags or []:
            counts[t] = counts.get(t, 0) + 1
    items = [{"tag": t, "count": c} for t, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    return jsonify({"items": items})


@bp.post("")
@jwt_required()
@doc("Create note", "Notes", body=NoteIn)
def create_note():
    user = current_user()
    data = parse_body(NoteIn)
    note = Note(
        user_id=user.id,
        title=data.title,
        content=data.content,
        tags=list(dict.fromkeys(data.tags)),
        pinned=data.pinned,
        project_id=check_ref(Project, data.project_id, user),
        goal_id=check_ref(Goal, data.goal_id, user),
    )
    db.session.add(note)
    db.session.commit()
    return jsonify(note.to_dict()), 201


@bp.get("/<int:note_id>")
@jwt_required()
@doc("Get note", "Notes")
def get_note(note_id):
    return jsonify(get_owned(Note, note_id, current_user()).to_dict())


@bp.patch("/<int:note_id>")
@bp.put("/<int:note_id>")
@jwt_required()
@doc("Update note (partial)", "Notes", body=NoteUpdate)
def update_note(note_id):
    user = current_user()
    note = get_owned(Note, note_id, user)
    data = parse_body(NoteUpdate)
    if "title" in data.model_fields_set and data.title is None:
        raise ApiError("Title cannot be null", 422, "validation_error")
    if "project_id" in data.model_fields_set:
        check_ref(Project, data.project_id, user)
    if "goal_id" in data.model_fields_set:
        check_ref(Goal, data.goal_id, user)
    apply_updates(note, data, ("title", "content", "pinned", "project_id", "goal_id"))
    if data.tags is not None:
        note.tags = list(dict.fromkeys(data.tags))
    db.session.commit()
    return jsonify(note.to_dict())


@bp.delete("/<int:note_id>")
@jwt_required()
@doc("Delete note", "Notes")
def delete_note(note_id):
    note = get_owned(Note, note_id, current_user())
    db.session.delete(note)
    db.session.commit()
    return jsonify({"ok": True})
