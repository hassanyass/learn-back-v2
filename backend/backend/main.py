from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.routes.auth_router import router as auth_router
from backend.routes.dashboard_router import router as dashboard_router
from backend.routes.feedback_router import router as feedback_router
from backend.routes.ingestion_router import router as ingestion_router
from backend.routes.session_router import router as session_router


app = FastAPI(title="LearnBack Backend")
app.mount("/static", StaticFiles(directory="static"), name="static")

# CORS — allow any origin during controlled user testing phase
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
