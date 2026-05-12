# Backend-managed Cookie Webchat

FastAPI scaffold for a static webchat UI where Gemini web cookies stay on the backend.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8022 --reload
```

Open `http://localhost:8022/chat`.

## Configure

Edit `config.json`:

- Set `auth.keys[0].key` to the internal app bearer key users enter in the UI.
- Set `chat.accounts[].secure_1psid` and `secure_1psidts` to backend-only Gemini cookie values.

The frontend never receives those upstream cookie values.
