import "express-async-errors";
import express from "express";
import cors from "cors";
import type { HealthResponse } from "@rtcg/shared";
import { config } from "./config.js";
import { pingPgvector, pingPostgres, pool } from "./db.js";
import { pingEmbeddings } from "./services/embeddings.js";
import { pingOcr } from "./services/ocr.js";
import { recoverStaleIngests } from "./services/ingest_worker.js";
import { documentsRouter } from "./routes/documents.js";
import { chunksRouter } from "./routes/chunks.js";
import { searchRouter } from "./routes/search.js";
import { qnaRouter } from "./routes/qna.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/documents", documentsRouter);
app.use("/api/chunks", chunksRouter);
app.use("/api/search", searchRouter);
app.use("/api/qna", qnaRouter);

app.get("/api/health", async (_req, res) => {
  const [pg, vec, emb, ocr] = await Promise.all([
    pingPostgres(),
    pingPgvector(),
    pingEmbeddings(),
    pingOcr(),
  ]);
  const body: HealthResponse = {
    status:
      pg === "ok" && vec === "ok" && emb === "ok" && ocr === "ok"
        ? "ok"
        : "degraded",
    vrijeme: new Date().toISOString(),
    postgres: pg,
    pgvector: vec,
    embeddings: emb,
    ocr,
    verzija: "0.1.0",
  };
  res.json(body);
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[backend] sluša na http://localhost:${config.port}`);
  console.log(`[backend] režim: ${config.nodeEnv}`);

  // Pokupi dokumente koji su ostali zaglavljeni u CHUNKING/EMBEDDING
  // nakon prethodnog crash-a ili restartovanja.
  recoverStaleIngests()
    .then((n) => {
      if (n > 0) console.log(`[worker] startup recovery: ${n} dokumenata u redu`);
    })
    .catch((e) => console.error("[worker] startup recovery greška:", e));
});

async function shutdown(signal: string) {
  console.log(`[backend] primio ${signal}, gasim...`);
  server.close(() => console.log("[backend] HTTP server zatvoren"));
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
