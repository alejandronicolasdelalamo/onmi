from flask import Flask


def register_blueprints(app: Flask) -> None:
    from . import admin, auth, dashboard, goals, habits, insights, notes, projects, wellbeing

    for module in (auth, notes, projects, goals, habits, wellbeing, dashboard, insights, admin):
        app.register_blueprint(module.bp)
