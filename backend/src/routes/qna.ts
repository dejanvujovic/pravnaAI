/**
 * Q&A API — generisani odgovor sa citiranjem izvora (SSE stream).
 *
 *   POST /api/qna   QnaRequest → text/event-stream sa QnaStreamEvent-ovima
 *
 * Odgovor se vraća kao SSE: svaka linija je `data: <json>\n\n`. Klijent
 * koristi EventSource ili fetch + ReadableStream parser, dispatch-uje
 * po `tip` polju (token | citati | kraj | greska).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { QnaStreamEvent } from "@rtcg/shared";
import { answerStream } from "../services/qna.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const qnaSchema = z.object({
  pitanje: z.string().trim().min(3).max(2000),
  filteri: z
    .object({
      tip: z.array(z.enum(TIP)).min(1).optional(),
      oblast: z.array(z.enum(OBLAST)).min(1).optional(),
      status: z.array(z.enum(STATUS)).min(1).optional(),
      datumOd: z.string().regex(DATE_RE).optional(),
      datumDo: z.string().regex(DATE_RE).optional(),
    })
    .optional(),
});

export const qnaRouter = Router();

qnaRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  let parsed;
  try {
    parsed = qnaSchema.parse(req.body);
  } catch (e) {
    res.status(400).json({
      greska: "Neispravan Q&A zahtjev.",
      detalji: e instanceof z.ZodError ? e.flatten() : String(e),
    });
    return;
  }

  // Postavi SSE headere prije prvog event-a; flushHeaders šalje status
  // odmah da klijent zna da je veza otvorena (a ne da je timeout u toku).
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering ako se doda
  res.flushHeaders();

  const send = (event: QnaStreamEvent): boolean =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Heartbeat svakih 15s da spriječi load balancer da prekine konekciju.
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15_000);

  try {
    for await (const ev of answerStream(parsed)) {
      const ok = send(ev);
      if (!ok) {
        // Klijent ne čita — sačekaj da se buffer isprazni.
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }
  } catch (e) {
    send({
      tip: "greska",
      poruka: e instanceof Error ? e.message : "Neočekivana greška.",
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
