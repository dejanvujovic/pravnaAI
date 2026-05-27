# Deployment kroz Portainer

Cijeli RTCG Legal AI stack — frontend, backend, Postgres, embeddings i
OCR — pokrenut kao jedan **Portainer Stack** koji se gradi i podiže iz
Git repozitorijuma.

> ⚠ **Pilot konfiguracija — bez auth-a i TLS-a.** Stack stavite **iza
> VPN-a ili interne RTCG mreže**. Produkcioni hardening (LDAP/AD,
> RBAC, TLS, audit log UI, automatski backup) dolazi u Fazi 2.

---

## Šta se dobija

Pet kontejnera u jednoj Portainer Stack-i, svi povezani internom Docker
mrežom:

```
┌───────────────────────────────────────────────────────────────┐
│  port 80 (host) ──→ rtcg-legal-ai-frontend  (nginx + dist)    │
│                          │                                    │
│                          │ proxy /api/  ──→ backend:4000      │
│                          ▼                                    │
│                     rtcg-legal-ai-backend  (Node 20 + tsx)    │
│                          │                                    │
│        ┌─────────────────┼─────────────────┐                  │
│        ▼                 ▼                 ▼                  │
│  postgres:5432    embeddings:8001     ocr:8002                │
│  (pgvector)       (BGE-M3)            (Tesseract)             │
└───────────────────────────────────────────────────────────────┘
```

Volumes (Portainer Volumes tab):

- `rtcg-legal-ai-postgres-data` — sve indeksirano (chunks, embeddings, razgovori, audit)
- `rtcg-legal-ai-embeddings-cache` — BGE-M3 model (~2.3 GB)
- `rtcg-legal-ai-backend-uploads` — originali PDF/DOCX fajlova

---

## Preduslovi

| Stavka | Minimum | Preporuka |
|---|---|---|
| OS | Ubuntu Server 22.04 LTS | Ubuntu Server 24.04 LTS |
| RAM | 8 GB | 16 GB (BGE-M3 troši ~3 GB) |
| Disk | 50 GB | 100 GB SSD |
| CPU | 4 jezgra | 8 jezgara |
| Docker | Engine + Compose v2 | — |
| Mreža | pristup `api.anthropic.com` | + `github.com` za update |

Korisnik na serveru: non-root sa `sudo` (primjer `rtcg-deploy`).

---

## Korak 1 — Instaliraj Docker (preskoči ako već imaš)

```bash
sudo apt update
sudo apt install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

## Korak 2 — Instaliraj Portainer

```bash
docker volume create portainer_data

docker run -d \
  --name portainer \
  --restart=always \
  -p 9443:9443 -p 8000:8000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Otvori u browser-u: **https://server-ip:9443** → kreiraj admin nalog
(zapamti šifru — povratak je samo kroz reset volumena). Connect na
**Local Docker** environment.

> Self-signed sertifikat je očekivan na :9443 — prihvati upozorenje za
> pilot. Za TLS sa Let's Encrypt vidi *Korak 8* na dnu.

## Korak 3 — Generiši lozinku i pripremi tajne

Postgres lozinka (kopiraj output, treba ti u sljedećem koraku):

```bash
docker run --rm node:20-alpine \
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Anthropic API ključ:

- Otvori https://console.anthropic.com/settings/keys
- Create Key → daj mu ime "RTCG Legal AI pilot"
- Kopiraj `sk-ant-…` string

## Korak 4 — Dodaj Stack u Portainer

Postoje dvije metode. **Metoda A (Web editor + GHCR) je preporučena** —
ne zavisi od toga da Portainer može da klonira git repo (na sporijim/
firewall-ovanim mrežama git fetch zna da istekne) i ne bilduje ništa na
serveru, samo povlači gotove slike.

### Metoda A — Web editor sa gotovim slikama (GHCR) ✅ preporučeno

Preduslov: GitHub Actions workflow `docker-publish.yml` je bar jednom
prošao na `main` i objavio slike na `ghcr.io` (provjeri u repo →
**Actions** tab da je "Docker publish (GHCR)" zelen, i u repo →
**Packages** da postoji 5 paketa `pravnaai-*`).

> Paketi na GHCR-u su podrazumijevano **privatni**. Da bi Portainer
> mogao da ih povuče bez registry kredencijala, otvori svaki paket na
> https://github.com/dejanvujovic?tab=packages → **Package settings** →
> **Change visibility** → **Public**. (Ili dodaj GHCR registry
> kredencijale u Portainer: **Registries → Add registry → Custom**,
> URL `ghcr.io`, username + GitHub PAT sa `read:packages`.)

1. Lijevi meni → **Stacks** → **+ Add stack**
2. **Name**: `rtcg-legal-ai`
3. **Build method**: izaberi **Web editor**
4. Paste cijeli sadržaj fajla
   [`docker-compose.portainer.yml`](../docker-compose.portainer.yml)
   (raw verzija:
   `https://raw.githubusercontent.com/dejanvujovic/pravnaAI/main/docker-compose.portainer.yml`)
