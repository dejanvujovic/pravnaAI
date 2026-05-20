import pg from "pg";
import { config } from "./config.js";

// DATE (OID 1082) — vraćaj sirov "YYYY-MM-DD" string. Default node-pg
// parser pravi JS Date objekat u local TZ, što kasnije pri .toISOString()
// može pomjeriti dan unaprijed/unazad (CET ≠ UTC).
pg.types.setTypeParser(1082, (val: string) => val);

export const pool = new pg.Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[db] neočekivana greška u idle klijentu", err);
});

export async function pingPostgres(): Promise<"ok" | "down"> {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "down";
  }
}

export async function pingPgvector(): Promise<"ok" | "missing"> {
  try {
    const r = await pool.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
    );
    return r.rowCount && r.rowCount > 0 ? "ok" : "missing";
  } catch {
    return "missing";
  }
}
