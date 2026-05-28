/**
 * Async ingest worker — pokreće se nakon što HTTP upload vrati 201.
 *
 * Korak po korak:
 *   1) Učitaj dokument iz DB-a (tekst, mimetip).
 *   2) Postavi faza = CHUNKING, generiši chunk-ove iz teksta.
 *   3) Postavi faza = EMBEDDING, izračunaj embeddinge u batch-evima
 *      (po 16, vidi EMBED_BATCH_SIZE).
 *   4) Upiši sve chunk-ove u rag.chunks u jednoj transakciji
 *      (sa starim chunkovima obrisanim — idempotentno za re-indeks).
 *   5) Postavi faza = ZAVRSENO + embedded_u = NOW().
 *
 * Crash-recovery: pri startup-u backend traži dokumente sa faza
 * IN ('CHUNKING','EMBEDDING','INDEKSIRANJE') i pokreće ih ponovo.
 * Postojeći chunkovi se brišu (DELETE CASCADE bi ih ostavio sirote).
 *
 * Greške: faza = GRESKA + ingest_greska populated + audit FAILED zapis.
 */

import { pool } from "../db.js";
import { embedBatched, EMBED_BATCH_SIZE } from "./embeddings.js";
import { logIngest } from "./audit.js";
import { chunkText, type ParsedChunk } from "./chunking.js";

interface DocForIngest {
  id: string;
  tekst: string | null;
}

/**
 * Concurrency limit za ingest worker. Embedding sidecar je single-process
 * (jedan Python proces, jedan model u memoriji), pa paralelne ingest task-ove
 * dijeli CPU što kvari throughput i pravi `fetch failed` na konekcijama koje
 * se kufaju u redu. Serial obrada (1 dokument istovremeno) daje punu CPU
 * dostupnost embeddings sidecar-u, queue se brže drenira ukupno.
 *
 * Default 1; može se podići kroz `INGEST_CONCURRENCY` ako embeddings dobije
 * GPU sa headroom-om (`device="cuda"` može da obradi više batch-eva paralelno).
 */
const INGEST_CONCURRENCY = (() => {
  const raw = process.env.INGEST_CONCURRENCY;
  if (!raw || raw.trim() === "") return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
})();

const queue: string[] = [];
let active = 0;

/** Pokreće async ingest za jedan dokument. Stavlja u red ako su svi slot-ovi zauzeti. */
export function scheduleIngest(documentId: string): void {
  queue.push(documentId);
  pumpQueue();
}

function pumpQueue(): void {
  while (active < INGEST_CONCURRENCY && queue.length > 0) {
    const id = queue.shift()!;
    active++;
    setImmediate(() => {
      runIngest(id)
        .catch((e) => {
          console.error(`[worker] neuhvaćena greška u runIngest(${id}):`, e);
        })
        .finally(() => {
          active--;
          pumpQueue();
        });
    });
  }
}

/** Pronalazi sve dokumente sa polovično obrađenom obradom i pokreće ih. */
export async function recoverStaleIngests(): Promise<number> {
  const r = await pool.query<{ id: string }>(`
    SELECT id FROM documents.documents
     WHERE faza IN ('CHUNKING', 'EMBEDDING', 'INDEKSIRANJE')
       AND obrisano IS NULL
  `);
  for (const row of r.rows) {
    scheduleIngest(row.id);
  }
  return r.rowCount ?? 0;
}

