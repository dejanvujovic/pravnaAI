# PravnaAI — UI specifikacija (`frontend/`)

> Vodič za izradu korisničkog interfejsa RTCG Legal AI sistema.
> Cilj: frontend developer (ili agent) gradi ekrane po ovom dokumentu bez nagađanja —
> definisani su dizajn-tokeni, struktura ekrana, komponente, stanja i ugovori prema backend API-ju.

**Stack:** React + TypeScript + Vite · `@rtcg/shared` za tipove · UI tekst na crnogorskom
**Status:** Faza 1 (MVP, jun/jul 2026)
**Izvor istine za tipove:** `shared/types.ts` — ovaj dokument upućuje na njega, ne duplira ga.

---

## 1. Dizajn-jezik

Dark, profesionalan, dokumentaran. Inspiracija je pravni/institucionalni karakter, ne "tech startup". Zlatna RTCG boja je jedini akcent — dominira tamna paleta sa preciznim akcentima.

### 1.1 Tokeni (`src/styles/tokens.css`)

```css
:root {
  /* Pozadine */
  --bg:        #0E1116;  /* osnovna pozadina aplikacije */
  --panel:     #161B22;  /* kartice, sidebar, header */
  --panel-2:   #1C232D;  /* ugnježdene površine, hover, badge */
  --border:    #262E3A;  /* sve linije i obrubi */

  /* Tekst */
  --text:      #E6EAF0;
  --muted:     #8A94A6;

  /* Akcent i semantika */
  --accent:    #C8A24B;  /* RTCG zlatna — primarni akcent */
  --accent-2:  #8C6F2E;  /* tamniji kraj gradijenta */
  --blue:      #7FB3FF;  /* tip dokumenta: presuda */
  --green:     #5FBF8A;  /* uspjeh, indeksirano */
  --red:       #E07A6B;  /* greška, brisanje */
  --violet:    #C792E0;  /* tip dokumenta: interni akt */
}
```

Akcent se uvijek koristi kao gradijent `linear-gradient(135deg, var(--accent), var(--accent-2))` na ikonicama brenda i primarnim dugmadima.

### 1.2 Tipografija

| Namjena | Font | Korišćenje |
|---|---|---|
| Sadržaj (odgovori, naslovi, dokumenti) | **Newsreader** (serif) | daje pravni, dokumentarni ton |
| UI elementi (dugmad, labele, meta, tabele) | **Geist** (sans) | klasa `.ui-sans` |

```css
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Geist:wght@400;500;600;700&display=swap');
```

> Pravilo: sve što je *sadržaj koji korisnik čita kao tekst* ide u Newsreader; sve što je *kontrola interfejsa* ide u Geist.

### 1.3 Geometrija i kretanje

- Radijusi: kartice `14px`, dugmad `10–11px`, ikonice brenda `9px`, pilule/chips `20px`.
- Obrubi: uvijek `1px solid var(--border)`; na hover/aktivno mijenja se u boju akcenta ili tipa.
- Sjenke: štedljivo — samo na composer baru i aktivnim dropzone stanjima.
- Animacije: `fadeUp` (0.3–0.5s) za ulazak poruka i redova; staggered `animation-delay` za grid kartica. Bez raštrkanih mikro-animacija.

### 1.4 Tipovi dokumenata i vizuelne grupe

Taksonomija (`DocumentType`, 9 vrijednosti) živi u `@rtcg/shared` i ne smije se redefinisati u UI-u. Za prikaz se 9 tipova mapira na **4 vizuelne grupe** (`DocumentGroup`) — svaka grupa ima jednu boju i ikonicu. Mapiranje `DocumentType → DocumentGroup` drži frontend (`src/lib/docTypes.ts`), ne `shared`.

| `DocumentType` | Grupa (`DocumentGroup`) | Boja | Ikonica (lucide) |
|---|---|---|---|
| `ZAKON` | `PROPIS` | `--accent` | `BookOpen` |
| `PODZAKONSKI_AKT` | `PROPIS` | `--accent` | `BookOpen` |
| `PRESUDA` | `PRAKSA` | `--blue` | `Gavel` |
| `SUDSKA_PRAKSA` | `PRAKSA` | `--blue` | `Gavel` |
| `MISLJENJE` | `PRAKSA` | `--blue` | `Gavel` |
| `UGOVOR_O_RADU` | `UGOVOR` | `--green` | `FileSignature` |
| `UGOVOR_JAVNA_NABAVKA` | `UGOVOR` | `--green` | `FileSignature` |
| `INTERNI_AKT` | `INTERNI` | `--violet` | `Building2` |
| `OSTALO` | `INTERNI` | `--violet` | `Building2` |

