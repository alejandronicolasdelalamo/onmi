from datetime import date, datetime, timezone
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from pydantic import BaseModel, ValidationError

from .extensions import db
from .models import Role, User


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request", details=None):
        super().__init__(message)
        self.message, self.status, self.code, self.details = message, status, code, details

    def to_response(self):
        body = {"error": {"code": self.code, "message": self.message}}
        if self.details:
            body["error"]["details"] = self.details
        return jsonify(body), self.status


def utcnow() -> datetime:
    """UTC naive (consistente entre SQLite y Postgres)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def today() -> date:
    return utcnow().date()


def client_today() -> date:
    """Día del usuario (su zona horaria) si el cliente lo manda en `?today=`; acotado a ±1 día del servidor."""
    server = today()
    raw = request.args.get("today")
    try:
        day = date.fromisoformat(raw) if raw else server
    except ValueError:
        return server
    return day if abs((day - server).days) <= 1 else server


def parse_body(schema: type[BaseModel], partial: bool = False) -> BaseModel:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("The body must be a JSON object", 400, "invalid_body")
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        raise ApiError("Invalid data", 422, "validation_error", details) from exc


def current_user() -> User:
    user = db.session.get(User, int(get_jwt_identity()))
    if user is None or not user.is_active:
        raise ApiError("User unavailable", 401, "unauthorized")
    return user


def get_owned(model, obj_id: int, user: User):
    """Obtiene un objeto del usuario o 404 (nunca revela objetos ajenos)."""
    obj = db.session.get(model, obj_id)
    if obj is None or obj.user_id != user.id:
        raise ApiError(f"{model.__name__} not found", 404, "not_found")
    return obj


def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if current_user().role != Role.ADMIN:
            raise ApiError("Admins only", 403, "forbidden")
        return fn(*args, **kwargs)

    return wrapper


def paginate(query, default_size: int = 50, max_size: int = 200):
    page = max(request.args.get("page", 1, type=int), 1)
    size = min(max(request.args.get("page_size", default_size, type=int), 1), max_size)
    total = db.session.scalar(db.select(db.func.count()).select_from(query.subquery()))
    items = db.session.scalars(query.limit(size).offset((page - 1) * size)).all()
    return items, {"page": page, "page_size": size, "total": total}


def check_ref(model, ref_id: int | None, user: User):
    """Valida que una referencia (project_id, goal_id...) pertenezca al usuario."""
    if ref_id is not None:
        get_owned(model, ref_id, user)
    return ref_id


def apply_updates(obj, data: BaseModel, fields: tuple[str, ...]) -> None:
    """Aplica solo los campos enviados (PATCH); permite poner a null los opcionales."""
    for field in fields:
        if field in data.model_fields_set:
            setattr(obj, field, getattr(data, field))
