from datetime import timedelta

import requests
from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from ..extensions import db, limiter
from ..models import AuthToken, Role, TokenKind, User
from ..openapi import doc
from ..schemas import (
    ChangePasswordIn,
    EmailIn,
    GoogleIn,
    LoginIn,
    ProfileIn,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
)
from ..services import mail
from ..utils import ApiError, current_user, parse_body, utcnow

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

DEMO_EMAIL = "demo@onmi.app"


def _session_response(user: User, status: int = 200):
    """Respuesta con la sesión iniciada: tokens JWT en cookies httpOnly."""
    resp = jsonify({"user": user.to_dict()})
    resp.status_code = status
    set_access_cookies(resp, create_access_token(identity=str(user.id)))
    set_refresh_cookies(resp, create_refresh_token(identity=str(user.id)))
    user.last_login_at = utcnow()
    db.session.commit()
    return resp


def _send_verification(user: User) -> None:
    raw = AuthToken.issue(user, TokenKind.VERIFY_EMAIL, timedelta(hours=24))
    db.session.commit()
    mail.send_verification(user, raw)


@bp.get("/config")
@doc("Public client configuration", "Auth", auth=False)
def public_config():
    cfg = current_app.config
    return jsonify(
        {
            "google_client_id": cfg["GOOGLE_CLIENT_ID"] or None,
            "demo_enabled": cfg["DEMO_ENABLED"],
        }
    )


@bp.post("/register")
@limiter.limit("10 per hour")
@doc("Create account", "Auth", body=RegisterIn, auth=False)
def register():
    data = parse_body(RegisterIn)
    email = data.email.lower()
    if db.session.scalar(db.select(User).filter_by(email=email)):
        raise ApiError("An account with that email already exists", 409, "email_taken")
    user = User(name=data.name, email=email)
    user.set_password(data.password)
    db.session.add(user)
    db.session.commit()
    _send_verification(user)
    return _session_response(user, 201)


@bp.post("/login")
@limiter.limit("10 per minute")
@doc("Sign in", "Auth", body=LoginIn, auth=False, description="Locks the account for 15 min after 5 failed attempts.")
def login():
    data = parse_body(LoginIn)
    user = db.session.scalar(db.select(User).filter_by(email=data.email.lower()))
    cfg = current_app.config
    if user and user.is_locked:
        raise ApiError("Account temporarily locked. Try again later.", 423, "locked")
    if not user or not user.check_password(data.password):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= cfg["MAX_FAILED_LOGINS"]:
                user.locked_until = utcnow() + timedelta(minutes=cfg["LOCKOUT_MINUTES"])
                user.failed_logins = 0
            db.session.commit()
        raise ApiError("Incorrect email or password", 401, "invalid_credentials")
    if not user.is_active:
        raise ApiError("Account deactivated", 403, "inactive")
    if cfg["REQUIRE_EMAIL_VERIFICATION"] and not user.email_verified:
        raise ApiError("Verify your email to continue", 403, "email_not_verified")
    user.failed_logins = 0
    user.locked_until = None
    return _session_response(user)


@bp.post("/logout")
@doc("Sign out", "Auth", auth=False)
def logout():
    resp = jsonify({"ok": True})
    unset_jwt_cookies(resp)
    return resp


@bp.post("/refresh")
@jwt_required(refresh=True)
@doc("Renew the access token using the refresh token", "Auth")
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))
    if user is None or not user.is_active:
        raise ApiError("User unavailable", 401, "unauthorized")
    resp = jsonify({"user": user.to_dict()})
    set_access_cookies(resp, create_access_token(identity=str(user.id)))
    return resp


@bp.get("/me")
@jwt_required()
@doc("Current user", "Auth")
def me():
    return jsonify({"user": current_user().to_dict()})


@bp.patch("/me")
@jwt_required()
@doc("Update profile", "Auth", body=ProfileIn)
def update_me():
    user = current_user()
    data = parse_body(ProfileIn)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is not None:
            setattr(user, field, value)
    db.session.commit()
    return jsonify({"user": user.to_dict()})


