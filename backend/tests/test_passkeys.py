"""Passkeys con un autenticador de software (ES256): prueba el flujo WebAuthn completo sin navegador."""

import hashlib
import json
import os
import struct

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn import base64url_to_bytes
from webauthn.helpers import bytes_to_base64url as b64

from app.extensions import db
from app.models import Passkey

from .conftest import register

ORIGIN = "http://localhost:5173"
RP_ID = "localhost"


class SoftKey:
    """Autenticador virtual: crea una credencial y firma retos."""

    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(32)
        self.count = 0

    def _cose(self) -> bytes:
        nums = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})

    def create(self, options: dict, origin: str = ORIGIN, rp_id: str = RP_ID) -> dict:
        client = json.dumps(
            {"type": "webauthn.create", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}
        ).encode()
        auth_data = (
            hashlib.sha256(rp_id.encode()).digest()
            + bytes([0x45])
            + struct.pack(">I", 0)
            + bytes(16)
            + struct.pack(">H", len(self.cred_id))
            + self.cred_id
            + self._cose()
        )
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {"clientDataJSON": b64(client), "attestationObject": b64(att), "transports": ["internal"]},
            "clientExtensionResults": {},
        }

    def sign(self, options: dict, user_id: int, origin: str = ORIGIN, rp_id: str = RP_ID, count: int | None = None):
        self.count = self.count + 1 if count is None else count
        client = json.dumps(
            {"type": "webauthn.get", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}
        ).encode()
        auth_data = hashlib.sha256(rp_id.encode()).digest() + bytes([0x05]) + struct.pack(">I", self.count)
        signature = self.key.sign(auth_data + hashlib.sha256(client).digest(), ec.ECDSA(hashes.SHA256()))
        return {
            "id": b64(self.cred_id),
            "rawId": b64(self.cred_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64(client),
                "authenticatorData": b64(auth_data),
                "signature": b64(signature),
                "userHandle": b64(str(user_id).encode()),
            },
            "clientExtensionResults": {},
        }


def add_passkey(client, key: SoftKey, name="Mi iPhone"):
    r = client.post("/api/auth/passkeys/register/options")
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    out = client.post(
        "/api/auth/passkeys/register/verify",
        json={"credential": key.create(body["options"]), "challenge_token": body["challenge_token"], "name": name},
    )
    return out


def test_register_then_sign_in_without_a_password(app, client, user):
    key = SoftKey()
    out = add_passkey(client, key)
    assert out.status_code == 201 and out.get_json()["name"] == "Mi iPhone"
    assert [p["name"] for p in client.get("/api/auth/passkeys").get_json()["items"]] == ["Mi iPhone"]

    device = app.test_client()  # otro dispositivo, sin sesión
    opts = device.post("/api/auth/passkeys/login/options").get_json()
    assert opts["options"]["rpId"] == RP_ID
    r = device.post(
        "/api/auth/passkeys/login/verify",
        json={"credential": key.sign(opts["options"], user["id"]), "challenge_token": opts["challenge_token"]},
    )
    assert r.status_code == 200 and r.get_json()["user"]["email"] == "ana@example.com"
    assert device.get("/api/auth/me").status_code == 200
    assert db.session.scalar(db.select(Passkey)).last_used_at is not None


