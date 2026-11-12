from datetime import timedelta

from flask import Blueprint, Response, current_app, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db, limiter
from ..models import Goal, Note, NoteImage, Project
from ..openapi import doc
from ..schemas import NoteIn, NotesPasswordChangeIn, NotesPasswordIn, NotesPasswordRemoveIn, NoteUpdate
from ..services import notes_extras, notes_lock
from ..utils import ApiError, apply_updates, check_ref, current_user, get_owned, parse_body, utcnow

bp = Blueprint("notes", __name__, url_prefix="/api/notes")


def _require_password_set(user) -> None:
    if not user.notes_lock_hash:
        raise ApiError("Set a notes password first", 409, "no_notes_password")


def _require_unlocked(note: Note, reveal: bool) -> None:
    if note.locked and not reveal:
        raise ApiError("This note is hidden. Unlock your notes first.", 403, "notes_locked")


def _get_note(note_id: int, user, trashed: bool = False) -> Note:
    """La nota del usuario; una nota en la papelera solo existe para las rutas de la papelera."""
    note = get_owned(Note, note_id, user)
    if (note.deleted_at is not None) != trashed:
        raise ApiError("Note not found", 404, "not_found")
    return note


def _minutes() -> int:
    return current_app.config["NOTES_UNLOCK_MINUTES"]


@bp.get("")
@jwt_required()
@doc(
    "List notes",
    "Notes",
    description="Filters: `q` (text), `tag`, `pinned`, `project_id`, `goal_id`, `trash=1` (deleted notes). "
    "Hidden notes come back without "
    "content (and are left out of any search or filter) unless the `X-Notes-Unlock` header is valid.",
)
def list_notes():
    user = current_user()
    reveal = notes_lock.is_unlocked(user)
    trash = request.args.get("trash") in {"1", "true"}
    if trash:
        notes_extras.purge_expired()
    query = db.select(Note).filter_by(user_id=user.id)
    query = query.where(Note.deleted_at.is_not(None) if trash else Note.deleted_at.is_(None))
    q = request.args.get("q", "").strip()
    tag = request.args.get("tag", "").strip().lower()
    pinned = request.args.get("pinned") in {"1", "true"}
    filtered = bool(q or tag or pinned)
    if q:
        like = f"%{q}%"
        query = query.where(Note.title.ilike(like) | Note.content.ilike(like))
    if pinned:
        query = query.where(Note.pinned.is_(True))
    for key in ("project_id", "goal_id"):
        if (val := request.args.get(key, type=int)) is not None:
            query = query.filter_by(**{key: val})
            filtered = True
    if filtered and not reveal:
        # Una búsqueda o un filtro nunca debe delatar el contenido de una nota oculta.
        query = query.where(Note.locked.is_(False))
    if trash:
        query = query.order_by(Note.deleted_at.desc())
    else:
        query = query.order_by(Note.pinned.desc(), Note.updated_at.desc())
    notes = db.session.scalars(query).all()
    if tag:
        notes = [n for n in notes if tag in [t.lower() for t in (n.tags or [])]]
    return jsonify({"items": [n.to_dict(reveal) for n in notes]})


@bp.get("/tags")
@jwt_required()
@doc("Tags in use with their note count (hidden notes only count when unlocked)", "Notes")
def list_tags():
    user = current_user()
    query = db.select(Note.tags).filter_by(user_id=user.id).where(Note.deleted_at.is_(None))
    if not notes_lock.is_unlocked(user):
        query = query.where(Note.locked.is_(False))
    counts: dict[str, int] = {}
    for (tags,) in db.session.execute(query):
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
    if data.locked:
        _require_password_set(user)
    if data.queued:
        # Reenvío desde la bandeja sin conexión: si la nota ya llegó antes (el corte fue después de enviarla), se
        # devuelve esa misma en vez de crear otra igual.
        dup = db.session.scalar(
            db.select(Note)
            .filter_by(user_id=user.id, title=data.title, content=data.content, deleted_at=None)
            .where(Note.created_at > utcnow() - timedelta(days=2))
            .order_by(Note.id)
        )
        if dup is not None:
            return jsonify(dup.to_dict(notes_lock.is_unlocked(user))), 200
    note = Note(
        user_id=user.id,
        title=data.title,
        content=data.content,
        tags=list(dict.fromkeys(data.tags)),
        pinned=data.pinned,
        locked=data.locked,
        project_id=check_ref(Project, data.project_id, user),
        goal_id=check_ref(Goal, data.goal_id, user),
    )
    db.session.add(note)
    db.session.flush()
    notes_extras.sync_images(note)
    db.session.commit()
    return jsonify(note.to_dict(reveal=True)), 201  # quien la acaba de escribir ya conoce su contenido


