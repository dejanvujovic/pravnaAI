# RTCG Legal AI

Interni RAG sistem za pravnu službu Radio-televizije Crne Gore.

## Struktura monorepa

```
pravnaAI/
├── backend/        Node.js + Express + TypeScript (API, RAG, ingest)
├── frontend/       React + TypeScript + Vite (UI na crnogorskom)
├── shared/         Zajednički TS tipovi (@rtcg/shared)
├── db/init/        SQL skripte koje se izvršavaju pri prvom Postgres bootu
├── docker-compose.yml   Postgres 16 + pgvector
└── package.json    npm workspaces (root)
```

## Preduslovi

- Node.js ≥ 20.10
- Docker Desktop (ili Docker Engine + Compose v2)
- (Faza 1) Tesseract 5.x sa srpskim jezičkim paketima — `srp`, `srp_latn`

## Pokretanje (lokalno)

```bash
# 1. Instaliraj zavisnosti za sve workspaces
npm install

# 2. Kopiraj env template i popuni ANTHROPIC_API_KEY
cp .env.example .env

# 3. Podigni Postgres + pgvector
npm run db:up

# 4. Backend (port 4000) i frontend (port 5173) u zasebnim terminalima
npm run dev:backend
npm run dev:frontend
```

Otvori http://localhost:5173 — početna strana zove `/api/health` koji vraća status Postgres-a i pgvector ekstenzije.

## Faze razvoja

| Faza | Period | Sadržaj |
|------|--------|---------|
| 1 — MVP | jun/jul 2026 | Ingest tool (PDF/DOCX + OCR), semantička pretraga, Q&A sa citiranjem |
| 2 — Produkcija | avg/sep 2026 | LDAP/AD, audit, monitoring, hardening |
| 3 — Contract Intelligence | okt/nov 2026 | Analiza rizika, Word eksport sa tracked changes |

## Korisne komande

```bash
npm run typecheck     # provjeri tipove svuda
npm run db:psql       # uđi u psql shell u kontejneru
npm run db:logs       # prati Postgres logove
npm run db:down       # zaustavi Postgres (volume ostaje)
```
