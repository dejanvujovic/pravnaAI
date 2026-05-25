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
  QnaRequest,
  QnaStreamEvent,
  SearchHit,
} from "@rtcg/shared";
import { CLAUDE_MODEL, getClaude } from "./claude.js";
import { search } from "./search.js";

const DEFAULT_KONTEKST_K = 8;
const MAX_KONTEKST_K = 15;
const MAX_TOKENS = 1024;

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
5. Budi sažet — pravnik već zna kontekst, treba mu suština.`;

/** Glavni async generator — emituje QnaStreamEvent-ove. */
export async function* answerStream(
  req: QnaRequest,
): AsyncGenerator<QnaStreamEvent, void, void> {
  const start = Date.now();

  // 1. Pretraga konteksta. Default DEFAULT_KONTEKST_K hit-ova; trenutno
  //    fiksno — kasnije se može izložiti u QnaRequest-u kad UI to zatraži.
  const { pogoci } = await search({
    upit: req.pitanje,
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

  // 4. Stream odgovor sa Claude API-ja.
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
      messages: [{ role: "user", content: userPrompt }],
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

export { MAX_KONTEKST_K };
