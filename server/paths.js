import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SERVER_DIR, "..");
export const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const CHAT_UPLOAD_DIR = process.env.VERCEL
  ? "/tmp/chat_uploads"
  : path.join(DATA_DIR, "chat_uploads");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