> `<TypeBadge>` prikazuje **tačan tip** kao tekst, ali boju/ikonicu uzima iz grupe. Tako pravnik vidi precizno *"Ugovor o javnoj nabavci"*, a vizuelno ostaje dosljedno sa ostalim ugovorima. Filter chips mogu raditi i po grupi (4 dugmeta) i po oblasti (`LegalArea`).

---

## 2. Mapa ekrana (Faza 1)

```
/            Chat (Q&A sa citiranjem)      — primarni ekran
/ingest      Unos dokumenata               — drag-drop + pipeline + baza
/document/:id  Detalj dokumenta (Faza 1.5) — segmenti + metapodaci
```

Layout aplikacije: lijevi **sidebar** (istorija upita, novi upit, navigacija ka unosu) + glavni panel. Sidebar je sklopiv (`PanelLeftClose` / `PanelLeft`).

---

## 3. Ekran: Chat (`/`)

Chat-centričan kao Harvey, ali sa citiranjem izvora kao ključnom razlikom.

### 3.1 Struktura

```
┌────────────┬──────────────────────────────────────┐
│  SIDEBAR   │  HEADER (naslov razgovora · model)    │
│            ├──────────────────────────────────────┤
│ + Novi     │                                       │
│   upit     │   PRAZNO STANJE  ili  TOK RAZGOVORA   │
│            │                                       │
│ ISTORIJA   │                                       │
│  · ...     ├──────────────────────────────────────┤
│            │  COMPOSER (textarea + priloži + send) │
│ [sovereign]│  disclaimer ispod                     │
└────────────┴──────────────────────────────────────┘
```

### 3.2 Prazno stanje

- Centriran brend (ikonica `Scale` u zlatnom gradijentu), naslov *"Kako mogu pomoći pravnoj službi?"*, podnaslov o pretrazi crnogorskih propisa uz navođenje izvora.
- **Brze akcije** (grid 2×2): Pretraga prakse, Uporedi dokumente, Sažmi presudu, Rokovi i postupak. Svaka ima ikonicu, labelu i kratak opis. Hover: obrub → akcent, lagani `translateY(-2px)`.
- **Primjeri upita** (lista): klik šalje upit. Npr. *"Koji su rokovi za odgovor na tužbu prema ZPP-u?"*

### 3.3 Tok razgovora

- **Korisnička poruka:** desno poravnata, `--panel-2` pozadina, asimetričan radijus (`14px 14px 4px 14px`).
- **AI odgovor:** lijevo, sa avatarom brenda. Sadržaj u Newsreader, `line-height ~1.62`. Ispod odgovora **blok izvora**.
- **Stanje učitavanja:** tri tačkice (`bp` keyframes) + tekst *"Pretražujem pravnu bazu…"*.

### 3.4 Blok izvora (ključna komponenta — `<SourceList>`)

Renderuje `QnaResponse.citati` (tip `Citat[]`). Ispod svakog AI odgovora, naslov `IZVORI (n)` sa ikonicom `BookOpen`. Svaki izvor je `<SourcePill>` koji prima jedan `Citat`:

- Badge tipa (boja po grupi — vidi 1.4), `naslov` (npr. *Zakon o parničnom postupku*), `referenca` (npr. *čl. 281, st. 1*; ako je `null`, izostaviti red reference), i `skor` kao % (poravnato desno, `tabular-nums`).
- Klik otvara **bočni drawer** sa `isjecak` (tekst segmenta iz `pgvector`), `skor` i dugmetom *"Otvori cijeli dokument"* (vodi na `/document/:documentId`).

Ako je `citati` prazan niz, **ne prikazivati odgovor kao pouzdan** — umjesto toga upozorenje (vidi UX invarijantu 1).

Ispod izvora obavezna napomena: *"Provjeri izvore prije upotrebe — urednički nadzor ostaje obavezan."* (usklađeno sa AI etičkim principima RTCG).

### 3.5 Composer

Textarea (auto-rast do ~160px), dugme *priloži dokument* (`Paperclip`), dugme *pošalji* (gradijent kad ima teksta, sivo kad je prazno). Enter šalje, Shift+Enter novi red. Ispod: *"PravnaAI može pogriješiti. Odgovori nisu pravni savjet — provjeri navedene izvore."*

---

## 4. Ekran: Unos dokumenata (`/ingest`)

### 4.1 Struktura

```
HEADER  (logo · brojač: N dok. / M segmenata u pgvector · "Infrastruktura RTCG")
  │
  ├─ DROPZONE        prevuci/klikni — auto-klasifikacija, OCR za skenirane
  ├─ U OBRADI (n)    kartice sa pipeline-om i ručnom korekcijom tipa
  └─ INDEKSIRANO     pretraga + filter chips + tabela dokumenata
```

