/**
 * Q&A orchestration — semantička pretraga + Claude API + citiranje.
 *
 * Tok:
 *   1) `search()` vraća top-K SearchHit-ova kao kontekst (default 8).
 *   2) Konstruišemo numerisani prompt: pitanje + isječci [1]..[N].
 *   3) Claude streamuje odgovor; mi ga prepakujemo u QnaStreamEvent niz:
 *        - prvo `citati` event sa svim hit-ovima (UI ih prikazuje odmah)
 *        - zatim niz `token` event-ova kako tekst stiže
 *        - na kraju `kraj` (model + trajanje) ili `greska`
 *   4) Ako pretraga ne vrati nijedan isječak, vraćamo `greska` i tu
 *      stajemo — bez izvora ne smijemo odgovarati (UI-SPEC invarijanta 1).
 *
 * Prompt caching: system prompt je obilježen `cache_control: ephemeral`
 * tako da Anthropic kešira system poruku kroz uzastopne zahtjeve i
 * smanjuje cost. Korisničke poruke (sa hit-ovima) se ne keširaju jer
 * se mijenjaju po upitu.
 */

import type {
  Citat,
  DocumentType,
  QnaPoruka,
  QnaRequest,
  QnaStreamEvent,
  SearchHit,
} from "@rtcg/shared";
import { CLAUDE_MODEL, getClaude } from "./claude.js";
import { search } from "./search.js";

const DEFAULT_KONTEKST_K = 8;
const MAX_KONTEKST_K = 15;
const MAX_TOKENS = 1024;
/**
 * Maksimalan broj prethodnih poruka koje šaljemo Claude-u kao istoriju.
 * Šest = oko 3 razmjene; više od toga znači viši cost i veću šansu da
 * cache promaši. Sjeku se najstarije poruke.
 */
const MAX_ISTORIJA = 6;
/**
 * Ispod ovoliko karaktera, trenutno pitanje smatramo follow-up-om i
 * dodajemo zadnje korisnikovo pitanje u search query da RAG ne luta
 * (npr. "samo u zakonu o medijima" sa 24 karaktera).
 */
const FOLLOWUP_PRAG = 60;

const SYSTEM_PROMPT = `Ti si pravni asistent pravne službe Radio-televizije Crne Gore (RTCG).
Tvoj zadatak je da odgovaraš na pravna pitanja korisnika koristeći ISKLJUČIVO
navedene isječke iz crnogorske pravne baze (zakoni, podzakonski akti, ugovori,
presude, interni akti RTCG-a).

Pravila:
1. Odgovaraj na crnogorskom jeziku, ijekavski. Tehnička i pravna terminologija
   mora biti precizna ("zaposleni", "tužilac", "naručilac javne nabavke",
   "urednički nadzor", itd.).
2. Citiraj izvore brojevima u uglastim zagradama — [1], [2], [3] — koji se
   odnose na isječke u redoslijedu kojim su navedeni u poruci korisnika.
3. Ako navedeni isječci ne sadrže odgovor, kaži tačno: "Na osnovu dostupnih
   dokumenata ne mogu dati odgovor." Ne izmišljaj članove, datume ili pravila.
4. Ne daj pravni savjet. Tvoj odgovor je informativan i mora biti provjeren od
   strane pravnika prije primjene.
5. Budi sažet — pravnik već zna kontekst, treba mu suština.
6. Prethodne poruke razgovora služe samo za kontekst; brojevi citata
   [1]..[N] uvijek se odnose ISKLJUČIVO na isječke u TRENUTNOJ korisničkoj
   poruci, ne na isječke iz ranijih razmjena.`;

