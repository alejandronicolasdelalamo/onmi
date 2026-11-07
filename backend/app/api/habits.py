from datetime import timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Goal, Habit, HabitLog
from ..openapi import doc
from ..schemas import HabitIn, HabitUpdate, ToggleIn
from ..services.stats import completion_rate, daily_counts
from ..utils import ApiError, apply_updates, check_ref, current_user, get_owned, parse_body, today

bp = Blueprint("habits", __name__, url_prefix="/api/habits")


@bp.get("")
@jwt_required()
@doc("List habits with streaks", "Habits", description="`archived=1` includes archived habits.")
def list_habits():
    query = db.select(Habit).filter_by(user_id=current_user().id)
    if request.args.get("archived") not in {"1", "true"}:
        query = query.filter_by(archived=False)
    habits = db.session.scalars(query.order_by(Habit.id)).all()
    t = today()
    return jsonify({"items": [h.to_dict(t) for h in habits]})


@bp.post("")
@jwt_required()
@doc("Create habit", "Habits", body=HabitIn)
def create_habit():
    user = current_user()
    data = parse_body(HabitIn)
    habit = Habit(
        user_id=user.id,
        name=data.name,
        description=data.description,
        category=data.category,
        color=data.color,
        goal_id=check_ref(Goal, data.goal_id, user),
    )
    db.session.add(habit)
    db.session.commit()
    return jsonify(habit.to_dict(today())), 201


@bp.get("/heatmap")
@jwt_required()
@doc(
    "Aggregated daily activity (heatmap) and completion rate per habit",
    "Habits",
    description="`days` (7-365, default 120).",
)
def heatmap():
    user = current_user()
    days = min(max(request.args.get("days", 120, type=int), 7), 365)
    end = today()
    start = end - timedelta(days=days - 1)
    habits = db.session.scalars(db.select(Habit).filter_by(user_id=user.id, archived=False)).all()
    all_days = [d for h in habits for d in h.completed_days() if start <= d <= end]
    per_habit = [
        {
            "id": h.id,
            "name": h.name,
            "color": h.color,
            "rate_30d": completion_rate(h.completed_days(), end - timedelta(days=29), end),
        }
        for h in habits
    ]
    return jsonify({"series": daily_counts(all_days, start, end), "habits": per_habit, "total_habits": len(habits)})


@bp.get("/<int:habit_id>")
@jwt_required()
@doc("Get habit", "Habits")
def get_habit(habit_id):
    return jsonify(get_owned(Habit, habit_id, current_user()).to_dict(today()))


@bp.patch("/<int:habit_id>")
@jwt_required()
@doc("Update habit (partial)", "Habits", body=HabitUpdate)
def update_habit(habit_id):
    user = current_user()
    habit = get_owned(Habit, habit_id, user)
    data = parse_body(HabitUpdate)
    fields = data.model_fields_set
    for required in ("name", "color", "archived"):
        if required in fields and getattr(data, required) is None:
            raise ApiError(f"{required} cannot be null", 422, "validation_error")
    if "goal_id" in fields:
        check_ref(Goal, data.goal_id, user)
    apply_updates(habit, data, ("name", "description", "category", "color", "goal_id", "archived"))
    db.session.commit()
    return jsonify(habit.to_dict(today()))


@bp.delete("/<int:habit_id>")
@jwt_required()
@doc("Delete habit and its history", "Habits")
def delete_habit(habit_id):
    habit = get_owned(Habit, habit_id, current_user())
    db.session.delete(habit)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/<int:habit_id>/toggle")
@jwt_required()
@doc("Mark/unmark a day as done (defaults to today)", "Habits", body=ToggleIn)
def toggle_habit(habit_id):
    habit = get_owned(Habit, habit_id, current_user())
    data = parse_body(ToggleIn) if request.data else ToggleIn()
    day = data.date or today()
    t = today()
    # +1 día de margen: el usuario puede ir por delante de UTC (su «hoy» ya es el «mañana» del servidor).
    if day > t + timedelta(days=1):
        raise ApiError("Cannot mark a future day", 422, "validation_error")
    if day < t - timedelta(days=365):
        raise ApiError("Date is too old", 422, "validation_error")
    log = db.session.scalar(db.select(HabitLog).filter_by(habit_id=habit.id, day=day))
    if log:
        db.session.delete(log)
    else:
        db.session.add(HabitLog(habit_id=habit.id, day=day))
    db.session.commit()
    db.session.refresh(habit)
    return jsonify(habit.to_dict(t))
