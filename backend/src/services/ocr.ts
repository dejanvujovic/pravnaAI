/**
 * Klijent ka OCR sidecar servisu (Tesseract 5).
 *
 * Sidecar radi u zasebnom Docker kontejneru i prima PDF preko multipart
 * upload-a. Vraća tekst po stranicama. Backend ga zove samo kad digitalna
 * ekstrakcija teksta vrati prazno (skenirani dokumenti).
 */

import { config } from "../config.js";

export type OcrStatus = "ok" | "down";

export interface OcrPage {
  redni_broj: number;
  tekst: string;
}

export interface OcrResult {
  strane: OcrPage[];
  broj_strana: number;
  duzina_teksta: number;
  trajanje_ms: number;
  jezici: string;
  dpi: number;
}

export interface OcrHealth {
  status: "ok";
  tesseract_verzija: string;
  jezici_default: string;
}

export async function pingOcr(): Promise<OcrStatus> {
  try {
    const r = await fetchWithTimeout(
      `${config.ocr.url}/health`,
      { method: "GET" },
      5_000,
    );
    if (!r.ok) return "down";
    const body = (await r.json()) as OcrHealth;
    return body.status === "ok" ? "ok" : "down";
  } catch {
    return "down";
  }
}

/**
 * Pošalji PDF buffer ka OCR sidecar-u i vrati izvučeni tekst po strani.
 * Greška servisa baca — pozivalac ga loguje kao FAILED audit zapis i
 * vraća dokument bez OCR teksta (može se reindeksirati kasnije).
 */
export async function ocrPdf(buffer: Buffer, filename: string): Promise<OcrResult> {
  const fd = new FormData();
  // Node fetch koristi Web FormData; Blob iz Buffer-a:
  const blob = new Blob([buffer], { type: "application/pdf" });
  fd.append("file", blob, filename);

  const r = await fetchWithTimeout(
    `${config.ocr.url}/ocr`,
    { method: "POST", body: fd },
    config.ocr.timeoutMs,
  );

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`OCR servis greška ${r.status}: ${body}`);
  }

  return (await r.json()) as OcrResult;
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