/** Glavni async generator — emituje QnaStreamEvent-ove. */
export async function* answerStream(
  req: QnaRequest,
): AsyncGenerator<QnaStreamEvent, void, void> {
  const start = Date.now();

  // 1. Pretraga konteksta. Za kratka follow-up pitanja (npr. "samo u
  //    zakonu o medijima") dodajemo zadnje korisnikovo pitanje u upit
  //    da embedding signal ne propadne. Inače trenutno pitanje samo.
  const upitZaPretragu = sastaviUpitZaPretragu(req.pitanje, req.istorija);
  const { pogoci } = await search({
    upit: upitZaPretragu,
    filteri: req.filteri,
    topK: DEFAULT_KONTEKST_K,
  });

  if (pogoci.length === 0) {
    yield {
      tip: "greska",
      poruka: "Nema relevantnih dokumenata u bazi za ovaj upit.",
    };
    return;
  }

  // 2. Emituj `citati` event odmah — UI ih prikazuje dok Claude još razmišlja.
  const citati = pogoci.map(hitToCitat);
  yield { tip: "citati", citati };

  // 3. Konstruiši user prompt sa numerisanim isječcima.
  const userPrompt = formatUserPrompt(req.pitanje, pogoci);

  // 4. Stream odgovor sa Claude API-ja, sa istorijom prethodnih razmjena.
  //    Prethodne assistant poruke ne sadrže isječke iz njihovog turna —
  //    samo tekst odgovora. Citati [1]..[N] u trenutnom turnu odnose se
  //    SAMO na isječke u aktuelnom user prompt-u.
  try {
    const claude = getClaude();
    const stream = claude.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...formatirajIstoriju(req.istorija),
        { role: "user", content: userPrompt },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { tip: "token", tekst: event.delta.text };
      }
    }

    yield {
      tip: "kraj",
      model: CLAUDE_MODEL,
      trajanjeMs: Date.now() - start,
    };
  } catch (e) {
    yield {
      tip: "greska",
      poruka:
        e instanceof Error
          ? `Claude API greška: ${e.message}`
          : "Nepoznata greška u generisanju odgovora.",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hitToCitat(h: SearchHit): Citat {
  return {
    documentId: h.documentId,
    chunkId: h.chunkId,
    naslov: h.naslov,
    referenca: h.referenca,
    isjecak: h.isjecak,
    skor: h.skor,
    tip: h.metapodaci.tip as DocumentType,
  };
}

function formatUserPrompt(pitanje: string, hits: SearchHit[]): string {
  const isjecciBlok = hits
    .map((h, i) => {
      const ref = h.referenca ? ` — ${h.referenca}` : "";
      return `[${i + 1}] ${h.naslov}${ref}\n${h.isjecak}`;
    })
    .join("\n\n---\n\n");

  return `PITANJE: ${pitanje}\n\nISJEČCI:\n${isjecciBlok}`;
}

/**
 * Mapira QnaPoruka[] u Anthropic messages format. Uzima samo zadnjih
 * MAX_ISTORIJA poruka i obezbjeđuje da niz počinje sa "user" (Claude
 * API zahtjev) — ako ispadne assistant prvo, sjeku se i te.
 */
function formatirajIstoriju(
  istorija: QnaPoruka[] | undefined,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!istorija || istorija.length === 0) return [];
  let posljednje = istorija.slice(-MAX_ISTORIJA);
  // Prvi mora biti user (Anthropic ograničenje).
  while (posljednje.length > 0 && posljednje[0]!.uloga !== "user") {
    posljednje = posljednje.slice(1);
  }
  return posljednje.map((p) => ({
    role: p.uloga === "user" ? "user" : "assistant",
    content: p.tekst,
  }));
}

/**
 * Sastavlja upit za RAG search. Za kratka follow-up pitanja (ispod
 * FOLLOWUP_PRAG karaktera) dodaje zadnje user pitanje iz istorije — bez
 * toga embedding "samo u zakonu o medijima" ne nosi semantički signal o
 * tome šta se pita.
 */
function sastaviUpitZaPretragu(
  pitanje: string,
  istorija: QnaPoruka[] | undefined,
): string {
  if (pitanje.length >= FOLLOWUP_PRAG || !istorija) return pitanje;
  const zadnjeUserPitanje = [...istorija]
    .reverse()
    .find((p) => p.uloga === "user");
  if (!zadnjeUserPitanje) return pitanje;
  return `${zadnjeUserPitanje.tekst} ${pitanje}`;
}

export { MAX_KONTEKST_K };
