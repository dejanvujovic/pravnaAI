/**
 * Search API — semantička + leksička pretraga nad indeksiranim chunkovima.
 *
 * Trenutno:
 *   POST /api/search    SearchRequest → SearchResponse (hybrid RRF)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { MAX_TOP_K, search } from "../services/search.js";

// Enum vrijednosti su duplikovane iz shared/types.ts radi Zod tuple-a
// (z.enum zahtijeva non-readonly string tuple; Object.values + cast bi
// izgubio literal type-ove).
const TIP = [
  "ZAKON",
  "PODZAKONSKI_AKT",
  "INTERNI_AKT",
  "UGOVOR_O_RADU",
  "UGOVOR_JAVNA_NABAVKA",
  "PRESUDA",
  "SUDSKA_PRAKSA",
  "MISLJENJE",
  "OSTALO",
] as const;

const OBLAST = [
  "RADNO_PRAVO",
  "JAVNE_NABAVKE",
  "PARNICNI_POSTUPAK",
  "UPRAVNI_POSTUPAK",
  "MEDIJSKO_PRAVO",
  "OBLIGACIONO",
  "AUTORSKO",
  "KRIVICNO",
  "OSTALO",
] as const;

const STATUS = ["NACRT", "VAZECI", "STAVLJEN_VAN_SNAGE", "ARHIVA"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const searchSchema = z.object({
  upit: z.string().trim().min(1).max(500),
  filteri: z
    .object({
      tip: z.array(z.enum(TIP)).min(1).optional(),
      oblast: z.array(z.enum(OBLAST)).min(1).optional(),
      status: z.array(z.enum(STATUS)).min(1).optional(),
      datumOd: z.string().regex(DATE_RE, "datumOd mora biti YYYY-MM-DD").optional(),
      datumDo: z.string().regex(DATE_RE, "datumDo mora biti YYYY-MM-DD").optional(),
    })
    .optional(),
  topK: z.number().int().min(1).max(MAX_TOP_K).optional(),
});

export const searchRouter = Router();

searchRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  let parsed;
  try {
    parsed = searchSchema.parse(req.body);
  } catch (e) {
    res.status(400).json({
      greska: "Neispravan zahtjev za pretragu.",
      detalji: e instanceof z.ZodError ? e.flatten() : String(e),
    });
    return;
  }

  const odgovor = await search(parsed);
  res.json(odgovor);
});