### 4.2 Dropzone

- Veliki isprekidani obrub; na `dragover` → obrub i ikonica u akcentu, blaga pozadina `rgba(200,162,75,.06)`, sjenka.
- Tekst: *"Prevuci dokumente ovdje"* / *"ili klikni za odabir — zakoni, presude, ugovori, interni akti"* / *"PDF · DOCX · TXT · RTF — automatska klasifikacija i OCR za skenirane dokumente"*.
- Prihvata `multiple`. Backend pri unosu pogađa `DocumentType` (heuristika nad imenom/sadržajem); UI prima `IngestStatus.tip` i prikazuje ga kao prijedlog koji se može ispraviti.

### 4.3 Red u obradi (`<IngestItem>`)

Renderuje jedan `IngestStatus`.

- Ikonica statusa (`IngestStatus.ocr === true` → indikator da je primijenjen OCR), `naziv`, veličina (`velicinaBajtova`) + `brojSegmenata`.
- **Ručna korekcija klasifikacije:** padajući izbor `DocumentType` (9 vrijednosti) — pravnik ispravlja auto-klasifikaciju prije/tokom obrade; opciono i `LegalArea`. Promjena šalje `PATCH /api/ingest/:id` (`IngestPatchRequest`).
- **Pipeline** (`<Pipeline>`): četiri faze iz `INGEST_STAGE_ORDER` — `PARSIRANJE → CHUNKING → EMBEDDING → INDEKSIRANJE`. Završene zelene sa kvačicom, aktivna u akcentu sa spinerom, buduće sive. Faza `GRESKA` → red crveno, prikazati `IngestStatus.greska`.
- Po dostizanju `ZAVRSENO` red migrira iz *U obradi* u *Indeksirano*.

### 4.4 Tabela indeksiranih (`<DocTable>`)

Renderuje `DocumentMeta[]` (`GET /api/documents`).

- Toolbar: pretraga po nazivu (`Search`) + filter chips. Dva nivoa filtera: po **grupi** (`Sve` + 4 grupe iz 1.4) i opciono po **oblasti** (`LegalArea`). Selektovani chip u boji grupe.
- Red: ikonica, `naslov`, meta (`velicinaBajtova · brojSegmenata segmenata · datum`), `<TypeBadge>` (tačan `tip`, boja po grupi), badge `status` ako nije `VAZECI` (npr. *NACRT*, *VAN SNAGE*), status indikator *"indeksirano"* (zelena tačka), dugme za brisanje (`Trash2`, crveno na hover → `DELETE /api/documents/:id`).
- Prazno stanje filtera: `FileSearch` + *"Nema dokumenata za zadati filter."*

Footer: *"Dokumenti se segmentiraju i vektorizuju lokalno · embeddings se čuvaju u pgvector na infrastrukturi RTCG."*

---

## 5. Komponente za izdvajanje (`src/components/`)

| Komponenta | Opis | Koristi se na |
|---|---|---|
| `<Logo>` | brend ikonica + naziv + podnaslov | svuda |
| `<TypeBadge tip size>` | badge tipa (`DocumentType`), boja po grupi | chat citati, ingest tabela |
| `<SourcePill citat onClick>` | red izvora (`Citat`) sa skorom | chat odgovor |
| `<SourceDrawer citat onClose>` | bočni panel sa `isjecak` | chat |
| `<Pipeline faza>` | indikator obrade (`IngestStage`) | ingest |
| `<IngestItem status>` | red dokumenta u obradi (`IngestStatus`) | ingest |
| `<DocTable docs grupa oblast>` | tabela (`DocumentMeta[]`) | ingest |
| `<Composer onSend>` | unos upita | chat |
| `<EmptyState>` | brze akcije + primjeri | chat |

---

## 6. Ugovor sa backendom

**Svi tipovi su definisani u `shared/types.ts` (`@rtcg/shared`) — ovdje se NE redefinišu.** Ova sekcija samo mapira endpointe na tipove i opisuje kako ih UI koristi. Pri radu uvijek otvori `shared/types.ts` kao izvor istine.

### 6.1 Endpointi → tipovi

