"""Envío de correo con backend intercambiable: consola (dev/tests) o SendGrid (producción)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from flask import current_app

log = logging.getLogger("onmi.mail")


@dataclass
class Message:
    to: str
    subject: str
    text: str
    html: str


def outbox() -> list[Message]:
    return current_app.extensions.setdefault("onmi_outbox", [])


def send(message: Message) -> None:
    key = current_app.config.get("SENDGRID_API_KEY")
    if not key:
        # Modo desarrollo: el correo se imprime y se guarda en memoria (útil en tests).
        outbox().append(message)
        print(f"\n=== MAIL -> {message.to} | {message.subject}\n{message.text}\n===\n", flush=True)
        return
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    mail = Mail(
        from_email=current_app.config["MAIL_FROM"],
        to_emails=message.to,
        subject=message.subject,
        html_content=message.html,
        plain_text_content=message.text,
    )
    try:
        SendGridAPIClient(key).send(mail)
    except Exception:  # no se filtran detalles al cliente
        log.exception("Fallo enviando correo a %s", message.to)


def _frontend(path: str) -> str:
    return f"{current_app.config['FRONTEND_URL'].rstrip('/')}{path}"


def send_verification(user, token: str) -> None:
    link = _frontend(f"/verify-email?token={token}")
    send(
        Message(
            user.email,
            "Verify your ONMi email",
            f"Hi {user.name},\n\nConfirm your email: {link}\n\nThe link expires in 24 hours.",
            f'<p>Hi {user.name},</p><p><a href="{link}">Confirm your email</a></p><p>The link expires in 24 hours.</p>',
        )
    )


def send_password_reset(user, token: str) -> None:
    link = _frontend(f"/reset-password?token={token}")
    send(
        Message(
            user.email,
            "Reset your ONMi password",
            f"Hi {user.name},\n\nReset your password: {link}\n\n"
            "The link expires in 1 hour. If this was not you, ignore this email.",
            f'<p>Hi {user.name},</p><p><a href="{link}">Reset your password</a></p>'
            "<p>The link expires in 1 hour. If this was not you, ignore this email.</p>",
        )
    )
