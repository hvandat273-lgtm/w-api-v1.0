import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CHAT_UPLOAD_DIR } from "../paths.js";
import { httpError } from "../errors.js";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".log"]);

const MIME_BY_EXTENSION = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".json", "application/json"],
  [".csv", "text/csv"],
  [".log", "text/plain"],
]);

export class FileStore {
  constructor(uploadDir = CHAT_UPLOAD_DIR, configStore) {
    this.uploadDir = uploadDir;
    this.configStore = configStore;
  }

  async saveUpload(file) {
    if (!file) throw httpError(400, "Upload file is required.");

    const originalName = path.basename(file.originalname || "upload");
    const extension = path.extname(originalName).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(extension)) {
      throw httpError(400, "Unsupported file type.");
    }

    const config = this.configStore.read();
    const maxBytes = config.chat.upload.max_file_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw httpError(400, `File exceeds ${config.chat.upload.max_file_mb}MB limit.`);
    }

    await fs.mkdir(this.uploadDir, { recursive: true });
    const id = crypto.randomUUID();
    const storedName = `${id}${extension}`;
    const metadata = {
      id,
      name: originalName,
      mime_type: file.mimetype || MIME_BY_EXTENSION.get(extension) || "application/octet-stream",
      size: file.size,
      created_at: new Date().toISOString(),
      stored_name: storedName,
    };

    await fs.writeFile(path.join(this.uploadDir, storedName), file.buffer);
    await fs.writeFile(this.metadataPath(id), JSON.stringify(metadata, null, 2), "utf8");

    const { stored_name: _storedName, ...publicMetadata } = metadata;
    return publicMetadata;
  }

  async getAttachmentRecords(attachmentIds) {
    const records = [];
    for (const id of attachmentIds) {
      const metadata = await this.getMetadata(id);
      records.push({
        metadata,
        path: this.filePath(metadata.id, metadata.stored_name),
      });
    }
    return records;
  }

  async getMetadata(id) {
    try {
      const raw = await fs.readFile(this.metadataPath(id), "utf8");
      return JSON.parse(raw);
    } catch {
      throw httpError(404, "File not found.");
    }
  }

  filePath(id, storedName) {
    return path.join(this.uploadDir, storedName || `${id}${path.extname(id)}`);
  }

  metadataPath(id) {
    return path.join(this.uploadDir, `${id}.json`);
  }

  async deleteFile(id) {
    const metadata = await this.getMetadata(id);
    await fs.rm(this.filePath(id, metadata.stored_name), { force: true });
    await fs.rm(this.metadataPath(id), { force: true });
  }
}