@bp.get("/<int:note_id>")
@jwt_required()
@doc("Get note", "Notes")
def get_note(note_id):
    user = current_user()
    return jsonify(_get_note(note_id, user).to_dict(notes_lock.is_unlocked(user)))


@bp.patch("/<int:note_id>")
@bp.put("/<int:note_id>")
@jwt_required()
@doc("Update note (partial). Editing a hidden note needs the unlock header.", "Notes", body=NoteUpdate)
def update_note(note_id):
    user = current_user()
    note = _get_note(note_id, user)
    reveal = notes_lock.is_unlocked(user)
    data = parse_body(NoteUpdate)
    if data.model_fields_set - {"pinned"}:  # fijar/desfijar una nota oculta no revela nada
        _require_unlocked(note, reveal)
    if "title" in data.model_fields_set and data.title is None:
        raise ApiError("Title cannot be null", 422, "validation_error")
    if "locked" in data.model_fields_set:
        if data.locked is None:
            raise ApiError("locked cannot be null", 422, "validation_error")
        if data.locked:
            _require_password_set(user)
    if "project_id" in data.model_fields_set:
        check_ref(Project, data.project_id, user)
    if "goal_id" in data.model_fields_set:
        check_ref(Goal, data.goal_id, user)
    apply_updates(note, data, ("title", "content", "pinned", "locked", "project_id", "goal_id"))
    if data.tags is not None:
        note.tags = list(dict.fromkeys(data.tags))
    if "content" in data.model_fields_set:
        notes_extras.sync_images(note)
    db.session.commit()
    return jsonify(note.to_dict(reveal))


@bp.delete("/<int:note_id>")
@jwt_required()
@doc(
    "Delete note",
    "Notes",
    description="A live note goes to the trash (kept 30 days). A note already in the trash is deleted for good. "
    "A hidden note needs the unlock header.",
)
def delete_note(note_id):
    user = current_user()
    note = get_owned(Note, note_id, user)
    _require_unlocked(note, notes_lock.is_unlocked(user))
    if note.deleted_at is None:
        note.deleted_at = utcnow()
        note.pinned = False
    else:
        notes_extras.delete_note_forever(note)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/<int:note_id>/restore")
@jwt_required()
@doc("Restore a note from the trash", "Notes")
def restore_note(note_id):
    user = current_user()
    note = _get_note(note_id, user, trashed=True)
    note.deleted_at = None
    db.session.commit()
    return jsonify(note.to_dict(notes_lock.is_unlocked(user)))


@bp.delete("/trash")
@jwt_required()
@doc("Empty the trash (hidden notes are only removed with the unlock header)", "Notes")
def empty_trash():
    user = current_user()
    reveal = notes_lock.is_unlocked(user)
    removed = skipped = 0
    for note in db.session.scalars(db.select(Note).filter_by(user_id=user.id).where(Note.deleted_at.is_not(None))):
        if note.locked and not reveal:
            skipped += 1
            continue
        notes_extras.delete_note_forever(note)
        removed += 1
    db.session.commit()
    return jsonify({"removed": removed, "skipped": skipped})


@bp.get("/<int:note_id>/links")
@jwt_required()
@doc("Notes this one links to with [[title]] and notes that link to it", "Notes")
def note_links(note_id):
    user = current_user()
    reveal = notes_lock.is_unlocked(user)
    note = _get_note(note_id, user)
    _require_unlocked(note, reveal)
    query = db.select(Note.id, Note.title, Note.content).filter_by(user_id=user.id).where(Note.deleted_at.is_(None))
    if not reveal:  # una nota oculta no puede ni citarse ni aparecer como cita
        query = query.where(Note.locked.is_(False))
    rows = db.session.execute(query.order_by(Note.updated_at.desc())).all()
    by_title: dict[str, int] = {}
    for rid, title, _ in rows:
        by_title.setdefault(title.strip().lower(), rid)
    outgoing = [
        {"title": t, "id": by_title.get(t.lower()) if by_title.get(t.lower()) != note.id else None}
        for t in notes_extras.link_titles(note.content)
    ]
    me = note.title.strip().lower()
    backlinks = [
        {"id": rid, "title": title}
        for rid, title, content in rows
        if rid != note.id and me in {t.lower() for t in notes_extras.link_titles(content)}
    ]
    return jsonify({"outgoing": outgoing, "backlinks": backlinks})


