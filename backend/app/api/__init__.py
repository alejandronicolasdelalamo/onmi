from flask import Flask


def register_blueprints(app: Flask) -> None:
    from . import admin, auth, dashboard, goals, habits, notes, projects, wellbeing

    for module in (auth, notes, projects, goals, habits, wellbeing, dashboard, admin):
        app.register_blueprint(module.bp)
