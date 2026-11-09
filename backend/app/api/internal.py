import hmac

from flask import Blueprint, current_app, jsonify, request

from ..services.reminders import send_due_reminders
from ..utils import ApiError

bp = Blueprint("internal", __name__, url_prefix="/api/internal")


@bp.post("/tick")
def tick():
    """Lo llama un cron externo cada pocos minutos: despierta el servidor y envía los recordatorios que toquen.

    Protegido con `CRON_TOKEN` (cabecera `Authorization: Bearer <token>`). Sin token configurado, no existe.
    """
    expected = current_app.config.get("CRON_TOKEN")
    if not expected:
        raise ApiError("Not found", 404, "not_found")
    given = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise ApiError("Invalid token", 401, "unauthorized")
    return jsonify({"ok": True, **send_due_reminders()})
