import crypto from "node:crypto";

import { httpError } from "./errors.js";

export function requireIdentity(store) {
  return (req, _res, next) => {
    try {
      const identity = authenticate(req, store);
      req.identity = identity;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAdmin(store) {
  return (req, _res, next) => {
    try {
      const identity = authenticate(req, store);
      if (identity.role !== "admin") {
        throw httpError(403, "Admin role is required.");
      }
      req.identity = identity;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function authenticate(req, store) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw httpError(401, "Missing bearer token.");
  }

  const token = match[1].trim();
  const config = store.read();
  const authKey = config.auth.keys.find((item) => safeEqual(item.key, token));
  if (!authKey) {
    throw httpError(401, "Invalid bearer token.");
  }

  return { id: authKey.id, role: authKey.role };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
