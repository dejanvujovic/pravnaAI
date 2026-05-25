/**
 * Razgovori API — perzistentna istorija Q&A razgovora za sidebar.
 *
 * Endpointi:
 *   GET    /api/conversations?sesijaId=UUID   Lista razgovora za sesiju.
 *   GET    /api/conversations/:id             Pun razgovor + poruke.
 *   DELETE /api/conversations/:id             Soft delete.
 *
 * Kreiranje razgovora ide lijeno kroz POST /api/qna — vidi services/qna.ts.
 * Bez auth-a; vlasništvo se određuje preko `sesija_id` koji frontend
 * čuva u localStorage.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Citat, RazgovorDetail, RazgovorListItem, SacuvanaPoruka } from "@rtcg/shared";
import { pool } from "../db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const conversationsRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/conversations?sesijaId=UUID — lista za sidebar
// ---------------------------------------------------------------------------

interface RazgovorListRow {
  id: string;
  naslov: string;
  kreirano: Date;
  azurirano: Date;
}

const listQuerySchema = z.object({
  sesijaId: z.string().regex(UUID_RE, "sesijaId mora biti UUID"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

conversationsRouter.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        greska: "Neispravni query parametri.",
        detalji: parsed.error.flatten(),
      });
      return;
    }
    const { sesijaId, limit } = parsed.data;

    const r = await pool.query<RazgovorListRow>(
      `SELECT id, naslov, kreirano, azurirano
         FROM chat.razgovori
        WHERE sesija_id = $1::uuid AND obrisano IS NULL
        ORDER BY azurirano DESC
        LIMIT $2::int`,
      [sesijaId, limit],
    );

    const razgovori: RazgovorListItem[] = r.rows.map((row) => ({
      id: row.id,
      naslov: row.naslov,
      kreirano: row.kreirano.toISOString(),
      azurirano: row.azurirano.toISOString(),
    }));

    res.json({ razgovori });
  },
);

// ---------------------------------------------------------------------------
// GET /api/conversations/:id — pun razgovor sa porukama
// ---------------------------------------------------------------------------

interface RazgovorRow {
  id: string;
  naslov: string;
  kreirano: Date;
  azurirano: Date;
}

interface PorukaRow {
  id: string;
  uloga: string;
  tekst: string;
  citati: Citat[] | null;
  kreirano: Date;
}

conversationsRouter.get(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id || !UUID_RE.test(id)) {
      res.status(400).json({ greska: "Neispravan ID razgovora." });
      return;
    }

    const rg = await pool.query<RazgovorRow>(
      `SELECT id, naslov, kreirano, azurirano
         FROM chat.razgovori
        WHERE id = $1::uuid AND obrisano IS NULL`,
      [id],
    );
    if (rg.rowCount === 0) {
      res.status(404).json({ greska: "Razgovor nije pronađen." });
      return;
    }

    const pr = await pool.query<PorukaRow>(
      `SELECT id, uloga, tekst, citati, kreirano
         FROM chat.poruke
        WHERE razgovor_id = $1::uuid
        ORDER BY redni_broj ASC`,
      [id],
    );

    const razgovor = rg.rows[0]!;
    const poruke: SacuvanaPoruka[] = pr.rows.map((row) => ({
      id: row.id,
      uloga: row.uloga as "user" | "ai",
      tekst: row.tekst,
      citati: row.citati,
      kreirano: row.kreirano.toISOString(),
    }));

    const detalj: RazgovorDetail = {
      id: razgovor.id,
      naslov: razgovor.naslov,
      kreirano: razgovor.kreirano.toISOString(),
      azurirano: razgovor.azurirano.toISOString(),
      poruke,
    };

    res.json(detalj);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/conversations/:id — soft delete
// ---------------------------------------------------------------------------

conversationsRouter.delete(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id || !UUID_RE.test(id)) {
      res.status(400).json({ greska: "Neispravan ID razgovora." });
      return;
    }

    const r = await pool.query(
      `UPDATE chat.razgovori
          SET obrisano = NOW()
        WHERE id = $1::uuid AND obrisano IS NULL`,
      [id],
    );

    if (r.rowCount === 0) {
      res.status(404).json({ greska: "Razgovor nije pronađen ili je već obrisan." });
      return;
    }

    res.status(204).end();
  },
);
