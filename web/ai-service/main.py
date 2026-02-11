import os
import io
import base64
import logging
from contextlib import asynccontextmanager

import cv2  # type: ignore
import numpy as np  # type: ignore
from fastapi import FastAPI, HTTPException  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from pydantic import BaseModel  # type: ignore
from insightface.app import FaceAnalysis  # type: ignore
from PIL import Image  # type: ignore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
FACE_THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.40"))
MODEL_NAME = os.getenv("FACE_MODEL", "buffalo_l")
MODEL_ROOT = os.getenv("MODEL_ROOT", os.path.expanduser("~/.insightface"))
MIN_FACE_SIZE = 80  # px – reject tiny faces
MIN_DET_SCORE = 0.5  # minimum detection confidence
EMBEDDING_DIM = 512

logger = logging.getLogger("ai-service")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Global face analyser (loaded once)
# ---------------------------------------------------------------------------
face_app: FaceAnalysis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load InsightFace model on startup."""
    global face_app
    logger.info("Loading InsightFace model '%s' …", MODEL_NAME)
    face_app = FaceAnalysis(name=MODEL_NAME, root=MODEL_ROOT, providers=["CPUExecutionProvider"])
    face_app.prepare(ctx_id=-1, det_size=(640, 640))
    logger.info("InsightFace model ready ✓")
    yield
    face_app = None


app = FastAPI(
    title="Elegant Solutions – AI Service",
    description="Face Recognition AI Service (Phase 2)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class EnrollRequest(BaseModel):
    user_id: str
    images_base64: list[str]  # 1‑3 images


class EnrollResponse(BaseModel):
    success: bool
    message: str
    embedding: list[float] | None = None
    quality_score: float | None = None
    model_version: str = MODEL_NAME


class VerifyRequest(BaseModel):
    image_base64: str
    embeddings: list[dict]  # [{ user_id, embedding: float[] }, ...]
    threshold: float | None = None


class VerifyMatch(BaseModel):
    matched: bool
    user_id: str | None = None
    score: float = 0.0
    face_detected: bool = False
    message: str = ""


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    threshold: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def decode_image(b64: str) -> np.ndarray:
    """Base64 → OpenCV BGR ndarray."""
    # Strip optional data-URI prefix
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def check_quality(face) -> tuple[bool, float, str]:
    """Return (ok, score, reason)."""
    bbox = face.bbox.astype(int)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    if w < MIN_FACE_SIZE or h < MIN_FACE_SIZE:
        return False, face.det_score, "ใบหน้าเล็กเกินไป กรุณาขยับเข้ามาใกล้กล้อง"

    if face.det_score < MIN_DET_SCORE:
        return False, face.det_score, "คุณภาพภาพต่ำ กรุณาถ่ายในที่มีแสงสว่าง"

    return True, float(face.det_score), "ok"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {
        "service": "Elegant Solutions AI Service",
        "status": "running",
        "phase": "Phase 2 – Face Recognition",
        "endpoints": ["/enroll", "/verify", "/health"],
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy" if face_app else "model_not_loaded",
        model_loaded=face_app is not None,
        model_name=MODEL_NAME,
        threshold=FACE_THRESHOLD,
    )


@app.post("/enroll", response_model=EnrollResponse)
async def enroll(request: EnrollRequest):
    """
    Receive 1‑3 face images → detect → extract embedding.
    Returns the **averaged** embedding so the caller can store it in the DB.
    """
    if not face_app:
        raise HTTPException(503, "Model not loaded yet")

    if not request.images_base64:
        return EnrollResponse(success=False, message="ไม่มีรูปภาพ")

    embeddings: list[np.ndarray] = []
    best_quality = 0.0

    for idx, b64 in enumerate(request.images_base64[:3]):
        try:
            img = decode_image(b64)
        except Exception:
            return EnrollResponse(success=False, message=f"รูปที่ {idx+1} ถอดรหัสไม่ได้")

        faces = face_app.get(img)
        if not faces:
            return EnrollResponse(success=False, message=f"รูปที่ {idx+1}: ตรวจไม่พบใบหน้า กรุณาถ่ายใหม่")

        face = max(faces, key=lambda f: f.det_score)  # best detection
        ok, q, reason = check_quality(face)
        if not ok:
            return EnrollResponse(success=False, message=f"รูปที่ {idx+1}: {reason}")

        embeddings.append(face.embedding)
        best_quality = max(best_quality, q)

    # Average embeddings for robustness
    avg_embedding = np.mean(embeddings, axis=0)
    # Normalise to unit vector
    avg_embedding = avg_embedding / (np.linalg.norm(avg_embedding) + 1e-8)

    return EnrollResponse(
        success=True,
        message="ลงทะเบียนใบหน้าสำเร็จ",
        embedding=avg_embedding.tolist(),
        quality_score=round(best_quality, 4),
    )


@app.post("/verify", response_model=VerifyMatch)
async def verify(request: VerifyRequest):
    """
    Receive 1 face image + list of enrolled embeddings →
    detect face → compare (1:N) → return best match.
    """
    if not face_app:
        raise HTTPException(503, "Model not loaded yet")

    threshold = request.threshold or FACE_THRESHOLD

    # Decode probe image
    try:
        img = decode_image(request.image_base64)
    except Exception:
        return VerifyMatch(matched=False, message="ถอดรหัสภาพไม่ได้")

    faces = face_app.get(img)
    if not faces:
        return VerifyMatch(matched=False, face_detected=False, message="ตรวจไม่พบใบหน้า ขยับหน้าให้อยู่ในกรอบ")

    face = max(faces, key=lambda f: f.det_score)
    ok, _, reason = check_quality(face)
    if not ok:
        return VerifyMatch(matched=False, face_detected=True, message=reason)

    probe = face.embedding
    probe = probe / (np.linalg.norm(probe) + 1e-8)

    # 1:N comparison
    best_score = -1.0
    best_uid: str | None = None

    for entry in request.embeddings:
        stored = np.array(entry["embedding"], dtype=np.float32)
        stored = stored / (np.linalg.norm(stored) + 1e-8)
        score = cosine_similarity(probe, stored)
        if score > best_score:
            best_score = score
            best_uid = entry["user_id"]

    if best_score >= threshold and best_uid:
        return VerifyMatch(
            matched=True,
            user_id=best_uid,
            score=round(best_score, 4),
            face_detected=True,
            message="ยืนยันตัวตนสำเร็จ",
        )

    return VerifyMatch(
        matched=False,
        score=round(best_score, 4) if best_score > 0 else 0.0,
        face_detected=True,
        message="ไม่สามารถยืนยันตัวตนได้ กรุณาลองใหม่",
    )
