# =====================================================================
# RTCG Legal AI — OCR sidecar (Tesseract 5 + srpski jezički paketi)
# Slika sadrži tesseract binar + poppler za PDF->slike + srp ćirilica.
# Latinica (srp_latn) se preuzima sa tessdata projekta tokom builda.
# =====================================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

WORKDIR /app

# System paketi:
# - tesseract-ocr           OCR engine
# - tesseract-ocr-srp       jezički paket: srpski (ćirilica)
# - poppler-utils           pdftoppm / pdftocairo (PDF->slike)
# - curl                    za skidanje srp_latn modela
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-srp \
      poppler-utils \
      curl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# srp_latn (latinična varijanta) nije zapakovana u apt — skidamo iz
# zvaničnog tessdata repo-a. Koristimo standardni (ne _best) jer je
# manji a kvalitet je za naše legalne dokumente sasvim dovoljan.
RUN curl -fsSL \
      -o "${TESSDATA_PREFIX}/srp_latn.traineddata" \
      "https://github.com/tesseract-ocr/tessdata/raw/main/srp_latn.traineddata"

# Verifikacija da Tesseract vidi oba jezika.
RUN tesseract --list-langs | grep -E "^srp$" \
 && tesseract --list-langs | grep -E "^srp_latn$"

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://localhost:8002/health | grep -q '"status":"ok"' || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]
