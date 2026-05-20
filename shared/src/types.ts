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
  skor: number;
  metapodaci: Pick<DocumentMeta, "tip" | "oblast" | "datum" | "organSud">;
}

export interface SearchResponse {
  pogoci: SearchHit[];
  trajanjeMs: number;
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
  verzija: string;
}
