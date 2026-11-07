"""ONMi API - factoría de la aplicación Flask."""

from __future__ import annotations

import logging
import os

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from .config import get_config
from .extensions import cors, db, jwt, limiter, migrate
from .openapi import init_openapi
from .utils import ApiError


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    cfg = get_config(config_name)
    app.config.from_object(cfg() if callable(cfg) else cfg)
    app.url_map.strict_slashes = False
    os.makedirs(app.instance_path, exist_ok=True)

    logging.basicConfig(level=logging.INFO if not app.testing else logging.WARNING)

    db.init_app(app)
    migrate.init_app(app, db, compare_type=True)
    jwt.init_app(app)
    limiter.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    from .api import register_blueprints

    register_blueprints(app)
    init_openapi(app)
    _register_handlers(app)
    _register_security_headers(app)

    from .cli import register_cli

    register_cli(app)

    if not app.testing:
        from .admin_panel import setup_admin

        setup_admin(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app


def _register_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def api_error(err: ApiError):
        return err.to_response()

    @app.errorhandler(HTTPException)
    def http_error(err: HTTPException):
        code = (err.name or "error").lower().replace(" ", "_")
        return jsonify({"error": {"code": code, "message": err.description}}), err.code

    @app.errorhandler(Exception)
    def unexpected(err: Exception):
        app.logger.exception("Unhandled error")
        db.session.rollback()
        return jsonify({"error": {"code": "internal_error", "message": "Internal error"}}), 500

    def _auth_error(code: str, message: str):
        return jsonify({"error": {"code": code, "message": message}}), 401

    @jwt.unauthorized_loader
    def unauthorized(reason):
        return _auth_error("unauthorized", "Authentication required")

    @jwt.invalid_token_loader
    def invalid(reason):
        return _auth_error("invalid_token", "Invalid token")

    @jwt.expired_token_loader
    def expired(header, payload):
        return _auth_error("token_expired", "Your session has expired")

    @limiter.request_filter
    def _skip_options():
        from flask import request

        return request.method == "OPTIONS"

    @app.errorhandler(429)
    def too_many(err):
        return jsonify({"error": {"code": "rate_limited", "message": "Too many attempts, please wait a moment"}}), 429


def _register_security_headers(app: Flask) -> None:
    @app.after_request
    def headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return resp
