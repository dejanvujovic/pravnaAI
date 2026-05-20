/**
 * Ekstrakcija teksta iz digitalnog PDF i DOCX.
 *
 * Scan PDF-ovi (sve slike, bez text layer-a) ovdje vraćaju prazan tekst —
 * tu logiku hvata kasnije OCR pipeline (Faza 1 PR #4), čije su pretpostavke:
 * `brojStrana > 0 && tekst.length == 0`.
 *
 * PDF parser: `unpdf` (wrapper oko aktualnog Mozilla pdfjs-dist).
 * DOCX parser: `mammoth.extractRawText`.
 */

import { extractText } from "unpdf";
import mammoth from "mammoth";

export const SUPPORTED_MIMETYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ParsedDocumentText = {
  tekst: string;
  brojStrana: number | null;
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
): Promise<ParsedDocumentText> {
  if (mimetype === SUPPORTED_MIMETYPES.PDF) return parsePdf(buffer);
  if (mimetype === SUPPORTED_MIMETYPES.DOCX) return parseDocx(buffer);
  throw new ParserError(`Nepodržan MIME tip za parsiranje: ${mimetype}`);
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocumentText> {
  try {
    // unpdf očekuje Uint8Array; Buffer to već jeste, ali kopiramo
    // ArrayBuffer view da izbjegnemo eventualne shared-memory probleme.
    const u8 = new Uint8Array(buffer);
    // `mergePages: true` → text je string (ne array). totalPages je broj.
    const result = await extractText(u8, { mergePages: true });
    return {
      tekst: normalize(result.text),
      brojStrana: result.totalPages,
    };
  } catch (e) {
    throw new ParserError("Greška pri parsiranju PDF-a", e);
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocumentText> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      tekst: normalize(result.value ?? ""),
      brojStrana: null, // DOCX nema fiksan koncept "stranice"
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
