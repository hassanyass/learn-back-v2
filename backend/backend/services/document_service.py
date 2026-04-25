import io
import os
from pathlib import Path

from supabase import create_client

from fastapi import HTTPException, UploadFile, status
from PyPDF2 import PdfReader


class DocumentService:
    ALLOWED_EXTENSIONS = {".pdf"}

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        )

    def validate_upload(self, upload_file: UploadFile) -> str:
        return self.validate_filename(upload_file.filename or "")

    def validate_filename(self, filename: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix not in self.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF files are supported.",
            )
        return suffix

    async def extract_raw_text(self, upload_file: UploadFile) -> str:
        content = await upload_file.read()
        return self.extract_raw_text_from_bytes(
            filename=upload_file.filename or "",
            content=content,
        )

    def extract_raw_text_from_bytes(self, filename: str, content: bytes) -> str:
        extension = self.validate_filename(filename)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        return self._extract_pdf_text(content)

    def _extract_pdf_text(self, content: bytes) -> str:
        reader = PdfReader(io.BytesIO(content))
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        text = "\n".join(filter(None, pages)).strip()
        if not text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No extractable text found in PDF.",
            )
        return text

    def upload_pdf_to_storage(self, pdf_bytes: bytes, storage_key: str) -> str:
        """
        Uploads PDF bytes to Supabase Storage and returns a validated public URL.
        Raises RuntimeError on any failure — caller decides whether to abort or degrade.
        """
        import logging
        logger = logging.getLogger(__name__)

        if not pdf_bytes:
            raise RuntimeError("PDF bytes are required for storage upload.")
        if not pdf_bytes.startswith(b"%PDF"):
            raise RuntimeError("The uploaded file does not contain a valid PDF header.")

        bucket = self.supabase.storage.from_("slides")

        try:
            upload_response = bucket.upload(
                path=storage_key,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf"},
            )
        except Exception as exc:
            raise RuntimeError(f"Supabase upload call failed: {exc}") from exc

        if not upload_response:
            raise RuntimeError("Supabase upload returned an empty/null response.")

        # Check for error in response (SDK may surface errors as attributes or dict keys).
        resp_error = (
            getattr(upload_response, "error", None)
            or (upload_response.get("error") if isinstance(upload_response, dict) else None)
        )
        if resp_error:
            raise RuntimeError(f"Supabase upload returned an error: {resp_error}")

        # Verify the uploaded path matches what we requested.
        # The SDK may return path as an attribute or as a dict key.
        uploaded_path = (
            getattr(upload_response, "path", None)
            or getattr(upload_response, "full_path", None)
            or (upload_response.get("path") if isinstance(upload_response, dict) else None)
            or (upload_response.get("Key") if isinstance(upload_response, dict) else None)
        )
        if uploaded_path and uploaded_path != storage_key and not uploaded_path.endswith(storage_key):
            logger.warning(
                "Supabase upload path mismatch: expected=%s, got=%s (type=%s)",
                storage_key, uploaded_path, type(upload_response).__name__,
            )

        # Build and validate public URL.
        public_url = bucket.get_public_url(storage_key)
        if not isinstance(public_url, str) or not public_url.startswith(("http://", "https://")):
            raise RuntimeError("Supabase did not return a valid public URL for the uploaded PDF.")

        logger.info("PDF uploaded to Supabase: key=%s, url=%s", storage_key, public_url)
        return public_url

