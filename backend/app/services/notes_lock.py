"""Notas ocultas: contraseña propia + desbloqueo temporal.

El desbloqueo es un token firmado y con caducidad que el cliente guarda solo en memoria y envía en la cabecera
`X-Notes-Unlock`. Cambiar la contraseña de notas invalida los tokens anteriores (la huella incluye el hash).
Importante: es ocultación en el servidor, no cifrado de extremo a extremo.
"""

import hashlib

from flask import current_app, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from ..models import User

HEADER = "X-Notes-Unlock"
_SALT = "onmi-notes-unlock"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def _fingerprint(user: User) -> str:
    return hashlib.sha256((user.notes_lock_hash or "").encode()).hexdigest()[:16]


def issue_token(user: User) -> str:
    return _serializer().dumps({"uid": user.id, "fp": _fingerprint(user)})


def is_unlocked(user: User) -> bool:
    """¿La petición trae un desbloqueo vigente de ESTE usuario?"""
    raw = request.headers.get(HEADER, "")
    if not raw or not user.notes_lock_hash:
        return False
    try:
        data = _serializer().loads(raw, max_age=current_app.config["NOTES_UNLOCK_MINUTES"] * 60)
    except BadSignature:
        return False
    return data.get("uid") == user.id and data.get("fp") == _fingerprint(user)
