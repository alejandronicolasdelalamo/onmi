"""Generación ligera de OpenAPI 3 a partir de un decorador `@doc` + modelos pydantic."""

from __future__ import annotations

import re

from flask import Flask, jsonify

SWAGGER_HTML = """<!doctype html><html><head><meta charset="utf-8"><title>ONMi API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
</head><body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#ui'})</script></body></html>"""


def doc(summary: str, tag: str, body=None, auth: bool = True, description: str = ""):
    def deco(fn):
        fn._openapi = {
            "summary": summary,
            "tag": tag,
            "body": body,
            "auth": auth,
            "description": description,
        }
        return fn

    return deco


def build_spec(app: Flask) -> dict:
    paths: dict = {}
    schemas: dict = {}
    for rule in app.url_map.iter_rules():
        view = app.view_functions.get(rule.endpoint)
        meta = getattr(view, "_openapi", None)
        if not meta:
            continue
        path = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", rule.rule)
        params = [{"name": n, "in": "path", "required": True, "schema": {"type": "integer"}} for n in rule.arguments]
        for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            op = {
                "summary": meta["summary"],
                "description": meta["description"],
                "tags": [meta["tag"]],
                "parameters": params,
                "responses": {
                    "200": {"description": "OK"},
                    "default": {"$ref": "#/components/responses/Error"},
                },
            }
            if meta["auth"]:
                op["security"] = [{"cookieAuth": []}]
            if meta["body"] is not None and method in {"POST", "PUT", "PATCH"}:
                model = meta["body"]
                schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
                for name, sub in schema.pop("$defs", {}).items():
                    schemas[name] = sub
                schemas[model.__name__] = schema
                op["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{model.__name__}"}}},
                }
            paths.setdefault(path, {})[method.lower()] = op
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "ONMi API",
            "version": "1.0.0",
            "description": "ONMi API: notes, habits, projects, goals, mood and pomodoro.",
        },
        "paths": dict(sorted(paths.items())),
        "components": {
            "schemas": schemas,
            "securitySchemes": {"cookieAuth": {"type": "apiKey", "in": "cookie", "name": "access_token_cookie"}},
            "responses": {
                "Error": {
                    "description": "Error",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "error": {
                                        "type": "object",
                                        "properties": {
                                            "code": {"type": "string"},
                                            "message": {"type": "string"},
                                        },
                                    }
                                },
                            }
                        }
                    },
                }
            },
        },
    }


def init_openapi(app: Flask) -> None:
    @app.get("/api/openapi.json")
    def openapi_json():
        return jsonify(build_spec(app))

    @app.get("/docs")
    @app.get("/api/docs")
    def swagger_ui():
        return SWAGGER_HTML
