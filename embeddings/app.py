"""
RTCG Legal AI — BGE-M3 embedding sidecar.

Mali FastAPI servis koji izlaže BGE-M3 model (multilingvalni, 1024-dim,
podržava sr-Cyrl i sr-Latn). Pokreće se kao zaseban kontejner, backend
mu pristupa preko HTTP-a unutar Docker mreže.

Endpointi:
  POST /embed     { "texts": ["..."] }    -> { "embeddings": [[...]], "model": "bge-m3", "dim": 1024 }
  GET  /health                            -> { "status": "ok"|"loading", "model": "bge-m3" }
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
log = logging.getLogger("embeddings")

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-m3")
MAX_BATCH = int(os.environ.get("EMBEDDING_MAX_BATCH", "32"))
MAX_TEXT_CHARS = int(os.environ.get("EMBEDDING_MAX_CHARS", "8192"))

# Model se učitava jednom, na startup-u (lifespan).
state: dict = {"model": None, "ready": False}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from sentence_transformers import SentenceTransformer

    log.info("Učitavam model %s (može potrajati pri prvom pokretanju)...", MODEL_NAME)
    state["model"] = SentenceTransformer(MODEL_NAME, device="cpu")
    state["ready"] = True
    log.info("Model spreman.")
    yield
    state["model"] = None
    state["ready"] = False


app = FastAPI(title="RTCG Legal AI Embeddings", version="0.1.0", lifespan=lifespan)


class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=MAX_BATCH)


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    dim: int


class HealthResponse(BaseModel):
    status: str
    model: str
    dim: int | None = None


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if not state["ready"]:
        return HealthResponse(status="loading", model=MODEL_NAME)
    return HealthResponse(status="ok", model=MODEL_NAME, dim=1024)


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not state["ready"]:
        raise HTTPException(status_code=503, detail="Model još nije učitan.")

    # Defenzivno odsiijeci predugačke tekstove — BGE-M3 ima 8192 token kontekst,
    # ali ovdje radimo grubu provjeru po karakterima.
    texts = [t[:MAX_TEXT_CHARS] for t in req.texts]

    model = state["model"]
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)

    return EmbedResponse(
        embeddings=vectors.tolist(),
        model="bge-m3",
        dim=int(vectors.shape[1]),
    )