| Endpoint | Zahtjev | Odgovor | Ekran |
|---|---|---|---|
| `POST /api/qna` | `QnaRequest` | `QnaResponse` (ili SSE `QnaStreamEvent`) | Chat |
| `POST /api/search` | `SearchRequest` | `SearchResponse` | brza akcija "Pretraga prakse" |
| `POST /api/ingest` | multipart (fajlovi) | `IngestStatus[]` (po jedan po fajlu) | Ingest |
| `GET /api/ingest/:id/stream` | — | SSE `IngestStatus` | Ingest |
| `GET /api/ingest/:id` | — | `IngestStatus` | Ingest (polling fallback) |
| `PATCH /api/ingest/:id` | `IngestPatchRequest` | `IngestStatus` | Ingest (korekcija klasifikacije) |
| `GET /api/documents` | query filteri | `DocumentMeta[]` | Ingest tabela |
| `DELETE /api/documents/:id` | — | `204` | Ingest tabela |
| `GET /api/documents/:id` | — | `DocumentMeta` + segmenti | `/document/:id` (Faza 1.5) |
| `GET /api/health` | — | `HealthResponse` | header indikator |

Ne-2xx odgovori uvijek vraćaju `ApiError` (`{ kod, poruka }`); `poruka` se prikazuje korisniku.

### 6.2 Chat (Q&A)

`POST /api/qna` sa `QnaRequest`. UI renderuje `QnaResponse.odgovor` u Newsreader, a `citati` (`Citat[]`) kao `<SourcePill>` listu (vidi 3.4). `model` ide u header.

**Streaming (preporučeno):** backend šalje `QnaStreamEvent` preko SSE — `token` (dopisuje tekst), `citati` (popunjava izvore), `kraj` (model + trajanje), `greska`. Do prvog `token` eventa composer prikazuje *"Pretražujem pravnu bazu…"*.

### 6.3 Unos (ingest)

`POST /api/ingest` (multipart) → niz `IngestStatus` (po `id` za svaki fajl). Status uživo preko **SSE** `GET /api/ingest/:id/stream`, ili polling `GET /api/ingest/:id`. `<Pipeline>` mapira `IngestStatus.faza` na korake iz `INGEST_STAGE_ORDER`. Korekcija tipa/oblasti → `PATCH /api/ingest/:id` (`IngestPatchRequest`).

### 6.4 Baza dokumenata

`GET /api/documents` vraća `DocumentMeta[]` (filteri kao query parametri — `tip`, `oblast`, `status`, pretraga po nazivu). `DELETE /api/documents/:id` uklanja dokument i njegove segmente iz `pgvector`.

### 6.5 Health

`GET /api/health` → `HealthResponse` (već postoji): `postgres`, `pgvector`, `embeddings`, `verzija`. UI prikazuje diskretan indikator u headeru kada `status !== "ok"`.

---

## 7. Pravila ponašanja (UX invarijante)

1. **Citiranje je obavezno.** AI odgovor bez izvora se ne prikazuje kao pouzdan — ako je `QnaResponse.citati` prazan, prikazati upozorenje umjesto tihog odgovora.
2. **Urednički nadzor.** Disclaimer o ljudskoj provjeri vidljiv uz svaki odgovor. Odgovori nisu pravni savjet.
3. **Sovereign poruka.** Na vidljivom mjestu (sidebar + ingest footer) stoji da podaci ostaju na infrastrukturi RTCG.
4. **Crnogorski jezik, dosljedna terminologija:** *verifikovanih* (ne *verificiranih*), *zaposleni* (ne *zaposlenik*), *urednički nadzor*, *najbolje prakse*, *rezultovati*.
5. **Taksonomija je jedan izvor istine.** `DocumentType` se nikad ne redefiniše u UI-u; boje/ikonice idu preko `DocumentGroup` mape (`src/lib/docTypes.ts`), identično na svim ekranima.

---

## 8. Mapa prema fazama razvoja

| Faza | UI dodaci |
|---|---|
| **1 — MVP** (jun/jul) | Chat sa citiranjem, Ingest (drag-drop + pipeline + tabela), Health indikator |
| **1.5** | Ekran `/document/:id` — pregled segmenata i izvučenih metapodataka (član, datum presude, strane ugovora); zatvara krug sa citiranjem |
| **2 — Produkcija** (avg/sep) | Prijava (LDAP/AD), korisničke uloge, **audit log** ekran, indikatori monitoringa |
| **3 — Contract Intelligence** (okt/nov) | Split-view analize ugovora (rizici označeni inline), izvoz u Word sa *tracked changes* |

---

## 9. Reference

Prototipovi ekrana (React, samostalni, simulirani podaci) izrađeni kao polazna tačka:
- `PravnaAI.jsx` — chat ekran
- `PravnaAI_Ingest.jsx` — unos dokumenata

Ovi prototipovi sadrže gotove `<Pipeline>`, `<SourcePill>`, `<TypeBadge>` i paletu — prenijeti ih u `frontend/src/` i povezati na stvarni API umjesto simulacije (`setTimeout`).
