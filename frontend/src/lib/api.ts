/**
 * API klijent — fetch wrapper za backend /api/* endpointe.
 *
 * Glavni izazov: /api/qna vraća text/event-stream sa QnaStreamEvent-ovima.
 * Browser EventSource ne podržava POST, pa parsiramo SSE ručno preko
 * fetch + ReadableStream.
 */

import type { HealthResponse, QnaRequest, QnaStreamEvent } from "@rtcg/shared";

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
