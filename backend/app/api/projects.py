from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Priority, Project, ProjectStatus
from ..openapi import doc
from ..schemas import ProjectIn, ProjectUpdate
from ..utils import ApiError, apply_updates, current_user, get_owned, parse_body

bp = Blueprint("projects", __name__, url_prefix="/api/projects")


def _column(user_id: int, status: ProjectStatus) -> list[Project]:
    return list(
        db.session.scalars(
            db.select(Project).filter_by(user_id=user_id, status=status).order_by(Project.position, Project.id)
        )
    )


def _reindex(items: list[Project]) -> None:
    for i, p in enumerate(items):
        p.position = i


@bp.get("")
@jwt_required()
@doc("List projects (ordered by column and position)", "Projects")
def list_projects():
    items = db.session.scalars(
        db.select(Project).filter_by(user_id=current_user().id).order_by(Project.position, Project.id)
    ).all()
    return jsonify({"items": [p.to_dict() for p in items]})


@bp.post("")
@jwt_required()
@doc("Create project", "Projects", body=ProjectIn)
def create_project():
    user = current_user()
    data = parse_body(ProjectIn)
    status = ProjectStatus(data.status)
    project = Project(
        user_id=user.id,
        name=data.name,
        description=data.description,
        category=data.category,
        status=status,
        priority=Priority(data.priority),
        due_date=data.due_date,
        position=len(_column(user.id, status)),
    )
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@bp.get("/<int:project_id>")
@jwt_required()
@doc("Get project", "Projects")
def get_project(project_id):
    return jsonify(get_owned(Project, project_id, current_user()).to_dict())


@bp.patch("/<int:project_id>")
@jwt_required()
@doc(
    "Update a project / move it on the Kanban board",
    "Projects",
    body=ProjectUpdate,
    description="`status` and `position` relocate the card and reindex the affected columns.",
)
def update_project(project_id):
    user = current_user()
    project = get_owned(Project, project_id, user)
    data = parse_body(ProjectUpdate)
    fields = data.model_fields_set
    if "name" in fields and data.name is None:
        raise ApiError("Name cannot be null", 422, "validation_error")
    apply_updates(project, data, ("name", "description", "category", "due_date"))
    if data.priority:
        project.priority = Priority(data.priority)

    if data.status is not None or data.position is not None:
        old_status = project.status
        new_status = ProjectStatus(data.status) if data.status else old_status
        target = [p for p in _column(user.id, new_status) if p.id != project.id]
        position = data.position if data.position is not None else len(target)
        target.insert(min(position, len(target)), project)
        if new_status != old_status:
            _reindex([p for p in _column(user.id, old_status) if p.id != project.id])
        project.status = new_status
        _reindex(target)
    db.session.commit()
    return jsonify(project.to_dict())


@bp.delete("/<int:project_id>")
@jwt_required()
@doc("Delete project (and its goals; notes are unlinked)", "Projects")
def delete_project(project_id):
    user = current_user()
    project = get_owned(Project, project_id, user)
    status = project.status
    db.session.delete(project)
    db.session.flush()
    _reindex(_column(user.id, status))
    db.session.commit()
    return jsonify({"ok": True})
