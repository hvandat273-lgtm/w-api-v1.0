import fs from "node:fs/promises";
import path from "node:path";

import { httpError } from "../errors.js";
import { parseSseChunk } from "../sse.js";
import { IMAGE_EXTENSIONS, TEXT_EXTENSIONS } from "./fileStore.js";

export class RouterClient {
  async checkConnection(config) {
    const data = await this.requestJson(config, "/models", { method: "GET", timeoutMs: 15000 });
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return `9Router is reachable. ${count} model(s) available.`;
  }

  async complete(config, messages, model, attachments) {
    const payload = {
      model,
      messages: await this.buildMessages(messages, attachments),
      stream: false,
    };
    const data = await this.requestJson(config, "/chat/completions", {
      method: "POST",
      body: payload,
      timeoutMs: config.chat.router.timeout_ms,
    });
    return extractMessageText(data);
  }

  async *streamComplete(config, messages, model, attachments) {
    const response = await this.request(config, "/chat/completions", {
      method: "POST",
      body: {
        model,
        messages: await this.buildMessages(messages, attachments),
        stream: true,
      },
      timeoutMs: config.chat.router.timeout_ms,
    });

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      const parsed = parseSseChunk(buffer, decoder.decode(chunk, { stream: true }));
      buffer = parsed.buffer;
      for (const event of parsed.events) {
        const delta = parseOpenAiDelta(event.data);
        if (delta.done) return;
        if (delta.text) yield delta.text;
      }
    }

    if (buffer.trim()) {
      const delta = parseOpenAiDelta(buffer.replace(/^data:\s*/i, ""));
      if (delta.text) yield delta.text;
    }
  }

  async buildMessages(messages, attachments) {
    const upstreamMessages = messages.map((message) => ({
      role: message.role,
      content: String(message.content || ""),
    }));

    if (!attachments.length) return upstreamMessages;

    const textBlocks = [];
    const imageParts = [];

    for (const { metadata, path: filePath } of attachments) {
      const extension = path.extname(metadata.stored_name || metadata.name || "").toLowerCase();
      if (TEXT_EXTENSIONS.has(extension)) {
        const text = await fs.readFile(filePath, "utf8");
        textBlocks.push(`Attached file: ${metadata.name}\n${text.slice(0, 100000)}`);
      } else if (IMAGE_EXTENSIONS.has(extension)) {
        const image = await fs.readFile(filePath);
        imageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${metadata.mime_type};base64,${image.toString("base64")}`,
          },
        });
      }
    }

    if (!textBlocks.length && !imageParts.length) return upstreamMessages;

    let userIndex = upstreamMessages.findLastIndex((message) => message.role === "user");
    if (userIndex < 0) {
      upstreamMessages.push({ role: "user", content: "" });
      userIndex = upstreamMessages.length - 1;
    }

    const currentContent = String(upstreamMessages[userIndex].content || "");
    const text = [currentContent, ...textBlocks].filter(Boolean).join("\n\n");
    upstreamMessages[userIndex].content = imageParts.length
      ? [{ type: "text", text: text || "Analyze the attached image(s)." }, ...imageParts]
      : text;

    return upstreamMessages;
  }

  async requestJson(config, pathname, options) {
    const response = await this.request(config, pathname, options);
    return response.json();
  }

  async request(config, pathname, options) {
    const router = config.chat.router;
    if (!config.chat.enabled) throw httpError(503, "Chat is disabled.");
    if (!router.api_key) throw httpError(503, "9Router API key is not configured.");
    if (!router.base_url) throw httpError(503, "9Router base URL is not configured.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || router.timeout_ms || 180000);
    const body = options.body ? JSON.stringify(options.body) : undefined;

    let response;
    try {
      response = await fetch(`${router.base_url}${pathname}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${router.api_key}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw httpError(504, "9Router request timed out.");
      }
      throw httpError(502, `Cannot reach 9Router: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw httpError(response.status, normalizeUpstreamError(response.status, text));
    }

    return response;
  }
}

function extractMessageText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content) return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || "").join("") || "[No text response]";
  }
  if (typeof data?.output_text === "string") return data.output_text;
  return "[No text response]";
}

function parseOpenAiDelta(rawData) {
  const text = String(rawData || "").trim();
  if (!text || text === "[DONE]") return { done: true, text: "" };

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { done: false, text: "" };
  }

  const choice = data.choices?.[0];
  const content = choice?.delta?.content ?? choice?.message?.content ?? data.response ?? data.text ?? "";
  return {
    done: choice?.finish_reason != null,
    text: typeof content === "string" ? content : "",
  };
}

function normalizeUpstreamError(status, text) {
  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.detail || data?.message;
    if (message) return `9Router error ${status}: ${message}`;
  } catch {
    // Use plain text below.
  }
  return text ? `9Router error ${status}: ${text.slice(0, 300)}` : `9Router error ${status}.`;
}
