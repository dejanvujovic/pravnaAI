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
