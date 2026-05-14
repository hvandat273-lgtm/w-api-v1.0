import express from "express";
import multer from "multer";
import path from "node:path";

import { requireIdentity } from "../auth.js";
import { resolveChatModel } from "../config.js";
import { asyncRoute, httpError } from "../errors.js";
import { writeSse } from "../sse.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createChatRouter({ store, fileStore, routerClient }) {
  const router = express.Router();
  const auth = requireIdentity(store);

  router.post("/completions", auth, asyncRoute(async (req, res) => {
    const payload = validateChatPayload(req.body);
    if (payload.stream) {
      throw httpError(400, "Use /api/chat/completions/stream for streaming responses.");
    }

    const config = store.read();
    assertAttachmentLimit(payload, config);
    const attachments = await fileStore.getAttachmentRecords(payload.attachments.map((item) => item.id));
    const model = resolveChatModel(payload.model, config);
    const text = await routerClient.complete(config, payload.messages, model, attachments);

    res.json({
      conversation_id: payload.conversation_id || cryptoRandomId(),
      model,
      message: { role: "assistant", content: text },
      created_at: new Date().toISOString(),
    });
  }));

  router.post("/completions/stream", auth, asyncRoute(async (req, res) => {
    const payload = validateChatPayload(req.body);
    const config = store.read();
    assertAttachmentLimit(payload, config);
    const attachments = await fileStore.getAttachmentRecords(payload.attachments.map((item) => item.id));
    const conversationId = payload.conversation_id || cryptoRandomId();
    const model = resolveChatModel(payload.model, config);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const collected = [];
    try {
      for await (const delta of routerClient.streamComplete(config, payload.messages, model, attachments)) {
        collected.push(delta);
        writeSse(res, "delta", { delta });
      }
      writeSse(res, "done", {
        conversation_id: conversationId,
        model,
        message: { role: "assistant", content: collected.join("") },
      });
    } catch (error) {
      writeSse(res, "error", { message: error.message || "Upstream chat service failed." });
    } finally {
      res.end();
    }
  }));

  router.post("/files", auth, upload.single("upload"), asyncRoute(async (req, res) => {
    const metadata = await fileStore.saveUpload(req.file);
    res.status(201).json(metadata);
  }));

  router.get("/files/:fileId", auth, asyncRoute(async (req, res) => {
    const metadata = await fileStore.getMetadata(req.params.fileId);
    res.download(fileStore.filePath(metadata.id, metadata.stored_name), metadata.name);
  }));

  router.delete("/files/:fileId", auth, asyncRoute(async (req, res) => {
    await fileStore.deleteFile(req.params.fileId);
    res.status(204).end();
  }));

  return router;
}

function validateChatPayload(body) {
  if (!Array.isArray(body?.messages) || body.messages.length < 1) {
    throw httpError(400, "At least one message is required.");
  }

  const messages = body.messages.map((message) => ({
    role: validateRole(message.role),
    content: String(message.content || ""),
  })).filter((message) => message.content);

  if (!messages.length) throw httpError(400, "At least one non-empty message is required.");

  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .map((attachment) => ({ id: String(attachment.id || "").trim() }))
        .filter((attachment) => attachment.id)
    : [];

  return {
    conversation_id: body.conversation_id || null,
    model: body.model || null,
    messages,
    attachments,
    stream: body.stream === true,
  };
}

function validateRole(role) {
  if (["system", "user", "assistant"].includes(role)) return role;
  throw httpError(400, "Invalid message role.");
}

function assertAttachmentLimit(payload, config) {
  if (payload.attachments.length > config.chat.upload.max_files_per_message) {
    throw httpError(400, "Too many attachments for one message.");
  }
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
