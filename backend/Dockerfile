# Backend image — Node.js 20 + tsx runtime.
#
# Build context je root monorepa (vidi docker-compose.yml `context: .`),
# pa COPY putanje uključuju workspace prefiks (`backend/`, `shared/`).
# Konzervativno koristimo node:20-slim (Debian) umjesto alpine da
# izbjegnemo glibc/musl pitanja sa eventualnim native modulima.

FROM node:20-slim

WORKDIR /app

# Layer 1: lock-files i workspace package.json fajlovi za stabilan
# npm install cache (rebuild samo kad se zavisnosti promijene).
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Instaliraj sve workspace zavisnosti. tsx je devDependency ali ga
# `start` skripta koristi u runtime-u, pa ne smijemo --omit=dev.
RUN npm install --no-audit --no-fund

# Bazni tsconfig — backend/shared `tsconfig.json` ga extend-uju
# (`../tsconfig.base.json`); tsx ga čita za path/type resolution.
COPY tsconfig.base.json ./

# Layer 2: izvorni kod backend-a i shared tipova. Frontend se ne kopira
# (ima svoj image).
COPY shared ./shared
COPY backend ./backend

# Migracioni runner (`backend/scripts/migrate.ts`) čita SQL fajlove iz
# `/app/db/migrations` (resolve ../../db/migrations). Bez ovoga `npm run
# migrate` puca sa ENOENT na startu kontejnera.
COPY db ./db

# Migracije pišu u app dir kroz `MONOREPO_ROOT` u storage.ts; eksplicitno
# napravi folder za uploads i daj write dozvole node korisniku.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migracije su idempotentne (hash-tracked), pa ih okidamo na svaki start.
# Ako baza još ne odgovara (race sa postgres health-check-om), restart
# policy u compose-u će pokušati ponovo.
CMD ["sh", "-c", "npm run migrate --workspace=backend && npm run start --workspace=backend"]