async function runIngest(documentId: string): Promise<void> {
  const start = Date.now();
  let chunks: ParsedChunk[] = [];

  try {
    // 1. Učitaj dokument.
    const docRes = await pool.query<DocForIngest>(
      `SELECT id, tekst FROM documents.documents WHERE id = $1`,
      [documentId],
    );
    const doc = docRes.rows[0];
    if (!doc) {
      console.warn(`[worker] dokument ${documentId} ne postoji, preskačem`);
      return;
    }
    if (!doc.tekst || doc.tekst.length === 0) {
      await setFaza(documentId, "GRESKA", "Dokument nema teksta za chunkovanje.");
      return;
    }

    // 2. CHUNKING
    await setFaza(documentId, "CHUNKING");
    chunks = chunkText(doc.tekst);
    if (chunks.length === 0) {
      await setFaza(documentId, "GRESKA", "Chunker je vratio 0 chunk-ova.");
      return;
    }
    await logIngest({
      documentId,
      akcija: "CHUNK",
      detalji: {
        brojChunkova: chunks.length,
        sasStrukturom: chunks.filter((c) => c.strukturaPutanja !== null).length,
      },
    });

    // 3. EMBEDDING (cijeli batch interno dijeli embedBatched).
    await setFaza(documentId, "EMBEDDING");
    const embedStart = Date.now();
    const vektori = await embedBatched(chunks.map((c) => c.sadrzaj));
    if (vektori.length !== chunks.length) {
      throw new Error(
        `Embedding servis je vratio ${vektori.length} vektora za ${chunks.length} chunk-ova.`,
      );
    }
    await logIngest({
      documentId,
      akcija: "EMBED",
      detalji: {
        brojChunkova: chunks.length,
        brojBatch: Math.ceil(chunks.length / EMBED_BATCH_SIZE),
        velicinaBatch: EMBED_BATCH_SIZE,
      },
      trajanjeMs: Date.now() - embedStart,
    });

    // 4. INSERT u rag.chunks (transakcija, idempotentno preko DELETE).
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Briši postojeće chunkove (za slučaj re-indeksiranja / recovery-ja).
      await client.query(`DELETE FROM rag.chunks WHERE document_id = $1`, [documentId]);

      // pgvector serializacija: vector('[0.1,0.2,...]')
      // Sve chunkove unesemo u jedno multi-row INSERT-u kroz UNNEST.
      const ids: string[] = chunks.map(() => randomUuidish());
      const rednBrojevi = chunks.map((c) => c.rednBroj);
      const sadrzaji = chunks.map((c) => c.sadrzaj);
      const tokeni = chunks.map((c) => c.brojTokena);
      const putanje = chunks.map((c) => c.strukturaPutanja);
      const embStrings = vektori.map((v) => `[${v.join(",")}]`);

      await client.query(
        `INSERT INTO rag.chunks
           (id, document_id, redni_broj, sadrzaj, broj_tokena, struktura_putanja,
            embedding, embedded_u)
         SELECT
           unnest($2::uuid[]),
           $1::uuid,
           unnest($3::int[]),
           unnest($4::text[]),
           unnest($5::int[]),
           unnest($6::text[]),
           unnest($7::text[])::vector,
           NOW()`,
        [documentId, ids, rednBrojevi, sadrzaji, tokeni, putanje, embStrings],
      );

      // 5. Marker uspjeha.
      await client.query(
        `UPDATE documents.documents
            SET faza = 'ZAVRSENO',
                chunked_u = COALESCE(chunked_u, NOW()),
                embedded_u = NOW(),
                ingest_greska = NULL
          WHERE id = $1`,
        [documentId],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    console.log(
      `[worker] dokument ${documentId} indeksiran: ${chunks.length} chunk-ova, ${Date.now() - start}ms`,
    );
  } catch (e) {
    const poruka = e instanceof Error ? e.message : String(e);
    console.error(`[worker] greška za ${documentId}: ${poruka}`);
    await setFaza(documentId, "GRESKA", poruka);
    await logIngest({
      documentId,
      akcija: "FAILED",
      status: "GRESKA",
      greska: poruka,
      detalji: { faza: "ingest_worker", brojChunkova: chunks.length },
      trajanjeMs: Date.now() - start,
    }).catch(() => {});
  }
}

async function setFaza(
  documentId: string,
  faza: "CHUNKING" | "EMBEDDING" | "INDEKSIRANJE" | "ZAVRSENO" | "GRESKA",
  greska?: string,
): Promise<void> {
  await pool.query(
    `UPDATE documents.documents
        SET faza = $2,
            ingest_greska = $3,
            chunked_u = CASE
              WHEN $2 IN ('EMBEDDING', 'INDEKSIRANJE', 'ZAVRSENO') AND chunked_u IS NULL
                THEN NOW()
              ELSE chunked_u
            END
      WHERE id = $1`,
    [documentId, faza, greska ?? null],
  );
}

/** Mali helper za generisanje UUID-eva bez dodatne zavisnosti. */
function randomUuidish(): string {
  return crypto.randomUUID();
}
