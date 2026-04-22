"""Phase 3C — Kido Service.

Generates Kido's in-character response by building a dynamic prompt context
from session_state, evaluator label, and difficulty level.  Handles
force_transition directives for max-attempts scenarios.

This service operates on the session_state dict — no DB access.
The Orchestrator (SessionService) calls this after the Evaluator.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from backend.core.llm_manager import LLMManager
from backend.prompts.kido_prompts import KIDO_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Difficulty labels for human-readable injection into the prompt
DIFFICULTY_LABELS: dict[int, str] = {
    1: "Basic (ask simple recall questions)",
    2: "Application (ask 'how does it work?' or 'give me an example' questions)",
    3: "Synthesis (ask 'why does it matter?' or 'how does X compare to Y?' questions)",
}


class KidoService:
    """Generates Kido's response given evaluator output and session context.

    This service is stateless — it receives state, builds a prompt, calls the
    LLM, and returns the parsed JSON output.
    """

    def __init__(self) -> None:
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

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_response(
        self,
        session_state: dict[str, Any],
        evaluator_label: str,
        user_message: str,
        current_point: str,
        force_transition: bool = False,
        next_point: str | None = None,
    ) -> dict[str, Any]:
        """Generate Kido's response as structured JSON.

        Parameters
        ----------
        session_state : dict
            The full nested session_state JSONB.
        evaluator_label : str
            One of CORRECT|INCORRECT|NEEDS_INFO|IRRELEVANT.
        user_message : str
            The student's latest message text.
        current_point : str
            Title of the current pedagogical point.
        force_transition : bool
            If True, inject [SYSTEM ALARM] to change subject.
        next_point : str | None
            Title of the next point (required when force_transition=True).

        Returns
        -------
        dict with keys: kido_response (str), widget_type (str)
        """
        # Build dynamic prompt context
        difficulty = session_state.get("current_difficulty", 1)
        difficulty_label = DIFFICULTY_LABELS.get(difficulty, DIFFICULTY_LABELS[1])

        # Build topic/point context
        ti = session_state.get("current_topic_index", 0)
        topics = session_state.get("topics", [])
        topic_title = topics[ti]["topic_title"] if ti < len(topics) else "Unknown Topic"

        # Build prompt sections
        sections: list[str] = []

        sections.append(f"## Current Topic\n{topic_title}")
        sections.append(f"## Current Point Being Discussed\n{current_point}")
        sections.append(f"## Evaluator Label\n{evaluator_label}")
        sections.append(f"## Difficulty Level\n{difficulty_label}")
        sections.append(f"## Student's Message\n{user_message}")

        # Inject transition directive if needed
        if force_transition and next_point:
            sections.append(
                f"## [SYSTEM ALARM]\n"
                f"The user has struggled 3 times on \"{current_point}\". "
                f"You MUST gracefully change the subject. Express understanding, "
                f"say it's okay to move on, and enthusiastically ask about the "
                f"next point: \"{next_point}\"."
            )

        prompt = "\n\n".join(sections)

        # Call LLM
        raw = await self.llm_manager.call_with_fallback(
            f"{KIDO_SYSTEM_PROMPT}\n\n{prompt}"
        )

        # Parse JSON response
        try:
            parsed = self._parse_json(raw)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Kido returned non-JSON; using fallback. Raw: %s", raw[:300])
            parsed = {
                "kido_response": raw.strip()[:500] if raw.strip() else (
                    f"Hmm, I'm still thinking about {current_point}... "
                    f"can you explain it a bit more?"
                ),
                "widget_type": "text",
                "widget_data": None,
            }

        # Ensure required keys exist
        if "kido_response" not in parsed:
            parsed["kido_response"] = (
                f"Hmm, I'm still thinking about {current_point}... "
                f"can you explain it a bit more?"
            )
        if "widget_type" not in parsed:
            parsed["widget_type"] = "text"
        if "widget_data" not in parsed:
            parsed["widget_data"] = None

        # Normalize widget_type to lowercase
        parsed["widget_type"] = parsed["widget_type"].lower()

        # Validate widget_type
        valid_types = {"text", "process", "comparison", "math"}
        if parsed["widget_type"] not in valid_types:
            parsed["widget_type"] = "text"

        # Enforce widget_data rules: null for text/math, required for process/comparison
        if parsed["widget_type"] in ("text", "math"):
            parsed["widget_data"] = None
        elif parsed["widget_type"] == "process" and parsed["widget_data"]:
            # Validate process structure
            if not isinstance(parsed["widget_data"].get("steps"), list):
                parsed["widget_data"] = None
                parsed["widget_type"] = "text"
        elif parsed["widget_type"] == "comparison" and parsed["widget_data"]:
            # Validate comparison structure
            wd = parsed["widget_data"]
            if not isinstance(wd.get("categories"), list) or not isinstance(wd.get("attributes"), list):
                parsed["widget_data"] = None
                parsed["widget_type"] = "text"

        return parsed

    # ------------------------------------------------------------------
    # LLM Call Helpers
    # ------------------------------------------------------------------

    async def _call_groq(self, prompt: str, api_key: str) -> str:
        payload = {
            "model": self.groq_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
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
            "temperature": 0.4,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(self.secondary_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    # ------------------------------------------------------------------
    # JSON Parser
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        """Strip markdown fences and parse JSON."""
        cleaned = raw.strip()

        # Handle markdown code fences
        if cleaned.startswith("```"):
            # Find the end fence
            lines = cleaned.split("\n")
            # Remove first line (```json or ```) and last line (```)
            inner_lines = []
            started = False
            for line in lines:
                if not started:
                    if line.strip().startswith("```"):
                        started = True
                        continue
                elif line.strip() == "```":
                    break
                else:
                    inner_lines.append(line)
            cleaned = "\n".join(inner_lines).strip()

        # Try to find JSON object in the response if not pure JSON
        if not cleaned.startswith("{"):
            # Look for JSON embedded in the text
            brace_start = cleaned.find("{")
            brace_end = cleaned.rfind("}")
            if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
                cleaned = cleaned[brace_start:brace_end + 1]

        return json.loads(cleaned)
