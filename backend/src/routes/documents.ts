/**
 * Documents API — ingest i pretraga dokumenata.
 *
 * Trenutni endpointi:
 *   POST /api/documents        Multipart upload (PDF/DOCX) + JSON metapodaci.
 *
 * Buduće (sljedeći PR-ovi):
 *   - GET    /api/documents          listing sa filterima
 *   - GET    /api/documents/:id      detalji
 *   - DELETE /api/documents/:id      soft delete
 *   - POST   /api/documents/:id/reindex
 */

import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { DocumentMeta } from "@rtcg/shared";
import { pool } from "../db.js";
import { hashBuffer, removeFileQuiet, storeFile } from "../services/storage.js";
import { logIngest } from "../services/audit.js";
import { ParserError, SUPPORTED_MIMETYPES, parseFile } from "../services/parser.js";

// ---------------------------------------------------------------------------
// Multer (memory storage; fajlovi do 50 MB)
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = 50;
const ALLOWED_MIMETYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Validacija metapodataka
// ---------------------------------------------------------------------------

const metadataSchema = z.object({
  naslov: z.string().min(1).max(500),
  tip: z.enum([
    "ZAKON",
    "PODZAKONSKI_AKT",
    "INTERNI_AKT",
    "UGOVOR_O_RADU",
    "UGOVOR_JAVNA_NABAVKA",
    "PRESUDA",
    "SUDSKA_PRAKSA",
    "MISLJENJE",
    "OSTALO",
  ]),
  oblast: z.enum([
    "RADNO_PRAVO",
    "JAVNE_NABAVKE",
    "PARNICNI_POSTUPAK",
    "UPRAVNI_POSTUPAK",
    "MEDIJSKO_PRAVO",
    "OBLIGACIONO",
    "AUTORSKO",
    "KRIVICNO",
    "OSTALO",
  ]),
  status: z.enum(["NACRT", "VAZECI", "STAVLJEN_VAN_SNAGE", "ARHIVA"]).optional(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum mora biti u formatu YYYY-MM-DD").optional(),
  organSud: z.string().max(255).optional(),
  brojSluzbenogLista: z.string().max(100).optional(),
  jezik: z.enum(["sr-Cyrl", "sr-Latn", "mixed"]).optional(),
});

type IngestMetadata = z.infer<typeof metadataSchema>;

// ---------------------------------------------------------------------------
// DB row → DocumentMeta mapper
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  naslov: string;
  tip: string;
  oblast: string;
  status: string;
  datum: string | null;
  organ_sud: string | null;
  broj_sluzbenog_lista: string | null;
  jezik: string;
  broj_strana: number | null;
  velicina_bajtova: string | null; // BIGINT vraća se kao string iz pg-a
  broj_segmenata: number; // izračunato kao COUNT(*) iz rag.chunks
  kreirano: Date;
  azurirano: Date;
}

function akcijaZaMime(mimetype: string): "PARSE_PDF" | "PARSE_DOCX" {
  return mimetype === SUPPORTED_MIMETYPES.PDF ? "PARSE_PDF" : "PARSE_DOCX";
}

