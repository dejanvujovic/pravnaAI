# RTCG Legal AI

Interni AI sistem za pravnu službu Radio-televizije Crne Gore.

Sistem omogućava (1) **semantičku pretragu i pitanja–odgovori na crnogorskom jeziku** nad korpusom crnogorskih zakona, internih akata RTCG-a, ugovora i sudskih presuda, uz obavezno navođenje izvora, i (2) **analizu rizika u ugovorima** u odnosu na crnogorsku sudsku praksu (Faza 3).

Cijeli stack se hostuje interno — podaci ne napuštaju RTCG infrastrukturu osim kontrolisanih poziva ka Claude API-ju za generativni dio.

> **Konvencija**: sav user-facing tekst (UI, API poruke, komentari u kodu, dokumentacija, commit poruke) piše se na **crnogorskom jeziku, ijekavica**. Ekavski oblici se ne koriste.

---

## Sadržaj

- [Faze razvoja i trenutno stanje](#faze-razvoja-i-trenutno-stanje)
- [Arhitektura](#arhitektura)
- [Tehnološki stack](#tehnološki-stack)
- [Brzi start (novi računar)](#brzi-start-novi-računar)
- [Detaljan setup](#detaljan-setup)
- [Razvojni tok (Git + CI)](#razvojni-tok-git--ci)
- [Struktura repozitorijuma](#struktura-repozitorijuma)
- [Frontend specifikacija](#frontend-specifikacija)
- [Ugovor sa backendom (tipovi)](#ugovor-sa-backendom-tipovi)
- [API endpointi](#api-endpointi)
- [SQL šeme i migracije](#sql-šeme-i-migracije)
- [Skripte](#skripte)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Faze razvoja i trenutno stanje

| Faza | Period | Sadržaj |
|------|--------|---------|
| **1 — MVP** | jun/jul 2026 | Ingest tool (PDF/DOCX + OCR), semantička pretraga, Q&A sa citiranjem |
| **1.5** | jul/avg 2026 | Ekran `/document/:id` — pregled segmenata i izvučenih metapodataka |
| **2 — Produkcija** | avg/sep 2026 | LDAP/AD autentifikacija, role-based access, audit, monitoring, hardening |
| **3 — Contract Intelligence** | okt/nov 2026 | Analiza rizika ugovora prema sudskoj praksi, Word eksport sa *tracked changes* |

**Status (maj 2026):**
- ✅ Monorepo skelet, Docker Compose stack, CI workflow
- ✅ Postgres 16 + pgvector 0.8.2 + HNSW indeks
- ✅ BGE-M3 embedding sidecar (1024-dim, multilingvalan, CPU)
- ✅ SQL migration sistem (hash-tracked)
- ✅ `POST /api/documents` — multipart upload + SHA-256 dedup
- ✅ Ekstrakcija teksta iz digitalnih PDF (`unpdf`) i DOCX (`mammoth`)
- ✅ Frontend UI specifikacija ([frontend/UI-SPEC.md](frontend/UI-SPEC.md)) i preview prototip ([frontend/PravnaAI_Preview.jsx](frontend/PravnaAI_Preview.jsx))
- ✅ Tipovi za chat (Q&A + SSE), ingest pipeline, citate (`shared/src/types.ts`)
- ⏳ OCR fallback za skenirane PDF-ove (Tesseract) — PR #4
- ⏳ Chunking + embedding poziv + upis u `rag.chunks` — PR #5
- ⏳ `POST /api/search` i `POST /api/qna` — PR #6/#7
- ⏳ Frontend implementacija po UI-SPEC-u — paralelno sa backend PR-ovima

---

## Arhitektura

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (pravnici RTCG-a)                                      │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS (nginx u produkciji)
┌────────────────────────────────▼────────────────────────────────┐
│  Frontend — React + TypeScript + Vite                           │
│  Dark UI po UI-SPEC-u, sve tekstove na crnogorskoj ijekavici.   │
│  Razvojni dev server na :5173 (Vite proxy /api → :4000).        │
└────────────────────────────────┬────────────────────────────────┘
                                 │ /api/*
┌────────────────────────────────▼────────────────────────────────┐
│  Backend — Node.js 20 + Express + TypeScript (tsx)              │
│  - Ingest pipeline: hash → parse → chunk → embed → store        │
│  - RAG: query → embed → vector search → Claude API (SSE)        │
│  - Audit logging, autentifikacija (Faza 2)                      │
└──────────┬─────────────────────────────────┬────────────────────┘
           │                                 │
           │ HTTP                            │ pg
┌──────────▼──────────┐         ┌────────────▼──────────────────┐
│  Embeddings sidecar │         │  PostgreSQL 16 + pgvector     │
│  Python + FastAPI   │         │  + pg_trgm + unaccent         │
│  BGE-M3 (1024-dim,  │         │  Šeme: documents, rag, audit  │
│  cosine, CPU)       │         │  HNSW indeks na embeddinge    │
└─────────────────────┘         └───────────────────────────────┘

         (jedini outbound — kontrolisan, sa filterima)
┌─────────────────────────────────────────────────────────────────┐
│  Anthropic Claude API — claude-sonnet-4-6                       │
│  Generativni odgovori uz prompt caching nad korpusom.           │
└─────────────────────────────────────────────────────────────────┘
```

**Privacy boundary:** sve unutar (lokalna mreža RTCG-a) ostaje interno. Jedini outbound HTTPS poziv ide ka Claude API-ju (samo upit + relevantni isječci, nikad cijela neredigovana baza).

---

## Tehnološki stack

| Sloj | Izbor | Razlog |
|------|-------|--------|
| Backend runtime | Node.js 20 + tsx | Async streaming odgovora, brza iteracija u TS bez build koraka |
| Backend framework | Express 4 | Standardni, kompatibilan sa multer/multipart |
| Frontend | React 18 + Vite 5 + TS | UI na crnogorskoj ijekavici, brz dev experience |
| Baza | PostgreSQL 16 + pgvector 0.8.2 | Jedna baza za sve (relacioni + vektorski), interno hostovanje |
| Embeddinzi | BGE-M3 (1024-dim, cosine) preko Python FastAPI sidecar-a | Open-source, multilingvalan (sr-Cyrl + sr-Latn), ne izlazi van RTCG-a |
| PDF parser | `unpdf` (pdfjs-dist wrapper) | Aktivno održavan, ESM-native; `pdf-parse` koristi pdfjs iz 2018 |
| DOCX parser | `mammoth` | Solidan raw-text ekstraktor |
| OCR (PR #4) | Tesseract 5.x sa srpskim jezičkim paketima (srp + srp_latn), 300 DPI | Open source, dobro radi sa ćirilicom i latinicom |
| AI | Claude API — `claude-sonnet-4-6` | Anthropic preporučen za pravne tekstove, podržava prompt caching |
| UI fontovi | Newsreader (serif) za sadržaj, Geist (sans) za kontrole | Pravni/dokumentarni ton — vidi [UI-SPEC §1.2](frontend/UI-SPEC.md) |
| UI ikonice | `lucide-react` | Konzistentan stil, mali bundle |
| Autentifikacija (Faza 2) | LDAP/AD na postojeću RTCG infrastrukturu | Korisnici se ne kreiraju zasebno |
| Deployment | Docker Compose + nginx na Ubuntu 24.04 VM | Postojeća RTCG VM infrastruktura |

---

## Brzi start (novi računar)

Pretpostavke:
- Git, Docker Desktop, Node.js ≥ 20.10

```bash
# 1. Kloniraj repo
git clone https://github.com/dejanvujovic/pravnaAI.git
cd pravnaAI

# 2. Instaliraj zavisnosti za sve workspace-e
npm install

# 3. Kreiraj .env iz template-a
cp .env.example .env
# Otvori .env i unesi ANTHROPIC_API_KEY.
# Lozinka za Postgres može ostati default ili je promijeni (vidi napomenu ispod).

# 4. Podigni infrastrukturu (Postgres + embedding sidecar)
npm run stack:up
# Prvi build embedding kontejnera traje 5-10 min (PyTorch, sentence-transformers).
# Prvi start kontejnera dodatno 5-10 min dok skida BGE-M3 model (~2.3 GB).
# Sve to se kešira u Docker volume-u `rtcg-legal-ai-embeddings-cache`,
# pa naredni pokretači traju 10-15 sekundi.

# 5. Primijeni SQL migracije
npm run db:migrate

# 6. Pokreni backend i frontend (svaki u svom terminalu)
npm run dev:backend     # :4000
npm run dev:frontend    # :5173
```

Otvori http://localhost:5173 — početna strana zove `/api/health` i pokazuje status Postgres-a, pgvector ekstenzije i embedding servisa. Sve tri komponente treba da budu `ok`.

> **⚠ Sigurnosna napomena**: ako Postgres lozinka u `.env` ostane default za lokalni dev, **NIKAD** je ne koristi u produkciji. Generiši jaku lozinku sa:
> ```bash
> node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
> ```

---

## Detaljan setup

### Preduslovi po platformi

| Platforma | Komentar |
|-----------|----------|
| **Windows 11** | Docker Desktop, Git for Windows (uključuje Bash i Git Credential Manager), Node 20 sa https://nodejs.org. Provjera: `git --version`, `docker info`, `node --version`. |
| **macOS** | Docker Desktop, Node preko `brew install node@20`. |
| **Linux (Ubuntu 22+)** | Docker Engine + Compose v2, Node 20 preko NodeSource ili nvm. |

### Environment varijable

`.env` se ne commit-uje (vidi `.gitignore`). Template je u [.env.example](.env.example):

| Varijabla | Default | Napomena |
|-----------|---------|----------|
| `PORT` | `4000` | Backend HTTP port |
| `NODE_ENV` | `development` | `production` za deployment |
| `PGHOST` | `localhost` | Postgres hostname |
| `PGPORT` | `5432` | |
| `PGUSER` | `rtcg` | |
| `PGPASSWORD` | *(generiši)* | Mora se poklapati u `.env` i Postgres kontejneru (oba čitaju iz istog `.env`) |
| `PGDATABASE` | `rtcg_legal_ai` | |
| `ANTHROPIC_API_KEY` | *(obavezno)* | Sa https://console.anthropic.com/settings/keys |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | |
| `EMBEDDINGS_URL` | `http://localhost:8001` | URL ka Python sidecar-u |
| `TESSERACT_BIN` | `tesseract` | Putanja do binarnog fajla (Faza 1 PR #4) |
| `TESSERACT_LANGS` | `srp+srp_latn` | |
| `OCR_DPI` | `300` | |
| `UPLOADS_DIR` | `./data/uploads` | Rješava se u odnosu na koren repoa, ne cwd |
| `LDAP_*` | *(prazno)* | Aktivira se u Fazi 2 |

### Verifikacija setupa

Nakon `stack:up` + `db:migrate`:

```bash
docker compose ps
# 2 kontejnera: rtcg-legal-ai-postgres (healthy), rtcg-legal-ai-embeddings (healthy)

npm run db:psql
# psql> \dn         # documents, rag, audit
# psql> \dx         # vector, pg_trgm, unaccent, plpgsql

curl http://localhost:4000/api/health
# {"status":"ok","postgres":"ok","pgvector":"ok","embeddings":"ok",...}
```

---

## Razvojni tok (Git + CI)

**Pravilo:** ništa se ne pushuje direktno na `main` osim ako je u pitanju upload jednog fajla bez logike (npr. preview prototip). Svaki feature → branch → PR → CI provjera → squash merge.

### Standardni tok

```bash
# 1. Sa main grane, povuci najnovije
git checkout main
git pull --ff-only

# 2. Otvori novi branch
git checkout -b feat/<naziv>
# konvencija: feat/*, fix/*, chore/*, docs/*, ci/*

# 3. Radi, commit-uj, pushuj
git add <fajlovi>
git commit -m "..."
git push -u origin feat/<naziv>

# 4. Otvori PR na GitHub-u kroz link koji git ispiše:
#    https://github.com/dejanvujovic/pravnaAI/pull/new/feat/<naziv>

# 5. Sačekaj zelen CI (~50s)

# 6. Squash and merge + Delete branch na GitHub UI

# 7. Lokalno sinhronizuj
git checkout main
git pull --ff-only
git branch -d feat/<naziv>
git remote prune origin
```

### CI workflow

Svaki PR pokreće [.github/workflows/ci.yml](.github/workflows/ci.yml):

1. Instalira Node 20 + zavisnosti (`npm ci`)
2. Pokreće `npm run typecheck` preko svih workspace-a
3. Diže Postgres 16 + pgvector kao service container
4. Pokreće `db/init/01_extensions.sql`
5. Primjenjuje sve SQL migracije
6. **Re-pokreće migracije** i tvrdi da je broj primijenjenih = 0 (idempotentnost)

PR ne može da se mergeuje dok CI nije zelen.

### Commit poruke

Format: `tip(scope): kratak naslov`, body objašnjava *zašto*.

Tipovi: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`.

Commit poruke pišemo na **crnogorskoj ijekavici**. Body objašnjava razloge odluka, ne samo *što* je urađeno.

---

## Struktura repozitorijuma

```
pravnaAI/
├── .github/workflows/
│   └── ci.yml                  GitHub Actions — typecheck + migracije
├── backend/                    Node.js + Express + TypeScript
│   ├── scripts/
│   │   └── migrate.ts          Migration runner (hash-tracked)
│   ├── src/
│   │   ├── config.ts           Env loading + tipovani config
│   │   ├── db.ts               pg Pool + DATE custom parser
│   │   ├── index.ts            HTTP server + route registracija
│   │   ├── middleware/
│   │   │   └── errorHandler.ts Globalni error handler
│   │   ├── routes/
│   │   │   └── documents.ts    POST /api/documents (ingest)
│   │   └── services/
│   │       ├── audit.ts        audit.ingest_log helper
│   │       ├── embeddings.ts   Klijent ka BGE-M3 sidecar-u
│   │       ├── parser.ts       Ekstrakcija teksta iz PDF/DOCX
│   │       └── storage.ts      Hash + snimanje fajla na disk
│   └── package.json
├── frontend/                   React + Vite + TypeScript
│   ├── UI-SPEC.md              📘 Specifikacija UI-ja (izvor istine)
│   ├── PravnaAI_Preview.jsx    Samostalni preview prototip oba ekrana
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── shared/                     Zajednički TS tipovi (@rtcg/shared)
│   ├── src/
│   │   ├── index.ts
│   │   └── types.ts            📘 IZVOR ISTINE za sve API kontrakte
│   └── package.json
├── embeddings/                 Python BGE-M3 sidecar
│   ├── app.py                  FastAPI sa lifespan model loading-om
│   ├── requirements.txt
│   └── Dockerfile              CPU-only, model se kešira u volumen
├── db/
│   ├── init/
│   │   └── 01_extensions.sql   Auto-load pri prvom Postgres bootu
│   └── migrations/             Migracije, leksikografski poredak
│       ├── 0001_base.sql
│       ├── 0002_documents.sql
│       ├── 0003_chunks.sql
│       ├── 0004_audit.sql
│       └── 0005_documents_text.sql
├── data/                       Lokalni podaci (gitignored)
│   └── uploads/                Uploadovani PDF/DOCX po UUID-u
├── docker-compose.yml          Postgres + embedding sidecar
├── tsconfig.base.json
├── package.json                Workspaces root + skripte
├── .env.example
├── .gitignore
└── README.md
```

---

## Frontend specifikacija

**[frontend/UI-SPEC.md](frontend/UI-SPEC.md)** je izvor istine za sve odluke o korisničkom interfejsu — dizajn tokeni, tipografija, ekrani, komponente, ponašanje. Frontend developer (ili agent) gradi ekrane po tom dokumentu bez nagađanja.

Osnove (puni detalji u UI-SPEC-u):

- **Vizuelni jezik:** dark/profesionalan/dokumentaran, RTCG zlatna (`#C8A24B`) kao jedini akcent, gradijent na primarnim akcijama.
- **Tipografija:** *Newsreader* (serif) za sadržaj koji korisnik čita kao tekst, *Geist* (sans) za kontrole interfejsa.
- **Ekrani Faze 1:**
  - `/` — Chat (Q&A sa obaveznim citiranjem izvora)
  - `/ingest` — Drag-drop + pipeline + tabela indeksiranih dokumenata
  - `/document/:id` — Detalji dokumenta (Faza 1.5)
- **Taksonomija u UI-u:** 9 `DocumentType` vrijednosti se mapira na 4 vizuelne grupe (`DocumentGroup` u `shared/types.ts` — PROPIS, PRAKSA, UGOVOR, INTERNI), svaka sa svojom bojom i `lucide-react` ikonicom.
- **Prototip:** [frontend/PravnaAI_Preview.jsx](frontend/PravnaAI_Preview.jsx) je samostalni React fajl sa simuliranim podacima — gotove `<Pipeline>`, `<SourcePill>`, `<TypeBadge>` komponente i puna paleta za prebacivanje u `frontend/src/` i povezivanje na stvarni API.

**UX invarijante** (UI-SPEC §7):
1. Citiranje je obavezno — AI odgovor bez `citati` se prikazuje kao upozorenje, ne kao pouzdan odgovor.
2. Disclaimer "Provjeri izvore" vidljiv uz svaki odgovor.
3. *Sovereign* poruka — podaci ostaju na RTCG infrastrukturi.
4. Crnogorska ijekavica, dosljedna pravna terminologija.
5. `DocumentType` se nikad ne redefiniše u UI-u — boje/ikonice idu preko `DocumentGroup` mape.

---

## Ugovor sa backendom (tipovi)

**[shared/src/types.ts](shared/src/types.ts) je jedini izvor istine** za API kontrakte — backend i frontend ga importuju kroz `@rtcg/shared`. **Ne duplirati tipove**.

Trenutno definisano:

| Domen | Tipovi |
|---|---|
| Taksonomija | `DocumentType`, `LegalArea`, `DocumentStatus`, `DocumentGroup` |
| Dokumenti | `DocumentMeta` |
| Pretraga | `SearchRequest`, `SearchHit`, `SearchResponse` |
| Q&A | `Citat`, `QnaRequest`, `QnaResponse`, `QnaStreamEvent` (SSE) |
| Ingest | `IngestStage`, `INGEST_STAGE_ORDER`, `IngestStatus`, `IngestPatchRequest` |
| Health | `HealthResponse` |
| Greške | `ApiError` (`{ kod, poruka }`) |

Kad dodaješ novi endpoint, prvo definiši tipove u `shared/types.ts`, pa onda implementiraj backend i frontend.

---

## API endpointi

### Implementirani

#### `GET /api/health`

Provjera zdravlja svih komponenti. Vraća `HealthResponse`.

```bash
curl http://localhost:4000/api/health
```

```json
{
  "status": "ok",
  "vrijeme": "2026-05-25T11:00:00.000Z",
  "postgres": "ok",
  "pgvector": "ok",
  "embeddings": "ok",
  "verzija": "0.1.0"
}
```

`status: "degraded"` znači da je bar jedna komponenta `down`/`loading`/`missing`.

#### `POST /api/documents`

Multipart upload PDF ili DOCX dokumenta.

**Polja:**
- `file` (binary): PDF (`application/pdf`) ili DOCX. Maksimalno 50 MB.
- `metadata` (string, JSON): vidi `DocumentMeta` u [shared/types.ts](shared/src/types.ts).

**Primjer:**
```bash
curl -X POST http://localhost:4000/api/documents \
  -F "file=@zakon.pdf;type=application/pdf" \
  -F 'metadata={"naslov":"Zakon o radu","tip":"ZAKON","oblast":"RADNO_PRAVO","datum":"2024-01-15","organSud":"Skupština CG"}'
```

**Odgovori:**

| HTTP | Značenje |
|------|----------|
| `201 Created` | Tijelo: `DocumentMeta`. Fajl je sačuvan, tekst ekstraktovan, audit upisan. |
| `400 Bad Request` | Nedostaje `file`, prazan fajl, ili neispravni `metadata` (Zod greške u `detalji`). |
| `409 Conflict` | Dokument sa istim SHA-256 hash-om već postoji. Tijelo sadrži `postojeci.id` i `postojeci.naslov`. |
| `413 Payload Too Large` | Fajl > 50 MB. |
| `415 Unsupported Media Type` | MIME tip nije PDF ili DOCX. |
| `422 Unprocessable Entity` | Fajl je validan MIME tip, ali parser ne može pročitati sadržaj (oštećen fajl). |

### Planirani (UI-SPEC §6.1)

| Endpoint | Zahtjev | Odgovor | PR |
|---|---|---|---|
| `POST /api/qna` | `QnaRequest` | `QnaResponse` ili SSE `QnaStreamEvent` | #7 |
| `POST /api/search` | `SearchRequest` | `SearchResponse` | #6 |
| `POST /api/ingest` | multipart | `IngestStatus[]` | proširenje #2 |
| `GET /api/ingest/:id/stream` | — | SSE `IngestStatus` | proširenje #2 |
| `GET /api/ingest/:id` | — | `IngestStatus` | proširenje #2 |
| `PATCH /api/ingest/:id` | `IngestPatchRequest` | `IngestStatus` | proširenje #2 |
| `GET /api/documents` | query filteri | `DocumentMeta[]` | #6 |
| `DELETE /api/documents/:id` | — | `204` | #6 |
| `GET /api/documents/:id` | — | `DocumentMeta` + segmenti | Faza 1.5 |

Ne-2xx odgovori uvijek vraćaju `ApiError` (`{ kod, poruka }`); `poruka` se prikazuje korisniku.

---

## SQL šeme i migracije

**Šeme:**
- `documents` — registar dokumenata
- `rag` — chunkovi + embeddinzi
- `audit` — log ingest pipeline-a
- `public._migrations` — track primijenjenih migracija (SHA-256 hash)

**Ključne tabele:**

```
documents.documents
  id (uuid PK), naslov, tip, oblast, status, datum, organ_sud,
  broj_sluzbenog_lista, jezik, broj_strana, velicina_bajtova,
  izvorni_fajl_putanja, izvorni_fajl_hash (UNIQUE), izvorni_fajl_mimetip,
  tekst (TEXT), ocr_obavljen, ocr_obavljen_u, chunked_u, embedded_u,
  kreirano, azurirano, obrisano (soft delete)

rag.chunks
  id (uuid PK), document_id (FK), redni_broj, sadrzaj, broj_tokena,
  strana_od, strana_do, struktura_putanja, embedding (vector(1024)),
  kreirano, embedded_u

audit.ingest_log
  id (bigserial PK), document_id (FK, nullable), akcija, status,
  detalji (jsonb), greska, trajanje_ms, kreirano
```

**Pravila migracija:**
- Fajlovi se imenuju `NNNN_kratak_opis.sql` u `db/migrations/`.
- Primjenjuju se leksikografskim redoslijedom.
- Hash svakog primijenjenog fajla se čuva u `public._migrations`. Ako se postojeći fajl izmijeni, runner odbija da nastavi.
- **Nikad ne mijenjati postojeću migraciju** — uvijek pisati novu.

---

## Skripte

Sve se zovu iz korijena repoa:

| Komanda | Šta radi |
|---------|----------|
| `npm install` | Instalira sve workspace zavisnosti |
| `npm run typecheck` | TypeScript provjera kroz sva tri workspace-a |
| `npm run dev:backend` | Backend dev (tsx watch, :4000) |
| `npm run dev:frontend` | Frontend dev (Vite, :5173) |
| `npm run db:up` | Diže samo Postgres |
| `npm run db:down` | Zaustavlja kontejnere (volume ostaje) |
| `npm run db:logs` | Prati Postgres logove |
| `npm run db:psql` | Otvara psql shell unutar kontejnera |
| `npm run db:migrate` | Primjenjuje sve nove migracije |
| `npm run db:migrate:dry` | Pokaže šta bi se primijenilo, bez izvršavanja |
| `npm run embeddings:up` | Diže samo embedding sidecar (build ako treba) |
| `npm run embeddings:logs` | Prati embedding logove |
| `npm run stack:up` | Diže cijeli Docker stack (Postgres + embeddings) |

---

## Troubleshooting

### `EADDRINUSE: address already in use :::4000`

Stari backend proces zauzima port. Pronađi PID i ubij:

```bash
# Windows (Git Bash ili PowerShell)
netstat -ano | grep LISTENING | grep ":4000"
taskkill //F //PID <pid>

# Linux/macOS
lsof -ti:4000 | xargs kill -9
```

### Backend pokazuje `postgres: down` i `pgvector: missing` iako kontejner radi

`.env` se ne čita ispravno. Backend čita `.env` iz korijena repoa preko apsolutne putanje (`backend/src/config.ts`). Provjeri:

```bash
docker compose ps                     # kontejner mora biti "healthy"
docker compose exec postgres psql -U rtcg -d rtcg_legal_ai -c "SELECT 1"
cat .env | grep PG                    # vrijednosti odgovaraju onima u docker-compose.yml
```

### `git push` na novi računar pita za autentifikaciju

Na Windows-u Git Credential Manager automatski otvori browser za GitHub OAuth flow. Na Linux/macOS instaliraj `gh` CLI ili konfiguriši GitHub PAT.

Alternativa: koristi SSH umjesto HTTPS:
```bash
git remote set-url origin git@github.com:dejanvujovic/pravnaAI.git
```

### Embedding sidecar ne stiže do `Model spreman`

Prvi start treba 5-15 min jer skida ~2.3 GB model. Prati:

```bash
npm run embeddings:logs
# čekaj: "Model spreman." → "Application startup complete." → "Uvicorn running on http://0.0.0.0:8001"
```

Ako ne uspije (npr. mrežna greška), uništi volume i pokušaj ponovo:
```bash
docker compose down
docker volume rm rtcg-legal-ai-embeddings-cache
npm run embeddings:up
```

### `tsx watch` ne pokupi nove fajlove

Ako `parser.ts` (ili sl. novi fajl) ne radi nakon dodavanja, ručno restartuj backend (ne oslanjaj se na watch za potpuno nove fajlove):

```bash
# Ubij stari proces (vidi EADDRINUSE), pa
npm run dev:backend
```

### Upload daje 415 a fajl je validan PDF

Provjeri `Content-Type` koji client šalje. `curl` zahtjeva eksplicitno:
```bash
curl ... -F "file=@dok.pdf;type=application/pdf" ...
```

Browser i fetch postavljaju MIME automatski iz file ekstenzije.

---

## Roadmap

### Faza 1 — preostalo

- [ ] **PR #4** — OCR fallback (Tesseract) za skenirane PDF-ove (`tekst.length == 0 && broj_strana > 0`)
- [ ] **PR #5** — Chunking pravnih dokumenata (preferirati granice po članovima zakona, fallback fiksna veličina) + poziv embedding sidecar-a + upis u `rag.chunks`
- [ ] **PR #6** — `POST /api/search` semantička + leksička hibridna pretraga, `GET/DELETE /api/documents`
- [ ] **PR #7** — `POST /api/qna` Q&A endpoint sa Claude API-jem, SSE streaming, obavezno citiranje
- [ ] **PR #8** — Frontend implementacija (Chat + Ingest ekrani) po UI-SPEC-u, počevši od `PravnaAI_Preview.jsx` kao referentne tačke

### Faza 1.5

- [ ] Ekran `/document/:id` — pregled segmenata + izvučenih metapodataka (član, datum presude, strane ugovora)

### Faza 2 (priprema)

- LDAP/AD autentifikacija (passport-ldapauth)
- Role-based access control
- Strukturalan audit log za pristup dokumentima
- Rate limiting + request size limits
- Nginx reverse proxy + TLS
- Backup strategija za Postgres volume

### Faza 3 (priprema)

- Contract Intelligence prompt template-i
- Word eksport sa tracked changes (`docx` paket)
- Korpus crnogorske sudske prakse, naročito izgubljeni RTCG sporovi

---

## Licenca i pristup

Interni projekat RTCG-a. Pristup repozitorijumu je ograničen na članove razvojnog tima.

Kontakt: pravna@rtcg.me
