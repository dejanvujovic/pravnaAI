-- =====================================================================
-- RTCG Legal AI — inicijalne ekstenzije baze
-- Izvršava se automatski pri prvom kreiranju Postgres volumena.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Šeme za logičko razdvajanje
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS audit;
