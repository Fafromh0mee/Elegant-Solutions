FROM python:3.11-slim-bookworm

# System deps for OpenCV headless + build tools for insightface
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 build-essential python3-dev tzdata && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FACE_MODEL=buffalo_l \
    MODEL_ROOT=/opt/insightface \
    TZ=Asia/Bangkok

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Prepare the model in the image so container recreation and host reboot do not
# require a manual download. The model is not committed to the repository.
RUN mkdir -p "$MODEL_ROOT" && \
    python -c "from insightface.app import FaceAnalysis; import os; app = FaceAnalysis(name=os.environ['FACE_MODEL'], root=os.environ['MODEL_ROOT'], providers=['CPUExecutionProvider']); app.prepare(ctx_id=-1, det_size=(640, 640)); print('InsightFace model prepared')"

RUN addgroup --system --gid 10001 ai && \
    adduser --system --uid 10001 --ingroup ai --no-create-home ai && \
    chown -R ai:ai /app "$MODEL_ROOT"
USER ai

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=12 \
  CMD python -c "import json, sys, urllib.request; data=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)); sys.exit(0 if data.get('status') == 'healthy' and data.get('model_loaded') is True else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
