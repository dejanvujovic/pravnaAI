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
 * Pošalji do MAX_BATCH tekstova u jednom pozivu sidecar-a.
 * Za veće liste koristi `embedBatched` koji interno dijeli na batch-eve.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const r = await fetchWithTimeout(
    `${config.embeddings.url}/embed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    },
    config.embeddings.timeoutMs,
  );

  if (!r.ok) {
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
