"""Panel interno Flask-Admin en /db-admin (/admin es la ruta del panel React), solo para admins (cookie JWT)."""

from flask import redirect
from flask_admin import Admin, AdminIndexView
from flask_admin.contrib.sqla import ModelView
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .extensions import db
from .models import Goal, Habit, MoodEntry, Note, PomodoroSession, Project, Role, User


def _is_admin() -> bool:
    try:
        verify_jwt_in_request()
        user = db.session.get(User, int(get_jwt_identity()))
        return bool(user and user.is_active and user.role == Role.ADMIN)
    except Exception:
        return False


class _Secure:
    def is_accessible(self):
        return _is_admin()

    def inaccessible_callback(self, name, **kwargs):
        return redirect("/login")


class SecureIndex(_Secure, AdminIndexView):
    pass


class UserView(_Secure, ModelView):
    column_exclude_list = ("password_hash",)
    form_excluded_columns = ("password_hash", "tokens", "notes", "projects", "goals", "habits", "moods", "pomodoros")
    can_create = False


class SecureView(_Secure, ModelView):
    can_create = False


def setup_admin(app):
    admin = Admin(app, name="ONMi Admin", url="/db-admin", index_view=SecureIndex(url="/db-admin"))
    admin.add_view(UserView(User, db))
    for model in (Note, Project, Goal, Habit, MoodEntry, PomodoroSession):
        admin.add_view(SecureView(model, db))
