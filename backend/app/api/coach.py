from datetime import timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db, limiter
from ..models import CoachReview
from ..openapi import doc
from ..schemas import CoachGenerateIn
from ..services import coach
from ..services.stats import week_start
from ..utils import ApiError, client_today, current_user, parse_body, utcnow

bp = Blueprint("coach", __name__, url_prefix="/api/coach")

COOLDOWN = timedelta(hours=1)  # entre regeneraciones de la misma revisión (acota el coste)


def _current_review(user, week):
    return db.session.scalar(db.select(CoachReview).filter_by(user_id=user.id, week_start=week))


@bp.get("/status")
@jwt_required()
@doc(
    "Estado del coach semanal",
    "Coach",
    description=(
        "`ai_available`: el servidor tiene clave de Claude. `ai_enabled`: el usuario lo activó. "
        "`can_enable`: puede activarlo (no es la cuenta demo). `review`: la revisión de esta semana, si existe."
    ),
)
def status():
    user = current_user()
    review = _current_review(user, week_start(client_today()))
    available = coach.ai_available()
    return jsonify(
        {
            "ai_available": available,
            "ai_enabled": bool(user.ai_coach_enabled and available and not user.is_demo),
            "can_enable": available and not user.is_demo,
            "model": coach.model_name() if available else None,
            "review": review.to_dict() if review else None,
        }
    )


@bp.post("/review")
@jwt_required()
@limiter.limit("20 per day")
@doc(
    "Generar la revisión semanal",
    "Coach",
    body=CoachGenerateIn,
    description=(
        "Devuelve la revisión guardada de esta semana. Con `refresh` la regenera (máximo una vez por hora, salvo que "
        "haya cambiado el idioma). Con IA activada se escribe con Claude a partir de datos agregados; si no, con el "
        "redactor local."
    ),
)
def generate_review():
    user = current_user()
    data = parse_body(CoachGenerateIn)
    t = client_today()
    week = week_start(t)
    existing = _current_review(user, week)

    if existing and not data.refresh and existing.locale == user.locale:
        return jsonify(existing.to_dict())
    if existing and data.refresh and existing.locale == user.locale:
        wait = COOLDOWN - (utcnow() - existing.created_at)
        if wait > timedelta(0):
            raise ApiError(
                "Please wait before regenerating your review",
                429,
                "coach_cooldown",
                [{"field": "retry_after", "message": str(int(wait.total_seconds()))}],
            )

    result = coach.generate(user, coach.build_snapshot(user, t), user.locale)
    review = existing or CoachReview(user_id=user.id, week_start=week)
    review.locale, review.source, review.model = user.locale, result["source"], result["model"]
    review.text, review.created_at = result["text"], utcnow()
    db.session.add(review)
    db.session.commit()
    return jsonify({**review.to_dict(), "ai_error": result["ai_error"]}), 201
