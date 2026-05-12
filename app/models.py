from datetime import datetime, timezone
from typing import Literal
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
