from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db, limiter
from ..models import PushSubscription
from ..openapi import doc
from ..schemas import PushSubscribeIn, PushUnsubscribeIn
from ..services import push
from ..utils import ApiError, current_user, parse_body

bp = Blueprint("push", __name__, url_prefix="/api/push")


@bp.get("/status")
@jwt_required()
@doc(
    "Estado de las notificaciones push",
    "Push",
    description="`public_key` es null si el servidor no tiene claves VAPID: el cliente debe ocultar la opción.",
)
def status():
    user = current_user()
    return jsonify(
        {
            "public_key": current_app.config["VAPID_PUBLIC_KEY"] if push.is_configured() else None,
            "subscriptions": len(user.push_subscriptions),
            "timezone": user.timezone,
        }
    )


@bp.post("/subscribe")
@jwt_required()
@limiter.limit("30 per hour")
@doc("Registrar este navegador para recibir recordatorios", "Push", body=PushSubscribeIn)
def subscribe():
    user = current_user()
    data = parse_body(PushSubscribeIn)
    try:
        ZoneInfo(data.timezone)
        user.timezone = data.timezone
    except (ZoneInfoNotFoundError, ValueError):
        pass  # zona desconocida: se conserva la anterior
    sub = db.session.scalar(db.select(PushSubscription).filter_by(endpoint=data.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=data.endpoint, user_id=user.id, p256dh=data.keys.p256dh, auth=data.keys.auth)
        db.session.add(sub)
    else:  # el mismo navegador cambió de cuenta, o renovó sus claves
        sub.user_id, sub.p256dh, sub.auth = user.id, data.keys.p256dh, data.keys.auth
    db.session.commit()
    return jsonify({"ok": True, "subscriptions": len(user.push_subscriptions)}), 201


@bp.post("/unsubscribe")
@jwt_required()
@doc("Dejar de recibir recordatorios en este navegador", "Push", body=PushUnsubscribeIn)
def unsubscribe():
    user = current_user()
    data = parse_body(PushUnsubscribeIn)
    sub = db.session.scalar(db.select(PushSubscription).filter_by(endpoint=data.endpoint, user_id=user.id))
    if sub:
        db.session.delete(sub)
        db.session.commit()
    return jsonify({"ok": True})


@bp.post("/test")
@jwt_required()
@limiter.limit("10 per hour")
@doc("Enviarme una notificación de prueba", "Push")
def send_test():
    user = current_user()
    if not push.is_configured():
        raise ApiError("Push notifications are not configured on this server", 501, "not_configured")
    sent = 0
    for sub in list(user.push_subscriptions):
        try:
            sent += bool(
                push.send(
                    sub.to_webpush(),
                    {"title": "ONMi", "body": "Notifications are working.", "tag": "test", "url": "/settings"},
                )
            )
        except push.Gone:
            db.session.delete(sub)
    db.session.commit()
    return jsonify({"sent": sent})
