from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Goal, GoalMilestone, Project
from ..openapi import doc
from ..schemas import GoalIn, GoalUpdate, MilestoneIn, MilestoneUpdate
from ..utils import ApiError, apply_updates, check_ref, current_user, get_owned, parse_body, utcnow

bp = Blueprint("goals", __name__, url_prefix="/api/goals")


@bp.get("")
@jwt_required()
@doc("List goals", "Goals", description="Filters: `project_id`, `done`.")
def list_goals():
    query = db.select(Goal).filter_by(user_id=current_user().id)
    if (pid := request.args.get("project_id", type=int)) is not None:
        query = query.filter_by(project_id=pid)
    if (done := request.args.get("done")) in {"0", "1", "true", "false"}:
        query = query.filter_by(done=done in {"1", "true"})
    items = db.session.scalars(query.order_by(Goal.done, Goal.due_date.is_(None), Goal.due_date, Goal.id))
    return jsonify({"items": [g.to_dict() for g in items]})


@bp.post("")
@jwt_required()
@doc("Create goal", "Goals", body=GoalIn)
def create_goal():
    user = current_user()
    data = parse_body(GoalIn)
    goal = Goal(
        user_id=user.id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        shared=data.shared,
        project_id=check_ref(Project, data.project_id, user),
    )
    db.session.add(goal)
    db.session.commit()
    return jsonify(goal.to_dict()), 201


@bp.get("/<int:goal_id>")
@jwt_required()
@doc("Get goal", "Goals")
def get_goal(goal_id):
    return jsonify(get_owned(Goal, goal_id, current_user()).to_dict())


@bp.patch("/<int:goal_id>")
@jwt_required()
@doc("Update goal (partial)", "Goals", body=GoalUpdate)
def update_goal(goal_id):
    user = current_user()
    goal = get_owned(Goal, goal_id, user)
    data = parse_body(GoalUpdate)
    fields = data.model_fields_set
    if "title" in fields and data.title is None:
        raise ApiError("Title cannot be null", 422, "validation_error")
    if "shared" in fields and data.shared is None:
        raise ApiError("shared cannot be null", 422, "validation_error")
    if "project_id" in fields:
        check_ref(Project, data.project_id, user)
    apply_updates(goal, data, ("title", "description", "due_date", "project_id", "shared"))
    if data.done is not None and data.done != goal.done:
        goal.done = data.done
        goal.completed_at = utcnow() if data.done else None
    db.session.commit()
    return jsonify(goal.to_dict())


@bp.delete("/<int:goal_id>")
@jwt_required()
@doc("Delete goal (linked habits and notes are unlinked)", "Goals")
def delete_goal(goal_id):
    goal = get_owned(Goal, goal_id, current_user())
    db.session.delete(goal)
    db.session.commit()
    return jsonify({"ok": True})


# ---- hitos --------------------------------------------------------------------------------------------
MAX_MILESTONES = 30


def _milestone(milestone_id: int, user) -> GoalMilestone:
    ms = db.session.get(GoalMilestone, milestone_id)
    if ms is None or ms.goal.user_id != user.id:
        raise ApiError("Milestone not found", 404, "not_found")
    return ms


@bp.post("/<int:goal_id>/milestones")
@jwt_required()
@doc("Add a milestone to a goal", "Goals", body=MilestoneIn)
def add_milestone(goal_id):
    goal = get_owned(Goal, goal_id, current_user())
    data = parse_body(MilestoneIn)
    if len(goal.milestones) >= MAX_MILESTONES:
        raise ApiError("A goal can have up to 30 milestones", 409, "limit_reached")
    ms = GoalMilestone(goal_id=goal.id, title=data.title, position=len(goal.milestones))
    db.session.add(ms)
    db.session.commit()
    return jsonify(goal.to_dict()), 201


@bp.patch("/milestones/<int:milestone_id>")
@jwt_required()
@doc("Rename or tick a milestone", "Goals", body=MilestoneUpdate)
def update_milestone(milestone_id):
    ms = _milestone(milestone_id, current_user())
    data = parse_body(MilestoneUpdate)
    if "title" in data.model_fields_set and data.title is not None:
        ms.title = data.title
    if data.done is not None and data.done != ms.done:
        ms.done = data.done
        ms.completed_at = utcnow() if data.done else None
    db.session.commit()
    return jsonify(ms.goal.to_dict())


@bp.delete("/milestones/<int:milestone_id>")
@jwt_required()
@doc("Delete a milestone", "Goals")
def delete_milestone(milestone_id):
    ms = _milestone(milestone_id, current_user())
    goal = ms.goal
    goal.milestones.remove(ms)  # delete-orphan lo borra; así la colección ya no lo contiene
    for i, m in enumerate(goal.milestones):
        m.position = i
    db.session.commit()
    return jsonify(goal.to_dict())
