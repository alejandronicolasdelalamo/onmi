import click
from flask import Flask

from .extensions import db
from .models import Role, User


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    @click.option("--reset", is_flag=True, help="Borra todas las tablas antes de crearlas (solo desarrollo/tests).")
    def init_db(reset):
        """Crea las tablas (útil en local; en producción usa `flask db upgrade`)."""
        if reset:
            db.drop_all()
        db.create_all()
        click.echo("Tablas creadas.")

    @app.cli.command("seed-demo")
    def seed_demo():
        """Crea/rellena el usuario demo (demo@onmi.app)."""
        from .services.seed import ensure_demo_user

        db.create_all()
        user = ensure_demo_user()
        click.echo(f"Usuario demo listo: {user.email}")

    @app.cli.command("send-reminders")
    def send_reminders():
        """Envía los recordatorios de hábitos que toquen ahora. Programar cada 5 minutos (cron)."""
        from .services.reminders import send_due_reminders

        stats = send_due_reminders()
        click.echo(
            f"Revisados: {stats['checked']} · enviados: {stats['sent']} · "
            f"suscripciones caducadas eliminadas: {stats['subscriptions_removed']}"
        )

    @app.cli.command("generate-vapid")
    def generate_vapid():
        """Genera un par de claves VAPID para las notificaciones push."""
        from .services.push import generate_vapid_keys

        public, private = generate_vapid_keys()
        click.echo(f"VAPID_PUBLIC_KEY={public}\nVAPID_PRIVATE_KEY={private}")

    @app.cli.command("create-admin")
    @click.argument("email")
    @click.option("--name", default="Admin")
    @click.password_option()
    def create_admin(email, name, password):
        """Crea (o promociona) un administrador."""
        user = db.session.scalar(db.select(User).filter_by(email=email.lower()))
        if user is None:
            user = User(name=name, email=email.lower(), email_verified=True)
            db.session.add(user)
        user.role = Role.ADMIN
        user.set_password(password)
        db.session.commit()
        click.echo(f"Administrador listo: {user.email}")