function rowToMeta(r: DocumentRow): DocumentMeta {
  return {
    id: r.id,
    naslov: r.naslov,
    tip: r.tip as DocumentMeta["tip"],
    oblast: r.oblast as DocumentMeta["oblast"],
    status: r.status as DocumentMeta["status"],
    datum: r.datum,
    organSud: r.organ_sud,
    brojSluzbenogLista: r.broj_sluzbenog_lista,
    jezik: r.jezik as DocumentMeta["jezik"],
    brojStrana: r.broj_strana,
    velicinaBajtova: r.velicina_bajtova ? Number(r.velicina_bajtova) : null,
    brojSegmenata: r.broj_segmenata,
    kreirano: r.kreirano.toISOString(),
    azurirano: r.azurirano.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetadataField(raw: unknown): IngestMetadata {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return metadataSchema.parse(parsed);
}

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

function isUniqueViolation(e: unknown, constraint: string): e is PgError {
  return (
    e instanceof Error &&
    "code" in e &&
    (e as PgError).code === "23505" &&
    (e as PgError).constraint === constraint
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const documentsRouter = Router();

documentsRouter.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ greska: "Fajl nije priložen u polju 'file'." });
      return;
    }

    if (req.file.size === 0) {
      res.status(400).json({ greska: "Fajl je prazan." });
      return;
    }

    if (!ALLOWED_MIMETYPES.has(req.file.mimetype)) {
      res.status(415).json({
        greska: `Nepodržan format: ${req.file.mimetype}. Dozvoljeno: PDF i DOCX.`,
      });
      return;
    }

    let metadata: IngestMetadata;
    try {
      metadata = parseMetadataField(req.body.metadata);
    } catch (e) {
      res.status(400).json({
        greska: "Neispravni metapodaci u polju 'metadata' (JSON sa naslov, tip, oblast...).",
        detalji: e instanceof z.ZodError ? e.flatten() : String(e),
      });
      return;
    }

    const hash = hashBuffer(req.file.buffer);

    // 1. Provjera duplikata po hash-u (prije snimanja fajla).
    const existing = await pool.query<{ id: string; naslov: string }>(
      `SELECT id, naslov
         FROM documents.documents
        WHERE izvorni_fajl_hash = $1 AND obrisano IS NULL
        LIMIT 1`,
      [hash],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const dup = existing.rows[0]!;
      res.status(409).json({
        greska: "Dokument sa istim sadržajem već postoji.",
        postojeci: { id: dup.id, naslov: dup.naslov },
      });
      return;
    }

    // 2. Snimi fajl prije INSERT-a — UUID je već poznat.
    const documentId = randomUUID();
    const stored = await storeFile(documentId, req.file.originalname, req.file.buffer);

    // 3. Parsiranje teksta. Greška ovdje znači da fajl nije validan PDF/DOCX —
    //    vraćamo 422, ali ne brišemo fajl jer ga je korisnik već uspješno
    //    uploadovao; soft delete + reindex u kasnijoj fazi.
    let tekst: string;
    let brojStrana: number | null;
    const parseStart = Date.now();
    try {
      const parsed = await parseFile(req.file.buffer, req.file.mimetype);
      tekst = parsed.tekst;
      brojStrana = parsed.brojStrana;
    } catch (e) {
      await removeFileQuiet(stored.putanjaApsolutna);
      // Document još nije u DB-u (INSERT dolazi tek poslije parsiranja),
      // pa FK na audit.ingest_log.document_id bi pao; ostavljamo NULL.
      await logIngest({
        documentId: null,
        akcija: "FAILED",
        status: "GRESKA",
        greska: e instanceof Error ? e.message : String(e),
        detalji: {
          faza: "parser",
          mimetip: req.file.mimetype,
          originalnoIme: req.file.originalname,
          hash,
        },
        trajanjeMs: Date.now() - parseStart,
      }).catch((logErr) => {
        console.error("[audit] nije uspjelo logovanje parse failure-a:", logErr);
      });
      res.status(422).json({
        greska: "Fajl nije moguće parsirati kao validan PDF/DOCX.",
        detalji: e instanceof ParserError ? e.message : undefined,
      });
      return;
    }
    const parseTrajanjeMs = Date.now() - parseStart;

    // 4. INSERT + audit u jednoj transakciji.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ins = await client.query<DocumentRow>(
        `INSERT INTO documents.documents (
            id, naslov, tip, oblast, status, datum, organ_sud, broj_sluzbenog_lista,
            jezik, broj_strana, velicina_bajtova,
            izvorni_fajl_putanja, izvorni_fajl_hash, izvorni_fajl_mimetip,
            tekst
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id, naslov, tip, oblast, status, datum, organ_sud, broj_sluzbenog_lista,
                   jezik, broj_strana, velicina_bajtova, kreirano, azurirano,
                   (SELECT COUNT(*)::int
                      FROM rag.chunks
                     WHERE document_id = $1::uuid) AS broj_segmenata`,
        [
          documentId,
          metadata.naslov,
          metadata.tip,
          metadata.oblast,
          metadata.status ?? "VAZECI",
          metadata.datum ?? null,
          metadata.organSud ?? null,
          metadata.brojSluzbenogLista ?? null,
          metadata.jezik ?? "mixed",
          brojStrana,
          stored.velicinaBajtova,
          stored.putanjaRelativna,
          hash,
          req.file.mimetype,
          tekst,
        ],
      );

      await logIngest(
        {
          documentId,
          akcija: "UPLOAD",
          detalji: {
            mimetip: req.file.mimetype,
            velicinaBajtova: stored.velicinaBajtova,
            originalnoIme: req.file.originalname,
          },
        },
        client,
      );

      await logIngest(
        {
          documentId,
          akcija: akcijaZaMime(req.file.mimetype),
          detalji: {
            brojStrana,
            duzinaTeksta: tekst.length,
            jeBezTeksta: tekst.length === 0,
          },
          trajanjeMs: parseTrajanjeMs,
        },
        client,
      );

      await client.query("COMMIT");

      res.status(201).json(rowToMeta(ins.rows[0]!));
    } catch (e) {
      await client.query("ROLLBACK");
      await removeFileQuiet(stored.putanjaApsolutna);

      if (isUniqueViolation(e, "documents_hash_uq")) {
        res.status(409).json({
          greska:
            "Dokument sa istim sadržajem već postoji (race condition uhvaćen na UNIQUE).",
        });
        return;
      }

      // Audit log za failure, izvan transakcije.
      await logIngest({
        documentId,
        akcija: "FAILED",
        status: "GRESKA",
        greska: e instanceof Error ? e.message : String(e),
      }).catch(() => {
        /* secondary failure — ne propagiramo */
      });

      throw e;
    } finally {
      client.release();
    }
  },
);
