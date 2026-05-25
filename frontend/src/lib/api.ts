/**
 * API klijent — fetch wrapper za backend /api/* endpointe.
 *
 * Glavni izazov: /api/qna vraća text/event-stream sa QnaStreamEvent-ovima.
 * Browser EventSource ne podržava POST, pa parsiramo SSE ručno preko
 * fetch + ReadableStream.
 */

import type {
  DocumentListQuery,
  DocumentListResponse,
  DocumentMeta,
  HealthResponse,
  IngestStatus,
  QnaRequest,
  QnaStreamEvent,
} from "@rtcg/shared";

const API_BASE = ""; // Vite proxy preusmjerava /api/* na backend.

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(): Promise<HealthResponse> {
  const r = await fetch(`${API_BASE}/api/health`);
  if (!r.ok) throw new Error(`Health endpoint ${r.status}`);
  return (await r.json()) as HealthResponse;
}

// ---------------------------------------------------------------------------
// Q&A stream (SSE)
// ---------------------------------------------------------------------------

export class QnaApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "QnaApiError";
  }
}

/**
 * Šalje pitanje na /api/qna i emituje QnaStreamEvent niz preko async
 * generator-a. Pozivalac koristi `for await`.
 *
 *   for await (const ev of streamQna({pitanje: "..."}, signal)) {
 *     if (ev.tip === "token") setOdgovor(t => t + ev.tekst);
 *     ...
 *   }
 *
 * signal: AbortSignal za otkazivanje (npr. korisnik napušta stranicu).
 */
export async function* streamQna(
  req: QnaRequest,
  signal?: AbortSignal,
): AsyncGenerator<QnaStreamEvent, void, void> {
  const res = await fetch(`${API_BASE}/api/qna`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    const tekst = await res.text();
    let poruka = tekst;
    try {
      const json = JSON.parse(tekst) as { greska?: string };
      if (json.greska) poruka = json.greska;
    } catch {
      /* nije JSON, ostavi sirov tekst */
    }
    throw new QnaApiError(poruka, res.status);
  }
  if (!res.body) {
    throw new QnaApiError("Server nije vratio stream odgovora.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE event-i su razdvojeni "\n\n".
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part) continue;
        for (const line of part.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            yield JSON.parse(payload) as QnaStreamEvent;
          } catch (e) {
            console.warn("[qna] neuspjelo parsiranje SSE event-a:", payload, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Documents API (ingest ekran)
// ---------------------------------------------------------------------------

export class DocumentsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalji?: unknown,
  ) {
    super(message);
    this.name = "DocumentsApiError";
  }
}

async function obradiGreskuOdgovora(r: Response): Promise<DocumentsApiError> {
  const tekst = await r.text();
  let poruka = `HTTP ${r.status}`;
  let detalji: unknown = undefined;
  try {
    const json = JSON.parse(tekst) as { greska?: string; detalji?: unknown };
    if (json.greska) poruka = json.greska;
    if (json.detalji !== undefined) detalji = json.detalji;
  } catch {
    if (tekst) poruka = tekst;
  }
  return new DocumentsApiError(poruka, r.status, detalji);
}

/** Multipart POST /api/documents — vraća kreirani DocumentMeta. */
export async function uploadDokument(
  fajl: File,
  metapodaci: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<DocumentMeta> {
  const fd = new FormData();
  fd.append("file", fajl);
  fd.append("metadata", JSON.stringify(metapodaci));

  const r = await fetch(`${API_BASE}/api/documents`, {
    method: "POST",
    body: fd,
    signal,
  });
  if (!r.ok) throw await obradiGreskuOdgovora(r);
  return (await r.json()) as DocumentMeta;
}

/** GET /api/documents/:id/status — polling tokom ingest pipeline-a. */
export async function getIngestStatus(id: string): Promise<IngestStatus> {
  const r = await fetch(`${API_BASE}/api/documents/${id}/status`);
  if (!r.ok) throw await obradiGreskuOdgovora(r);
  return (await r.json()) as IngestStatus;
}

/** GET /api/documents — lista sa filterima i paginacijom. */
export async function listDokumenata(
  filteri: DocumentListQuery = {},
): Promise<DocumentListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filteri)) {
    if (v === undefined || v === "" || v === null) continue;
    qs.set(k, String(v));
  }
  const path = qs.toString().length > 0 ? `?${qs.toString()}` : "";
  const r = await fetch(`${API_BASE}/api/documents${path}`);
  if (!r.ok) throw await obradiGreskuOdgovora(r);
  return (await r.json()) as DocumentListResponse;
}

/** DELETE /api/documents/:id — soft delete. */
export async function deleteDokument(id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/documents/${id}`, { method: "DELETE" });
  if (!r.ok) throw await obradiGreskuOdgovora(r);
}
