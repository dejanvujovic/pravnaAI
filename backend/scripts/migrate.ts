/**
 * Minimalan migration runner.
 *
 * - Čita sve `*.sql` fajlove iz `db/migrations/`, sortirano leksikografski.
 * - Vodi evidenciju u `public._migrations` (ime, hash, primjenjeno).
 * - Svaki novi fajl se primjenjuje u jednoj transakciji.
 * - Ako se već primijenjena migracija promijenila (hash mismatch), prekida —
 *   nikad ne mijenjamo zatečenu migraciju, samo dodajemo nove.
 *
 * Pokretanje:
 *   npm run db:migrate              (svi nepriroka)
 *   npm run db:migrate -- --dry     (prikaz šta bi se pokrenulo, bez exec)
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "..", "db", "migrations");

const DRY_RUN = process.argv.includes("--dry");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      ime           TEXT PRIMARY KEY,
      hash          TEXT NOT NULL,
      primjenjeno   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

interface MigrationFile {
  ime: string;
  putanja: string;
  sadrzaj: string;
  hash: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

  const result: MigrationFile[] = [];
  for (const ime of sqlFiles) {
    const putanja = resolve(MIGRATIONS_DIR, ime);
    const sadrzaj = await readFile(putanja, "utf-8");
    const hash = createHash("sha256").update(sadrzaj).digest("hex");
    result.push({ ime, putanja, sadrzaj, hash });
  }
  return result;
}

async function loadAppliedMigrations(): Promise<Map<string, string>> {
  const r = await pool.query<{ ime: string; hash: string }>(
    "SELECT ime, hash FROM public._migrations",
  );
  return new Map(r.rows.map((row) => [row.ime, row.hash]));
}

async function applyMigration(m: MigrationFile): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(m.sadrzaj);
    await client.query(
      "INSERT INTO public._migrations (ime, hash) VALUES ($1, $2)",
      [m.ime, m.hash],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await ensureMigrationsTable();
  const [migracije, primjenjene] = await Promise.all([
    loadMigrations(),
    loadAppliedMigrations(),
  ]);

  let primjenjeno = 0;
  let preskoceno = 0;

  for (const m of migracije) {
    const postojeci = primjenjene.get(m.ime);
    if (postojeci) {
      if (postojeci !== m.hash) {
        throw new Error(
          `Migracija ${m.ime} je već primijenjena, ali je sadržaj izmijenjen. ` +
            `Nikad ne mijenjaj postojeću migraciju — kreiraj novu.`,
        );
      }
      preskoceno++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[migrate] DRY: ${m.ime} (${m.sadrzaj.length} chars)`);
    } else {
      console.log(`[migrate] primjenjujem ${m.ime}...`);
      await applyMigration(m);
      console.log(`[migrate]   OK`);
    }
    primjenjeno++;
  }

  console.log(
    `[migrate] gotovo — primijenjeno: ${primjenjeno}, već postojeće: ${preskoceno}`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[migrate] greška:", e instanceof Error ? e.message : e);
    await pool.end();
    process.exit(1);
  });
