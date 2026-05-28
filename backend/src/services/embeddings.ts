/**
 * Klijent ka BGE-M3 embedding sidecar servisu.
 * Servis radi u zasebnom Docker kontejneru, izlaže HTTP API na portu 8001.
 */

import { config } from "../config.js";

interface EmbedResponseBody {
  embeddings: number[][];
  model: string;
  dim: number;
}

interface HealthResponseBody {
  status: "ok" | "loading";
  model: string;
  dim: number | null;
}

export type EmbeddingsStatus = "ok" | "loading" | "down";

/**
 * Maksimalni broj pokušaja po pozivu /embed prije nego što propustimo grešku.
 * Pokriva: cold-start (model još učitava, sidecar vraća 503), tranzijentne
 * `fetch failed` (TCP reset / keepalive timeout), kratke uvicorn pauze pri
 * GC-u. Permanentne greške (npr. 400 zbog prevelikog teksta) ne retry-jamo.
 */
const EMBED_RETRY_MAX = 3;

/** Backoff između pokušaja (ms): 1s, 3s, 9s — exponential. */
function backoffMs(attempt: number): number {
  return 1000 * 3 ** attempt;
}

/**
 * Pošalji do MAX_BATCH tekstova u jednom pozivu sidecar-a.
 * Za veće liste koristi `embedBatched` koji interno dijeli na batch-eve.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < EMBED_RETRY_MAX; attempt++) {
    try {
      const r = await fetchWithTimeout(
        `${config.embeddings.url}/embed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts }),
        },
        config.embeddings.timeoutMs,
      );

      // 503 = model još nije učitan. Retry je smislen.
      if (r.status === 503) {
        const body = await r.text();
        lastErr = new Error(`Embedding servis još nije spreman (503): ${body}`);
        if (attempt < EMBED_RETRY_MAX - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastErr;
      }

      if (!r.ok) {
        // Ostale ne-2xx (npr. 400 validacija) su permanentne — ne retry.
        const body = await r.text();
        throw new Error(`Embedding servis greška ${r.status}: ${body}`);
      }

      const data = (await r.json()) as EmbedResponseBody;

      if (data.dim !== config.embeddings.dim) {
        throw new Error(
          `Embedding dimenzija ${data.dim} ne odgovara konfigurisanoj ${config.embeddings.dim}. ` +
            `Šema baze ima vector(${config.embeddings.dim}) — promjena dimenzije zahtijeva re-indeksiranje.`,
        );
      }

      return data.embeddings;
    } catch (e) {
      // Mrežne greške (`fetch failed`, TCP reset) su tranzijentne — retry.
      // AbortError (naš timeout) takođe retry-ujemo jer drugi pokušaj može
      // proći ako je sidecar bio zauzet GC-em ili kratko unavailable.
      if (!isRetryableError(e)) throw e;
      lastErr = e;
      if (attempt < EMBED_RETRY_MAX - 1) {
        console.warn(
          `[embeddings] pokušaj ${attempt + 1}/${EMBED_RETRY_MAX} neuspjeo: ${
            e instanceof Error ? e.message : String(e)
          }. Retry za ${backoffMs(attempt)}ms.`,
        );
        await sleep(backoffMs(attempt));
      }
    }
  }

  throw lastErr ?? new Error("Embedding poziv neuspjeo bez konkretne greške.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // undici `fetch failed` (sa cause = network error), TCP reset, ECONNRESET,
  // AbortError od naseg timeout-a. Sve smatramo tranzijentnim.
  if (e.name === "AbortError") return true;
  if (e.message.includes("fetch failed")) return true;
  if (e.message.includes("ECONNRESET")) return true;
  if (e.message.includes("ECONNREFUSED")) return true;
  if (e.message.includes("ETIMEDOUT")) return true;
  return false;
}

/** Veličina jednog batch-a ka sidecar-u — polovina sidecar max-a (32). */
export const EMBED_BATCH_SIZE = 16;

/**
 * Embeduj proizvoljnu listu tekstova dijeleći je na batch-eve.
 * Greška u jednom batch-u prekida cijelu listu i propagira se naviše —
 * caller je odgovoran za rollback / state cleanup.
 */
export async function embedBatched(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embed(batch);
    out.push(...vectors);
  }
  return out;
}

export async function pingEmbeddings(): Promise<EmbeddingsStatus> {
  try {
    const r = await fetchWithTimeout(
      `${config.embeddings.url}/health`,
      { method: "GET" },
      5_000,
    );
    if (!r.ok) return "down";
    const body = (await r.json()) as HealthResponseBody;
    return body.status === "ok" ? "ok" : "loading";
  } catch {
    return "down";
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
