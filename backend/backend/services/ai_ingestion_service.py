import json
import os
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.llm_manager import LLMManager
from backend.models.core import SlideDeck
from backend.prompts.segmentation_prompt import SEGMENTATION_SYSTEM_PROMPT


class AIIngestionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.groq_model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
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
        pdf_storage_url: str,
    ) -> dict[str, Any]:
        prompt = (
            f"{SEGMENTATION_SYSTEM_PROMPT}\n\n"
            f"Source filename: {source_filename}\n\n"
            "Raw lecture text follows:\n"
            f"{raw_text}"
        )
        llm_output = await self.llm_manager.call_with_fallback(prompt)
        segmentation_json = self._parse_segmentation_json(llm_output)

        deck = SlideDeck(
            user_id=user_id,
            original_filename=source_filename,
            pdf_storage_url=pdf_storage_url,
            raw_extracted_text=raw_text,
            segmented_json=segmentation_json,
            created_at=datetime.utcnow(),
        )
        self.db.add(deck)
        await self.db.commit()

        return {
            "pdf_storage_url": pdf_storage_url,
            "segmentation": segmentation_json,
        }

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
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()
        parsed = json.loads(cleaned)
        if "source_file" not in parsed or "extracted_segments" not in parsed:
            raise ValueError("LLM response missing required segmentation schema fields.")
        return parsed
