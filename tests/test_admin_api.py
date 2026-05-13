import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import require_admin
from app.main import app
from app.models import Identity
from app.services.config_store import ConfigStore


client = TestClient(app)


def temp_config(path: Path) -> Path:
    config_path = path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "auth": {
                    "keys": [
                        {"id": "admin", "key": "admin-secret", "role": "admin"},
                    ]
                },
                "chat": {
                    "enabled": True,
                    "default_model": "auto",
                    "accounts": [
                        {
                            "id": "account-1",
                            "name": "Default",
                            "enabled": True,
                            "secure_1psid": "psid-secret",
                            "secure_1psidts": "ts-secret",
                            "proxy": "",
                            "metadata": {},
                        }
                    ],
                    "upload": {"max_file_mb": 20, "max_files_per_message": 5},
                },
            }
        ),
        encoding="utf-8",
    )
    return config_path


def install_admin_test_context(config_path: Path):
    original_store = app.state.config_store
    app.state.config_store = ConfigStore(config_path)
    app.dependency_overrides[require_admin] = lambda: Identity(id="test-admin", role="admin")
    return original_store


def restore_admin_test_context(original_store) -> None:
    app.state.config_store = original_store
    app.dependency_overrides.pop(require_admin, None)


def test_admin_auth_keys_are_masked_and_mutable(tmp_path: Path):
    original_store = install_admin_test_context(temp_config(tmp_path))
    try:
      created = client.post(
          "/api/admin/auth-keys",
          json={"id": "user-1", "key": "user-secret", "role": "user"},
      )
      assert created.status_code == 201
      body = created.json()
      assert body["id"] == "user-1"
      assert body["key_masked"] != "user-secret"

      updated = client.patch(
          "/api/admin/auth-keys/user-1",
          json={"key": "user-secret-2", "role": "admin"},
      )
      assert updated.status_code == 200
      assert updated.json()["role"] == "admin"

      deleted = client.delete("/api/admin/auth-keys/user-1")
      assert deleted.status_code == 204
    finally:
        restore_admin_test_context(original_store)


def test_admin_cannot_delete_last_admin_key(tmp_path: Path):
    original_store = install_admin_test_context(temp_config(tmp_path))
    try:
        response = client.delete("/api/admin/auth-keys/admin")
        assert response.status_code == 400
        assert "last admin" in response.json()["detail"].lower()
    finally:
        restore_admin_test_context(original_store)


def test_admin_accounts_are_masked_and_cookie_fields_can_stay_unchanged(tmp_path: Path):
    config_path = temp_config(tmp_path)
    original_store = install_admin_test_context(config_path)
    try:
        accounts = client.get("/api/admin/accounts")
        assert accounts.status_code == 200
        account = accounts.json()[0]
        assert account["secure_1psid_masked"] != "psid-secret"
        assert account["secure_1psidts_masked"] != "ts-secret"

        updated = client.patch(
            "/api/admin/accounts/account-1",
            json={"name": "Renamed", "enabled": False, "secure_1psid": "", "secure_1psidts": ""},
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Renamed"

        persisted = json.loads(config_path.read_text(encoding="utf-8"))
        saved = persisted["chat"]["accounts"][0]
        assert saved["secure_1psid"] == "psid-secret"
        assert saved["secure_1psidts"] == "ts-secret"
        assert saved["enabled"] is False
    finally:
        restore_admin_test_context(original_store)
