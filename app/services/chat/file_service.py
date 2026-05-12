import json
import mimetypes
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import CHAT_UPLOAD_DIR, load_config
from app.models import FileMetadata, Identity, StoredFileMetadata


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
TEXT_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".log"}
ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS | TEXT_EXTENSIONS


class ChatFileService:
    def __init__(self, upload_dir: Path = CHAT_UPLOAD_DIR) -> None:
        self.upload_dir = upload_dir
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload(self, file: UploadFile, identity: Identity) -> FileMetadata:
        config = load_config()
        limit_bytes = config.chat.upload.max_file_mb * 1024 * 1024

        original_name = Path(file.filename or "upload").name
        extension = Path(original_name).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type.",
            )

        guessed_type = mimetypes.guess_type(original_name)[0]
        mime_type = file.content_type or guessed_type or "application/octet-stream"
        file_id = str(uuid4())
        stored_name = f"{file_id}{extension}"
        stored_path = self._safe_file_path(stored_name)
        meta_path = self._safe_file_path(f"{file_id}.json")

        size = 0
        try:
            with stored_path.open("wb") as destination:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit_bytes:
                        destination.close()
                        stored_path.unlink(missing_ok=True)
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="File is too large.",
                        )
                    destination.write(chunk)
        finally:
            await file.close()

        metadata = StoredFileMetadata(
            id=file_id,
            name=original_name,
            mime_type=mime_type,
            size=size,
            stored_name=stored_name,
        )
        meta_path.write_text(metadata.model_dump_json(indent=2), encoding="utf-8")
        return FileMetadata.model_validate(metadata.model_dump())

    def get_metadata(self, file_id: str) -> StoredFileMetadata:
        self._validate_file_id(file_id)
        meta_path = self._safe_file_path(f"{file_id}.json")
        if not meta_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
        return StoredFileMetadata.model_validate_json(meta_path.read_text(encoding="utf-8"))

    def get_file_path(self, file_id: str) -> Path:
        metadata = self.get_metadata(file_id)
        path = self._safe_file_path(metadata.stored_name)
        if not path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
        return path

    def get_attachment_records(self, file_ids: list[str]) -> list[tuple[StoredFileMetadata, Path]]:
        return [(self.get_metadata(file_id), self.get_file_path(file_id)) for file_id in file_ids]

    def delete_file(self, file_id: str) -> None:
        metadata = self.get_metadata(file_id)
        self._safe_file_path(metadata.stored_name).unlink(missing_ok=True)
        self._safe_file_path(f"{file_id}.json").unlink(missing_ok=True)

    def _safe_file_path(self, name: str) -> Path:
        candidate = (self.upload_dir / name).resolve()
        root = self.upload_dir.resolve()
        if root != candidate and root not in candidate.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path.")
        return candidate

    @staticmethod
    def _validate_file_id(file_id: str) -> None:
        try:
            UUID(file_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.") from exc
