from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.json"
DATA_DIR = BASE_DIR / "data"
CHAT_UPLOAD_DIR = DATA_DIR / "chat_uploads"
STATIC_DIR = BASE_DIR / "static"
PUBLIC_DIR = BASE_DIR / "public"


class AuthKeyConfig(BaseModel):
    id: str
    key: str
    role: str = "user"


class AuthConfig(BaseModel):
    keys: list[AuthKeyConfig] = Field(default_factory=list)


class ChatAccountConfig(BaseModel):
    id: str
    name: str
    enabled: bool = True
    secure_1psid: str = ""
    secure_1psidts: str = ""
    proxy: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class UploadConfig(BaseModel):
    max_file_mb: int = 20
    max_files_per_message: int = 5


class ChatConfig(BaseModel):
    enabled: bool = True
    default_model: str = "auto"
    accounts: list[ChatAccountConfig] = Field(default_factory=list)
    upload: UploadConfig = Field(default_factory=UploadConfig)


class AppConfig(BaseModel):
    auth: AuthConfig = Field(default_factory=AuthConfig)
    chat: ChatConfig = Field(default_factory=ChatConfig)


def load_config() -> AppConfig:
    if not CONFIG_PATH.exists():
        return AppConfig()
    return AppConfig.model_validate_json(CONFIG_PATH.read_text(encoding="utf-8"))


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"
