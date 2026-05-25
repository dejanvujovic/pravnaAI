-- =====================================================================
-- 0008 — Dodaj 'EDIT' u dozvoljene akcije audit.ingest_log
-- Korisnik može da izmijeni metapodatke postojećeg dokumenta preko
-- PATCH /api/documents/:id (npr. ispravka naslova ili tipa poslije
-- automatske ekstrakcije).
-- =====================================================================

ALTER TABLE audit.ingest_log
  DROP CONSTRAINT ingest_log_akcija_check;

ALTER TABLE audit.ingest_log
  ADD CONSTRAINT ingest_log_akcija_check CHECK (akcija IN (
    'UPLOAD', 'HASH_CHECK', 'OCR_START', 'OCR_DONE',
    'PARSE_DOCX', 'PARSE_PDF', 'CHUNK', 'EMBED', 'FAILED',
    'DELETE', 'EDIT'
  ));
