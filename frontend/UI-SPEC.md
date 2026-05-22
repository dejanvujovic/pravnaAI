# PravnaAI — UI specifikacija (`frontend/`)

> Vodič za izradu korisničkog interfejsa RTCG Legal AI sistema.
> Cilj: frontend developer (ili agent) gradi ekrane po ovom dokumentu bez nagađanja —
> definisani su dizajn-tokeni, struktura ekrana, komponente, stanja i ugovori prema backend API-ju.

**Stack:** React + TypeScript + Vite · `@rtcg/shared` za tipove · UI tekst na crnogorskom
**Status:** Faza 1 (MVP, jun/jul 2026)

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

### 1.4 Tipovi dokumenata (jedinstveni kroz cijeli UI)

Definisati jednom u `shared` i koristiti svuda (badge, filteri, klasifikacija pri unosu):

| Ključ | Labela | Boja | Ikonica (lucide) |
|---|---|---|---|
| `zakon` | Zakon / propis | `--accent` | `BookOpen` |
| `presuda` | Presuda | `--blue` | `Gavel` |
| `ugovor` | Ugovor | `--green` | `FileSignature` |
| `interni` | Interni akt RTCG | `--violet` | `Building2` |

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

Ispod svakog AI odgovora, naslov `IZVORI (n)` sa ikonicom `BookOpen`. Svaki izvor je `<SourcePill>`:

- Badge tipa (boja po tipu dokumenta), naziv (npr. *Zakon o parničnom postupku*), referenca (npr. *čl. 281, st. 1*), i % relevantnosti (poravnato desno, `tabular-nums`).
- Klik otvara **bočni drawer** sa izvodom iz baze (puni tekst odredbe iz `pgvector`), relevantnošću i dugmetom *"Otvori cijeli dokument"*.

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
- Prihvata `multiple`. Na unos: pogađa tip iz imena fajla (heuristika: `zakon|propis` → `zakon`; `presuda|rješenje|rev|U.` → `presuda`; `ugovor` → `ugovor`; ostalo → `interni`).

### 4.3 Red u obradi (`<IngestItem>`)

- Ikonica statusa, naziv, veličina + broj segmenata.
- **Ručna korekcija tipa:** četiri kvadratna toggle dugmeta (jedan po tipu) — pravnik ispravlja auto-klasifikaciju prije/tokom obrade.
- **Pipeline** (`<Pipeline>`): četiri faze — `Parsiranje → Chunking → Embedding → Indeksiranje`. Završene faze zelene sa kvačicom, aktivna u akcentu sa spinerom, buduće sive. Spojnice mijenjaju boju kako napreduje.
- Po završetku red migrira iz *U obradi* u *Indeksirano*.

### 4.4 Tabela indeksiranih (`<DocTable>`)

- Toolbar: pretraga po nazivu (`Search`) + filter chips po tipu (`Sve` + 4 tipa), selektovani chip u boji tipa.
- Red: ikonica, naziv, meta (`veličina · N segmenata · datum`), badge tipa, status indikator *"indeksirano"* (zelena tačka), dugme za brisanje (`Trash2`, crveno na hover).
- Prazno stanje filtera: `FileSearch` + *"Nema dokumenata za zadati filter."*

Footer: *"Dokumenti se segmentiraju i vektorizuju lokalno · embeddings se čuvaju u pgvector na infrastrukturi RTCG."*

---

## 5. Komponente za izdvajanje (`src/components/`)

| Komponenta | Opis | Koristi se na |
|---|---|---|
| `<Logo>` | brend ikonica + naziv + podnaslov | svuda |
| `<TypeBadge type size>` | badge tipa dokumenta | chat izvori, ingest tabela |
| `<SourcePill source onClick>` | red izvora sa relevantnošću | chat odgovor |
| `<SourceDrawer source onClose>` | bočni panel sa izvodom odredbe | chat |
| `<Pipeline stage>` | 4-fazni indikator obrade | ingest |
| `<IngestItem item>` | red dokumenta u obradi | ingest |
| `<DocTable docs filter>` | tabela indeksiranih dokumenata | ingest |
| `<Composer onSend>` | unos upita | chat |
| `<EmptyState>` | brze akcije + primjeri | chat |

---

## 6. Ugovor sa backendom (API tipovi → `@rtcg/shared`)

UI očekuje sljedeće oblike. Tipove definisati u `shared` da ih dijele backend i frontend.

### 6.1 Tip dokumenta i izvor

```ts
export type DocType = 'zakon' | 'presuda' | 'ugovor' | 'interni';

export interface Source {
  documentId: string;
  type: DocType;
  title: string;        // "Zakon o parničnom postupku"
  ref: string;          // "čl. 281, st. 1"
  relevance: number;    // 0..1 (cosine similarity)
  excerpt: string;      // tekst segmenta iz pgvector
}
```

### 6.2 Q&A — `POST /api/query`

```ts
// zahtjev
interface QueryRequest { question: string; filters?: DocType[]; }

// odgovor (streaming SSE ili JSON)
interface QueryResponse {
  answer: string;        // markdown/paragrafi
  sources: Source[];     // za <SourceList>
  model: string;         // "claude-sonnet-..." za prikaz u headeru
}
```

UI renderuje `answer` u Newsreader, `sources` kao `<SourcePill>` listu. Ako backend streamuje, composer prikazuje stanje *"Pretražujem pravnu bazu…"* do prvog tokena.

### 6.3 Unos — `POST /api/ingest` + status

```ts
type IngestStage = 'parse' | 'chunk' | 'embed' | 'index' | 'done' | 'error';

interface IngestStatus {
  id: string;
  name: string;
  size: string;
  type: DocType;         // auto-pogođen, korisnik može promijeniti
  stage: IngestStage;
  chunks: number;
  error?: string;
}
```

Tok: `POST /api/ingest` (multipart) → `id`; status preko **SSE** `GET /api/ingest/:id/stream` ili polling `GET /api/ingest/:id`. `<Pipeline>` mapira `stage` na korake. `PATCH /api/ingest/:id` za promjenu `type`.

### 6.4 Baza — `GET /api/documents`

```ts
interface DocumentRow {
  id: string; name: string; type: DocType;
  size: string; chunks: number; indexedAt: string;
}
// + DELETE /api/documents/:id
```

### 6.5 Health — `GET /api/health`

Početna provjera (već postoji): vraća status Postgres-a i `pgvector` ekstenzije. UI može prikazati diskretan indikator u headeru ako baza nije dostupna.

---

## 7. Pravila ponašanja (UX invarijante)

1. **Citiranje je obavezno.** AI odgovor bez izvora se ne prikazuje kao pouzdan — ako `sources` je prazan, prikazati upozorenje umjesto tihog odgovora.
2. **Urednički nadzor.** Disclaimer o ljudskoj provjeri vidljiv uz svaki odgovor. Odgovori nisu pravni savjet.
3. **Sovereign poruka.** Na vidljivom mjestu (sidebar + ingest footer) stoji da podaci ostaju na infrastrukturi RTCG.
4. **Crnogorski jezik, dosljedna terminologija:** *verifikovanih* (ne *verificiranih*), *zaposleni* (ne *zaposlenik*), *urednički nadzor*, *najbolje prakse*, *rezultovati*.
5. **Tip dokumenta je jedan izvor istine** — boje i ikonice identične na svim ekranima.

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