5. Nastavi na *Korak 5 — Environment variables*

### Metoda B — Repository (git fetch + build na serveru)

Zahtijeva da Portainer pouzdano stiže do GitHub-a i da server bilduje
slike. Koristi `docker-compose.yml` (sa `build:` direktivama).

1. **Stacks → + Add stack** → **Name**: `rtcg-legal-ai`
2. **Build method**: **Repository**
3. **Repository URL**: `https://github.com/dejanvujovic/pravnaAI`
4. **Repository reference**: `refs/heads/main`
5. **Compose path**: `docker-compose.yml`
6. **Authentication**: prazno ako je repo javni; inače GitHub PAT
   (fine-grained, Contents: Read-only na ovaj repo)

> Ako git fetch ističe sa `context deadline exceeded` — mreža ka GitHub-u
> je spora/blokirana. Pređi na **Metodu A**.

## Korak 5 — Environment variables

U istoj Stack formi, scrollaj do sekcije **Environment variables** i
dodaj:

| Naziv | Vrijednost |
|---|---|
| `PGPASSWORD` | *(generisano u Koraku 3)* |
| `ANTHROPIC_API_KEY` | `sk-ant-…` *(iz Koraka 3)* |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `PGUSER` | `rtcg` |
| `PGDATABASE` | `rtcg_legal_ai` |
| `HTTP_PORT` | `80` *(promijeni ako port 80 nije slobodan)* |

> ℹ U razvojnoj mašini `npm run stack:up` diže samo infrastrukturu
> (postgres + embeddings + OCR); backend i frontend se startuju
> direktno preko `npm run dev:backend` / `npm run dev:frontend` da
> dev ima hot reload. U Portainer-u se diže cio stack jer compose
> nema profilske podjele.

## Korak 6 — Deploy

Klikni **Deploy the stack** na dnu forme.

**Metoda A (GHCR):** Portainer povlači 5 gotovih slika sa `ghcr.io`
(~3–5 GB ukupno prvi put, najveći je embeddings). Bez build-a na serveru.

**Metoda B (Repository):** Portainer klonira repo i bilduje 5 slika
lokalno (~10–20 min prvi put — Python torch dependencies).

U oba slučaja kontejneri se dižu po zavisnostima — postgres prvo,
embeddings/ocr paralelno, backend kad je postgres `healthy`, frontend
kad backend krene.

Prati napredak na **Stacks → rtcg-legal-ai → Containers**. Svi treba
da budu zelene boje (`running`/`healthy`); ako embeddings ostane
`starting` više od 15 min, klikni **Logs** i čekaj
`"Application startup complete"` (prvi boot skida BGE-M3 model ~2.3 GB
u `embeddings-cache` volume).

## Korak 7 — Verifikacija

Sa drugog računara u RTCG mreži:

```bash
curl http://server-ip/api/health
# {"status":"ok","postgres":"ok","pgvector":"ok","embeddings":"ok","ocr":"ok",...}

curl -I http://server-ip/
# HTTP/1.1 200 OK
```

Otvori u browser-u **http://server-ip** → glavna Chat stranica sa
RTCG logom. Postavi probno pitanje da provjeriš end-to-end tok.

## Korak 8 — TLS sa Let's Encrypt (preporučeno za pilot)

Najlakše rešenje: stavi Caddy reverse proxy ispred Portainer-a/stack-a.
Caddy automatski uzima i obnavlja sertifikate.

```bash
docker run -d \
  --name caddy \
  --restart=always \
  -p 443:443 -p 80:80 \
  -v caddy-data:/data \
  -v caddy-config:/config \
  -v $(pwd)/Caddyfile:/etc/caddy/Caddyfile \
  caddy:2
```

`Caddyfile` (u home folderu rtcg-deploy korisnika):

```
pravna.rtcg.me {
    reverse_proxy frontend:80
}
```

Pa restartuj Caddy. **Prije ovoga** — promijeni u Portainer Stack-u
`HTTP_PORT` u nešto drugo (npr. `8080`) da ne dođe do konflikta na
host portu 80 sa Caddy-jem.

