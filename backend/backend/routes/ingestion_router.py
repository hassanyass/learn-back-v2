import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.services.ai_ingestion_service import AIIngestionService
from backend.services.auth_service import AuthService
from backend.services.document_service import DocumentService
from backend.core.llm_manager import LLMFallbackExhaustedError


router = APIRouter(prefix="/ingestion", tags=["ingestion"])
bearer_scheme = HTTPBearer(auto_error=True)

# Fix 5: Maximum upload size enforced on the backend (mirrors frontend 50 MB limit).
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
    document_service = DocumentService()
    ai_ingestion_service = AIIngestionService(db)

    # Fix 5: Server-side file size guard before any processing.
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is 50 MB "
                   f"(received {len(content) / 1024 / 1024:.1f} MB).",
        )
    # Rewind so downstream reads see full content.
    await file.seek(0)

    # Extract raw text — catches corrupted files (PdfReadError, BadZipFile) as 422.
    try:
        raw_text = await document_service.extract_raw_text(file)
    except HTTPException:
        raise  # Re-raise our own validation errors (400/422) unchanged.
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("File read failed: %s", exc)
        raise HTTPException(
            status_code=422,
            detail="We couldn't read this file. "
                   "It may be corrupted or password-protected. Please try a different file.",
        ) from exc

    extension = Path(file.filename or "").suffix.lower()

    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = os.path.join(temp_dir, file.filename or "slides_upload")
        await file.seek(0)
        file_bytes = await file.read()
        with open(input_path, "wb") as fp:
            fp.write(file_bytes)

        if extension == ".pdf":
            pdf_path = input_path
            storage_key = f"user_{user_id}/{Path(pdf_path).name}"
            pdf_storage_url = document_service.upload_pdf_to_storage(
                pdf_path=pdf_path,
                storage_key=storage_key,
            )
        else:
            # Fix 4: PPTX — LibreOffice conversion not available in dev environment.
            # Use a consistent placeholder scheme so the column contract is never null
            # and the PDF viewer can show a friendly fallback instead of a broken URL.
            safe_name = Path(file.filename or "slides").stem
            pdf_storage_url = f"placeholder://pptx/{user_id}/{safe_name}.pdf"

    try:
        result = await ai_ingestion_service.ingest_and_segment(
            user_id=user_id,
            source_filename=file.filename or "uploaded_file",
            raw_text=raw_text,
            pdf_storage_url=pdf_storage_url,
        )
    except LLMFallbackExhaustedError as exc:
        # Log the full technical detail server-side for debugging.
        import logging
        logging.getLogger(__name__).error("LLM fallback exhausted: %s", exc)
        # Return a clean message — NEVER expose provider names, URLs, or HTTP codes.
        raise HTTPException(
            status_code=422,
            detail="We had trouble analyzing your document. "
                   "Try uploading a smaller or simpler file with clear text content.",
        )
    return result
