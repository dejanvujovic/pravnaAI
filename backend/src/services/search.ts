/**
 * Hybridna pretraga nad rag.chunks: vektorska (BGE-M3 cosine) + leksička
 * (pg_trgm `similarity`), kombinovane Reciprocal Rank Fusion-om.
 *
 * Zašto hybrid (a ne samo vektor): pravna domena često traži doslovne
 * reference tipa "član 281 stav 1" koje semantičke embeddinge mogu da
 * promaše ako se ne pojavljuju kao fraza u trening korpusu. RRF spaja
 * dva ranga bez potrebe za normalizacijom skorova (Cormack et al. 2009).
 *
 * Pipeline:
 *   1) Embed upit (BGE-M3 sidecar, 1024-dim)
 *   2) Vector ranker: cosine distance + HNSW indeks, top PRE_FETCH
 *   3) Trigram ranker: pg_trgm `%` operator + GIN indeks, top PRE_FETCH
 *   4) RRF fuzija: score(d) = sum(1/(K + rank)) preko oba rankera
 *   5) Vrati top-K po fuzionisanom skoru
 *
 * Filteri (tip, oblast, status, datumOd, datumDo) primjenjuju se na
 * documents.documents pri JOIN-u u oba sub-rankera.
 */

import type {
  DocumentMeta,
  SearchHit,
  SearchRequest,
  SearchResponse,
} from "@rtcg/shared";
import { embed } from "./embeddings.js";
import { pool } from "../db.js";

/** RRF konstanta — Cormack et al. preporučuju 60. */
const RRF_K = 60;
/** Koliko rezultata uzeti od svakog rankera prije fuzije. */
const PRE_FETCH = 50;
/** Granica koliko hit-ova vraćamo klijentu. */
export const MAX_TOP_K = 50;
export const DEFAULT_TOP_K = 10;

interface SearchRow {
  chunk_id: string;
  document_id: string;
  sadrzaj: string;
  struktura_putanja: string | null;
  /**
   * Skor relevantnosti u [0, 1] — prikazuje se korisniku kao procenat.
   * Izvor: cosine sličnost embeddinga (1 - cosine_distance). Za chunkove
   * bez embeddinga (rijetki edge case) koristimo trigram similarity.
   * RRF se koristi samo za sortiranje (vidi rrf_score interno u SQL-u).
   */
  skor: string;
  naslov: string;
  tip: string;
  oblast: string;
  datum: string | null;
  organ_sud: string | null;
}

const SEARCH_SQL = /* sql */ `
WITH vec AS (
  SELECT c.id AS chunk_id,
         ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1::vector) AS rnk
    FROM rag.chunks c
    JOIN documents.documents d ON d.id = c.document_id AND d.obrisano IS NULL
   WHERE c.embedding IS NOT NULL
     AND ($2::text[] IS NULL OR d.tip    = ANY($2::text[]))
     AND ($3::text[] IS NULL OR d.oblast = ANY($3::text[]))
     AND ($4::text[] IS NULL OR d.status = ANY($4::text[]))
     AND ($5::date   IS NULL OR d.datum >= $5::date)
     AND ($6::date   IS NULL OR d.datum <= $6::date)
   ORDER BY c.embedding <=> $1::vector
   LIMIT $9::int
),
trg AS (
  SELECT c.id AS chunk_id,
         ROW_NUMBER() OVER (ORDER BY similarity(c.sadrzaj, $7) DESC) AS rnk
    FROM rag.chunks c
    JOIN documents.documents d ON d.id = c.document_id AND d.obrisano IS NULL
   WHERE c.sadrzaj % $7
     AND ($2::text[] IS NULL OR d.tip    = ANY($2::text[]))
     AND ($3::text[] IS NULL OR d.oblast = ANY($3::text[]))
     AND ($4::text[] IS NULL OR d.status = ANY($4::text[]))
     AND ($5::date   IS NULL OR d.datum >= $5::date)
     AND ($6::date   IS NULL OR d.datum <= $6::date)
   ORDER BY similarity(c.sadrzaj, $7) DESC
   LIMIT $9::int
),
fused AS (
  SELECT chunk_id, SUM(1.0 / ($10::int + rnk)) AS rrf_score
    FROM (
      SELECT chunk_id, rnk FROM vec
      UNION ALL
      SELECT chunk_id, rnk FROM trg
    ) u
   GROUP BY chunk_id
)
SELECT f.chunk_id,
       c.document_id,
       c.sadrzaj,
       c.struktura_putanja,
       -- Skor za UI: cosine sličnost u [0,1] iz BGE-M3 embeddinga.
       -- Za chunkove bez embeddinga pada na trigram similarity.
       GREATEST(0.0, LEAST(1.0, COALESCE(
         (1.0 - (c.embedding <=> $1::vector))::float,
         similarity(c.sadrzaj, $7)::float
       )))::text AS skor,
       d.naslov,
       d.tip,
       d.oblast,
       d.datum,
       d.organ_sud
  FROM fused f
  JOIN rag.chunks c             ON c.id = f.chunk_id
  JOIN documents.documents d    ON d.id = c.document_id
 ORDER BY f.rrf_score DESC
 LIMIT $8::int
`;

/**
 * Izvuče top-K hibridnih pogodaka za zadati upit i filtere.
 *
 * Ako pg_trgm ne nađe nijedan match, ranger `trg` će biti prazan i
 * konačni skor će biti samo iz vektorskog rankera — RRF tolerantan na
 * nedostatak jednog signala.
 */
export async function search(req: SearchRequest): Promise<SearchResponse> {
  const start = Date.now();

  const topK = Math.min(Math.max(req.topK ?? DEFAULT_TOP_K, 1), MAX_TOP_K);

  // 1. Embed upit (jedan element niza).
  const vektori = await embed([req.upit]);
  const queryVec = vektori[0];
  if (!queryVec) {
    throw new Error("Embedding servis nije vratio vektor za upit.");
  }

  // 2. Hibridna SQL pretraga.
  const r = await pool.query<SearchRow>(SEARCH_SQL, [
    `[${queryVec.join(",")}]`,            // $1 — vector kao string
    req.filteri?.tip ?? null,             // $2
    req.filteri?.oblast ?? null,          // $3
    req.filteri?.status ?? null,          // $4
    req.filteri?.datumOd ?? null,         // $5
    req.filteri?.datumDo ?? null,         // $6
    req.upit,                             // $7 — trigram upit
    topK,                                 // $8
    PRE_FETCH,                            // $9
    RRF_K,                                // $10
  ]);

  const pogoci: SearchHit[] = r.rows.map(rowToHit);

  return {
    pogoci,
    trajanjeMs: Date.now() - start,
  };
}

function rowToHit(r: SearchRow): SearchHit {
  return {
    documentId: r.document_id,
    chunkId: r.chunk_id,
    naslov: r.naslov,
    // Isječak — pun chunk sadržaj. UI može da skraćuje ili highlightuje
    // ključne riječi; sirovi tekst se vraća da bi se očuvao kontekst.
    isjecak: r.sadrzaj,
    skor: parseFloat(r.skor),
    referenca: r.struktura_putanja,
    metapodaci: {
      tip: r.tip as DocumentMeta["tip"],
      oblast: r.oblast as DocumentMeta["oblast"],
      datum: r.datum,
      organSud: r.organ_sud,
    },
  };
}
