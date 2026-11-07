import os
import secrets
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _db_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        return f"sqlite:///{BASE_DIR / 'instance' / 'onmi.db'}"
    return url.replace("postgres://", "postgresql://", 1)


class Config:
    ENV_NAME = "development"
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    SQLALCHEMY_DATABASE_URI = _db_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_hex(32)
    JWT_TOKEN_LOCATION = ["cookies"]
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


def get_config(name: str | None = None):
    name = name or os.getenv("FLASK_ENV", "development")
    return {"production": ProductionConfig, "testing": TestConfig}.get(name, Config)
