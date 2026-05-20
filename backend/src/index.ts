import "express-async-errors";
import express from "express";
import cors from "cors";
import type { HealthResponse } from "@rtcg/shared";
import { config } from "./config.js";
import { pingPgvector, pingPostgres, pool } from "./db.js";
import { pingEmbeddings } from "./services/embeddings.js";
import { documentsRouter } from "./routes/documents.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/documents", documentsRouter);

app.get("/api/health", async (_req, res) => {
  const [pg, vec, emb] = await Promise.all([
    pingPostgres(),
    pingPgvector(),
    pingEmbeddings(),
  ]);
  const body: HealthResponse = {
    status: pg === "ok" && vec === "ok" && emb === "ok" ? "ok" : "degraded",
    vrijeme: new Date().toISOString(),
    postgres: pg,
    pgvector: vec,
    embeddings: emb,
    verzija: "0.1.0",
  };
  res.json(body);
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[backend] sluša na http://localhost:${config.port}`);
  console.log(`[backend] režim: ${config.nodeEnv}`);
});

async function shutdown(signal: string) {
  console.log(`[backend] primio ${signal}, gasim...`);
  server.close(() => console.log("[backend] HTTP server zatvoren"));
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
