-- =====================================================================
-- 0005 — Kolona za izvorni tekst dokumenta
-- Popunjava se u ingest pipeline-u nakon parsiranja PDF/DOCX.
-- Velika polja idu kroz TOAST automatski.
-- =====================================================================

ALTER TABLE documents.documents
  ADD COLUMN tekst TEXT NULL;

-- Trigram indeks na cijeli tekst — koristi se za fuzzy/keyword pretragu
-- nezavisno od RAG embeddinga. Korisno za pronalaženje doslovnih izraza
-- (npr. "član 92 stav 3") kad semantička pretraga promaši.
CREATE INDEX documents_tekst_trgm_idx
  ON documents.documents
  USING GIN (tekst gin_trgm_ops);

COMMENT ON COLUMN documents.documents.tekst IS
  'Sirov ekstraktovan tekst iz PDF/DOCX-a. Prazno za scan dokumente dok OCR ne odradi posao.';
