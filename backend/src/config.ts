import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// .env živi u root-u monorepa, a backend cwd je `backend/` kad ga starta npm
// workspace skripta. Eksplicitno učitavamo iz root-a.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "..", "..", ".env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Nedostaje obavezna environment varijabla: ${name}`);
  }
  return v;
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

function intOpt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v || v.trim() === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment varijabla ${name} mora biti broj, dobijeno: ${v}`);
  return n;
}

export const config = {
  port: intOpt("PORT", 4000),
  nodeEnv: opt("NODE_ENV", "development") as "development" | "production" | "test",

  postgres: {
    host: opt("PGHOST", "localhost"),
    port: intOpt("PGPORT", 5432),
    user: opt("PGUSER", "rtcg"),
    password: opt("PGPASSWORD", ""),
    database: opt("PGDATABASE", "rtcg_legal_ai"),
  },

  anthropic: {
    // Ključ je obavezan tek kad se RAG endpoint stvarno koristi —
    // čitamo ga "lazy" kroz `req("ANTHROPIC_API_KEY")` u modulu koji
    // poziva Claude API, ne ovdje.
    model: opt("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  },

  embeddings: {
    url: opt("EMBEDDINGS_URL", "http://localhost:8001"),
    dim: 1024,
    timeoutMs: 60_000,
  },

  ocr: {
    url: opt("OCR_URL", "http://localhost:8002"),
    languages: opt("TESSERACT_LANGS", "srp+srp_latn"),
    dpi: intOpt("OCR_DPI", 300),
    // OCR scan dokumenta na više desetina strana može trajati par minuta.
    timeoutMs: 5 * 60 * 1000,
    uploadsDir: opt("UPLOADS_DIR", "./data/uploads"),
  },
} as const;

export function getAnthropicApiKey(): string {
  return req("ANTHROPIC_API_KEY");
}
