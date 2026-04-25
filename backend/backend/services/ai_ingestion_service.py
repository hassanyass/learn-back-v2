import json
import os
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.llm_manager import LLMManager
from backend.models.core import SlideDeck
from backend.prompts.segmentation_prompt import SEGMENTATION_SYSTEM_PROMPT


class AIIngestionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
        self.secondary_model = os.getenv("SECONDARY_LLM_MODEL", "openai/gpt-oss-20b")
        self.groq_url = os.getenv(
            "GROQ_CHAT_COMPLETIONS_URL",
            "https://api.groq.com/openai/v1/chat/completions",
        )
        self.secondary_url = os.getenv(
            "SECONDARY_CHAT_COMPLETIONS_URL",
            "https://api.openai.com/v1/chat/completions",
        )
        self.llm_manager = LLMManager(
            primary_call=self._call_groq,
            secondary_call=self._call_secondary,
            secondary_name="secondary",
        )

    async def ingest_and_segment(
        self,
        user_id: int,
        source_filename: str,
        raw_text: str,
        pdf_storage_url: str | None,
        file_type: str,
        has_preview: bool,
        upload_status: str = "READY",
        error_message: str | None = None,
    ) -> dict[str, Any]:
        if pdf_storage_url is not None and (
            not isinstance(pdf_storage_url, str) or not pdf_storage_url.startswith(("http://", "https://"))
        ):
            raise ValueError("SlideDeck.pdf_storage_url must be null or a real HTTP(S) storage URL before DB commit.")

        # Truncate raw text to stay within LLM context window limits.
        # Groq's llama-3.1-8b-instant has ~8K output but the payload limit
        # is based on total request size. ~12,000 words ≈ 48K tokens is safe.
        MAX_WORDS = 6_000
        words = raw_text.split()
        if len(words) > MAX_WORDS:
            truncated_text = " ".join(words[:MAX_WORDS])
            truncated_text += f"\n\n[... truncated from {len(words)} words to {MAX_WORDS} words ...]"
        else:
            truncated_text = raw_text

        prompt = (
            f"{SEGMENTATION_SYSTEM_PROMPT}\n\n"
            f"Source filename: {source_filename}\n\n"
            "Raw lecture text follows:\n"
            f"{truncated_text}"
        )

        # Fix 6: Safe LLM wrapper — retry once on bad JSON, then raise 422.
        llm_output = await self.llm_manager.call_with_fallback(prompt)
        segmentation_json = await self._safe_parse_with_retry(prompt, llm_output)

        # Fix 3: Validate schema before writing to DB.
        self._validate_segmentation_schema(segmentation_json)

        # Server-side enforcement: cap at 4 topics regardless of LLM output.
        segments = segmentation_json.get("extracted_segments", [])
        if len(segments) > 4:
            segmentation_json["extracted_segments"] = segments[:4]

        deck = SlideDeck(
            user_id=user_id,
            original_filename=source_filename,
            pdf_storage_url=pdf_storage_url,
            file_type=file_type,
            has_preview=has_preview,
            status=upload_status,
            error_message=error_message,
            raw_extracted_text=raw_text,
            segmented_json=segmentation_json,
            created_at=datetime.utcnow(),
        )
        self.db.add(deck)
        await self.db.commit()
        await self.db.refresh(deck)

        # Fix 1: Return document_id so the frontend can chain to /session/create.
        return {
            "document_id": deck.id,
            "pdf_storage_url": pdf_storage_url,
            "pdf_url": pdf_storage_url,
            "file_type": deck.file_type,
            "has_preview": deck.has_preview,
            "status": deck.status,
            "segmentation": segmentation_json,
        }

    async def _safe_parse_with_retry(
        self, prompt: str, first_output: str
    ) -> dict[str, Any]:
        """Fix 2+6: Try to parse the LLM JSON output.
        On failure, retry the LLM call once with a stricter instruction,
        then raise HTTP 422 — never HTTP 500.
        """
        try:
            return self._parse_segmentation_json(first_output)
        except (json.JSONDecodeError, ValueError):
            # Retry once with an explicit JSON-only reminder appended.
            retry_prompt = (
                prompt
                + "\n\nIMPORTANT: Your previous response was not valid JSON. "
                "Return ONLY the raw JSON object. No markdown, no backticks, no prose."
            )
            try:
                retry_output = await self.llm_manager.call_with_fallback(retry_prompt)
                return self._parse_segmentation_json(retry_output)
            except (json.JSONDecodeError, ValueError) as exc:
                # Log the raw output server-side for debugging — never send to frontend.
                import logging
                logging.getLogger(__name__).error(
                    "Segmentation JSON parse failed after retry. First 300 chars: %s",
                    first_output[:300] if first_output else "(empty)",
                )
                raise HTTPException(
                    status_code=422,
                    detail="We had trouble analyzing your document. "
                           "Try uploading a smaller or simpler file with clear text content.",
                ) from exc

    def _validate_segmentation_schema(self, parsed: dict[str, Any]) -> None:
        """Fix 3: Raise HTTP 422 if required top-level or per-segment fields are missing."""
        if "source_file" not in parsed or "extracted_segments" not in parsed:
            raise HTTPException(
                status_code=422,
                detail="We had trouble analyzing your document. "
                       "Try uploading a smaller or simpler file with clear text content.",
            )
        segments = parsed["extracted_segments"]
        if not isinstance(segments, list) or len(segments) == 0:
            raise HTTPException(
                status_code=422,
                detail="This document doesn't contain enough content for a learning session. "
                       "Try uploading lecture slides or study materials with more text.",
            )
        for i, seg in enumerate(segments):
            if "topic_title" not in seg or "extracted_concepts" not in seg:
                raise HTTPException(
                    status_code=422,
                    detail="We had trouble analyzing your document. "
                           "Please try uploading it again.",
                )

    async def _call_groq(self, prompt: str, api_key: str) -> str:
        payload = {
            "model": self.groq_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(self.groq_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    async def _call_secondary(self, prompt: str, api_key: str) -> str:
        payload = {
            "model": self.secondary_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(self.secondary_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    def _parse_segmentation_json(self, raw_output: str) -> dict[str, Any]:
        cleaned = raw_output.strip()
        # Strip markdown code fences robustly (handles ```json ... ``` and ``` ... ```)
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            # Drop first line (``` or ```json) and last line (```) if it closes the block
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            cleaned = "\n".join(lines).strip()
        return json.loads(cleaned)
