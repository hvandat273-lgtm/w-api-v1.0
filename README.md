# W-API 9Router Webchat

Static webchat UI with a Node.js backend. The browser uses an internal App key;
the 9Router API key stays in `config.json` on the backend.

## Run

```bash
npm install
npm start
```

Open `http://localhost:8022/chat`.

Admin is available at `http://localhost:8022/admin2732000`.

## Configure

Edit `config.json`:

- `auth.keys[]` controls App keys entered in the UI.
- `chat.router.base_url` should point to the 9Router OpenAI-compatible endpoint,
  for example `http://localhost:20128/v1`.
- `chat.router.api_key` is the 9Router API key.
- `chat.default_model` is the default model when the UI selects `Auto`.

The old Python/FastAPI implementation remains in `app/` as legacy code, but the
primary runtime is now `server/index.js`.
