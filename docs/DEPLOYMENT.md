# Deployment — RTCG Legal AI na centralnom serveru

Uputstvo za instalaciju **pilot instance** RTCG Legal AI sistema na
internom Linux serveru u RTCG mreži. Cilj: pravnici otvore URL u
pretraživaču i odmah koriste sistem.

> ⚠ **Pilot konfiguracija — bez auth-a i TLS-a.** Sistem stavite **iza
> VPN-a ili interne mreže** gdje je dostupan samo zaposlenima RTCG-a.
> Produkcioni hardening (LDAP/AD prijava, RBAC, TLS, audit log UI,
> automatski backup) dolazi u Fazi 2.

---

## Preduslovi

| Stavka | Minimum | Preporuka |
|---|---|---|
| OS | Ubuntu Server 22.04 LTS | Ubuntu Server 24.04 LTS |
| RAM | 8 GB | 16 GB (BGE-M3 model troši ~3 GB) |
| Disk | 50 GB | 100 GB SSD |
| CPU | 4 jezgra | 8 jezgara (embedding i OCR su CPU-only) |
| Mreža | pristup `api.anthropic.com` | + pristup `github.com` za update |

Korisnik na serveru: non-root account sa `sudo` (primjer `rtcg-deploy`).

---

## Korak 1 — Instaliraj Docker Engine

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

# Trenutni korisnik u docker grupu — da ne treba sudo
sudo usermod -aG docker $USER
newgrp docker

# Provjera
docker --version
docker compose version
```

## Korak 2 — Instaliraj Node.js 20 i Git

```bash
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node --version    # v20.x.x
npm --version
```

## Korak 3 — Klonira repozitorijum

```bash
sudo mkdir -p /opt/rtcg-legal-ai
sudo chown $USER:$USER /opt/rtcg-legal-ai
cd /opt/rtcg-legal-ai
git clone https://github.com/dejanvujovic/pravnaAI.git .
```

## Korak 4 — Environment varijable

```bash
cp .env.example .env

# Generiši jaku Postgres lozinku
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Otvori `.env` i unesi:

```bash
NODE_ENV=production
PGPASSWORD=<lozinka generisana iznad>
ANTHROPIC_API_KEY=<sa https://console.anthropic.com/settings/keys>
```

Ostala polja (PORT, PGHOST, model, sidecar URL-ovi) ostavi default.

## Korak 5 — Podigni infrastrukturu (Postgres + embedding + OCR)

```bash
npm install              # Instalira sve workspace zavisnosti
npm run stack:up         # Diže docker compose stack
```

**Prvi start traje 10–20 minuta** — BGE-M3 model (~2.3 GB) i Tesseract
slike se skidaju iz registry-ja. Sve se kešira u Docker volume
`rtcg-legal-ai-embeddings-cache`, pa naredni pokretači su 10–15 sekundi.

Prati napredak embedding kontejnera:

```bash
npm run embeddings:logs
# Čekaj: "Model spreman" → "Application startup complete"
```

## Korak 6 — Primijeni SQL migracije

```bash
npm run db:migrate
```

## Korak 7 — Build frontend bundle-a

```bash
cd frontend
npm run build
cd ..
# Izlaz: frontend/dist/ (statički HTML + JS + CSS)
```

## Korak 8 — Backend kao systemd servis

Kreiraj `/etc/systemd/system/rtcg-legal-ai.service`:

```ini
[Unit]
Description=RTCG Legal AI backend
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=rtcg-deploy
Group=rtcg-deploy
WorkingDirectory=/opt/rtcg-legal-ai
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start --workspace=backend
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/rtcg-legal-ai/backend.log
StandardError=append:/var/log/rtcg-legal-ai/backend.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/rtcg-legal-ai
sudo chown rtcg-deploy:rtcg-deploy /var/log/rtcg-legal-ai

sudo systemctl daemon-reload
sudo systemctl enable rtcg-legal-ai
sudo systemctl start rtcg-legal-ai
sudo systemctl status rtcg-legal-ai
```

Provjera:

```bash
curl http://localhost:4000/api/health
# {"status":"ok","postgres":"ok","pgvector":"ok","embeddings":"ok","ocr":"ok",...}
```

