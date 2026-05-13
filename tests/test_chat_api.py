from pathlib import Path

from fastapi.testclient import TestClient

from app.config import ChatAccountConfig
from app.main import app
from app.services.chat.file_service import ChatFileService
from app.services.chat.upstream_adapter import UpstreamChatAdapter


client = TestClient(app)


class FakeAccountService:
    def select_account(self):
        return ChatAccountConfig(
            id="fake",
            name="Fake",
            enabled=True,
            secure_1psid="secret-psid",
            secure_1psidts="secret-ts",
        )


class MissingAccountService:
    def select_account(self):
        raise RuntimeError("No enabled backend chat account is configured.")


class FakeAdapter:
    async def complete(self, account, messages, model, attachments):
        return "Fake assistant response"

    async def stream_complete(self, account, messages, model, attachments):
        yield "Fake "
        yield "stream response"


class FailingStreamAdapter(FakeAdapter):
    async def stream_complete(self, account, messages, model, attachments):
        yield "partial "
        raise RuntimeError("stream failed")


class RecordingChatClient:
    def __init__(self):
        self.calls = []

    def start_chat(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return "chat-session"


class ValueErrorModelChatClient(RecordingChatClient):
    def start_chat(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if kwargs.get("model"):
            raise ValueError("Unknown model")
        return "default-session"


def auth_headers():
    return {"Authorization": "Bearer change-me"}


def test_start_chat_treats_auto_aliases_as_default_model():
    for model in (None, "", "auto", "Auto", " default "):
        chat_client = RecordingChatClient()
        session = UpstreamChatAdapter._start_chat(chat_client, model)

        assert session == "chat-session"
        assert chat_client.calls == [((), {})]


def test_start_chat_passes_explicit_model():
    chat_client = RecordingChatClient()
    session = UpstreamChatAdapter._start_chat(chat_client, "gemini-3-flash")

    assert session == "chat-session"
    assert chat_client.calls == [((), {"model": "gemini-3-flash"})]


def test_start_chat_falls_back_to_default_for_unknown_model():
    chat_client = ValueErrorModelChatClient()
    session = UpstreamChatAdapter._start_chat(chat_client, "unknown-model")

    assert session == "default-session"
    assert chat_client.calls == [((), {"model": "unknown-model"}), ((), {})]


def test_requires_bearer_auth():
    response = client.post(
        "/api/chat/completions",
        json={"messages": [{"role": "user", "content": "hello"}]},
    )
    assert response.status_code == 401


def test_missing_backend_account_returns_clean_error():
    original_account_service = app.state.chat_account_service
    app.state.chat_account_service = MissingAccountService()
    try:
        response = client.post(
            "/api/chat/completions",
            headers=auth_headers(),
            json={"messages": [{"role": "user", "content": "hello"}]},
        )
    finally:
        app.state.chat_account_service = original_account_service

    assert response.status_code == 503
    body = response.text.lower()
    assert "secure_1psid" not in body
    assert "secret" not in body


def test_completion_success_with_fake_upstream():
    original_account_service = app.state.chat_account_service
    original_adapter = app.state.upstream_chat_adapter
    app.state.chat_account_service = FakeAccountService()
    app.state.upstream_chat_adapter = FakeAdapter()
    try:
        response = client.post(
            "/api/chat/completions",
            headers=auth_headers(),
            json={"messages": [{"role": "user", "content": "hello"}]},
        )
    finally:
        app.state.chat_account_service = original_account_service
        app.state.upstream_chat_adapter = original_adapter

    assert response.status_code == 200
    data = response.json()
    assert data["message"]["role"] == "assistant"
    assert data["message"]["content"] == "Fake assistant response"


def test_stream_completion_success_with_fake_upstream():
    original_account_service = app.state.chat_account_service
    original_adapter = app.state.upstream_chat_adapter
    app.state.chat_account_service = FakeAccountService()
    app.state.upstream_chat_adapter = FakeAdapter()
    try:
        response = client.post(
            "/api/chat/completions/stream",
            headers=auth_headers(),
            json={"messages": [{"role": "user", "content": "hello"}], "stream": True},
        )
    finally:
        app.state.chat_account_service = original_account_service
        app.state.upstream_chat_adapter = original_adapter

    assert response.status_code == 200
    assert "event: delta" in response.text
    assert '"delta": "Fake "' in response.text
    assert '"content": "Fake stream response"' in response.text


def test_stream_completion_emits_error_event_when_upstream_fails():
    original_account_service = app.state.chat_account_service
    original_adapter = app.state.upstream_chat_adapter
    app.state.chat_account_service = FakeAccountService()
    app.state.upstream_chat_adapter = FailingStreamAdapter()
    try:
        response = client.post(
            "/api/chat/completions/stream",
            headers=auth_headers(),
            json={"messages": [{"role": "user", "content": "hello"}], "stream": True},
        )
    finally:
        app.state.chat_account_service = original_account_service
        app.state.upstream_chat_adapter = original_adapter

    assert response.status_code == 200
    assert "event: delta" in response.text
    assert "event: error" in response.text
    assert "Upstream chat service failed." in response.text


def test_upload_get_delete_allowed_file(tmp_path: Path):
    original_file_service = app.state.chat_file_service
    app.state.chat_file_service = ChatFileService(tmp_path)
    try:
        upload = client.post(
            "/api/chat/files",
            headers=auth_headers(),
            files={"upload": ("note.txt", b"hello", "text/plain")},
        )
        assert upload.status_code == 201
        metadata = upload.json()
        assert metadata["name"] == "note.txt"
        assert "stored_name" not in metadata

        fetched = client.get(f"/api/chat/files/{metadata['id']}", headers=auth_headers())
        assert fetched.status_code == 200
        assert fetched.content == b"hello"

        deleted = client.delete(f"/api/chat/files/{metadata['id']}", headers=auth_headers())
        assert deleted.status_code == 204
        assert client.get(f"/api/chat/files/{metadata['id']}", headers=auth_headers()).status_code == 404
    finally:
        app.state.chat_file_service = original_file_service


def test_rejects_disallowed_upload_extension(tmp_path: Path):
    original_file_service = app.state.chat_file_service
    app.state.chat_file_service = ChatFileService(tmp_path)
    try:
        response = client.post(
            "/api/chat/files",
            headers=auth_headers(),
            files={"upload": ("script.exe", b"bad", "application/octet-stream")},
        )
    finally:
        app.state.chat_file_service = original_file_service

    assert response.status_code == 400


def test_rejects_streaming_for_mvp():
    response = client.post(
        "/api/chat/completions",
        headers=auth_headers(),
        json={"messages": [{"role": "user", "content": "hello"}], "stream": True},
    )
    assert response.status_code == 400
