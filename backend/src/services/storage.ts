/**
 * Storage servis — hash fajla i snimanje na lokalni disk.
 *
 * Lokacija: <UPLOADS_DIR>/<document_id>/<sanitized_original_name>
 * UPLOADS_DIR se čita iz `config.ocr.uploadsDir` (default ./data/uploads).
 *
 * Hash je SHA-256, koristi se za detekciju duplikata kroz UNIQUE indeks
 * `documents_hash_uq` u šemi.
 */

import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { config } from "../config.js";

// Relativne putanje u UPLOADS_DIR rješavamo u odnosu na koren monorepa,
// ne na trenutni cwd (backend se startuje iz različitih lokacija — tsx
// watch, npm scripts, CI). Ovaj fajl je na backend/src/services/storage.ts
// pa root = ../../.. .
const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..");

const UPLOADS_ROOT = isAbsolute(config.ocr.uploadsDir)
  ? config.ocr.uploadsDir
  : resolve(MONOREPO_ROOT, config.ocr.uploadsDir);

/**
 * Spriječi path traversal i opasne karaktere u imenu fajla.
 * Vraća samo basename + očišćene karaktere.
 */
function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "");
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "dokument";
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface StoredFile {
  putanjaRelativna: string;
  putanjaApsolutna: string;
  velicinaBajtova: number;
}

export async function storeFile(
  documentId: string,
  originalName: string,
  buffer: Buffer,
): Promise<StoredFile> {
  const safeName = sanitizeFilename(originalName);
  const dir = join(UPLOADS_ROOT, documentId);
  await mkdir(dir, { recursive: true });
  const apsolutna = join(dir, safeName);
  await writeFile(apsolutna, buffer);
  return {
    putanjaRelativna: join(documentId, safeName).replaceAll("\\", "/"),
    putanjaApsolutna: apsolutna,
    velicinaBajtova: buffer.byteLength,
  };
}

/**
 * Obriši orphan fajl ako INSERT u bazu padne. Tiho ignoriše ako fajl
 * ne postoji — race conditions ne smiju oboriti error handling.
 */
export async function removeFileQuiet(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch {
    /* nothing — file already gone or never existed */
  }
}
