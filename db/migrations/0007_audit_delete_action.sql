-- =====================================================================
-- 0007 — Dodaj 'DELETE' u dozvoljene akcije audit.ingest_log
-- Soft delete preko DELETE /api/documents/:id loguje se kao DELETE/OK.
-- =====================================================================

ALTER TABLE audit.ingest_log
  DROP CONSTRAINT ingest_log_akcija_check;

ALTER TABLE audit.ingest_log
  ADD CONSTRAINT ingest_log_akcija_check CHECK (akcija IN (
    'UPLOAD', 'HASH_CHECK', 'OCR_START', 'OCR_DONE',
    'PARSE_DOCX', 'PARSE_PDF', 'CHUNK', 'EMBED', 'FAILED', 'DELETE'
  ));
