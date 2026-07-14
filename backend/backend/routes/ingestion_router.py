from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.core.llm_manager import LLMFallbackExhaustedError
# NOTE: Upload limits have been removed — users may upload unlimited slide decks.
from backend.models.core import SlideDeck
from backend.services.ai_ingestion_service import AIIngestionService
from backend.services.auth_service import AuthService
from backend.services.document_service import DocumentService


router = APIRouter(prefix="/ingestion", tags=["ingestion"])
bearer_scheme = HTTPBearer(auto_error=True)

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> int:
    auth_service = AuthService(db)
    return auth_service.decode_token(credentials.credentials)





@router.post("/upload-slides")
async def upload_slides(
    file: UploadFile = File(...),
    timezone: str = Query(default="UTC"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _ = timezone  # Reserved for future ingestion-time timezone-aware metadata.
    # NOTE: Upload limits removed — unlimited uploads allowed.

    document_service = DocumentService()
    ai_ingestion_service = AIIngestionService(db)

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is 50 MB "
                   f"(received {len(file_bytes) / 1024 / 1024:.1f} MB).",
        )

    filename = file.filename or "uploaded_file"
    extension = Path(filename).suffix.lower()

    try:
        raw_text = document_service.extract_raw_text_from_bytes(
            filename=filename,
            content=file_bytes,
        )
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("File read failed: %s", exc)
        raise HTTPException(
            status_code=422,
            detail="We couldn't read this file. "
                   "It may be corrupted or password-protected. Please try a different file.",
        ) from exc

    file_type = "pdf"
    pdf_storage_url: str | None = None
    has_preview = False
    upload_status = "READY"
    upload_error_message: str | None = None

    storage_key = f"user_{user_id}/{uuid4().hex}_{Path(filename).name}"
    try:
        pdf_storage_url = document_service.upload_pdf_to_storage(
            pdf_bytes=file_bytes,
            storage_key=storage_key,
        )
        has_preview = True
        import logging
        logging.getLogger(__name__).info(
            "PDF upload succeeded: user=%s, key=%s", user_id, storage_key,
        )
    except Exception as exc:
        import logging
        upload_status = "UPLOAD_FAILED"
        upload_error_message = str(exc)
        logging.getLogger(__name__).error(
            "PDF storage upload failed: user=%s, key=%s, error=%s",
            user_id, storage_key, exc,
        )

    try:
        result = await ai_ingestion_service.ingest_and_segment(
            user_id=user_id,
            source_filename=filename,
            raw_text=raw_text,
            pdf_storage_url=pdf_storage_url,
            file_type=file_type,
            has_preview=has_preview,
            upload_status=upload_status,
            error_message=upload_error_message,
        )
    except LLMFallbackExhaustedError as exc:
        import logging
        logging.getLogger(__name__).error("LLM fallback exhausted: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_PROVIDER_LIMIT_REACHED",
                "message": (
                    "Our AI provider is temporarily at capacity. "
                    "Please try again in a few minutes, or use a demo session for now."
                ),
            },
        ) from exc
    return result
