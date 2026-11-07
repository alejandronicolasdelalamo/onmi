from flask import Flask


def register_blueprints(app: Flask) -> None:
    from . import admin, auth, coach, dashboard, goals, habits, insights, notes, projects, push, wellbeing

    for module in (auth, notes, projects, goals, habits, wellbeing, dashboard, insights, coach, push, admin):
        app.register_blueprint(module.bp)
