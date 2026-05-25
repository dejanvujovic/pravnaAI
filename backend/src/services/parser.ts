/**
 * Ekstrakcija teksta iz digitalnog PDF i DOCX, sa automatskim OCR fallback-om
 * za skenirane PDF-ove.
 *
 * PDF tok:
 *   1) `unpdf` izvuče text layer (digitalno generisani PDF-ovi)
 *   2) Ako je rezultat prazan (skeniran dokument bez text layer-a),
 *      poziva se OCR sidecar (Tesseract sa srpskim ćirilica + latinica)
 *
 * DOCX tok: `mammoth.extractRawText` — DOCX nema scan/digital razdvajanje.
 *
 * Bibliotečke odluke:
 *   - PDF: `unpdf` (wrapper oko aktualnog Mozilla pdfjs-dist)
 *   - DOCX: `mammoth`
 *   - OCR: zaseban Python sidecar (vidi services/ocr.ts), ne tesseract.js
 */

import { extractText } from "unpdf";
import mammoth from "mammoth";
import { ocrPdf } from "./ocr.js";

export const SUPPORTED_MIMETYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ParsedDocumentText = {
  tekst: string;
  brojStrana: number | null;
  /** true ako je tekst dobijen kroz OCR sidecar, ne text layer */
  ocrKoristen: boolean;
  /** trajanje OCR-a u ms (null ako nije korišten) */
  ocrTrajanjeMs: number | null;
};

export class ParserError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "ParserError";
  }
}

export async function parseFile(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
): Promise<ParsedDocumentText> {
  if (mimetype === SUPPORTED_MIMETYPES.PDF) return parsePdf(buffer, originalName);
  if (mimetype === SUPPORTED_MIMETYPES.DOCX) return parseDocx(buffer);
  throw new ParserError(`Nepodržan MIME tip za parsiranje: ${mimetype}`);
}

async function parsePdf(buffer: Buffer, originalName: string): Promise<ParsedDocumentText> {
  // 1. Pokušaj izvlačenje text layer-a.
  let tekst: string;
  let brojStrana: number | null;
  try {
    const u8 = new Uint8Array(buffer);
    const result = await extractText(u8, { mergePages: true });
    tekst = normalize(result.text);
    brojStrana = result.totalPages;
  } catch (e) {
    throw new ParserError("Greška pri parsiranju PDF-a", e);
  }

  // 2. Digital PDF — tekst postoji, vraćamo bez OCR-a.
  if (tekst.length > 0 || brojStrana === 0 || brojStrana === null) {
    return { tekst, brojStrana, ocrKoristen: false, ocrTrajanjeMs: null };
  }

  // 3. Scan PDF — ima strana ali prazan text layer → OCR fallback.
  //    Greška OCR-a se PROPAGIRA naviše (route je hvata kao 422), jer
  //    dokument bez teksta nije koristan za RAG indeksiranje.
  const ocrStart = Date.now();
  try {
    const ocr = await ocrPdf(buffer, originalName);
    const ocrTekst = normalize(
      ocr.strane.map((s) => s.tekst).join("\n\n"),
    );
    return {
      tekst: ocrTekst,
      brojStrana: ocr.broj_strana,
      ocrKoristen: true,
      ocrTrajanjeMs: Date.now() - ocrStart,
    };
  } catch (e) {
    throw new ParserError(
      "Skeniran PDF — OCR servis nije uspio izvući tekst",
      e,
    );
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocumentText> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      tekst: normalize(result.value ?? ""),
      brojStrana: null, // DOCX nema fiksan koncept "stranice"
      ocrKoristen: false,
      ocrTrajanjeMs: null,
    };
  } catch (e) {
    throw new ParserError("Greška pri parsiranju DOCX-a", e);
  }
}

/**
 * Normalizacija teksta:
 *  - CRLF/CR → LF
 *  - tri ili više uzastopnih praznih linija → dvije
 *  - trim trailing whitespace na svakoj liniji
 *  - trim na cijelom rezultatu
 */
function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
