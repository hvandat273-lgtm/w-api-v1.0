from collections.abc import AsyncIterator
from pathlib import Path

from app.config import ChatAccountConfig
from app.models import ChatMessage, StoredFileMetadata
from app.services.chat.file_service import IMAGE_EXTENSIONS, TEXT_EXTENSIONS


class UpstreamChatAdapter:
    async def check_account(self, account: ChatAccountConfig) -> str:
        client = self._create_client(account)
        try:
            await client.init(timeout=60, auto_close=False, auto_refresh=True)
            return "Cookie is usable."
        finally:
            await self._close_client(client)

    async def complete(
        self,
        account: ChatAccountConfig,
        messages: list[ChatMessage],
        model: str,
        attachments: list[tuple[StoredFileMetadata, Path]],
    ) -> str:
        prompt, file_paths = self._build_prompt(messages, attachments)
        client = self._create_client(account)
        try:
            await client.init(timeout=120, auto_close=False, auto_refresh=True)
            chat_session = self._start_chat(client, model)
            response = await chat_session.send_message(
                prompt,
                files=self._file_args(file_paths),
                timeout=180,
            )
            text = getattr(response, "text", None)
            if not text:
                return "[No text response]"
            return str(text)
        finally:
            await self._close_client(client)

    async def stream_complete(
        self,
        account: ChatAccountConfig,
        messages: list[ChatMessage],
        model: str,
        attachments: list[tuple[StoredFileMetadata, Path]],
    ) -> AsyncIterator[str]:
        prompt, file_paths = self._build_prompt(messages, attachments)
        client = self._create_client(account)
        try:
            await client.init(timeout=120, auto_close=False, auto_refresh=True)
            chat_session = self._start_chat(client, model)
            last_text = ""
            async for output in chat_session.send_message_stream(
                prompt,
                files=self._file_args(file_paths),
                timeout=180,
            ):
                delta = getattr(output, "text_delta", "") or ""
                if not delta:
                    text = getattr(output, "text", "") or ""
                    if text and text.startswith(last_text):
                        delta = text[len(last_text) :]
                    last_text = text or last_text
                elif hasattr(output, "text"):
                    last_text = getattr(output, "text", "") or last_text
                if delta:
                    yield str(delta)
        finally:
            await self._close_client(client)

    def _build_prompt(
        self,
        messages: list[ChatMessage],
        attachments: list[tuple[StoredFileMetadata, Path]],
    ) -> tuple[str, list[Path]]:
        transcript = "\n\n".join(
            f"{message.role.upper()}:\n{message.content}" for message in messages
        )
        file_paths: list[Path] = []
        text_blocks: list[str] = []

        for metadata, path in attachments:
            extension = Path(metadata.stored_name).suffix.lower()
            if extension in IMAGE_EXTENSIONS:
                file_paths.append(path)
            elif extension in TEXT_EXTENSIONS:
                text = path.read_text(encoding="utf-8", errors="replace")[:100_000]
                text_blocks.append(f"Attached file: {metadata.name}\n{text}")

        if text_blocks:
            transcript = f"{transcript}\n\n" + "\n\n".join(text_blocks)
        return transcript, file_paths

    @staticmethod
    def _create_client(account: ChatAccountConfig):
        try:
            from gemini_webapi import GeminiClient
        except ImportError as exc:
            raise RuntimeError("gemini-webapi is not installed.") from exc

        return GeminiClient(
            account.secure_1psid,
            account.secure_1psidts,
            proxy=account.proxy or None,
        )

    @staticmethod
    def _start_chat(client, model: str | None):
        model_name = UpstreamChatAdapter._normalize_model(model)
        if model_name:
            try:
                return client.start_chat(model=model_name)
            except ValueError:
                return client.start_chat()
        return client.start_chat()

    @staticmethod
    def _normalize_model(model: str | None) -> str | None:
        value = str(model or "").strip()
        if not value or value.lower() in {"auto", "default"}:
            return None
        return value

    @staticmethod
    def _file_args(file_paths: list[Path]) -> list[str] | None:
        if not file_paths:
            return None
        return [str(path) for path in file_paths]

    @staticmethod
    async def _close_client(client) -> None:
        close = getattr(client, "close", None)
        if close:
            await close()
