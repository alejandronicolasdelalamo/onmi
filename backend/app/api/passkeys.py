"""Passkeys (WebAuthn): iniciar sesión con Face ID, Touch ID o una llave de seguridad, sin contraseña.

El reto (challenge) de cada ceremonia viaja firmado y con caducidad en el propio cliente: el servidor no guarda estado.
"""

from urllib.parse import urlparse

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import bytes_to_base64url
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..extensions import db, limiter
from ..models import Passkey, User
from ..openapi import doc
from ..utils import ApiError, current_user, parse_body, utcnow
from .auth import _session_response

bp = Blueprint("passkeys", __name__, url_prefix="/api/auth/passkeys")

MAX_PER_USER = 10
CHALLENGE_SECONDS = 300
_SALT = "onmi-passkey-challenge"


class VerifyIn(BaseModel):
    credential: dict
    challenge_token: str = Field(min_length=10, max_length=2000)
    name: str = Field(default="", max_length=80)


def _rp() -> tuple[str, str]:
    """(RP ID, origen) esperados. El RP ID es el dominio de la web."""
    cfg = current_app.config
    url = urlparse(cfg["FRONTEND_URL"])
    rp_id = cfg["WEBAUTHN_RP_ID"] or (url.hostname or "localhost")
    return rp_id, f"{url.scheme}://{url.netloc}"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def _challenge_token(kind: str, challenge: bytes, user_id: int | None) -> str:
    return _serializer().dumps({"k": kind, "c": bytes_to_base64url(challenge), "u": user_id})


def _read_challenge(token: str, kind: str, user_id: int | None) -> bytes:
    try:
        data = _serializer().loads(token, max_age=CHALLENGE_SECONDS)
    except BadSignature as exc:
        raise ApiError("The passkey request expired. Try again.", 400, "passkey_expired") from exc
    if data.get("k") != kind or data.get("u") != user_id:
        raise ApiError("Invalid passkey request", 400, "passkey_invalid")
    return base64url_to_bytes(data["c"])


def _options_response(options, token: str):
    import json

    return jsonify({"options": json.loads(options_to_json(options)), "challenge_token": token})


@bp.get("")
@jwt_required()
@doc("My passkeys", "Auth")
def list_passkeys():
    user = current_user()
    return jsonify({"items": [p.to_dict() for p in sorted(user.passkeys, key=lambda p: p.created_at)]})


@bp.post("/register/options")
@jwt_required()
@limiter.limit("20 per hour")
@doc("Start adding a passkey", "Auth")
def register_options():
    user = current_user()
    if user.is_demo:
        raise ApiError("The demo account cannot add passkeys", 403, "forbidden")
    if len(user.passkeys) >= MAX_PER_USER:
        raise ApiError("You can have up to 10 passkeys", 409, "limit_reached")
    rp_id, _ = _rp()
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=current_app.config["WEBAUTHN_RP_NAME"],
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.name,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.credential_id)) for p in user.passkeys
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    return _options_response(options, _challenge_token("reg", options.challenge, user.id))


@bp.post("/register/verify")
@jwt_required()
@limiter.limit("20 per hour")
@doc("Finish adding a passkey", "Auth", body=VerifyIn)
def register_verify():
    user = current_user()
    if user.is_demo:
        raise ApiError("The demo account cannot add passkeys", 403, "forbidden")
    data = parse_body(VerifyIn)
    challenge = _read_challenge(data.challenge_token, "reg", user.id)
    rp_id, origin = _rp()
    try:
        verified = verify_registration_response(
            credential=data.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except (InvalidRegistrationResponse, ValueError, KeyError) as exc:
        raise ApiError("Could not verify the passkey", 400, "passkey_invalid") from exc
    cred_id = bytes_to_base64url(verified.credential_id)
    if db.session.scalar(db.select(Passkey).filter_by(credential_id=cred_id)):
        raise ApiError("That passkey is already registered", 409, "passkey_exists")
    passkey = Passkey(
        user_id=user.id,
        credential_id=cred_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        name=data.name.strip()[:80] or "Passkey",
    )
    db.session.add(passkey)
    db.session.commit()
    return jsonify(passkey.to_dict()), 201


@bp.delete("/<int:passkey_id>")
@jwt_required()
@doc("Remove a passkey", "Auth")
def delete_passkey(passkey_id):
    user = current_user()
    passkey = db.session.get(Passkey, passkey_id)
    if passkey is None or passkey.user_id != user.id:
        raise ApiError("Passkey not found", 404, "not_found")
    db.session.delete(passkey)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/login/options")
@limiter.limit("30 per hour")
@doc(
    "Start signing in with a passkey",
    "Auth",
    auth=False,
    description="Discoverable credentials: no email needed, the device offers the passkeys it has for this site.",
)
def login_options():
    rp_id, _ = _rp()
    options = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.PREFERRED)
    return _options_response(options, _challenge_token("auth", options.challenge, None))


@bp.post("/login/verify")
@limiter.limit("30 per hour")
@doc("Finish signing in with a passkey", "Auth", body=VerifyIn, auth=False)
def login_verify():
    data = parse_body(VerifyIn)
    challenge = _read_challenge(data.challenge_token, "auth", None)
    cred_id = data.credential.get("id")
    passkey = (
        db.session.scalar(db.select(Passkey).filter_by(credential_id=cred_id)) if isinstance(cred_id, str) else None
    )
    if passkey is None:
        raise ApiError("This passkey is not registered", 401, "invalid_credentials")
    rp_id, origin = _rp()
    try:
        verified = verify_authentication_response(
            credential=data.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
        )
    except (InvalidAuthenticationResponse, ValueError, KeyError) as exc:
        raise ApiError("Could not verify the passkey", 401, "invalid_credentials") from exc
    user: User = passkey.user
    if not user.is_active:
        raise ApiError("Account deactivated", 403, "inactive")
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = utcnow()
    user.failed_logins = 0
    user.locked_until = None
    return _session_response(user)
