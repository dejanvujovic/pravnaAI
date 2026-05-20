-- =====================================================================
-- 0002 — Tabela documents.documents
-- Registar svih dokumenata u sistemu: zakoni, ugovori, presude, akti.
-- =====================================================================

CREATE TABLE documents.documents (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Osnovni metapodaci
  naslov                  TEXT         NOT NULL,
  tip                     TEXT         NOT NULL,
  oblast                  TEXT         NOT NULL,
  status                  TEXT         NOT NULL DEFAULT 'VAZECI',
  datum                   DATE         NULL,
  organ_sud               TEXT         NULL,
  broj_sluzbenog_lista    TEXT         NULL,

  -- Jezik i fizički atributi
  jezik                   TEXT         NOT NULL DEFAULT 'mixed',
  broj_strana             INTEGER      NULL,
  velicina_bajtova        BIGINT       NULL,

  -- Izvorni fajl (čuva se na disku, ne u bazi)
  izvorni_fajl_putanja    TEXT         NULL,
  izvorni_fajl_hash       TEXT         NULL,
  izvorni_fajl_mimetip    TEXT         NULL,

  -- OCR
  ocr_obavljen            BOOLEAN      NOT NULL DEFAULT FALSE,
  ocr_obavljen_u          TIMESTAMPTZ  NULL,

  -- Statusi obrade
  chunked_u               TIMESTAMPTZ  NULL,
  embedded_u              TIMESTAMPTZ  NULL,

  -- Audit kolone
  kreirano                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  azurirano               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  obrisano                TIMESTAMPTZ  NULL,

  -- Provjere domena (lakše promijeniti kroz migraciju nego ENUM tip)
  CONSTRAINT documents_tip_check CHECK (tip IN (
    'ZAKON', 'PODZAKONSKI_AKT', 'INTERNI_AKT',
    'UGOVOR_O_RADU', 'UGOVOR_JAVNA_NABAVKA',
    'PRESUDA', 'SUDSKA_PRAKSA', 'MISLJENJE', 'OSTALO'
  )),
  CONSTRAINT documents_oblast_check CHECK (oblast IN (
    'RADNO_PRAVO', 'JAVNE_NABAVKE', 'PARNICNI_POSTUPAK',
    'UPRAVNI_POSTUPAK', 'MEDIJSKO_PRAVO', 'OBLIGACIONO',
    'AUTORSKO', 'KRIVICNO', 'OSTALO'
  )),
  CONSTRAINT documents_status_check CHECK (status IN (
    'NACRT', 'VAZECI', 'STAVLJEN_VAN_SNAGE', 'ARHIVA'
  )),
  CONSTRAINT documents_jezik_check CHECK (jezik IN (
    'sr-Cyrl', 'sr-Latn', 'mixed'
  ))
);

-- Spriječi dvostruki ingest istog fajla (po SHA-256 hash-u sadržaja).
CREATE UNIQUE INDEX documents_hash_uq
  ON documents.documents (izvorni_fajl_hash)
  WHERE izvorni_fajl_hash IS NOT NULL AND obrisano IS NULL;

-- Filter indeksi za pretragu po taksonomiji.
CREATE INDEX documents_tip_idx     ON documents.documents (tip)     WHERE obrisano IS NULL;
CREATE INDEX documents_oblast_idx  ON documents.documents (oblast)  WHERE obrisano IS NULL;
CREATE INDEX documents_status_idx  ON documents.documents (status)  WHERE obrisano IS NULL;
CREATE INDEX documents_datum_idx   ON documents.documents (datum)   WHERE obrisano IS NULL;

-- Fuzzy pretraga po naslovu (latinica/ćirilica varijante).
CREATE INDEX documents_naslov_trgm_idx
  ON documents.documents
  USING GIN (naslov gin_trgm_ops);

CREATE TRIGGER documents_set_azurirano
  BEFORE UPDATE ON documents.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_azurirano();

COMMENT ON TABLE  documents.documents IS 'Registar svih dokumenata. Soft delete preko `obrisano` kolone.';
COMMENT ON COLUMN documents.documents.izvorni_fajl_hash IS 'SHA-256 sirovih bajtova; spriječava dvostruki ingest.';
COMMENT ON COLUMN documents.documents.jezik IS 'Detektovan ili eksplicitno postavljen tokom ingest-a.';
