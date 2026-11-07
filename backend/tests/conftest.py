import pytest

from app import create_app
from app.extensions import db
from app.models import Role, User
from app.services import mail

PASSWORD = "Sup3rsecret!"


@pytest.fixture()
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def register(client, email="ana@example.com", name="Ana"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": PASSWORD})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["user"]


@pytest.fixture()
def user(client):
    return register(client)


@pytest.fixture()
def other_client(app):
    c = app.test_client()
    register(c, "bob@example.com", "Bob")
    return c


@pytest.fixture()
def admin_client(app):
    u = User(name="Root", email="root@example.com", role=Role.ADMIN, email_verified=True)
    u.set_password(PASSWORD)
    db.session.add(u)
    db.session.commit()
    c = app.test_client()
    r = c.post("/api/auth/login", json={"email": "root@example.com", "password": PASSWORD})
    assert r.status_code == 200
    return c


@pytest.fixture()
def outbox(app):
    box = mail.outbox()
    box.clear()
    return box