# ---- imágenes ---------------------------------------------------------------------------------------
@bp.post("/images")
@jwt_required()
@limiter.limit("60 per hour")
@doc(
    "Upload an image for a note",
    "Notes",
    description="Raw JPEG, PNG or WebP bytes as the request body (max 1.5 MB). Returns the id to cite as "
    "`![](onmi-image:ID)` in the note content.",
)
def upload_image():
    user = current_user()
    data = request.get_data(cache=False)
    if not data:
        raise ApiError("Empty image", 400, "invalid_image")
    if len(data) > notes_extras.MAX_IMAGE_BYTES:
        raise ApiError("The image is too large", 413, "image_too_large")
    mime = notes_extras.sniff_image(data)
    if mime is None:
        raise ApiError("Only JPEG, PNG and WebP images are accepted", 415, "invalid_image")
    count, total = notes_extras.image_usage(user)
    if count >= notes_extras.MAX_IMAGES_PER_USER or total + len(data) > notes_extras.MAX_IMAGE_TOTAL_BYTES:
        raise ApiError("Image storage limit reached", 409, "image_quota")
    image = NoteImage(user_id=user.id, mime=mime, size=len(data), data=data)
    db.session.add(image)
    db.session.commit()
    return jsonify({"id": image.id, "ref": f"onmi-image:{image.id}", "mime": mime, "size": image.size}), 201


@bp.get("/images/<int:image_id>")
@jwt_required()
@doc("Download one of my note images (images of a hidden note need the unlock header)", "Notes")
def get_image(image_id):
    user = current_user()
    image = db.session.get(NoteImage, image_id)
    if image is None or image.user_id != user.id:
        raise ApiError("Image not found", 404, "not_found")
    private = False
    if image.note_id is not None:
        note = db.session.get(Note, image.note_id)
        if note is not None and note.locked:
            _require_unlocked(note, notes_lock.is_unlocked(user))
            private = True
    resp = Response(image.data, mimetype=image.mime)
    resp.headers["Cache-Control"] = "no-store" if private else "private, max-age=3600"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


# ---- contraseña de las notas ocultas ----------------------------------------------------------------
def _not_demo(user) -> None:
    if user.is_demo:  # la cuenta demo es compartida: no puede esconder nada
        raise ApiError("The demo account cannot hide notes", 403, "forbidden")


def _matches_current(user, supplied: str) -> bool:
    """La contraseña de notas actual o (por si se olvidó) la de la cuenta."""
    return user.check_notes_lock(supplied) or user.check_password(supplied)


def _session(user):
    return jsonify({"token": notes_lock.issue_token(user), "expires_in": _minutes() * 60, "user": user.to_dict()})


@bp.post("/lock/password")
@jwt_required()
@limiter.limit("10 per hour")
@doc("Set the notes password (first time)", "Notes", body=NotesPasswordIn)
def set_notes_password():
    user = current_user()
    _not_demo(user)
    data = parse_body(NotesPasswordIn)
    if user.notes_lock_hash:
        raise ApiError("A notes password already exists", 409, "notes_password_exists")
    user.set_notes_lock(data.password)
    db.session.commit()
    return _session(user)


@bp.put("/lock/password")
@jwt_required()
@limiter.limit("10 per hour")
@doc(
    "Change the notes password",
    "Notes",
    body=NotesPasswordChangeIn,
    description="`current_password` is the current notes password or, if forgotten, the account password.",
)
def change_notes_password():
    user = current_user()
    _not_demo(user)
    data = parse_body(NotesPasswordChangeIn)
    _require_password_set(user)
    if not _matches_current(user, data.current_password):
        raise ApiError("Incorrect password", 401, "invalid_credentials")
    user.set_notes_lock(data.new_password)
    db.session.commit()
    return _session(user)


@bp.delete("/lock/password")
@jwt_required()
@limiter.limit("10 per hour")
@doc(
    "Remove the notes password (every hidden note becomes a normal note again)",
    "Notes",
    body=NotesPasswordRemoveIn,
)
def remove_notes_password():
    user = current_user()
    data = parse_body(NotesPasswordRemoveIn)
    _require_password_set(user)
    if not _matches_current(user, data.current_password):
        raise ApiError("Incorrect password", 401, "invalid_credentials")
    user.notes_lock_hash = None
    for note in user.notes:
        note.locked = False
    db.session.commit()
    return jsonify({"user": user.to_dict()})


@bp.post("/unlock")
@jwt_required()
@limiter.limit("10 per 5 minutes")
@doc("Unlock hidden notes for a few minutes", "Notes", body=NotesPasswordIn)
def unlock_notes():
    user = current_user()
    data = parse_body(NotesPasswordIn)
    _require_password_set(user)
    if not user.check_notes_lock(data.password):
        raise ApiError("Incorrect notes password", 401, "invalid_credentials")
    return jsonify({"token": notes_lock.issue_token(user), "expires_in": _minutes() * 60})
