# Priručnik za pravnike — RTCG Legal AI

Interni AI asistent pravne službe RTCG-a. Sistem odgovara na pravna pitanja
nad korpusom crnogorskih zakona, podzakonskih akata, ugovora, presuda i
internih akata RTCG-a — uvijek uz **citiranje izvora**.

> ⚠ **Važno:** AI može pogriješiti. Odgovori nisu pravni savjet — uvijek
> provjerite citirane izvore prije upotrebe u radu.

---

## Kako pristupiti

Otvorite u pretraživaču adresu koju Vam je dao IT tim (npr.
`http://pravna.rtcg.me`). Prijava nije potrebna — sve što radite ostaje
unutar RTCG mreže.

Jedino što izlazi izvan mreže je sažet pravni upit ka Anthropic Claude API
servisu, koji generiše tekst odgovora. **Cijeli dokumenti, podaci o
zaposlenima i ugovori ne napuštaju sistem.**

---

## Šta sistem može

- Odgovara na pravna pitanja na crnogorskom jeziku.
- Daje odgovor uz **citiranje tačnih članova** zakona, presuda ili akata
  iz baze.
- Drži istoriju svih Vaših razgovora — možete se vratiti svakoj temi.
- Pamti kontekst razgovora — možete postavljati potpitanja.
- Učitava nove PDF/DOCX dokumente (Vi ili IT) u bazu pretrage.

## Šta sistem **ne smije**

- Da daje pravni savjet — to ostaje na Vama.
- Da odgovori bez citata. Ako baza ne sadrži potrebne podatke, javlja
  *"Na osnovu dostupnih dokumenata ne mogu dati odgovor."*

---

## Ekrani

### 1. Razgovor (početna)

Postavite pitanje u polju na dnu ekrana, pa pritisnite Enter. AI počne
odmah da odgovara u realnom vremenu; iznad odgovora pojavljuju se citati
sa numerisanim izvorima (`[1]`, `[2]`, ...).

**Klik na bilo koji citat** → otvara desno panel sa punim tekstom tog
segmenta i metapodacima dokumenta (datum, organ, broj službenog lista).

Unutar panela dugme **"Otvori cijeli dokument"** vodi na puni dokument sa
istaknutim segmentom — u novom tab-u, pa razgovor ne gubite.

**Sidebar lijevo** — istorija svih Vaših razgovora. Klik na stavku otvara
razgovor, X briše. Dugme **"Novi razgovor"** pokreće svjež chat (prethodni
ostaje sačuvan u sidebar-u).

### 2. Dokumenti

Lista svih indeksiranih dokumenata. Filteri po tipu (Zakon, Ugovor,
Presuda...), oblasti i statusu. Pretraga po naslovu.

- **Klik na naslov** → ekran sa pregledom cijelog dokumenta i svim članovima.
- **Olovka** ikonica → izmjena metapodataka (naslov, tip, datum...).
- **Koš** ikonica → brisanje dokumenta iz baze pretrage (može se vratiti
  preko IT-a — soft delete).

### 3. Detalj dokumenta

Lijevo se prikazuje **sadržaj** (TOC) — lista svih članova/segmenata.
Klik na član → skoči direktno na taj dio teksta. Trenutno vidljiv član se
automatski ističe zlatnom bojom.

---

## Savjeti za bolje odgovore

| ✅ Konkretno | ❌ Generalno |
|---|---|
| "Koji su rokovi za žalbu u parničnom postupku?" | "Šta je parnični postupak?" |
| "Kako Zakon o medijima reguliše zaštitu izvora?" | "Šta zakon kaže o tome?" |
| "Da li ugovor o radu može da se otkaže bez otpremnine?" | "Pričaj mi o ugovoru o radu." |

**Potpitanja rade u kontekstu** — sistem pamti prethodno pitanje. Primjer:

> Vi: *Koji je rok za žalbu?*
> AI: ...30 dana...
> Vi: *A na presudu Vrhovnog suda?*
> AI: razumije da i dalje pitate o žalbenom roku.

---

## Unos novog dokumenta

**Dokumenti → "Novi unos"** → prevucite PDF ili DOCX (do 50 MB) u označeno
polje, ili kliknite da izaberete iz dijaloga.

Sistem će:

1. Automatski parsirati tekst (i OCR-ovati ako je skenirani PDF).
2. Pokušati da iz teksta izvuče naslov, tip, oblast, datum, organ i broj
   službenog lista. **Zlatne ivice** oko polja znače da je vrijednost
   automatski predložena — pregledajte i ispravite po potrebi.
3. Indeksirati dokument za pretragu.

**Za masovni unos** — bacite 2 do 10 fajlova odjednom. Otvoriće se
batch tabela u kojoj svaki red ima prefilovane metapodatke. Pregledajte,
ispravite gdje treba, pa kliknite **"Upload sve"** — sistem ih obrađuje
sekvencijalno.

---

## Pravne i etičke obaveze

1. **Provjeri izvore.** Pred svakim odgovorom su numerisani citati —
   otvorite ih i potvrdite da AI nije pogrešno tumačio član.
2. **AI nije pravni savjet.** Odgovor je polazna tačka za Vaš stručni
   rad, ne zamjena za njega.
3. **Povjerljivi podaci.** Ne unosite u chat tekstove koji ne smiju da
   napuste RTCG (npr. lične podatke trećih lica koje sistem ne treba da
   procesira). Sažeti upit ide ka Claude API-ju.

---

## Kome se obratiti

| Problem | Kontakt |
|---|---|
| Tehnička greška, sistem ne radi | IT tim RTCG-a |
| Pogrešan AI odgovor, AI izmišlja članove | pravna@rtcg.me — pošaljite naslov razgovora i opis problema |
| Predlog novog dokumenta za bazu | pravna@rtcg.me |
| Pitanje o funkcionalnostima | pravna@rtcg.me |
