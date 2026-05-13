import json
import os
import threading
from pathlib import Path
from uuid import uuid4

from app.config import AppConfig, AuthKeyConfig, ChatAccountConfig, CONFIG_PATH


class ConfigStore:
    def __init__(self, path: Path = CONFIG_PATH) -> None:
        self.path = path
        self._lock = threading.Lock()

    def read(self) -> AppConfig:
        if not self.path.exists():
            return AppConfig()
        return AppConfig.model_validate_json(self.path.read_text(encoding="utf-8"))

    def update(self, mutator) -> AppConfig:
        with self._lock:
            config = self.read()
            mutator(config)
            self._write(config)
            return config

    def _write(self, config: AppConfig) -> None:
        payload = config.model_dump(mode="json")
        text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        tmp_path.write_text(text, encoding="utf-8")
        os.replace(tmp_path, self.path)


def find_auth_key(config: AppConfig, key_id: str) -> AuthKeyConfig | None:
    return next((item for item in config.auth.keys if item.id == key_id), None)


def find_account(config: AppConfig, account_id: str) -> ChatAccountConfig | None:
    return next((item for item in config.chat.accounts if item.id == account_id), None)


def has_other_admin_key(config: AppConfig, key_id: str) -> bool:
    return any(item.id != key_id and item.role == "admin" for item in config.auth.keys)
