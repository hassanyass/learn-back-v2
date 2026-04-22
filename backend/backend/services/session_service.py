"""Phase 3A+4 — Dual-Agent Session Orchestrator.

Owns the full message lifecycle:
  User Message → Evaluator LLM → BKT Update → State Mutation → Kido LLM → Persist

All session-state mutations happen here.  Routers are thin transport.

State format (Phase 3A):
  The session_state JSONB is a deeply nested lesson map with per-point
  BKT scores, misconceptions, and kido_memory slots.  See
  Architecture/04_session_orchestrator.md for the full blueprint.
"""

from __future__ import annotations

import json
import logging
import os
from copy import deepcopy
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.core import LearningSession, SessionMessage, SlideDeck
from backend.prompts.orchestrator_prompts import EVALUATOR_SYSTEM_PROMPT, KIDO_SYSTEM_PROMPT
from backend.services.bkt_service import BKTService, MASTERY_THRESHOLD

logger = logging.getLogger(__name__)

MAX_ATTEMPTS_PER_POINT: int = 5
OVERALL_BKT_COMPLETION_THRESHOLD: float = 0.95


# ──────────────────────────────────────────────────────────────────────
# Helper: default session-state factory (legacy fallback)
# ──────────────────────────────────────────────────────────────────────

def _default_session_state() -> dict[str, Any]:
    """Build a minimal session_state for sessions created without
    the Phase 3A nested blueprint (backwards compatibility)."""
    return {
        "current_topic_index": 0,
        "current_point_index": 0,
        "point_attempts": 0,
        "current_difficulty": 1,
        "topics": [],
    }


# ──────────────────────────────────────────────────────────────────────
# SessionService
# ──────────────────────────────────────────────────────────────────────

