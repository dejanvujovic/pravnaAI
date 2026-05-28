# Backup i Restore — RTCG Legal AI

Vodič za upravljanje backup-ima Postgres baze koja drži korisnička pitanja, razgovore i ingestovane chunkove dokumenata.

> **TL;DR**: backup ide automatski svake noći u 03:00 (Europe/Podgorica), u Docker volumen `rtcg-legal-ai-postgres-backup-data`. Za off-server kopiju vidi sekciju [Off-server backup](#off-server-backup).

---

## Šta je backupovano

`pg_dump` sa `-Fc` flag-om (custom format, kompresovan) pravi snapshot **cijele baze** `rtcg_legal_ai`:

- Svi razgovori i poruke (`documents.razgovori`, `documents.poruke`)
- Svi dokumenti i njihovi chunkovi sa vektorima (`documents.documents`, `rag.chunks`)
- Audit log (`audit.ingest_events`)
- Migracije meta (`public._migrations`)

**Što NIJE u backup-u:**
- Originalne PDF/DOCX fajlove (u volumenu `rtcg-legal-ai-backend-uploads`)
- Embeddings model cache (`rtcg-legal-ai-embeddings-cache`) — model se ponovo skida sa HuggingFace pri prvom startu
- Backupi sami (njih ima u svom volumenu)

Ako treba kompletan disaster recovery (server umre), trebaš oba: postgres dump + uploads volumen.

---

## Šema retencije

Backup servis automatski briše stare fajlove po pravilima:

| Folder | Šta drži | Trajanje |
|---|---|---|
| `/backups/daily/` | svaki dnevni dump | **7 dana** |
| `/backups/weekly/` | nedjeljni "anchor" dump | **4 sedmice** |
| `/backups/monthly/` | prvi dan mjeseca dump | **12 mjeseci** |
| `/backups/last/latest.sql.gz` | symlink na najnoviji | uvijek |

Default je konzervativan: ~12 mjeseci unazad, sa rasterećenom granulacijom u dubinu. Za pilot veličinu ovo je ~50-200 MB ukupno.

Promjena retencije: postavi env var u Portainer Stack-u i redeploy:
- `BACKUP_KEEP_DAYS`
- `BACKUP_KEEP_WEEKS`
- `BACKUP_KEEP_MONTHS`

---

## Provjera da backup-i rade

### 1. Prvi pokušaj (ručno trigger-ovan)

Po default-u prvi backup čeka do 03:00. Da forsiramo trenutni test:

1. Portainer → **Containers** → `rtcg-legal-ai-postgres-backup` → `>_ Console`
2. Command: `/bin/sh` → Connect
3. Pokreni:
   ```sh
   /backup.sh
   ```
4. Vidiš output tipa:
   ```
   ==> Doing single database backup
   ==> Backing up to /backups/daily/rtcg_legal_ai-2026-05-28.sql.gz
   pg_dump: dumping contents of ... 
   ==> Cleaning expired backups
   ```

### 2. Lista backup-ova

Iz iste konzole:
```sh
ls -lah /backups/daily/ /backups/weekly/ /backups/monthly/ /backups/last/
```

### 3. Iz logova

Portainer → `rtcg-legal-ai-postgres-backup` → **Logs** → tu vidiš svaki cron pokušaj sa timestamp-om.

---

## Restore iz backup-a

> ⚠️ **DESTRUCTIVE OPERACIJA**: Ovo briše trenutnu bazu i vraća stanje sa backup-a. Sve poruke/dokumenti dodati nakon snapshot-a će biti izgubljeni.

### Brzi restore (zadnji backup)

1. **Zaustavi backend** (da ne piše tokom restore-a):
   - Portainer → Containers → `rtcg-legal-ai-backend` → **Stop**

2. **Otvori postgres konzolu**:
   - Portainer → Containers → `rtcg-legal-ai-postgres` → `>_ Console` → `/bin/bash`

3. **Kopiraj backup u postgres kontejner** (postgres-backup volumen NIJE direktno dostupan iz postgres kontejnera, pa idemo kroz `docker exec` od strane backup kontejnera):

   Alternativa A — kroz backup kontejner (preporučeno):
   ```sh
   # iz postgres-backup konzole:
   cat /backups/last/rtcg_legal_ai-latest.sql.gz > /tmp/restore.dump
   ```
   …pa kopiraj iz backup kontejnera u postgres kroz host. **Bez SSH-a ovo je nezgodno**. Lakša opcija je B.

   Alternativa B — temporary helper kontejner:
   - Portainer → **Containers** → **Add container**:
     - Name: `restore-helper`
     - Image: `postgres:16`
     - Network: ista mreža kao stack (`rtcg-legal-ai_default`)
     - Volumes:
       - `rtcg-legal-ai-postgres-backup-data` → `/backups` (read-only)
     - Command: `sleep 3600`
     - Deploy
   - Console u `restore-helper` → `/bin/bash`:
     ```sh
     export PGPASSWORD='<tvoj PGPASSWORD>'
     pg_restore -h postgres -U rtcg -d rtcg_legal_ai \
       --clean --if-exists --no-owner --no-privileges \
       /backups/last/rtcg_legal_ai-latest.sql.gz
     ```

4. **Pokreni backend** ponovo:
   - Portainer → `rtcg-legal-ai-backend` → **Start**

5. **Obriši helper kontejner** kad završi.

### Restore određenog datuma

Umjesto `/backups/last/...`, koristi specifični fajl:
```sh
pg_restore -h postgres -U rtcg -d rtcg_legal_ai \
  --clean --if-exists --no-owner --no-privileges \
  /backups/daily/rtcg_legal_ai-2026-05-15.sql.gz
```

Lista dostupnih:
```sh
ls /backups/daily/ /backups/weekly/ /backups/monthly/
```

---

## Off-server backup

Backup volumen živi **na istom serveru** — ne štiti od:
- Disk failure
- Ransomware
- Greška u Portainer-u koja briše volumene

Za stvarnu zaštitu, treba kopirati dump-ove **na drugu mašinu**. Bez SSH-a opcije su:

### Opcija A — Browser download (najjednostavnije za pilot)

1. Privremeno mount-uj backup volume u helper kontejner:
   - Image: `nginx:alpine`
   - Volume: `rtcg-legal-ai-postgres-backup-data` → `/usr/share/nginx/html` (read-only)
   - Port: `127.0.0.1:8888:80` (samo iz host-a)
   - Deploy
2. Otvori `http://192.168.241.249:8888/` u browseru — vidi listu, klikni za download.
3. Po završetku, **obriši taj kontejner** (nije za pernamentni rad — nema auth-a).

### Opcija B — rclone sidecar (automatski, ali zahtijeva cloud credentials)

Dodati u stack `rclone` kontejner koji svake noći upload-uje `/backups/` na S3/Backblaze/Google Drive. Konfiguracija detaljnije: TODO za Fazu 2.

### Opcija C — Network share (ako RTCG ima SMB/NFS share)

Mount-uj RTCG share u backup kontejner kao additional volume. Cron jednom dnevno kopira `/backups/` na share. Realno, ovo je najbolja opcija za internu javnu službu.

---

## Troubleshooting

### "Backup kontejner ne starta — postgres unhealthy"
- Provjeri da je postgres zdravo: `Containers → rtcg-legal-ai-postgres → Stats → status: healthy`
- Provjeri da PGPASSWORD u stack env var-ima odgovara onome iz postgres kontejnera

### "pg_dump greška: permission denied"
- Korisnik `${PGUSER}` mora biti owner baze ili imati `pg_read_all_data` privilegiju
- Default `rtcg` user kreirao bazu, pa ima sve privilegije

### "Disk full" upozorenje
- Backup volume rast: provjeri `Volumes → rtcg-legal-ai-postgres-backup-data → Stats`
- Smanji `BACKUP_KEEP_MONTHS` ili `BACKUP_KEEP_WEEKS`
- Obriši ručno: `rm /backups/monthly/<stari>.sql.gz` iz backup konzole
