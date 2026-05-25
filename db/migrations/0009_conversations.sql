-- =====================================================================
-- 0009 — chat.razgovori i chat.poruke
-- Perzistencija multi-turn Q&A razgovora. Bez auth-a (MVP) — vlasništvo
-- se određuje preko `sesija_id` koji frontend čuva u localStorage.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE chat.razgovori (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UUID koji frontend generiše pri prvoj posjeti i čuva u localStorage.
  -- Mijenja se samo ako korisnik obriše storage / koristi drugi browser.
  sesija_id    UUID         NOT NULL,
  naslov       TEXT         NOT NULL,
  kreirano     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  azurirano    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Soft delete da bismo zadržali audit trag; query filtriraju `IS NULL`.
  obrisano     TIMESTAMPTZ  NULL,

  CONSTRAINT razgovori_naslov_nonempty CHECK (length(naslov) > 0)
);

-- Lista razgovora za sidebar — najnoviji prvo, po sesiji.
CREATE INDEX razgovori_sesija_idx
  ON chat.razgovori (sesija_id, azurirano DESC)
  WHERE obrisano IS NULL;

CREATE TABLE chat.poruke (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  razgovor_id   UUID         NOT NULL
                REFERENCES chat.razgovori (id) ON DELETE CASCADE,
  -- 0-based redoslijed unutar razgovora.
  redni_broj    INTEGER      NOT NULL,
  uloga         TEXT         NOT NULL,
  tekst         TEXT         NOT NULL,
  -- Citati iz AI poruke (JSON-serijalizovani Citat[]). NULL za user poruke.
  citati        JSONB        NULL,
  kreirano      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT poruke_uloga_check CHECK (uloga IN ('user', 'ai')),
  CONSTRAINT poruke_redni_uq UNIQUE (razgovor_id, redni_broj),
  CONSTRAINT poruke_tekst_nonempty CHECK (length(tekst) > 0)
);

-- Učitavanje punog razgovora — sve poruke u redoslijedu.
CREATE INDEX poruke_razgovor_idx ON chat.poruke (razgovor_id, redni_broj);

COMMENT ON TABLE chat.razgovori IS 'Q&A razgovori, grupisani po browser sesiji.';
COMMENT ON TABLE chat.poruke IS 'Pojedinačne poruke unutar razgovora (user i ai).';
COMMENT ON COLUMN chat.poruke.citati IS 'Citat[] JSON za ai poruke; NULL za user.';
