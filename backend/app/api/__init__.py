from flask import Flask


def register_blueprints(app: Flask) -> None:
    from . import (
        admin,
        auth,
        backup,
        buddies,
        calendar,
        coach,
        dashboard,
        goals,
        habits,
        insights,
        internal,
        notes,
        passkeys,
        projects,
        push,
        search,
        wellbeing,
    )

    for module in (
        auth,
        notes,
        projects,
        goals,
        habits,
        wellbeing,
        dashboard,
        insights,
        coach,
        push,
        buddies,
        admin,
        internal,
        calendar,
        search,
        backup,
        passkeys,
    ):
        app.register_blueprint(module.bp)
