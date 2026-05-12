from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from app.auth import require_identity
from app.config import load_config
from app.models import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    FileMetadata,
    Identity,
)
from app.services.chat.account_service import ChatAccountService
from app.services.chat.file_service import ChatFileService
from app.services.chat.upstream_adapter import UpstreamChatAdapter


router = APIRouter(prefix="/api/chat", tags=["Webchat"])


def account_service(request: Request) -> ChatAccountService:
    return request.app.state.chat_account_service


def file_service(request: Request) -> ChatFileService:
    return request.app.state.chat_file_service


def upstream_adapter(request: Request) -> UpstreamChatAdapter:
    return request.app.state.upstream_chat_adapter


@router.post("/completions", response_model=ChatCompletionResponse)
async def complete_chat(
    payload: ChatCompletionRequest,
    identity: Identity = Depends(require_identity),
    accounts: ChatAccountService = Depends(account_service),
    files: ChatFileService = Depends(file_service),
    upstream: UpstreamChatAdapter = Depends(upstream_adapter),
) -> ChatCompletionResponse:
    if payload.stream:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Streaming is not supported by this MVP.",
        )

    config = load_config()
    if len(payload.attachments) > config.chat.upload.max_files_per_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many attachments for one message.",
        )

    attachment_ids = [attachment.id for attachment in payload.attachments]
    attachment_records = files.get_attachment_records(attachment_ids)

    try:
        account = accounts.select_account()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    model = payload.model or config.chat.default_model
    try:
        text = await upstream.complete(
            account=account,
            messages=payload.messages,
            model=model,
            attachments=attachment_records,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Upstream chat service failed.",
        ) from exc

    return ChatCompletionResponse(
        conversation_id=payload.conversation_id or str(uuid4()),
        model=model,
        message=ChatMessage(role="assistant", content=text),
    )


@router.post("/files", response_model=FileMetadata, status_code=status.HTTP_201_CREATED)
async def upload_chat_file(
    upload: UploadFile = File(...),
    identity: Identity = Depends(require_identity),
    files: ChatFileService = Depends(file_service),
) -> FileMetadata:
    return await files.save_upload(upload, identity)


@router.get("/files/{file_id}")
async def get_chat_file(
    file_id: str,
    identity: Identity = Depends(require_identity),
    files: ChatFileService = Depends(file_service),
) -> FileResponse:
    metadata = files.get_metadata(file_id)
    path = files.get_file_path(file_id)
    return FileResponse(path, media_type=metadata.mime_type, filename=metadata.name)


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_file(
    file_id: str,
    identity: Identity = Depends(require_identity),
    files: ChatFileService = Depends(file_service),
) -> None:
    files.delete_file(file_id)
