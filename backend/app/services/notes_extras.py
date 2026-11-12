"""Papelera, enlaces [[nota]] e imágenes de las notas."""

import re
from datetime import timedelta

from ..extensions import db
from ..models import Note, NoteImage, User
from ..utils import utcnow

TRASH_DAYS = 30
ORPHAN_IMAGE_HOURS = 24
MAX_IMAGE_BYTES = 1_500_000
MAX_IMAGES_PER_USER = 200
MAX_IMAGE_TOTAL_BYTES = 40_000_000

WIKILINK = re.compile(r"\[\[([^\[\]\n]{1,150})\]\]")
IMAGE_REF = re.compile(r"onmi-image:(\d+)")

_MAGIC = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def sniff_image(data: bytes) -> str | None:
    """Tipo real según los primeros bytes (no se fía de la cabecera Content-Type)."""
    for magic, mime in _MAGIC:
        if data.startswith(magic):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def link_titles(content: str) -> list[str]:
    """Títulos citados con [[…]], sin repetir y respetando el orden."""
    seen: dict[str, str] = {}
    for m in WIKILINK.finditer(content or ""):
        title = m.group(1).strip()
        if title:
            seen.setdefault(title.lower(), title)
    return list(seen.values())


def sync_images(note: Note) -> None:
    """Enlaza con la nota las imágenes (propias) que cita su contenido y suelta las que ya no cita."""
    wanted = {int(i) for i in IMAGE_REF.findall(note.content or "")}
    images = db.session.scalars(
        db.select(NoteImage).where(
            NoteImage.user_id == note.user_id,
            (NoteImage.id.in_(wanted) if wanted else db.false()) | (NoteImage.note_id == note.id),
        )
    ).all()
    for img in images:
        if img.id in wanted and img.note_id in (None, note.id):
            img.note_id = note.id
        elif img.note_id == note.id and img.id not in wanted:
            img.note_id = None  # queda huérfana y se elimina sola al día siguiente


def delete_note_forever(note: Note) -> None:
    db.session.execute(db.delete(NoteImage).where(NoteImage.note_id == note.id))
    db.session.delete(note)


def purge_expired() -> dict:
    """Elimina de verdad lo que lleva 30 días en la papelera y las imágenes que ninguna nota usa."""
    now = utcnow()
    old = db.session.scalars(db.select(Note).where(Note.deleted_at < now - timedelta(days=TRASH_DAYS))).all()
    for note in old:
        delete_note_forever(note)
    orphans = db.session.execute(
        db.delete(NoteImage).where(
            NoteImage.note_id.is_(None), NoteImage.created_at < now - timedelta(hours=ORPHAN_IMAGE_HOURS)
        )
    ).rowcount
    db.session.commit()
    return {"notes_purged": len(old), "images_purged": orphans or 0}


def image_usage(user: User) -> tuple[int, int]:
    count, total = db.session.execute(
        db.select(db.func.count(NoteImage.id), db.func.coalesce(db.func.sum(NoteImage.size), 0)).where(
            NoteImage.user_id == user.id
        )
    ).one()
    return int(count), int(total)
