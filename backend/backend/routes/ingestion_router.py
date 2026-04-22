import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.services.ai_ingestion_service import AIIngestionService
from backend.services.auth_service import AuthService
from backend.services.document_service import DocumentService


router = APIRouter(prefix="/ingestion", tags=["ingestion"])
bearer_scheme = HTTPBearer(auto_error=True)


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

    raw_text = await document_service.extract_raw_text(file)
    extension = Path(file.filename or "").suffix.lower()

    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = os.path.join(temp_dir, file.filename or "slides_upload")
        await file.seek(0)
        content = await file.read()
        with open(input_path, "wb") as fp:
            fp.write(content)

        if extension == ".pdf":
            pdf_path = input_path
        else:
            pdf_path = document_service.convert_pptx_to_pdf(input_path, temp_dir)

        storage_key = f"user_{user_id}/{Path(pdf_path).name}"
        pdf_storage_url = document_service.upload_pdf_to_storage(
            pdf_path=pdf_path,
            storage_key=storage_key,
        )

    result = await ai_ingestion_service.ingest_and_segment(
        user_id=user_id,
        source_filename=file.filename or "uploaded_file",
        raw_text=raw_text,
        pdf_storage_url=pdf_storage_url,
    )
    return result
