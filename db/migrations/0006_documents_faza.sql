-- =====================================================================
-- 0006 — Faza ingest pipeline-a + greška
-- Async chunking + embedding korak može trajati sekundama/minutama
-- nakon što HTTP upload vrati 201. Pratimo stanje u DB-u radi:
--   1) polling endpoint-a (GET /api/documents/:id/status → IngestStatus)
--   2) startup recovery-ja za dokumente zaglavljene crash-om
-- =====================================================================

ALTER TABLE documents.documents
  ADD COLUMN faza TEXT NOT NULL DEFAULT 'ZAVRSENO',
  ADD COLUMN ingest_greska TEXT NULL;

-- Spec dozvoljene vrijednosti (IngestStage iz @rtcg/shared).
-- PARSIRANJE se ne čuva u DB-u (parsing se desi prije INSERT-a),
-- ali ga ostavljamo u CHECK-u za forward-compatibility.
ALTER TABLE documents.documents
  ADD CONSTRAINT documents_faza_check CHECK (faza IN (
    'PARSIRANJE', 'CHUNKING', 'EMBEDDING', 'INDEKSIRANJE',
    'ZAVRSENO', 'GRESKA'
  ));

-- Postojeći dokumenti (uneseni prije ove migracije) tretirani su kao
-- ZAVRSENO — chunkovi će biti dodani manuelnim re-indeksom kasnije.
-- Default kolone već postavlja 'ZAVRSENO'.

-- Indeks za worker / recovery koji traži zaglavljene jobove.
CREATE INDEX documents_faza_recovery_idx
  ON documents.documents (faza)
  WHERE faza IN ('CHUNKING', 'EMBEDDING', 'INDEKSIRANJE');

COMMENT ON COLUMN documents.documents.faza IS
  'Stanje async ingest pipeline-a; ZAVRSENO znači da su svi chunkovi indeksirani.';
COMMENT ON COLUMN documents.documents.ingest_greska IS
  'Poruka greške ako je faza = GRESKA; null inače.';
