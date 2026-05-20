# =====================================================================
# RTCG Legal AI — BGE-M3 embedding sidecar (CPU-only)
# Model se NE pakuje u sliku — preuzima se pri prvom pokretanju i
# kešira u Docker volumen `embeddings-cache`, pa je rebuild jeftin.
# =====================================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/cache/huggingface \
    TRANSFORMERS_OFFLINE=0

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=20 \
  CMD curl -fsS http://localhost:8001/health | grep -q '"status":"ok"' || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
