-- =====================================================================
-- 0004 — audit.ingest_log
-- Trag svake operacije nad dokumentima: upload, OCR, chunking, embedding.
-- Koristi se za debugging ingest pipeline-a i za prikaz progresa u UI-u.
-- =====================================================================

CREATE TABLE audit.ingest_log (
  id            BIGSERIAL    PRIMARY KEY,
  document_id   UUID         NULL
                REFERENCES documents.documents (id) ON DELETE SET NULL,
  akcija        TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'OK',
  detalji       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  greska        TEXT         NULL,
  trajanje_ms   INTEGER      NULL,
  kreirano      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ingest_log_akcija_check CHECK (akcija IN (
    'UPLOAD', 'HASH_CHECK', 'OCR_START', 'OCR_DONE',
    'PARSE_DOCX', 'PARSE_PDF', 'CHUNK', 'EMBED', 'FAILED'
  )),
  CONSTRAINT ingest_log_status_check CHECK (status IN ('OK', 'GRESKA', 'PRESKOCENO'))
);

CREATE INDEX ingest_log_document_idx ON audit.ingest_log (document_id, kreirano DESC);
CREATE INDEX ingest_log_kreirano_idx ON audit.ingest_log (kreirano DESC);

COMMENT ON TABLE audit.ingest_log IS 'Audit trag ingest pipeline-a — UPLOAD do EMBED.';
