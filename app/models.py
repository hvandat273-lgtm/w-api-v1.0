from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class Identity(BaseModel):
    id: str
    role: str = "user"


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(..., min_length=1)


class AttachmentRef(BaseModel):
    id: str
    name: str | None = None
    mime_type: str | None = None


class ChatCompletionRequest(BaseModel):
    conversation_id: str | None = None
    model: str | None = None
    messages: list[ChatMessage] = Field(..., min_length=1)
    attachments: list[AttachmentRef] = Field(default_factory=list)
    stream: bool = False


class ChatCompletionResponse(BaseModel):
    conversation_id: str
    model: str
    message: ChatMessage
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FileMetadata(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    mime_type: str
    size: int
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class StoredFileMetadata(FileMetadata):
    stored_name: str


class MeResponse(BaseModel):
    id: str
    role: str


class AdminAuthKeyPublic(BaseModel):
    id: str
    role: str
    key_masked: str


class AdminAuthKeyCreate(BaseModel):
    id: str = Field(..., min_length=1)
    key: str = Field(..., min_length=1)
    role: Literal["admin", "user"] = "user"


class AdminAuthKeyUpdate(BaseModel):
    key: str | None = None
    role: Literal["admin", "user"] | None = None


class AdminAccountPublic(BaseModel):
    id: str
    name: str
    enabled: bool
    secure_1psid_masked: str
    secure_1psidts_masked: str
    proxy: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AdminAccountCreate(BaseModel):
    id: str | None = None
    name: str = Field(..., min_length=1)
    enabled: bool = True
    secure_1psid: str = Field(..., min_length=1)
    secure_1psidts: str = Field(..., min_length=1)
    proxy: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AdminAccountUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    secure_1psid: str | None = None
    secure_1psidts: str | None = None
    proxy: str | None = None
    metadata: dict[str, Any] | None = None


class AdminCookieCheckResponse(BaseModel):
    ok: bool
    status: Literal["alive", "dead"]
    checked_at: str
    message: str