## Korak 9 — Nginx kao reverse proxy

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/rtcg-legal-ai
```

```nginx
server {
    listen 80;
    server_name pravna.rtcg.me;   # <-- promijeniti

    # Frontend — statički build
    root /opt/rtcg-legal-ai/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;   # SPA fallback
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE za /api/qna — disable buffering, dug timeout
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    client_max_body_size 60M;   # PDF/DOCX upload do 50 MB
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rtcg-legal-ai \
          /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Korak 10 — Firewall (UFW)

```bash
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # HTTP (preko nginx-a)
sudo ufw enable
sudo ufw status
```

Postgres (5432), embedding (8001) i OCR (8002) slušaju samo na lokalnom
interfejsu kroz Docker — nisu izloženi van servera.

## Verifikacija

Sa drugog računara u RTCG mreži:

```bash
curl -I http://pravna.rtcg.me
# HTTP/1.1 200 OK
```

Otvori u browser-u — početni Chat ekran sa logotipom. Postavi probno
pitanje. Ako se prikazuje "Server nije dostupan" → vidi Problem solving.

---

## Update sistema

```bash
cd /opt/rtcg-legal-ai
git pull --ff-only
npm install
npm run db:migrate
cd frontend && npm run build && cd ..
sudo systemctl restart rtcg-legal-ai
```

## Backup

**Minimum dvije stavke** da se ne izgubi rad pravnika:

- Docker volume `rtcg-legal-ai-pgdata` — sve indeksirano (chunks,
  embeddings, razgovori, audit log).
- Folder `/opt/rtcg-legal-ai/data/uploads/` — originali PDF/DOCX fajlova.

Primjer dnevni cron job (`sudo crontab -e`):

```cron
# Postgres dump — svaki dan u 02:00
0 2 * * * /usr/bin/docker exec rtcg-legal-ai-postgres pg_dump -U rtcg rtcg_legal_ai | gzip > /backup/rtcg_$(date +\%F).sql.gz

# Originalni fajlovi — svaki dan u 03:00
0 3 * * * tar -czf /backup/uploads_$(date +\%F).tar.gz /opt/rtcg-legal-ai/data/uploads/

# Retencija — drži zadnjih 30 dana
0 4 * * * find /backup -name "rtcg_*.sql.gz" -mtime +30 -delete
0 4 * * * find /backup -name "uploads_*.tar.gz" -mtime +30 -delete
```

## TLS (Let's Encrypt) — opciono, preporučeno

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pravna.rtcg.me
# Sertifikat se obnavlja automatski preko systemd timer-a.
```

---

## Problem solving

### `502 Bad Gateway` u browseru

Backend ne radi.

```bash
sudo systemctl status rtcg-legal-ai
tail -100 /var/log/rtcg-legal-ai/backend.log
```

### `/api/health` vraća `postgres: down` ili `pgvector: missing`

Postgres kontejner pao ili `.env` nije ispravan.

```bash
docker compose ps
docker compose logs postgres
cat .env | grep PG          # Mora se poklapati sa kontejnerom
```

### `/api/health` vraća `embeddings: loading`

BGE-M3 se još učitava (~30 sek pri svakom restart-u kontejnera). Ako traje
> 5 min:

```bash
npm run embeddings:logs
# Ako greška u skidanju modela → uništi volume i pokušaj ponovo:
docker compose down
docker volume rm rtcg-legal-ai-embeddings-cache
npm run embeddings:up
```

### `/api/health` vraća `ocr: down`

Tesseract sidecar nije podignut. Provjeri:

```bash
docker compose ps                    # treba "rtcg-legal-ai-ocr (healthy)"
npm run ocr:logs
```

### `/api/qna` se prekida poslije nekoliko sekundi

SSE buffering uključen u nginx-u. U `/etc/nginx/sites-available/rtcg-legal-ai`
provjeri da postoje:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
```

Pa `sudo systemctl reload nginx`.

### Disk se brzo puni

Najveći potrošači:

- `rtcg-legal-ai-pgdata` (postgres volume) — embeddinzi su 4 KB po segmentu
- `rtcg-legal-ai-embeddings-cache` — ~2.3 GB jednom (BGE-M3 model)
- `data/uploads/` — originalni PDF/DOCX

Provjeri:

```bash
docker system df
du -sh /opt/rtcg-legal-ai/data/uploads/
```

### Backend stalno restart-uje

```bash
sudo journalctl -u rtcg-legal-ai -n 100
```

Najčešći uzrok: nedostaje `ANTHROPIC_API_KEY` u `.env` ili pogrešna
Postgres lozinka.

---

## Kontakt

Razvojni tim: pravna@rtcg.me · GitHub: https://github.com/dejanvujovic/pravnaAI
