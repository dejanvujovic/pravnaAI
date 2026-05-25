/**
 * Chunkovanje izvučenog teksta dokumenata za RAG indeksiranje.
 *
 * Strategija:
 *   1) Detekcija članova zakona regex-om ("Član N" latinica/ćirilica,
 *      sa ili bez dijakritika). Ako ima >= 2 člana, svaki član = chunk
 *      (sa strukturnom putanjom). Pre-veliki članovi se dijele dalje.
 *   2) Fallback: fiksna veličina (~3500 karaktera ≈ ~900 tokena za
 *      BGE-M3, dobro ispod 8192 limit-a), 350 karaktera overlap-a,
 *      lomi se na paragraf ili rečenicu kad može.
 *
 * Veličine su u karakterima, ne tokenima — koristimo ~4 char/token
 * aproksimaciju koja je dovoljna za zaštitu od max kontekst-limit-a.
 */

/** Maksimalna veličina chunk-a u karakterima. */
const MAX_CHUNK_CHARS = 3500;
/** Overlap između susjednih fixed-size chunkova. */
const OVERLAP_CHARS = 350;
/** Minimalna veličina chunk-a da ne pravimo besmislene fragmente. */
const MIN_CHUNK_CHARS = 200;
/** Aproksimacija — BGE-M3 tokenizer je drugačiji, ali za broj_tokena u DB-u dovoljno. */
const CHARS_PER_TOKEN = 4;

export interface ParsedChunk {
  rednBroj: number;
  sadrzaj: string;
  brojTokena: number;
  /** Npr. "Član 14" — popunjeno kad chunk dolazi iz prepoznatog člana. */
  strukturaPutanja: string | null;
}

/**
 * Glavni ulaz — vraća chunkove sa rednim brojevima 0..N-1.
 * Ako tekst nije dovoljan ni za jedan chunk, vraća prazan niz.
 */
export function chunkText(tekst: string): ParsedChunk[] {
  const trimmed = tekst.trim();
  if (trimmed.length < MIN_CHUNK_CHARS) {
    return trimmed.length === 0
      ? []
      : [{
          rednBroj: 0,
          sadrzaj: trimmed,
          brojTokena: estimateTokens(trimmed),
          strukturaPutanja: null,
        }];
  }

  const articleChunks = chunkByArticles(trimmed);
  if (articleChunks !== null) {
    return reindex(articleChunks);
  }

  return reindex(chunkBySize(trimmed));
}

// ---------------------------------------------------------------------------
// Article-based chunking
// ---------------------------------------------------------------------------

/**
 * Detektuje "Član N" kao granicu chunk-a. Podržava:
 *   - latinica: Član, Clan, ČLAN, CLAN, član, clan
 *   - ćirilica: Члан, ЧЛАН, члан
 *   - skraćeno ćirilično: Чл., чл., Чл, чл (bez tačke)
 *
 * Match-uje (?:start-of-text|whitespace) prije, jer PDF parser-i često
 * stope tekst u jedan red bez newlines-a. Inline reference tipa
 * "prema članu 14" ne matchuju jer regex eksplicitno traži oblik
 * "Član/Clan/Члан/Чл" + razmak + broj — sufiksi "članu/članom/članova"
 * imaju dodatne karaktere prije razmaka.
 *
 * Capture group 1 = broj člana.
 */
const ARTICLE_RE =
  /(?:^|\s)(?:[Čč]lan|[Cc]lan|[Чч]лан|[Чч]л\.?)\s+(\d+)/gm;

function chunkByArticles(tekst: string): ParsedChunk[] | null {
  const matches = [...tekst.matchAll(ARTICLE_RE)];
  if (matches.length < 2) return null;

  const chunks: ParsedChunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : tekst.length;
    const sadrzaj = tekst.slice(start, end).trim();
    const brojClana = matches[i]![1]!;
    const putanja = `Član ${brojClana}`;

    if (sadrzaj.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        rednBroj: 0, // reindex kasnije
        sadrzaj,
        brojTokena: estimateTokens(sadrzaj),
        strukturaPutanja: putanja,
      });
    } else {
      // Veliki članovi se sub-chunk-uju, ali svi nasljeđuju strukturnu putanju.
      const subs = chunkBySize(sadrzaj);
      for (const sub of subs) {
        chunks.push({ ...sub, strukturaPutanja: putanja });
      }
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Fixed-size chunking
// ---------------------------------------------------------------------------

function chunkBySize(tekst: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  let start = 0;

  while (start < tekst.length) {
    const target = Math.min(start + MAX_CHUNK_CHARS, tekst.length);
    let end = target;

    // Ako nije kraj teksta, pokušaj da nađemo dobru granicu u zadnjih 20%.
    if (target < tekst.length) {
      const searchFrom = Math.max(start + MIN_CHUNK_CHARS, target - MAX_CHUNK_CHARS * 0.2);
      const para = tekst.lastIndexOf("\n\n", target);
      const sent = lastSentenceBreak(tekst, searchFrom, target);
      if (para >= searchFrom) {
        end = para;
      } else if (sent >= searchFrom) {
        end = sent;
      }
    }

    const sadrzaj = tekst.slice(start, end).trim();
    if (sadrzaj.length >= MIN_CHUNK_CHARS || end === tekst.length) {
      chunks.push({
        rednBroj: 0,
        sadrzaj,
        brojTokena: estimateTokens(sadrzaj),
        strukturaPutanja: null,
      });
    }

    // Bili smo na kraju teksta — nema potrebe za dodatnim overlap-chunk-om
    // koji ne donosi novi sadržaj.
    if (end === tekst.length) break;

    const nextStart = end - OVERLAP_CHARS;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

/** Posljednji ". ", "! " ili "? " unutar range-a [from, to]; -1 ako nema. */
function lastSentenceBreak(tekst: string, from: number, to: number): number {
  let best = -1;
  for (const marker of [". ", "! ", "? ", ".\n", "!\n", "?\n"]) {
    const idx = tekst.lastIndexOf(marker, to);
    if (idx >= from && idx > best) best = idx + marker.length;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTokens(s: string | number): number {
  const len = typeof s === "string" ? s.length : s;
  return Math.ceil(len / CHARS_PER_TOKEN);
}

function reindex(chunks: ParsedChunk[]): ParsedChunk[] {
  return chunks.map((c, i) => ({ ...c, rednBroj: i }));
}
