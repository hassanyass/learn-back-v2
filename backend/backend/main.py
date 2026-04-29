import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.routes.auth_router import router as auth_router
from backend.routes.dashboard_router import router as dashboard_router
from backend.routes.feedback_router import router as feedback_router
from backend.routes.ingestion_router import router as ingestion_router
from backend.routes.session_router import router as session_router

# ── Load environment (safe — file may not exist in containers) ──
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# ── Deployment configuration (all have safe defaults) ──
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# ── Structured logging ──
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="LearnBack Backend", debug=DEBUG)
app.mount("/static", StaticFiles(directory="static"), name="static")

# CORS — configurable via CORS_ORIGINS env var (comma-separated)
# Default: "*" (allow all origins during controlled user testing phase)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(feedback_router)
app.include_router(ingestion_router)
app.include_router(session_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