class SessionService:
    """Orchestrates the Evaluator → Kido dual-agent chain and manages all
    session-state transitions for a single teaching session."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.bkt = BKTService()

        # LLM config (reuses project conventions from AIIngestionService)
        self.groq_model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        self.groq_url = os.getenv(
            "GROQ_CHAT_COMPLETIONS_URL",
            "https://api.groq.com/openai/v1/chat/completions",
        )
        self.secondary_model = os.getenv("SECONDARY_LLM_MODEL", "openai/gpt-oss-20b")
        self.secondary_url = os.getenv(
            "SECONDARY_CHAT_COMPLETIONS_URL",
            "https://api.openai.com/v1/chat/completions",
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def process_user_message(
        self,
        session_id: int,
        user_text: str,
    ) -> dict[str, Any]:
        """Full dual-agent pipeline for a single user message.

        Returns a dict with keys:
            kido_response    (str)   – Kido's formatted reply
            widget_type      (str)   – rendering hint for the frontend
            session_state    (dict)  – updated state snapshot
            advanced         (bool)  – True if the point was auto-advanced
            session_complete (bool)  – True if the session has been terminated
        """
        session = await self._get_session(session_id)
        state = self._ensure_state(session)
        segments = await self._get_segments(session)

        current_point = self._resolve_current_point(state, segments)
        conversation_history = await self._build_conversation_history(session_id)

        # --- 1. Persist user message ---
        await self._persist_message(session_id, "user", user_text, widget_type=None)

        # --- 2. Call Evaluator ---
        evaluator_output = await self._call_evaluator(
            current_point=current_point,
            conversation_history=conversation_history,
            user_text=user_text,
        )

        # --- 3. BKT Update (per-point) ---
        ti = state["current_topic_index"]
        pi = state["current_point_index"]
        point_node = self._get_point_node(state, ti, pi)
        prev_score = point_node["bkt_score"] if point_node else self.bkt.initial_probability()
        bkt_direction = evaluator_output.get("bkt_shift_direction", 0)
        new_score = self.bkt.update(prev_score, int(bkt_direction))
        if point_node:
            point_node["bkt_score"] = new_score

        # --- 3b. Track misconceptions live (nested inside point) ---
        detected_misconception = evaluator_output.get("detected_misconception")
        if detected_misconception and evaluator_output.get("label") == "INCORRECT" and point_node:
            point_node["misconceptions"].append({
                "misconception": detected_misconception,
                "timestamp": datetime.utcnow().isoformat(),
            })

        # --- 4. Accumulate learned items and metaphors (session-level for Kido) ---
        # These are kept as transient context for the Kido prompt, not persisted
        # in the per-point structure (kido_memory is generated once on completion).
        learned_summary = evaluator_output.get("kido_learned_summary", "")
        identified_metaphors = evaluator_output.get("identified_metaphors", "")

        # Build running lists from evaluator output for Kido's context
        # (these live ephemerally in the pipeline, not in session_state)
        kido_learned_so_far = [learned_summary] if learned_summary else []
        kido_metaphors = [identified_metaphors] if identified_metaphors else []

        # --- 5. Increment attempt counter ---
        state["point_attempts"] += 1

        # --- 6. Limit Check (Python-enforced) ---
        advanced = False
        session_complete = False
        instruction_for_kido = evaluator_output.get("instruction_for_kido", "")

        if state["point_attempts"] >= MAX_ATTEMPTS_PER_POINT or self.bkt.is_mastered(new_score):
            advanced = True

            # Mark current point as completed
            if point_node:
                point_node["status"] = "completed"
                # Phase 3B: kido_memory would be generated here

            state["point_attempts"] = 0
            state["current_point_index"] += 1

            # Resolve next point
            next_point = self._resolve_current_point(state, segments)
            if next_point:
                # Mark the new current point as in_progress
                new_node = self._get_point_node(state, state["current_topic_index"], state["current_point_index"])
                if new_node:
                    new_node["status"] = "in_progress"
                instruction_for_kido += (
                    f"\n\nIMPORTANT: Acknowledge the end of this point gracefully "
                    f"and ask about the next point: \"{next_point}\"."
                )
            else:
                # All points in this topic are complete — check for next topic
                state["current_point_index"] = 0
                state["current_topic_index"] += 1
                next_point = self._resolve_current_point(state, segments)
                if next_point:
                    new_node = self._get_point_node(state, state["current_topic_index"], state["current_point_index"])
                    if new_node:
                        new_node["status"] = "in_progress"
                    instruction_for_kido += (
                        f"\n\nIMPORTANT: Celebrate finishing this topic! "
                        f"Now transition to the next topic. Ask about: \"{next_point}\"."
                    )
                else:
                    # All topics exhausted → terminate session
                    session_complete = True

        # --- 6b. Termination check: Overall BKT mastery ---
        overall_bkt = self._aggregate_bkt(state)
        if overall_bkt > OVERALL_BKT_COMPLETION_THRESHOLD and overall_bkt > 0:
            session_complete = True

        # --- 6c. Force closing message if session is complete ---
        if session_complete:
            instruction_for_kido = (
                "\n\nIMPORTANT: The teaching session is now COMPLETE! "
                "Celebrate the student's incredible achievement warmly. "
                "Thank them for being such a wonderful teacher. "
                "Let them know they can view their personalized feedback "
                "and learning report on the feedback dashboard. "
                "End with an encouraging, uplifting closing message."
            )

        # --- 7. Call Kido ---
        widget_type = evaluator_output.get("widget_type", "TEXT")
        kido_response = await self._call_kido(
            instruction_for_kido=instruction_for_kido,
            identified_metaphors=identified_metaphors,
            what_kido_learned=kido_learned_so_far,
            conversation_history=conversation_history,
        )

        # --- 8. Persist Kido message ---
        await self._persist_message(session_id, "kido", kido_response, widget_type=widget_type)

        # --- 9. Flush state back to DB ---
        session.session_state = deepcopy(state)
        session.bkt_score = overall_bkt
        if session_complete:
            session.status = "completed"
            session.end_time = datetime.utcnow()
        await self.db.commit()

        return {
            "kido_response": kido_response,
            "widget_type": widget_type,
            "session_state": state,
            "advanced": advanced,
            "session_complete": session_complete,
        }

    async def generate_hint(self, session_id: int) -> dict[str, Any]:
        """Generate a hint for the current point and persist as a 'system' message.

        Returns dict with keys: hint_text, widget_type.
        """
        session = await self._get_session(session_id)
        state = self._ensure_state(session)
        segments = await self._get_segments(session)

        current_point = self._resolve_current_point(state, segments)
        if not current_point:
            return {"hint_text": "No more points to cover!", "widget_type": "TEXT"}

        conversation_history = await self._build_conversation_history(session_id)

        hint_prompt = (
            f"The student is trying to teach the following concept: \"{current_point}\".\n\n"
            f"Conversation so far:\n{conversation_history}\n\n"
            "Provide a SHORT scaffolding hint (1-2 sentences) that helps the "
            "student recall the concept WITHOUT revealing the answer. Use "
            "guiding questions or partial frameworks."
        )

        hint_text = await self._llm_call(
            system_prompt="You are a helpful teaching assistant. Provide scaffolding hints only.",
            user_content=hint_prompt,
        )

        await self._persist_message(session_id, "system", hint_text, widget_type="TEXT")

        return {"hint_text": hint_text, "widget_type": "TEXT"}

    # ------------------------------------------------------------------
    # LLM Call Wrappers
    # ------------------------------------------------------------------

    async def _call_evaluator(
        self,
        current_point: str,
        conversation_history: str,
        user_text: str,
    ) -> dict[str, Any]:
        """Call the Evaluator agent and parse strict JSON output."""
        user_content = (
            f"## Current Pedagogical Point\n{current_point}\n\n"
            f"## Conversation History\n{conversation_history}\n\n"
            f"## Student's Latest Message\n{user_text}"
        )

        raw = await self._llm_call(
            system_prompt=EVALUATOR_SYSTEM_PROMPT,
            user_content=user_content,
        )

        try:
            parsed = self._parse_json(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Evaluator returned non-JSON; falling back. Raw: %s", raw[:300])
            parsed = {
                "label": "NEEDS_INFO",
                "bkt_shift_direction": 0,
                "kido_learned_summary": "",
                "instruction_for_kido": "Ask the student to clarify their explanation.",
                "widget_type": "TEXT",
                "identified_metaphors": "",
                "detected_misconception": None,
            }

        return parsed

    async def _call_kido(
        self,
        instruction_for_kido: str,
        identified_metaphors: str,
        what_kido_learned: list[str],
        conversation_history: str,
    ) -> str:
        """Call the Kido agent with evaluator directives and context."""
        learned_block = "\n".join(f"- {item}" for item in what_kido_learned) if what_kido_learned else "(nothing yet)"

        user_content = (
            f"## Instruction\n{instruction_for_kido}\n\n"
            f"## Student's Metaphors to Reuse\n{identified_metaphors or '(none)'}\n\n"
            f"## What Kido Has Learned So Far\n{learned_block}\n\n"
            f"## Recent Conversation\n{conversation_history}"
        )

        return await self._llm_call(
            system_prompt=KIDO_SYSTEM_PROMPT,
            user_content=user_content,
        )

    async def _llm_call(self, system_prompt: str, user_content: str) -> str:
        """Low-level LLM HTTP call with Groq-primary / secondary-fallback."""
        api_keys = self._parse_key_pool("GROQ_API_KEYS")
        for key in api_keys:
            try:
                return await self._http_chat(
                    url=self.groq_url,
                    model=self.groq_model,
                    api_key=key,
                    system_prompt=system_prompt,
                    user_content=user_content,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    logger.info("Groq key rate-limited, rotating...")
                    continue
                raise

        # Fallback to secondary
        secondary_keys = self._parse_key_pool("SECONDARY_LLM_API_KEYS")
        for key in secondary_keys:
            try:
                return await self._http_chat(
                    url=self.secondary_url,
                    model=self.secondary_model,
                    api_key=key,
                    system_prompt=system_prompt,
                    user_content=user_content,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    logger.info("Secondary key rate-limited, rotating...")
                    continue
                raise

        raise RuntimeError("All LLM providers exhausted for session call.")

    @staticmethod
    async def _http_chat(
        url: str,
        model: str,
        api_key: str,
        system_prompt: str,
        user_content: str,
    ) -> str:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.3,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"]

    # ------------------------------------------------------------------
    # Data Helpers
    # ------------------------------------------------------------------

    async def _get_session(self, session_id: int) -> LearningSession:
        stmt = select(LearningSession).where(LearningSession.id == session_id)
        result = (await self.db.execute(stmt)).scalar_one_or_none()
        if result is None:
            raise ValueError(f"Session {session_id} not found.")
        return result

    async def _get_segments(self, session: LearningSession) -> list[dict[str, Any]]:
        """Retrieve the segmented curriculum for this session's slide deck."""
        stmt = select(SlideDeck).where(SlideDeck.user_id == session.user_id).order_by(SlideDeck.created_at.desc())
        deck = (await self.db.execute(stmt)).scalar_one_or_none()
        if deck is None or not deck.segmented_json:
            raise ValueError("No slide deck found for this session's user.")
        segments = deck.segmented_json.get("extracted_segments", [])
        return segments

    @staticmethod
    def _get_point_node(
        state: dict[str, Any],
        topic_idx: int,
        point_idx: int,
    ) -> dict[str, Any] | None:
        """Safely retrieve a point node from the nested topics array."""
        topics = state.get("topics", [])
        if topic_idx >= len(topics):
            return None
        points = topics[topic_idx].get("points", [])
        if point_idx >= len(points):
            return None
        return points[point_idx]

    @staticmethod
    def _resolve_current_point(
        state: dict[str, Any],
        segments: list[dict[str, Any]],
    ) -> str | None:
        """Return the current concept string or None if all exhausted.

        Reads from the nested topics array in state if available,
        falling back to the raw segments for backwards compatibility.
        """
        topic_idx = state["current_topic_index"]
        point_idx = state["current_point_index"]

        # Phase 3A: read from nested topics in state
        topics = state.get("topics", [])
        if topics:
            if topic_idx >= len(topics):
                return None
            points = topics[topic_idx].get("points", [])
            if point_idx >= len(points):
                return None
            return points[point_idx]["point_title"]

        # Fallback: read from raw segments (legacy sessions)
        if topic_idx >= len(segments):
            return None
        topic = segments[topic_idx]
        concepts = topic.get("extracted_concepts", [])
        if point_idx >= len(concepts):
            return None
        return concepts[point_idx]

    async def _build_conversation_history(self, session_id: int) -> str:
        """Build a concise text representation of the last messages."""
        stmt = (
            select(SessionMessage)
            .where(SessionMessage.session_id == session_id)
            .order_by(SessionMessage.created_at.asc())
        )
        rows = (await self.db.execute(stmt)).scalars().all()

        # Keep last 20 messages to fit context windows
        recent = rows[-20:] if len(rows) > 20 else rows
        lines: list[str] = []
        for msg in recent:
            role = msg.sender_role.upper()
            lines.append(f"[{role}]: {msg.message_text}")
        return "\n".join(lines) if lines else "(no messages yet)"

    async def _persist_message(
        self,
        session_id: int,
        sender_role: str,
        text: str,
        widget_type: str | None,
    ) -> SessionMessage:
        msg = SessionMessage(
            session_id=session_id,
            sender_role=sender_role,
            message_text=text,
            widget_type=widget_type or "TEXT",
            created_at=datetime.utcnow(),
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    @staticmethod
    def _ensure_state(session: LearningSession) -> dict[str, Any]:
        """Return (and bootstrap if needed) the mutable session state."""
        if session.session_state is None:
            session.session_state = _default_session_state()
        return session.session_state

    @staticmethod
    def _aggregate_bkt(state: dict[str, Any]) -> float:
        """Compute a single aggregate BKT score across all tracked points."""
        topics = state.get("topics", [])
        if topics:
            all_scores = [
                pt["bkt_score"]
                for topic in topics
                for pt in topic.get("points", [])
            ]
            if not all_scores:
                return 0.0
            return sum(all_scores) / len(all_scores)
        return 0.0

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

    @staticmethod
    def _parse_key_pool(env_name: str) -> list[str]:
        raw = os.getenv(env_name, "").strip()
        if not raw:
            return []
        return [k.strip() for k in raw.split(",") if k.strip()]
