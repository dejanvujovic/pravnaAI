# Postgres image sa baked-in init skriptama.
#
# Razlog: u Portainer Web Editor / GHCR deployment-u nema bind mount-a na
# `./db/init` (repo fajlovi nisu na disku servera). Init skripte
# (`01_extensions.sql` — CREATE EXTENSION vector, pg_trgm, unaccent) se
# pakuju u sliku. Postgres ih izvršava SAMO pri prvom bootu (prazan data
# dir); na postojećem volume-u se preskaču.

FROM pgvector/pgvector:pg16

COPY init/ /docker-entrypoint-initdb.d/
