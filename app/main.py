from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import CHAT_UPLOAD_DIR, PUBLIC_DIR, STATIC_DIR
from app.routers.chat import router as chat_router
from app.services.chat.account_service import ChatAccountService
from app.services.chat.file_service import ChatFileService
from app.services.chat.upstream_adapter import UpstreamChatAdapter


app = FastAPI(
    title="Backend-managed Cookie Webchat",
    description="Static webchat with backend-only Gemini cookies.",
    version="0.1.0",
)

app.state.chat_account_service = ChatAccountService()
app.state.chat_file_service = ChatFileService(CHAT_UPLOAD_DIR)
app.state.upstream_chat_adapter = UpstreamChatAdapter()

app.include_router(chat_router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
if PUBLIC_DIR.exists():
    css_dir = PUBLIC_DIR / "css"
    js_dir = PUBLIC_DIR / "js"
    if css_dir.exists():
        app.mount("/css", StaticFiles(directory=css_dir), name="public-css")
    if js_dir.exists():
        app.mount("/js", StaticFiles(directory=js_dir), name="public-js")


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/chat")


@app.get("/chat", response_class=HTMLResponse, include_in_schema=False)
async def chat_page() -> HTMLResponse:
    path = PUBLIC_DIR / "index.html"
    if not path.exists():
        path = STATIC_DIR / "chat.html"
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat UI not found.")
    return HTMLResponse(path.read_text(encoding="utf-8"))


@app.get("/health", tags=["Health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
