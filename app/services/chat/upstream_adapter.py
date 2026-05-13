from pathlib import Path
import json

from app.config import ChatAccountConfig
from app.models import ChatMessage, StoredFileMetadata
from app.services.chat.file_service import IMAGE_EXTENSIONS, TEXT_EXTENSIONS


class UpstreamChatAdapter:
    async def check_account(self, account: ChatAccountConfig) -> str:
        try:
            from gemini_webapi import GeminiClient
        except ImportError as exc:
            raise RuntimeError("gemini-webapi is not installed.") from exc

        client = GeminiClient(
            account.secure_1psid,
            account.secure_1psidts,
            proxy=account.proxy or None,
        )
        try:
            await client.init(timeout=60, auto_close=False, auto_refresh=True)
            return "Cookie is usable."
        finally:
            close = getattr(client, "close", None)
            if close:
                await close()

    async def complete(
        self,
        account: ChatAccountConfig,
        messages: list[ChatMessage],
        model: str,
        attachments: list[tuple[StoredFileMetadata, Path]],
    ) -> str:
        prompt, image_paths = self._build_prompt(messages, attachments)

        try:
            from gemini_webapi import GeminiClient
        except ImportError as exc:
            raise RuntimeError("gemini-webapi is not installed.") from exc

        client = GeminiClient(
            account.secure_1psid,
            account.secure_1psidts,
            proxy=account.proxy or None,
        )
        try:
            await client.init(timeout=120, auto_close=False, auto_refresh=True)
            start_kwargs = {}
            if model and model != "auto":
                start_kwargs["model"] = model
            chat_session = client.start_chat(**start_kwargs)
            if image_paths:
                return await self._complete_with_files_raw(
                    client=client,
                    prompt=prompt,
                    file_paths=image_paths,
                    proxy=account.proxy or None,
                    model=model,
                )

            response = await chat_session.send_message(prompt)
            text = getattr(response, "text", None)
            if not text:
                return "[No text response]"
            return str(text)
        finally:
            close = getattr(client, "close", None)
            if close:
                await close()

    def _build_prompt(
        self,
        messages: list[ChatMessage],
        attachments: list[tuple[StoredFileMetadata, Path]],
    ) -> tuple[str, list[Path]]:
        transcript = "\n\n".join(
            f"{message.role.upper()}:\n{message.content}" for message in messages
        )
        image_paths: list[Path] = []
        text_blocks: list[str] = []

        for metadata, path in attachments:
            extension = Path(metadata.stored_name).suffix.lower()
            if extension in IMAGE_EXTENSIONS:
                image_paths.append(path)
            elif extension in TEXT_EXTENSIONS:
                text = path.read_text(encoding="utf-8", errors="replace")[:100_000]
                text_blocks.append(f"Attached file: {metadata.name}\n{text}")

        if text_blocks:
            transcript = f"{transcript}\n\n" + "\n\n".join(text_blocks)
        return transcript, image_paths

    async def _complete_with_files_raw(
        self,
        client,
        prompt: str,
        file_paths: list[Path],
        proxy: str | None,
        model: str,
    ) -> str:
        from gemini_webapi.client import parse_file_name, upload_file
        from gemini_webapi.constants import Endpoint, Model

        gemini_model = Model.UNSPECIFIED if not model or model == "auto" else Model.from_name(model)
        uploaded_files = [
            [[await upload_file(str(file_path), proxy)], parse_file_name(str(file_path))]
            for file_path in file_paths
        ]
        response = await client.client.post(
            Endpoint.GENERATE.value,
            headers=gemini_model.model_header,
            data={
                "at": client.access_token,
                "f.req": json.dumps(
                    [
                        None,
                        json.dumps(
                            [
                                [prompt, 0, None, uploaded_files],
                                None,
                                None,
                            ]
                        ),
                    ]
                ),
            },
            timeout=180,
        )
        response.raise_for_status()
        text = self._extract_text_from_raw_response(response.text)
        if not text:
            raise RuntimeError("Gemini returned an empty file response.")
        return text

    @staticmethod
    def _extract_text_from_raw_response(raw_response: str) -> str:
        lines = [line for line in raw_response.splitlines() if line and not line.startswith(")]}'")]
        for line in lines:
            try:
                response_parts = json.loads(line)
            except json.JSONDecodeError:
                continue

            collected: list[str] = []
            for part in response_parts:
                if not isinstance(part, list) or len(part) < 3 or not part[2]:
                    continue
                try:
                    main_part = json.loads(part[2])
                except (TypeError, ValueError):
                    continue
                if not isinstance(main_part, list) or len(main_part) <= 4:
                    continue
                candidates = main_part[4]
                if not isinstance(candidates, list):
                    continue
                for candidate in candidates:
                    try:
                        candidate_text = candidate[1][0]
                    except (IndexError, TypeError):
                        continue
                    if isinstance(candidate_text, str) and candidate_text.strip():
                        collected.append(candidate_text.strip())
            if collected:
                return "\n\n".join(collected)
        return ""
