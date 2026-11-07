import os
import secrets
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def database_url() -> str:
    """URL de la base de datos según el entorno ACTUAL (se llama al crear la app, no al importar el módulo)."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return f"sqlite:///{BASE_DIR / 'instance' / 'onmi.db'}"
    return url.replace("postgres://", "postgresql://", 1)


class Config:
    ENV_NAME = "development"
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    SQLALCHEMY_DATABASE_URI = database_url()  # valor por defecto; create_app lo vuelve a leer del entorno
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_hex(32)
    # Navegador: cookies httpOnly + CSRF. Apps nativas: cabecera Authorization (los navegadores no la envían
    # solos, así que no hay CSRF). Solo se entregan tokens en el cuerpo si el cliente los pide con `X-Client: mobile`.
    JWT_TOKEN_LOCATION = ["cookies", "headers"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=14)
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_REFRESH_COOKIE_PATH = "/api/auth/refresh"

    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", FRONTEND_URL).split(",")]

    SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "no-reply@onmi.app")
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    DEMO_ENABLED = os.getenv("DEMO_ENABLED", "true").lower() == "true"
    # Web Push (recordatorios). Genera las claves con `flask generate-vapid`. Sin ellas, la opción se oculta.
    VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:no-reply@onmi.app")
    # Coach semanal con IA (opcional). Sin clave se usa siempre el redactor local.
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    COACH_MODEL = os.getenv("COACH_MODEL", "claude-opus-5-5")

    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "true").lower() == "true"
    MAX_FAILED_LOGINS = 5
    LOCKOUT_MINUTES = 15
    REQUIRE_EMAIL_VERIFICATION = False


class ProductionConfig(Config):
    ENV_NAME = "production"
    # `true` por defecto; ponlo a `false` solo si pruebas en HTTP plano fuera de localhost.
    JWT_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"

    def __init__(self):
        for key in ("SECRET_KEY", "JWT_SECRET_KEY", "DATABASE_URL"):
            if not os.getenv(key):
                raise RuntimeError(f"{key} es obligatorio en producción")


class TestConfig(Config):
    ENV_NAME = "testing"
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    JWT_COOKIE_CSRF_PROTECT = False
    RATELIMIT_ENABLED = False
    SENDGRID_API_KEY = ""
    GOOGLE_CLIENT_ID = "test-client-id"
    VAPID_PUBLIC_KEY = "test-public-key"
    VAPID_PRIVATE_KEY = "test-private-key"
    ANTHROPIC_API_KEY = "test-anthropic-key"


def get_config(name: str | None = None):
    name = name or os.getenv("FLASK_ENV", "development")
    return {"production": ProductionConfig, "testing": TestConfig}.get(name, Config)
