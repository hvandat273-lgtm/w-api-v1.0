import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CONFIG_PATH } from "./paths.js";

const DEFAULT_MODEL = "ag/gemini-3-flash";
const PROCESSING_MODEL = "ag/gemini-3-flash";

export class ConfigStore {
  constructor(configPath = CONFIG_PATH) {
    if (process.env.VERCEL) {
      this._baseConfigPath = configPath;
      this.configPath = "/tmp/config.json";
    } else {
      this._baseConfigPath = null;
      this.configPath = configPath;
    }
  }

  read() {
    // On Vercel: check writable /tmp first (has runtime changes), fall back to deployed config
    if (this._baseConfigPath) {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        return normalizeConfig(raw);
      }
      if (fs.existsSync(this._baseConfigPath)) {
        const raw = JSON.parse(fs.readFileSync(this._baseConfigPath, "utf8"));
        return normalizeConfig(raw);
      }
      return normalizeConfig({});
    }
    if (!fs.existsSync(this.configPath)) {
      return normalizeConfig({});
    }
    const raw = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    return normalizeConfig(raw);
  }

  update(mutator) {
    const config = this.read();
    mutator(config);
    this.write(config);
    return config;
  }

  write(config) {
    const normalized = normalizeConfig(config);
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const tmp = path.join(
      path.dirname(this.configPath),
      `.${path.basename(this.configPath)}.${crypto.randomUUID()}.tmp`,
    );
    fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, this.configPath);
  }
}

export function normalizeConfig(raw) {
  const auth = raw?.auth ?? {};
  const chat = raw?.chat ?? {};
  const router = chat.router ?? {};
  const upload = chat.upload ?? {};
  const legacyAccount = Array.isArray(chat.accounts) ? chat.accounts[0] ?? {} : {};

  const defaultModel = normalizeDefaultModel(chat.default_model || router.model || legacyAccount.api_model);

  return {
    auth: {
      keys: Array.isArray(auth.keys)
        ? auth.keys.map((item) => ({
            id: String(item.id ?? "").trim(),
            key: String(item.key ?? ""),
            role: String(item.role ?? "user") === "admin" ? "admin" : "user",
          })).filter((item) => item.id && item.key)
        : [],
    },
    chat: {
      enabled: chat.enabled !== false,
      default_model: defaultModel,
      system_prompt: typeof chat.system_prompt === "string" ? chat.system_prompt : "",
      router: {
        base_url: String(
          router.base_url ||
          legacyAccount.api_base_url ||
          process.env.NINEROUTER_BASE_URL ||
          "http://localhost:20128/v1",
        ).replace(/\/+$/, ""),
        api_key: String(
          router.api_key ||
          legacyAccount.api_key ||
          process.env.NINEROUTER_API_KEY ||
          "",
        ),
        timeout_ms: Number(router.timeout_ms || process.env.NINEROUTER_TIMEOUT_MS || 180000),
        last_checked_at: router.last_checked_at || null,
        last_check_ok: router.last_check_ok ?? null,
        last_check_message: router.last_check_message || "",
      },
      upload: {
        max_file_mb: Number(upload.max_file_mb || 20),
        max_files_per_message: Number(upload.max_files_per_message || 5),
      },
    },
  };
}

function normalizeDefaultModel(model) {
  const value = String(model || "").trim();
  if (!value || ["auto", "default"].includes(value.toLowerCase())) {
    return DEFAULT_MODEL;
  }
  return value;
}

export function resolveChatModel(requestedModel, config) {
  // Use the model requested by the client, or fall back to the configured default
  const model = String(requestedModel || "").trim();
  if (model && model !== "auto" && model !== "default") return model;
  return config.chat.default_model || PROCESSING_MODEL;
}

export function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}
