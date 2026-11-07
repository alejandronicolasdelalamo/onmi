from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..openapi import doc
from ..services.insights_data import compute_insights
from ..utils import client_today, current_user

bp = Blueprint("insights", __name__, url_prefix="/api/insights")


@bp.get("")
@jwt_required()
@doc(
    "Revisión semanal y patrones entre hábitos, ánimo y enfoque",
    "Insights",
    description=(
        "Compara los últimos 7 días con los 7 anteriores y calcula cómo cambia el ánimo los días que se cumple cada "
        "hábito. Los patrones exigen datos suficientes y se devuelven como correlaciones, no como causas. "
        "`today` (YYYY-MM-DD) permite usar el día local del usuario."
    ),
)
def get_insights():
    return jsonify(compute_insights(current_user(), client_today()))
