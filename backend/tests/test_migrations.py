"""Las migraciones de Alembic deben llegar exactamente al esquema que definen los modelos."""

from pathlib import Path

from flask_migrate import check, downgrade, upgrade

from app import create_app

MIGRATIONS = str(Path(__file__).resolve().parent.parent / "migrations")


def test_migrations_match_models_and_are_reversible(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'mig.db').as_posix()}")
    app = create_app("development")
    with app.app_context():
        upgrade(directory=MIGRATIONS)
        check(directory=MIGRATIONS)  # lanza una excepción si los modelos tienen cambios sin migración
        downgrade(directory=MIGRATIONS, revision="base")
        upgrade(directory=MIGRATIONS)
