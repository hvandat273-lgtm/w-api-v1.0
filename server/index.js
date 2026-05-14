import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConfigStore } from "./config.js";
import { HttpError } from "./errors.js";
import { PUBLIC_DIR, CHAT_UPLOAD_DIR } from "./paths.js";
import { createAdminRouter } from "./routes/admin.js";
import { createChatRouter } from "./routes/chat.js";
import { createSessionRouter } from "./routes/session.js";
import { FileStore } from "./services/fileStore.js";
import { RouterClient } from "./services/routerClient.js";

const store = new ConfigStore();
const routerClient = new RouterClient();
const fileStore = new FileStore(CHAT_UPLOAD_DIR, store);

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path === "/chat" ||
    req.path === "/admin" ||
    req.path === "/admin2732000" ||
    /\.(?:html|js|css)$/i.test(req.path)
  ) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use((req, res, next) => {
  if (req.path === "/admin" || req.path === "/admin.html") {
    res.status(404).json({ detail: "Route not found." });
    return;
  }
  next();
});
app.use(express.static(PUBLIC_DIR));

app.use("/api", createSessionRouter(store));
app.use("/api/chat", createChatRouter({ store, fileStore, routerClient }));
app.use("/api/admin", createAdminRouter({ store, routerClient }));

app.get("/", (_req, res) => res.redirect("/chat"));
app.get("/chat", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/admin2732000", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));

app.use((req, res) => {
  res.status(404).json({ detail: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ detail: error.message || "Internal server error." });
});

const port = Number(process.env.PORT || 8022);
const host = process.env.HOST || "0.0.0.0";
const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisFile = fileURLToPath(import.meta.url);

if (entrypoint === thisFile) {
  app.listen(port, host, () => {
    console.log(`W-API 9Router server listening on http://${host}:${port}`);
  });
}