@bp.delete("/me")
@jwt_required()
@doc("Delete my account and all my data", "Auth")
def delete_me():
    user = current_user()
    if user.is_demo:
        raise ApiError("The demo account cannot be deleted", 403, "forbidden")
    db.session.delete(user)
    db.session.commit()
    resp = jsonify({"ok": True})
    unset_jwt_cookies(resp)
    return resp


@bp.post("/change-password")
@jwt_required()
@limiter.limit("10 per hour")
@doc("Change password", "Auth", body=ChangePasswordIn)
def change_password():
    user = current_user()
    data = parse_body(ChangePasswordIn)
    if not user.check_password(data.current_password):
        raise ApiError("The current password is incorrect", 401, "invalid_credentials")
    user.set_password(data.new_password)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/forgot-password")
@limiter.limit("5 per hour")
@doc(
    "Request a password recovery link",
    "Auth",
    body=EmailIn,
    auth=False,
    description="Always answers 200 so it does not reveal which emails exist.",
)
def forgot_password():
    data = parse_body(EmailIn)
    user = db.session.scalar(db.select(User).filter_by(email=data.email.lower()))
    if user and user.is_active and not user.is_demo:
        raw = AuthToken.issue(user, TokenKind.RESET_PASSWORD, timedelta(hours=1))
        db.session.commit()
        mail.send_password_reset(user, raw)
    return jsonify({"ok": True})


@bp.post("/reset-password")
@limiter.limit("10 per hour")
@doc("Set a new password with the received token", "Auth", body=ResetPasswordIn, auth=False)
def reset_password():
    data = parse_body(ResetPasswordIn)
    user = AuthToken.consume(data.token, TokenKind.RESET_PASSWORD)
    if user is None:
        raise ApiError("Invalid or expired link", 400, "invalid_token")
    user.set_password(data.password)
    user.failed_logins = 0
    user.locked_until = None
    user.email_verified = True  # recibió el email, queda probado
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/verify-email")
@doc("Confirm email", "Auth", body=TokenIn, auth=False)
def verify_email():
    data = parse_body(TokenIn)
    user = AuthToken.consume(data.token, TokenKind.VERIFY_EMAIL)
    if user is None:
        raise ApiError("Invalid or expired link", 400, "invalid_token")
    user.email_verified = True
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/resend-verification")
@jwt_required()
@limiter.limit("3 per hour")
@doc("Resend verification email", "Auth")
def resend_verification():
    user = current_user()
    if not user.email_verified:
        _send_verification(user)
    return jsonify({"ok": True})


@bp.post("/google")
@limiter.limit("20 per hour")
@doc("Sign in with Google (ID token)", "Auth", body=GoogleIn, auth=False)
def google_login():
    client_id = current_app.config["GOOGLE_CLIENT_ID"]
    if not client_id:
        raise ApiError("Google sign-in is not configured", 501, "not_configured")
    data = parse_body(GoogleIn)
    try:
        r = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": data.credential},
            timeout=5,
        )
        info = r.json() if r.status_code == 200 else None
    except (requests.RequestException, ValueError):
        info = None
    if not info or info.get("aud") != client_id or str(info.get("email_verified")).lower() != "true":
        raise ApiError("Invalid Google credential", 401, "invalid_credentials")

    email, sub = info["email"].lower(), info["sub"]
    user = db.session.scalar(db.select(User).filter_by(google_id=sub)) or db.session.scalar(
        db.select(User).filter_by(email=email)
    )
    if user is None:
        user = User(name=info.get("name") or email.split("@")[0], email=email)
        db.session.add(user)
        db.session.flush()
    if not user.is_active:
        raise ApiError("Account deactivated", 403, "inactive")
    user.google_id = sub
    user.email_verified = True
    db.session.commit()
    return _session_response(user)


@bp.post("/demo")
@limiter.limit("30 per hour")
@doc("Sign in with the demo account (sample data)", "Auth", auth=False)
def demo_login():
    if not current_app.config["DEMO_ENABLED"]:
        raise ApiError("Demo mode is disabled", 404, "not_found")
    from ..services.seed import ensure_demo_user

    return _session_response(ensure_demo_user())


__all__ = ["bp", "Role"]
