/**
 * Zajednički tipovi koje dijele backend i frontend.
 * API kontrakti, taksonomija dokumenata, enumeracije.
 *
 * Pravilo: ovdje samo tipovi i const enumeracije — bez runtime logike,
 * bez Node-specific ili browser-specific importa.
 */

// ---------------------------------------------------------------------------
// Taksonomija dokumenata
// ---------------------------------------------------------------------------

export const DocumentType = {
  ZAKON: "ZAKON",
  PODZAKONSKI_AKT: "PODZAKONSKI_AKT",
  INTERNI_AKT: "INTERNI_AKT",
  UGOVOR_O_RADU: "UGOVOR_O_RADU",
  UGOVOR_JAVNA_NABAVKA: "UGOVOR_JAVNA_NABAVKA",
  PRESUDA: "PRESUDA",
  SUDSKA_PRAKSA: "SUDSKA_PRAKSA",
  MISLJENJE: "MISLJENJE",
  OSTALO: "OSTALO",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const LegalArea = {
  RADNO_PRAVO: "RADNO_PRAVO",
  JAVNE_NABAVKE: "JAVNE_NABAVKE",
  PARNICNI_POSTUPAK: "PARNICNI_POSTUPAK",
  UPRAVNI_POSTUPAK: "UPRAVNI_POSTUPAK",
  MEDIJSKO_PRAVO: "MEDIJSKO_PRAVO",
  OBLIGACIONO: "OBLIGACIONO",
  AUTORSKO: "AUTORSKO",
  KRIVICNO: "KRIVICNO",
  OSTALO: "OSTALO",
} as const;
export type LegalArea = (typeof LegalArea)[keyof typeof LegalArea];

export const DocumentStatus = {
  NACRT: "NACRT",
  VAZECI: "VAZECI",
  STAVLJEN_VAN_SNAGE: "STAVLJEN_VAN_SNAGE",
  ARHIVA: "ARHIVA",
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/**
 * Vizuelne grupe za UI (boja/ikonica). Više DocumentType vrijednosti
 * mapira se na jednu grupu — npr. obje vrste ugovora u UGOVOR.
 * Mapiranje DocumentType -> DocumentGroup drži frontend, ne shared.
 */
export const DocumentGroup = {
  PROPIS: "PROPIS",   // ZAKON, PODZAKONSKI_AKT
  PRAKSA: "PRAKSA",   // PRESUDA, SUDSKA_PRAKSA, MISLJENJE
  UGOVOR: "UGOVOR",   // UGOVOR_O_RADU, UGOVOR_JAVNA_NABAVKA
  INTERNI: "INTERNI", // INTERNI_AKT, OSTALO
} as const;
export type DocumentGroup = (typeof DocumentGroup)[keyof typeof DocumentGroup];

// ---------------------------------------------------------------------------
// Document model (API view)
// ---------------------------------------------------------------------------

export interface DocumentMeta {
  id: string;
  naslov: string;
  tip: DocumentType;
  oblast: LegalArea;
  status: DocumentStatus;
  datum: string | null; // ISO 8601, npr. "2024-03-15"
  organSud: string | null; // organ koji je donio dokument, ili sud
  brojSluzbenogLista: string | null;
  jezik: "sr-Cyrl" | "sr-Latn" | "mixed";
  brojStrana: number | null;
  velicinaBajtova: number | null;
  brojSegmenata: number; // broj chunkova u pgvector
  kreirano: string; // ISO timestamp
  azurirano: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// RAG / pretraga
// ---------------------------------------------------------------------------

export interface SearchRequest {
  upit: string;
  filteri?: {
    tip?: DocumentType[];
    oblast?: LegalArea[];
    status?: DocumentStatus[];
    datumOd?: string;
    datumDo?: string;
  };
  topK?: number;
}

export interface SearchHit {
  documentId: string;
  chunkId: string;
  naslov: string;
  isjecak: string;
  skor: number; // 0..1, cosine similarity
  referenca: string | null; // "čl. 281, st. 1" — ako je izvučeno iz strukture
  metapodaci: Pick<DocumentMeta, "tip" | "oblast" | "datum" | "organSud">;
}

export interface SearchResponse {
  pogoci: SearchHit[];
  trajanjeMs: number;
}

// ---------------------------------------------------------------------------
// Q&A (generisani odgovor sa citiranjem) — chat ekran
// ---------------------------------------------------------------------------

/** Citiran izvor uz AI odgovor. Izveden iz SearchHit, obogaćen za prikaz. */
export interface Citat {
  documentId: string;
  chunkId: string;
  naslov: string; // "Zakon o parničnom postupku"
  referenca: string | null; // "čl. 281, st. 1"
  isjecak: string;
  skor: number; // 0..1
  tip: DocumentType;
}

export interface QnaRequest {
  pitanje: string;
  filteri?: SearchRequest["filteri"];
}

/** Konačan odgovor (JSON ili završni SSE event). */
export interface QnaResponse {
  odgovor: string; // markdown / paragrafi
  citati: Citat[]; // prazno => UI prikazuje upozorenje, ne tihi odgovor
  model: string; // npr. "claude-sonnet-4-..."
  trajanjeMs: number;
}

/** SSE event tokom streaminga Q&A odgovora. */
export type QnaStreamEvent =
  | { tip: "token"; tekst: string }
  | { tip: "citati"; citati: Citat[] }
  | { tip: "kraj"; model: string; trajanjeMs: number }
  | { tip: "greska"; poruka: string };

// ---------------------------------------------------------------------------
// Unos dokumenata (ingest)
// ---------------------------------------------------------------------------

export const IngestStage = {
  PARSIRANJE: "PARSIRANJE",
  CHUNKING: "CHUNKING",
  EMBEDDING: "EMBEDDING",
  INDEKSIRANJE: "INDEKSIRANJE",
  ZAVRSENO: "ZAVRSENO",
  GRESKA: "GRESKA",
} as const;
export type IngestStage = (typeof IngestStage)[keyof typeof IngestStage];

/** Redoslijed faza za prikaz progresa (<Pipeline>). */
export const INGEST_STAGE_ORDER: readonly IngestStage[] = [
  IngestStage.PARSIRANJE,
  IngestStage.CHUNKING,
  IngestStage.EMBEDDING,
  IngestStage.INDEKSIRANJE,
] as const;

export interface IngestStatus {
  id: string;
  naziv: string;
  velicinaBajtova: number | null;
  tip: DocumentType; // auto-pogođen pri unosu, korisnik može promijeniti
  oblast: LegalArea | null; // opciono klasifikovano
  faza: IngestStage;
  brojSegmenata: number; // raste kroz faze
  ocr: boolean; // da li je primijenjen OCR (skeniran dokument)
  greska: string | null; // popunjeno kada faza === GRESKA
}

/** Izmjena klasifikacije prije/tokom obrade — PATCH /api/ingest/:id */
export interface IngestPatchRequest {
  tip?: DocumentType;
  oblast?: LegalArea;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: "ok" | "degraded";
  vrijeme: string;
  postgres: "ok" | "down";
  pgvector: "ok" | "missing";
  embeddings: "ok" | "loading" | "down";
  ocr: "ok" | "down";
  verzija: string;
}

// ---------------------------------------------------------------------------
// Greške
// ---------------------------------------------------------------------------

/** Jedinstven oblik greške koji API vraća uz ne-2xx status. */
export interface ApiError {
  kod: string; // mašinski čitljiv, npr. "INGEST_FAILED"
  poruka: string; // poruka za korisnika, na crnogorskom
}
