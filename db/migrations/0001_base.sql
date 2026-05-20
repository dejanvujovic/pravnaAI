-- =====================================================================
-- 0001 — Base: pretpostavlja postojanje šema iz db/init/01_extensions.sql.
-- Kreira tabelu za praćenje migracija; ne treba je dirati ručno.
-- =====================================================================

-- Provjera da su sve potrebne ekstenzije instalirane.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'Ekstenzija vector (pgvector) nije instalirana';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    RAISE EXCEPTION 'Ekstenzija pg_trgm nije instalirana';
  END IF;
END
$$;

-- Helper: trigger funkcija koja postavlja `azurirano` pri svakom UPDATE-u.
CREATE OR REPLACE FUNCTION public.set_azurirano() RETURNS TRIGGER AS $$
BEGIN
  NEW.azurirano = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
