import express from "express";

import { requireAdmin } from "../auth.js";
import { maskSecret } from "../config.js";
import { asyncRoute, httpError } from "../errors.js";

export function createAdminRouter({ store, routerClient }) {
  const router = express.Router();
  const admin = requireAdmin(store);

  router.get("/router", admin, (req, res) => {
    res.json(publicRouterSettings(store.read()));
  });

  router.patch("/router", admin, asyncRoute(async (req, res) => {
    const payload = req.body || {};
    const updated = store.update((config) => {
      if (typeof payload.enabled === "boolean") config.chat.enabled = payload.enabled;
      if (payload.default_model != null && String(payload.default_model).trim()) {
        config.chat.default_model = String(payload.default_model).trim();
      }
      if (payload.base_url != null && String(payload.base_url).trim()) {
        config.chat.router.base_url = String(payload.base_url).trim().replace(/\/+$/, "");
      }
      if (payload.api_key != null && String(payload.api_key).trim()) {
        config.chat.router.api_key = String(payload.api_key).trim();
      }
      if (payload.max_file_mb != null) {
        config.chat.upload.max_file_mb = Number(payload.max_file_mb);
      }
      if (payload.max_files_per_message != null) {
        config.chat.upload.max_files_per_message = Number(payload.max_files_per_message);
      }
      if (typeof payload.system_prompt === "string") {
        config.chat.system_prompt = payload.system_prompt;
      }
    });
    res.json(publicRouterSettings(updated));
  }));

  router.post("/router/check", admin, asyncRoute(async (req, res) => {
    const config = store.read();
    const checkedAt = new Date().toISOString();
    try {
      const message = await routerClient.checkConnection(config);
      store.update((nextConfig) => {
        nextConfig.chat.router.last_checked_at = checkedAt;
        nextConfig.chat.router.last_check_ok = true;
        nextConfig.chat.router.last_check_message = message;
      });
      res.json({ ok: true, status: "alive", checked_at: checkedAt, message });
    } catch (error) {
      const message = error.message || "9Router check failed.";
      store.update((nextConfig) => {
        nextConfig.chat.router.last_checked_at = checkedAt;
        nextConfig.chat.router.last_check_ok = false;
        nextConfig.chat.router.last_check_message = message;
      });
      res.json({ ok: false, status: "dead", checked_at: checkedAt, message });
    }
  }));

  router.get("/auth-keys", admin, (req, res) => {
    res.json(store.read().auth.keys.map(publicAuthKey));
  });

  router.post("/auth-keys", admin, asyncRoute(async (req, res) => {
    const keyId = String(req.body?.id || "").trim();
    const keyValue = String(req.body?.key || "").trim();
    const role = req.body?.role === "admin" ? "admin" : "user";
    if (!keyId || !keyValue) throw httpError(400, "Key id and key are required.");

    const config = store.update((nextConfig) => {
      if (nextConfig.auth.keys.some((item) => item.id === keyId)) {
        throw httpError(409, "Auth key id already exists.");
      }
      nextConfig.auth.keys.push({ id: keyId, key: keyValue, role });
    });
    res.status(201).json(publicAuthKey(config.auth.keys.find((item) => item.id === keyId)));
  }));

  router.patch("/auth-keys/:keyId", admin, asyncRoute(async (req, res) => {
    const config = store.update((nextConfig) => {
      const authKey = nextConfig.auth.keys.find((item) => item.id === req.params.keyId);
      if (!authKey) throw httpError(404, "Auth key not found.");
      if (req.body?.role && authKey.role === "admin" && req.body.role !== "admin" && !hasOtherAdminKey(nextConfig, authKey.id)) {
        throw httpError(400, "Cannot remove the last admin key.");
      }
      if (req.body?.key && String(req.body.key).trim()) authKey.key = String(req.body.key).trim();
      if (req.body?.role) authKey.role = req.body.role === "admin" ? "admin" : "user";
    });
    res.json(publicAuthKey(config.auth.keys.find((item) => item.id === req.params.keyId)));
  }));

  router.delete("/auth-keys/:keyId", admin, asyncRoute(async (req, res) => {
    store.update((nextConfig) => {
      const authKey = nextConfig.auth.keys.find((item) => item.id === req.params.keyId);
      if (!authKey) throw httpError(404, "Auth key not found.");
      if (authKey.role === "admin" && !hasOtherAdminKey(nextConfig, authKey.id)) {
        throw httpError(400, "Cannot delete the last admin key.");
      }
      nextConfig.auth.keys = nextConfig.auth.keys.filter((item) => item.id !== req.params.keyId);
    });
    res.status(204).end();
  }));

  return router;
}

function publicRouterSettings(config) {
  const router = config.chat.router;
  return {
    enabled: config.chat.enabled,
    default_model: config.chat.default_model,
    system_prompt: config.chat.system_prompt || "",
    base_url: router.base_url,
    api_key_masked: maskSecret(router.api_key),
    has_api_key: Boolean(router.api_key),
    timeout_ms: router.timeout_ms,
    upload: config.chat.upload,
    metadata: {
      last_checked_at: router.last_checked_at || null,
      last_check_ok: router.last_check_ok ?? null,
      last_check_message: router.last_check_message || "",
    },
  };
}

function publicAuthKey(authKey) {
  return {
    id: authKey.id,
    role: authKey.role,
    key_masked: maskSecret(authKey.key),
  };
}

function hasOtherAdminKey(config, keyId) {
  return config.auth.keys.some((item) => item.id !== keyId && item.role === "admin");
}
