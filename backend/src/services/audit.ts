/**
 * Audit log za ingest pipeline.
 *
 * Pišemo u `audit.ingest_log` poslije svake značajne operacije.
 * Funkcija prihvata bilo `pool` (jedan upit van transakcije) ili
 * `PoolClient` (kad smo unutar transakcije sa drugim operacijama).
 */

import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../db.js";

export type IngestAkcija =
  | "UPLOAD"
  | "HASH_CHECK"
  | "OCR_START"
  | "OCR_DONE"
  | "PARSE_DOCX"
  | "PARSE_PDF"
  | "CHUNK"
  | "EMBED"
  | "FAILED";

export type IngestStatus = "OK" | "GRESKA" | "PRESKOCENO";

export interface IngestLogEntry {
  documentId?: string | null;
  akcija: IngestAkcija;
  status?: IngestStatus;
  detalji?: Record<string, unknown>;
  greska?: string;
  trajanjeMs?: number;
}

type SqlExecutor = Pool | PoolClient;

export async function logIngest(
  entry: IngestLogEntry,
  executor: SqlExecutor = defaultPool,
): Promise<void> {
  await executor.query(
    `INSERT INTO audit.ingest_log
       (document_id, akcija, status, detalji, greska, trajanje_ms)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [
      entry.documentId ?? null,
      entry.akcija,
      entry.status ?? "OK",
      JSON.stringify(entry.detalji ?? {}),
      entry.greska ?? null,
      entry.trajanjeMs ?? null,
    ],
  );
}
