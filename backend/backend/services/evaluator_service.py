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
from backend.services.bkt_service import BKTService, MASTERY_THRESHOLD

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────

MAX_POINT_ATTEMPTS: int = 5


class EvaluatorService:
    """Pure scoring service for student messages and widget submissions.

    This service applies BKT updates and difficulty adjustments but does
    NOT make advancement decisions, set point status, or mutate attempt
    counters.  All progression decisions are the sole responsibility of
    the Decision Engine (SessionService).
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
        self.bkt = BKTService()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def evaluate_message(
        self,
        session_state: dict[str, Any],
        user_message: str,
    ) -> tuple[dict[str, Any], str, dict[str, Any]]:
        """DEPRECATED: evaluate_message is dead code and has been hard-disabled.
        
        The orchestrator now uses SessionService._call_evaluator() directly to 
        manage session state mutations deterministically.
        """
        raise NotImplementedError(
            "evaluate_message is disabled for architectural safety. It contained "
            "unsafe misconception mutation logic and is no longer used by the chat pipeline."
        )

    def evaluate_mind_map(
        self,
        session_state: dict[str, Any],
        correction_events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Apply BKT bonuses for user corrections on the Mind Map using the event log.

        For every correction event, apply the specified bkt_delta to that point,
        and update the kido_memory.

        Parameters
        ----------
        session_state : dict
            The full nested session_state JSONB (mutated in-place).
        correction_events : list
            List of immutable correction events to process.

        Returns
        -------
        dict : The updated session_state.
        """
        state = session_state
        topics = state.get("topics", [])

        for event in correction_events:
            node_id = event["node_id"]
            delta = event.get("bkt_delta", 0.05)
            text = event["correction_text"]
            
            # Find the target point by node_id
            for topic in topics:
                for point in topic.get("points", []):
                    if point.get("id") == node_id:
                        point["bkt_score"] = min(1.0, point.get("bkt_score", 0.3) + delta)
                        point["kido_memory"] = {
                            "title": point.get("kido_memory", {}).get("title", point.get("point_title", "")) if point.get("kido_memory") else point.get("point_title", ""),
                            "summary": text,
                        }
                        break

        return state

    def evaluate_widget(
        self,
        session_state: dict[str, Any],
        expected_data: dict[str, Any],
        submitted_data: dict[str, Any],
        widget_type: str,
    ) -> tuple[dict[str, Any], str, bool]:
        """Grade a widget submission using pure Python logic (no LLM).

        Pure scoring only — returns the label and whether the answer was
        correct. Does NOT mutate point status, point_attempts, or make
        any completion decisions. Those are handled by the Decision Engine.

        Parameters
        ----------
        session_state : dict
            The full nested session_state JSONB (mutated in-place for BKT/difficulty only).
        expected_data : dict
            The original widget_data generated by Kido.
        submitted_data : dict
            The user's submitted widget data.
        widget_type : str
            One of "PROCESS" or "COMPARISON".

        Returns
        -------
        tuple of (updated_state, label, point_completed)
            point_completed is determined by BKT threshold / max attempts.
        """
        state = session_state
        ti = state["current_topic_index"]
        pi = state["current_point_index"]

        topics = state.get("topics", [])
        if ti >= len(topics):
            return state, "IRRELEVANT", False

        points = topics[ti].get("points", [])
        if pi >= len(points):
            return state, "IRRELEVANT", False

        point_node = points[pi]
        prev_bkt = point_node.get("bkt_score", self.bkt.initial_probability())

        # ── Determine correctness ────────────────────────────────────
        is_correct = False
        wt = widget_type.upper()

        if wt == "PROCESS":
            expected_steps = expected_data.get("steps", [])
            # Frontend submits an array of IDs in 'order'
            submitted_order = submitted_data.get("order", [])
            # Extract the correct order of IDs from the expected steps
            expected_order = [s.get("id") for s in expected_steps if isinstance(s, dict)]
            is_correct = expected_order == submitted_order

        elif wt == "COMPARISON":
            expected_items = expected_data.get("items", [])
            # Frontend submits an object mapping item IDs to categories
            submitted_placements = submitted_data.get("placements", {})

            # Build lookup: id → correct category
            expected_map = {
                i["id"]: i["category"] for i in expected_items if isinstance(i, dict)
            }

            # Every expected item must be present and correctly categorized
            if set(expected_map.keys()) == set(submitted_placements.keys()):
                is_correct = all(
                    submitted_placements.get(i_id) == cat
                    for i_id, cat in expected_map.items()
                )
            else:
                is_correct = False
        else:
            # Unknown widget type — treat as incorrect
            is_correct = False

        # ── Apply BKT + Difficulty (pure scoring, no status/attempts) ─
        if is_correct:
            label = "CORRECT"
            point_node["bkt_score"] = self.bkt.update(prev_bkt, 1)
            state["current_difficulty"] = min(3, state.get("current_difficulty", 1) + 1)
        else:
            label = "INCORRECT"
            point_node["bkt_score"] = self.bkt.update(prev_bkt, 0)
            state["current_difficulty"] = max(1, state.get("current_difficulty", 1) - 1)

        # ── Completion decision by Decision Engine rules ──────────────
        current_bkt = point_node["bkt_score"]
        attempts = state.get("point_attempts", 0)
        # Only increment attempts for INCORRECT (Decision Engine rule)
        if not is_correct:
            state["point_attempts"] = attempts + 1
            attempts += 1

        point_completed = (current_bkt >= MASTERY_THRESHOLD) or (attempts >= MAX_POINT_ATTEMPTS)

        return state, label, point_completed

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
                "label": "NEEDS_INFO",
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
