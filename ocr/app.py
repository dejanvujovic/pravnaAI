"""
RTCG Legal AI — OCR sidecar (Tesseract 5).

FastAPI servis koji prima PDF i vraća tekst po stranicama, izvučen
optičkim prepoznavanjem znakova. Konfiguracija jezičkih modela:
srpski (ćirilica) + srpski (latinica), 300 DPI po defaultu.

Pipeline po jednom zahtjevu:
  1) PDF bajtovi -> niz PIL Image-eva (pdf2image / poppler)
  2) za svaku stranicu: pytesseract.image_to_string(...)
  3) vrati JSON sa per-page tekstovima i agregatima

Endpointi:
  POST /ocr             multipart fajl polje "file" (application/pdf)
  GET  /health          status + tesseract verzija
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import List

from fastapi import FastAPI, File, HTTPException, UploadFile
from pdf2image import convert_from_bytes
from pdf2image.exceptions import PDFPageCountError, PDFSyntaxError
from PIL import Image
from pydantic import BaseModel
import pytesseract

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
log = logging.getLogger("ocr")

DEFAULT_LANGS = os.environ.get("OCR_LANGS", "srp+srp_latn")
DEFAULT_DPI = int(os.environ.get("OCR_DPI", "300"))
# PSM 3 = auto detekcija strane (default). Za pravne dokumente sa
# jasnim layoutom 6 (single uniform block) može biti tačniji, ali
# 3 sigurnije za mješovite layoute (tabele, headere).
DEFAULT_PSM = int(os.environ.get("OCR_PSM", "3"))
MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "300"))


class OcrPage(BaseModel):
    redni_broj: int  # 0-indexed
    tekst: str


class OcrResponse(BaseModel):
    strane: List[OcrPage]
    broj_strana: int
    duzina_teksta: int
    trajanje_ms: int
    jezici: str
    dpi: int


class HealthResponse(BaseModel):
    status: str
    tesseract_verzija: str
    jezici_default: str


app = FastAPI(title="RTCG Legal AI OCR", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        v = str(pytesseract.get_tesseract_version())
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"Tesseract nije dostupan: {e}")
    return HealthResponse(
        status="ok",
        tesseract_verzija=v,
        jezici_default=DEFAULT_LANGS,
    )


@app.post("/ocr", response_model=OcrResponse)
async def ocr_pdf(file: UploadFile = File(...)) -> OcrResponse:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=415,
            detail=f"Nepodržan MIME: {file.content_type}. Očekivano application/pdf.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Prazan fajl.")

    start = time.time()
    try:
        images: List[Image.Image] = convert_from_bytes(
            raw,
            dpi=DEFAULT_DPI,
            fmt="png",
        )
    except (PDFSyntaxError, PDFPageCountError) as e:
        raise HTTPException(status_code=422, detail=f"Neispravan PDF: {e}")
    except Exception as e:
        log.exception("pdf2image konverzija nije uspjela")
        raise HTTPException(status_code=500, detail=f"PDF→slike greška: {e}")

    if len(images) > MAX_PAGES:
        raise HTTPException(
            status_code=413,
            detail=f"Previše stranica ({len(images)}); limit je {MAX_PAGES}.",
        )

    log.info("OCR: %d stranica @ %d DPI, jezici=%s", len(images), DEFAULT_DPI, DEFAULT_LANGS)

    strane: List[OcrPage] = []
    tess_config = f"--psm {DEFAULT_PSM}"
    for i, img in enumerate(images):
        try:
            tekst = pytesseract.image_to_string(img, lang=DEFAULT_LANGS, config=tess_config)
        except pytesseract.TesseractError as e:
            log.warning("Tesseract greška na strani %d: %s", i, e)
            tekst = ""
        strane.append(OcrPage(redni_broj=i, tekst=tekst))

    duzina = sum(len(p.tekst) for p in strane)
    trajanje_ms = int((time.time() - start) * 1000)
    log.info("OCR završen: %d strana, %d karaktera, %d ms", len(strane), duzina, trajanje_ms)

    return OcrResponse(
        strane=strane,
        broj_strana=len(strane),
        duzina_teksta=duzina,
        trajanje_ms=trajanje_ms,
        jezici=DEFAULT_LANGS,
        dpi=DEFAULT_DPI,
    )
