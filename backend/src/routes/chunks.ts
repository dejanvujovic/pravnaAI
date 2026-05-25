/**
 * Chunks API — pristup pojedinačnim segmentima dokumenta.
 *
 * Trenutno: GET /api/chunks/:id za SourceDrawer (klik na citat ispod AI
 * odgovora). Vraća puni sadržaj chunka + metapodatke o pripadajućem
 * dokumentu, da frontend može da prikaže izvor bez dodatnog hitanja
 * /api/documents.
 */

import { Router, type Request, type Response } from "express";
import type { ChunkDetail } from "@rtcg/shared";
import { pool } from "../db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChunkRow {
  id: string;
  document_id: string;
  redni_broj: number;
  sadrzaj: string;
  struktura_putanja: string | null;
  strana_od: number | null;
  strana_do: number | null;
  d_id: string;
  d_naslov: string;
  d_tip: string;
  d_oblast: string;
  d_status: string;
  d_datum: string | null;
  d_organ_sud: string | null;
  d_broj_sluzbenog_lista: string | null;
  d_jezik: string;
}

export const chunksRouter = Router();

chunksRouter.get(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id || !UUID_RE.test(id)) {
      res.status(400).json({ greska: "Neispravan ID chunka." });
      return;
    }

    const r = await pool.query<ChunkRow>(
      `SELECT
         c.id,
         c.document_id,
         c.redni_broj,
         c.sadrzaj,
         c.struktura_putanja,
         c.strana_od,
         c.strana_do,
         d.id  AS d_id,
         d.naslov AS d_naslov,
         d.tip AS d_tip,
         d.oblast AS d_oblast,
         d.status AS d_status,
         d.datum AS d_datum,
         d.organ_sud AS d_organ_sud,
         d.broj_sluzbenog_lista AS d_broj_sluzbenog_lista,
         d.jezik AS d_jezik
       FROM rag.chunks c
       JOIN documents.documents d ON d.id = c.document_id
       WHERE c.id = $1::uuid AND d.obrisano IS NULL
       LIMIT 1`,
      [id],
    );

    if (r.rowCount === 0) {
      res.status(404).json({ greska: "Chunk nije pronađen." });
      return;
    }

    const row = r.rows[0]!;
    const detalj: ChunkDetail = {
      id: row.id,
      documentId: row.document_id,
      redniBroj: row.redni_broj,
      sadrzaj: row.sadrzaj,
      strukturaPutanja: row.struktura_putanja,
      stranaOd: row.strana_od,
      stranaDo: row.strana_do,
      dokument: {
        id: row.d_id,
        naslov: row.d_naslov,
        tip: row.d_tip as ChunkDetail["dokument"]["tip"],
        oblast: row.d_oblast as ChunkDetail["dokument"]["oblast"],
        status: row.d_status as ChunkDetail["dokument"]["status"],
        datum: row.d_datum,
        organSud: row.d_organ_sud,
        brojSluzbenogLista: row.d_broj_sluzbenog_lista,
        jezik: row.d_jezik as ChunkDetail["dokument"]["jezik"],
      },
    };

    res.json(detalj);
  },
);
