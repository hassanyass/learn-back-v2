"""Phase 3B — Evaluator Service.

Isolated service that grades the student's message, applies BKT math,
tracks misconceptions, and determines point completion.  It operates
purely on the session_state dict — no DB access, no WebSocket awareness.

The Orchestrator (SessionService) calls this and handles advancement.
"""

from __future__ import annotations

import json
import logging
import os
from copy import deepcopy
from typing import Any

import httpx

from backend.core.llm_manager import LLMManager
from backend.prompts.evaluator_prompts import EVALUATOR_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────

BKT_MASTERY_THRESHOLD: float = 0.85
MAX_POINT_ATTEMPTS: int = 3
BKT_CORRECT_INCREMENT: float = 0.60
BKT_INCORRECT_DECREMENT: float = 0.10


class EvaluatorService:
    """Grades user messages and mutates session_state accordingly.

    This service does NOT advance indices — it only marks the current
    point as completed and returns a flag.  The Orchestrator handles
    topic/point index advancement.
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

    async def evaluate_message(
        self,
        session_state: dict[str, Any],
        user_message: str,
    ) -> tuple[dict[str, Any], str, bool]:
        """Grade the user's message and apply state mutations.

        Parameters
        ----------
        session_state : dict
            The full nested session_state JSONB (will be mutated in-place
            and also returned as a deep copy).
        user_message : str
            The student's latest message text.

        Returns
        -------
        tuple of (updated_state, evaluation_label, point_completed)
            - updated_state: the mutated session_state dict
            - evaluation_label: one of CORRECT|INCORRECT|NEEDS_INFO|IRRELEVANT
            - point_completed: True if the point should be marked done
        """
        state = session_state  # mutate in place
        ti = state["current_topic_index"]
        pi = state["current_point_index"]

        # ── Resolve topic and point titles ────────────────────────────
        topics = state.get("topics", [])
        if ti >= len(topics):
            return state, "IRRELEVANT", False

        topic_node = topics[ti]
        topic_title = topic_node.get("topic_title", "Unknown Topic")
        points = topic_node.get("points", [])

        if pi >= len(points):
            return state, "IRRELEVANT", False

        point_node = points[pi]
        point_title = point_node.get("point_title", "Unknown Point")

        # ── Call Evaluator LLM ────────────────────────────────────────
        evaluator_output = await self._call_evaluator_llm(
            topic_title=topic_title,
            point_title=point_title,
            user_message=user_message,
        )

        label = evaluator_output.get("evaluation_label", "NEEDS_INFO")
        detected_misconception = evaluator_output.get("detected_misconception")
        memory_title = evaluator_output.get("memory_title")
        memory_summary = evaluator_output.get("memory_summary")

        # ── Apply BKT Math & State Mutations ──────────────────────────
        prev_bkt = point_node.get("bkt_score", 0.3)

        if label == "CORRECT":
            point_node["bkt_score"] = min(1.0, prev_bkt + BKT_CORRECT_INCREMENT)
            state["current_difficulty"] = min(3, state.get("current_difficulty", 1) + 1)

        elif label == "INCORRECT":
            state["point_attempts"] = state.get("point_attempts", 0) + 1
            point_node["bkt_score"] = max(0.0, prev_bkt - BKT_INCORRECT_DECREMENT)
            state["current_difficulty"] = max(1, state.get("current_difficulty", 1) - 1)

        elif label == "NEEDS_INFO":
            state["point_attempts"] = state.get("point_attempts", 0) + 1

        # IRRELEVANT: no changes to attempts or BKT

        # ── Apply Misconceptions ──────────────────────────────────────
        if detected_misconception:
            point_node.setdefault("misconceptions", []).append(detected_misconception)

        # ── Check Completion ──────────────────────────────────────────
        current_bkt = point_node["bkt_score"]
        attempts = state.get("point_attempts", 0)
        point_completed = False

        if current_bkt >= BKT_MASTERY_THRESHOLD or attempts >= MAX_POINT_ATTEMPTS or label == "CORRECT":
            point_node["status"] = "completed"
            point_completed = True

            # Save kido_memory if the LLM produced one
            if memory_title and memory_summary:
                point_node["kido_memory"] = {
                    "title": memory_title,
                    "summary": memory_summary,
                }

        return state, label, point_completed

    def evaluate_mind_map(
        self,
        session_state: dict[str, Any],
        corrections: dict[str, str],
    ) -> dict[str, Any]:
        """Apply BKT bonuses for user corrections on the Mind Map.

        For every correction the user makes, add +0.05 BKT to that point.
        Mark the current topic as 'reviewed'.

        Parameters
        ----------
        session_state : dict
            The full nested session_state JSONB (mutated in-place).
        corrections : dict
            Map of point_title → corrected_summary.

        Returns
        -------
        dict : The updated session_state.
        """
        BKT_CORRECTION_BONUS = 0.05

        state = session_state
        ti = state["current_topic_index"]
        topics = state.get("topics", [])

        if ti >= len(topics):
            return state

        topic_node = topics[ti]
        points = topic_node.get("points", [])

        # Apply BKT bonus for each correction
        for point in points:
            pt_title = point.get("point_title", "")
            if pt_title in corrections:
                point["bkt_score"] = min(1.0, point.get("bkt_score", 0.3) + BKT_CORRECTION_BONUS)
                # Update kido_memory with the corrected summary
                point["kido_memory"] = {
                    "title": point.get("kido_memory", {}).get("title", pt_title) if point.get("kido_memory") else pt_title,
                    "summary": corrections[pt_title],
                }

        # Mark the topic as reviewed
        topic_node["reviewed"] = True

        return state

    # ------------------------------------------------------------------
    # LLM Call Helpers
    # ------------------------------------------------------------------

    async def _call_evaluator_llm(
        self,
        topic_title: str,
        point_title: str,
        user_message: str,
    ) -> dict[str, Any]:
        """Build the evaluator prompt and call the LLM."""
        prompt = (
            f"{EVALUATOR_SYSTEM_PROMPT}\n\n"
            f"## Topic\n{topic_title}\n\n"
            f"## Specific Point to Evaluate\n{point_title}\n\n"
            f"## Student's Message\n{user_message}"
        )

        raw = await self.llm_manager.call_with_fallback(prompt)

        try:
            return self._parse_json(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Evaluator returned non-JSON; falling back. Raw: %s", raw[:300])
            return {
                "evaluation_label": "NEEDS_INFO",
                "detected_misconception": None,
                "memory_title": None,
                "memory_summary": None,
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

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        """Strip markdown fences and parse JSON."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        return json.loads(cleaned)