> Alternativa bez Caddy-ja: nginx na host-u + certbot. Vidi
> [DEPLOYMENT.md §Korak 9–10](./DEPLOYMENT.md).

---

## Update sistema

**Metoda A (GHCR):**
1. Push na `main` → GitHub Actions automatski rebild-uje i objavi nove
   slike na `ghcr.io` (prati u repo → **Actions**).
2. Kad workflow pozeleni, u Portainer-u: **Stacks → rtcg-legal-ai →
   Editor → Update the stack** sa **Re-pull image and redeploy**
   uključenim. Portainer povlači `:latest` slike i restartuje kontejnere.

**Metoda B (Repository):** **Pull and redeploy** — Portainer povlači
najnoviji commit i rebild-uje izmijenjene slike.

U oba slučaja DB migracije se okidaju automatski pri startu backend-a
(idempotentne kroz `public._migrations` hash-tracking).

## Backup

Najlakše: Portainer **Volumes** sekcija → klikni volume → **Browse**.
Ali za automatizovan dnevni backup koristi cron na host-u.

`/etc/cron.daily/rtcg-backup` (chmod +x):

```bash
#!/bin/bash
set -e
TS=$(date +%F)
mkdir -p /backup

# Postgres dump
docker exec rtcg-legal-ai-postgres \
  pg_dump -U rtcg rtcg_legal_ai | gzip > /backup/rtcg_${TS}.sql.gz

# Uploads tar
docker run --rm \
  -v rtcg-legal-ai-backend-uploads:/data:ro \
  -v /backup:/out \
  alpine tar -czf /out/uploads_${TS}.tar.gz -C /data .

# Retencija 30 dana
find /backup -name "rtcg_*.sql.gz" -mtime +30 -delete
find /backup -name "uploads_*.tar.gz" -mtime +30 -delete
```

---

## Problem solving

### Stack se ne deploy-uje, "no such image"

Build je pao. **Stacks → rtcg-legal-ai → Editor** → klikni **Update**
sa `Re-pull image` aktivnim. Provjeri Logs za pojedinačne kontejnere
da vidiš tačnu grešku.

### Backend kontejner u `restarting` petlji

Najčešće: `ANTHROPIC_API_KEY` nije postavljen ili je pogrešan, ili
Postgres lozinka ne odgovara između backend env-a i postgres init-a.

```
Portainer → Containers → rtcg-legal-ai-backend → Logs
```

Tipična greška: `Nedostaje obavezna environment varijabla: ANTHROPIC_API_KEY`.
Otvori Stack → Environment variables → ispravi → **Update the stack**.

### `/api/health` vraća `embeddings: loading` više od 5 minuta

BGE-M3 model se skida (~2.3 GB) ili ima problem sa mrežom.

```
Containers → rtcg-legal-ai-embeddings → Logs
```

Ako mrežna greška — uništi volume i pokušaj ponovo:

```bash
docker compose down embeddings
docker volume rm rtcg-legal-ai-embeddings-cache
# Redeploy stack-a kroz Portainer
```

### `/api/qna` se prekida nakon ~60s

SSE response stream prekinut prerano. Provjeri:

- nginx u frontend kontejneru — `frontend/nginx.conf` MORA imati
  `proxy_buffering off` i `proxy_read_timeout 300s`. Ovi su podrazumijevani
  u `main` branchu, ali ako koristiš starije image-e — pull pa redeploy.
- Ako koristiš Caddy / dodatni reverse proxy ispred — i tamo isto.

### Port 80 zauzet

```bash
sudo ss -tlnp | grep ':80 '
```

Ako se javi nginx ili apache2 na host-u: zaustavi ih ili promijeni
`HTTP_PORT` env var u Portainer Stack-u na npr. `8080`, pa otvori
`http://server-ip:8080`.

### Storage se brzo puni

Provjeri šta zauzima prostor:

```bash
docker system df
docker volume ls -q | xargs -I{} sh -c \
  'echo "{}: $(docker run --rm -v {}:/v alpine du -sh /v | cut -f1)"'
```

Najveći potrošači: `rtcg-legal-ai-postgres-data` (embeddings + dokumenti),
`rtcg-legal-ai-backend-uploads` (originali). Stari Docker image build cache
možeš pokupiti sa `docker builder prune -a -f`.

---

## Kontakt

Razvojni tim: pravna@rtcg.me · GitHub: https://github.com/dejanvujovic/pravnaAI