def test_sign_in_rejects_wrong_origin_replay_tamper_and_unknown_keys(app, client, user):
    key = SoftKey()
    add_passkey(client, key)
    device = app.test_client()

    def attempt(credential_fn, token_from=None):
        opts = device.post("/api/auth/passkeys/login/options").get_json()
        cred = credential_fn(opts["options"])
        return device.post(
            "/api/auth/passkeys/login/verify",
            json={"credential": cred, "challenge_token": (token_from or opts)["challenge_token"]},
        )

    # Origen de otra web (phishing): no vale.
    assert attempt(lambda o: key.sign(o, user["id"], origin="https://evil.example")).status_code == 401
    # Otro dominio (RP ID distinto): no vale.
    assert attempt(lambda o: key.sign(o, user["id"], rp_id="evil.example")).status_code == 401
    # Firma de otra clave con el mismo identificador de credencial.
    imposter = SoftKey()
    imposter.cred_id = key.cred_id
    assert attempt(lambda o: imposter.sign(o, user["id"])).status_code == 401
    # Credencial desconocida.
    assert attempt(lambda o: SoftKey().sign(o, user["id"])).status_code == 401
    # Reto de otra ceremonia (un reto antiguo con una firma nueva).
    old = device.post("/api/auth/passkeys/login/options").get_json()
    assert attempt(lambda o: key.sign(o, user["id"]), token_from=old).status_code == 401
    # Contador que retrocede (credencial clonada): se rechaza.
    assert attempt(lambda o: key.sign(o, user["id"], count=5)).status_code == 200
    assert attempt(lambda o: key.sign(o, user["id"], count=3)).status_code == 401
    assert (
        device.get("/api/auth/me").status_code == 200
    )  # el intento bueno anterior dejó sesión; los malos no cambian nada


def test_challenge_token_cannot_be_reused_across_ceremonies_or_users(app, client, other_client, user):
    reg = client.post("/api/auth/passkeys/register/options").get_json()
    key = SoftKey()
    cred = key.create(reg["options"])
    # Otro usuario no puede cerrar la ceremonia de este.
    r = other_client.post(
        "/api/auth/passkeys/register/verify", json={"credential": cred, "challenge_token": reg["challenge_token"]}
    )
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "passkey_invalid"
    # Un reto de registro no sirve para iniciar sesión.
    r = app.test_client().post(
        "/api/auth/passkeys/login/verify", json={"credential": cred, "challenge_token": reg["challenge_token"]}
    )
    assert r.status_code == 400
    # Un token inventado.
    r = client.post("/api/auth/passkeys/register/verify", json={"credential": cred, "challenge_token": "x" * 40})
    assert r.status_code == 400 and r.get_json()["error"]["code"] == "passkey_expired"


def test_passkey_ownership_limits_and_demo(app, client, other_client, user):
    key = SoftKey()
    pid = add_passkey(client, key).get_json()["id"]
    assert other_client.delete(f"/api/auth/passkeys/{pid}").status_code == 404
    assert other_client.get("/api/auth/passkeys").get_json()["items"] == []
    # La misma credencial no puede registrarse dos veces.
    assert add_passkey(client, key).status_code == 409
    assert client.delete(f"/api/auth/passkeys/{pid}").status_code == 200
    assert client.get("/api/auth/passkeys").get_json()["items"] == []

    for _ in range(10):
        assert add_passkey(client, SoftKey()).status_code == 201
    assert client.post("/api/auth/passkeys/register/options").status_code == 409

    demo = app.test_client()
    demo.post("/api/auth/demo")
    assert demo.post("/api/auth/passkeys/register/options").status_code == 403


def test_deactivated_account_cannot_sign_in_with_a_passkey(app, client, user):
    key = SoftKey()
    add_passkey(client, key)
    pk = db.session.scalar(db.select(Passkey))
    pk.user.is_active = False
    db.session.commit()
    device = app.test_client()
    opts = device.post("/api/auth/passkeys/login/options").get_json()
    r = device.post(
        "/api/auth/passkeys/login/verify",
        json={"credential": key.sign(opts["options"], user["id"]), "challenge_token": opts["challenge_token"]},
    )
    assert r.status_code == 403


def test_registration_options_exclude_existing_credentials(client, user):
    key = SoftKey()
    add_passkey(client, key)
    opts = client.post("/api/auth/passkeys/register/options").get_json()["options"]
    assert [c["id"] for c in opts["excludeCredentials"]] == [b64(key.cred_id)]
    assert base64url_to_bytes(opts["challenge"])  # reto aleatorio, decodificable
    assert opts["rp"]["id"] == RP_ID and opts["user"]["name"] == "ana@example.com"


def test_unused_register_import():
    assert register
