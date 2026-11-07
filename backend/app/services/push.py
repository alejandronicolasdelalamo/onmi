"""Envío de Web Push con VAPID. Sin claves configuradas no se envía nada (modo desarrollo)."""

from __future__ import annotations

import json
import logging

from flask import current_app

log = logging.getLogger("onmi.push")


class Gone(Exception):
    """El navegador dio de baja la suscripción (HTTP 404/410): hay que borrarla."""


def is_configured() -> bool:
    cfg = current_app.config
    return bool(cfg.get("VAPID_PUBLIC_KEY") and cfg.get("VAPID_PRIVATE_KEY"))


def send(subscription: dict, payload: dict) -> bool:
    """Envía una notificación. True si el servicio push la aceptó; lanza `Gone` si la suscripción ya no existe."""
    if not is_configured():
        return False
    from pywebpush import WebPushException, webpush

    cfg = current_app.config
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=cfg["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": cfg["VAPID_SUBJECT"]},
            ttl=3600,
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            raise Gone from exc
        log.warning("Web Push rechazado (%s): %s", status, exc)
        return False


def generate_vapid_keys() -> tuple[str, str]:
    """(clave pública para el navegador, clave privada) en base64url, listas para variables de entorno."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid
    from py_vapid.utils import b64urlencode

    vapid = Vapid()
    vapid.generate_keys()
    public = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    return b64urlencode(public), b64urlencode(private)
