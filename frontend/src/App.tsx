import { useEffect, useState } from "react";
import type { HealthResponse } from "@rtcg/shared";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((e: unknown) => setGreska(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>RTCG Legal AI</h1>
      <p style={{ color: "#555" }}>
        Interni sistem pravne službe Radio-televizije Crne Gore.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Stanje sistema</h2>
        {greska && <p style={{ color: "#b00020" }}>Greška: {greska}</p>}
        {!greska && !health && <p>Provjera...</p>}
        {health && (
          <ul>
            <li>Status: <strong>{health.status}</strong></li>
            <li>PostgreSQL: {health.postgres}</li>
            <li>pgvector: {health.pgvector}</li>
            <li>Embeddings (BGE-M3): {health.embeddings}</li>
            <li>OCR (Tesseract): {health.ocr}</li>
            <li>Verzija: {health.verzija}</li>
            <li>Vrijeme: {new Date(health.vrijeme).toLocaleString("sr-Latn-ME")}</li>
          </ul>
        )}
      </section>
    </main>
  );
}
