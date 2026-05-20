-- =====================================================================
-- 0003 — rag.chunks
-- Tekst dokumenata izdjeljen na djelove (chunks) + BGE-M3 embeddinzi.
-- Vektorska dimenzija je 1024 (BGE-M3). Promjena modela = re-indeksiranje.
-- =====================================================================

CREATE TABLE rag.chunks (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID         NOT NULL
                      REFERENCES documents.documents (id) ON DELETE CASCADE,

  -- Redoslijed unutar dokumenta (0-based).
  redni_broj          INTEGER      NOT NULL,

  -- Sadržaj
  sadrzaj             TEXT         NOT NULL,
  broj_tokena         INTEGER      NULL,

  -- Pozicija u izvornom dokumentu (best-effort; može biti NULL).
  strana_od           INTEGER      NULL,
  strana_do           INTEGER      NULL,

  -- Strukturna putanja kad detektujemo zakonsku strukturu,
  -- npr. "Glava II / Član 14" ili "II. Predmet ugovora / Tačka 3".
  struktura_putanja   TEXT         NULL,

  -- BGE-M3 embedding (cosine sličnost).
  embedding           vector(1024) NULL,

  -- Audit
  kreirano            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  embedded_u          TIMESTAMPTZ  NULL,

  CONSTRAINT chunks_redni_broj_uq UNIQUE (document_id, redni_broj),
  CONSTRAINT chunks_sadrzaj_nonempty CHECK (length(sadrzaj) > 0)
);

-- Range query po dokumentu (npr. svi chunks u redoslijedu).
CREATE INDEX chunks_document_idx ON rag.chunks (document_id, redni_broj);

-- Trigram indeks za leksičku (fuzzy) pretragu, hibridno sa vektorskom.
CREATE INDEX chunks_sadrzaj_trgm_idx
  ON rag.chunks
  USING GIN (sadrzaj gin_trgm_ops);

-- HNSW vektorski indeks (cosine sličnost) — gradi se nakon prvog ingest-a.
-- Parametri: m=16 (konekcije po čvoru), ef_construction=64 (kvalitet gradnje).
-- Ostavljamo bazni default; tjunirati kasnije kad imamo realan korpus.
CREATE INDEX chunks_embedding_hnsw_idx
  ON rag.chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE  rag.chunks IS 'Tekstualni djelovi dokumenata + BGE-M3 vektorski reprezent.';
COMMENT ON COLUMN rag.chunks.embedding IS '1024-dim vektor iz bge-m3, normalizovan.';
COMMENT ON COLUMN rag.chunks.struktura_putanja IS 'Putanja kroz strukturu izvornog dokumenta, ako je detektovana.';
