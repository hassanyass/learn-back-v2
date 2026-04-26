"""Phase 3D — Dual-Agent Session Orchestrator.

Owns the full message lifecycle:
  User Message → Evaluator → BKT Update → State Mutation → Kido → Persist

Handles two pipelines:
  1. process_chat_message  — standard Evaluator → Kido flow with topic checkpoint detection
  2. process_mind_map      — mind map corrections → BKT bonus → topic advance → Kido intro

All session-state mutations happen here.  Routers are thin transport.
"""

from __future__ import annotations

import asyncio
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
from backend.services.evaluator_service import EvaluatorService
from backend.services.kido_service import KidoService

logger = logging.getLogger(__name__)

MAX_ATTEMPTS_PER_POINT: int = 5
OVERALL_BKT_COMPLETION_THRESHOLD: float = 0.95

# ──────────────────────────────────────────────────────────────────────
# Concurrency: Per-session mutual exclusion lock registry
# ──────────────────────────────────────────────────────────────────────

_session_locks: dict[int, asyncio.Lock] = {}


def _get_session_lock(session_id: int) -> asyncio.Lock:
    """Return the asyncio.Lock for a given session_id, creating it if needed.

    This guarantees that only ONE operation per session can execute at a time,
    preventing read-modify-write race conditions under async concurrency.
    """
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


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
        self.evaluator = EvaluatorService()
        self.kido = KidoService()

        # LLM config (reuses project conventions from AIIngestionService)
        self.groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
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
    # Public API: Chat Message Pipeline
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
            topic_checkpoint (bool)  – True if we hit a mind map checkpoint
            mind_map_data    (list)  – kido_memory entries for the current topic
        """
        async with _get_session_lock(session_id):
            return await self._process_user_message_locked(session_id, user_text)

    async def _process_user_message_locked(
        self, session_id: int, user_text: str,
    ) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
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

        # --- 3. Validate evaluator label (deterministic) ---
        VALID_LABELS = {"CORRECT", "INCORRECT", "NEEDS_INFO", "IRRELEVANT"}
        label = evaluator_output.get("label", "NEEDS_INFO").upper().strip()
        if label not in VALID_LABELS:
            logger.warning("Unknown evaluator label '%s'; defaulting to NEEDS_INFO", label)
            label = "NEEDS_INFO"

        # --- 3b. BKT Update (deterministic from label, NOT from LLM) ---
        ti = state["current_topic_index"]
        pi = state["current_point_index"]
        point_node = self._get_point_node(state, ti, pi)
        prev_score = point_node["bkt_score"] if point_node else self.bkt.initial_probability()
        bkt_direction = 1 if label == "CORRECT" else 0
        new_score = self.bkt.update(prev_score, bkt_direction)
        if point_node:
            point_node["bkt_score"] = new_score

        # --- 3c. Track misconceptions live (nested inside point) ---
        detected_misconception = evaluator_output.get("detected_misconception")
        if detected_misconception and label == "INCORRECT" and point_node:
            point_node["misconceptions"].append({
                "misconception": detected_misconception,
                "timestamp": datetime.utcnow().isoformat(),
            })

        # --- 4. Accumulate learned items and metaphors ---
        learned_summary = evaluator_output.get("kido_learned_summary", "")
        identified_metaphors = evaluator_output.get("identified_metaphors", "")
        kido_learned_so_far = [learned_summary] if learned_summary else []

        # --- 5. Increment attempt counter (only on INCORRECT/NEEDS_INFO) ---
        if label in ("INCORRECT", "NEEDS_INFO"):
            state["point_attempts"] += 1

        # --- 6. Limit Check (Python-enforced) ---
        advanced = False
        session_complete = False
        topic_checkpoint = False
        mind_map_data: list[dict[str, Any]] = []
        instruction_for_kido = evaluator_output.get("instruction_for_kido", "")

        if state["point_attempts"] >= MAX_ATTEMPTS_PER_POINT or self.bkt.is_mastered(new_score):
            advanced = True

            # Mark current point as completed + populate kido_memory
            if point_node:
                point_node["status"] = "completed"
                point_node["is_correct"] = (label == "CORRECT")
                
                # Populate kido_memory from evaluator output
                mem_title = evaluator_output.get("memory_title")
                mem_summary = evaluator_output.get("memory_summary")
                if mem_title and mem_summary:
                    point_node["kido_memory"] = {
                        "title": mem_title,
                        "summary": mem_summary,
                    }
                elif not point_node.get("kido_memory"):
                    # Fallback: use learned_summary from evaluator
                    point_node["kido_memory"] = {
                        "title": current_point or "Unknown",
                        "summary": evaluator_output.get("kido_learned_summary", ""),
                    }

            state["point_attempts"] = 0
            state["current_point_index"] += 1

            # Check: are ALL points in the current topic completed?
            topic_node = state["topics"][ti] if ti < len(state.get("topics", [])) else None
            all_points_done = False
            if topic_node:
                all_points_done = all(
                    p.get("status") in ("completed", "skipped")
                    for p in topic_node.get("points", [])
                )

            if all_points_done and topic_node:
                # ── COMPLETION_ELIGIBLE (REVIEW MODE) ──
                # We no longer hard-lock the session or return early.
                # Just instruct Kido to invite the user to review the Mind Map.
                instruction_for_kido += (
                    "\n\nIMPORTANT: We have finished all points in this topic! 🎉 "
                    "Tell the student you learned a lot and invite them to view your 'Mind Map' "
                    "using the button to see your notes. Let them know they can correct "
                    "your notes or proceed to the next topic whenever they are ready."
                )


            else:
                # Normal point advancement (within same topic)
                next_point = self._resolve_current_point(state, segments)
                if next_point:
                    new_node = self._get_point_node(state, state["current_topic_index"], state["current_point_index"])
                    if new_node:
                        new_node["status"] = "in_progress"
                        new_node["is_visited"] = True
                    instruction_for_kido += (
                        f"\n\nIMPORTANT: Acknowledge the end of this point gracefully "
                        f"and ask about the next point: \"{next_point}\"."
                    )
                else:
                    # Edge case: shouldn't reach here if all_points_done check works
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
        evaluator_label = label  # Use the validated label, not raw LLM output
        widget_type = evaluator_output.get("widget_type", "TEXT")

        kido_result = await self.kido.generate_response(
            session_state=state,
            evaluator_label=evaluator_label,
            user_message=user_text,
            current_point=current_point or "Unknown Point",
            instruction_for_kido=instruction_for_kido,
            identified_metaphors=identified_metaphors,
            conversation_history=conversation_history,
            kido_learned_summary=learned_summary,
        )
        kido_response = kido_result.get("kido_response", "")
        widget_type = kido_result.get("widget_type", widget_type.lower())
        widget_data = kido_result.get("widget_data", None)

        # --- 8. Persist Kido message ---
        await self._persist_message(
            session_id, "kido", kido_response,
            widget_type=widget_type.upper(), widget_data=widget_data,
        )

        # --- 9. Flush state back to DB ---
        session.session_state = deepcopy(state)
        session.bkt_score = overall_bkt
        if session_complete:
            session.status = "completed"
            session.end_time = datetime.utcnow()
        await self.db.commit()

        return {
            "kido_response": kido_response,
            "evaluator_label": evaluator_label,
            "widget_type": widget_type.upper(),
            "widget_data": widget_data,
            "session_state": state,
            "advanced": advanced,
            "session_complete": session_complete,
            "topic_checkpoint": False,
            "mind_map_data": [],
        }

    # ------------------------------------------------------------------
    # Public API: Mind Map Submission Pipeline
    # ------------------------------------------------------------------

    async def process_mind_map(
        self,
        session_id: int,
        corrections: dict[str, str],
    ) -> dict[str, Any]:
        """Process mind map corrections and advance to next topic.

        Returns a dict with keys:
            kido_response    (str)
            widget_type      (str)
            session_state    (dict)
            session_complete (bool)
        """
        async with _get_session_lock(session_id):
            return await self._process_mind_map_locked(session_id, corrections)

    async def _process_mind_map_locked(
        self, session_id: int, corrections: dict[str, str],
    ) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
        session = await self._get_session(session_id)
        state = self._ensure_state(session)
        segments = await self._get_segments(session)

        import uuid
        from datetime import datetime
        
        # --- 1. Append Immutable Correction Events ---
        new_events = []
        for title, text in corrections.items():
            node_id = None
            # Find the node ID by title across all topics (since mind map can show all)
            for topic in state.get("topics", []):
                for p in topic.get("points", []):
                    if p.get("point_title") == title:
                        node_id = p.get("id")
                        break
                if node_id:
                    break
            
            if node_id and text.strip():
                evt = {
                    "event_id": f"corr_{uuid.uuid4().hex[:8]}",
                    "node_id": node_id,
                    "correction_text": text.strip(),
                    "timestamp": datetime.utcnow().isoformat(),
                    "impact_type": "OVERRIDE",
                    "bkt_delta": 0.05
                }
                new_events.append(evt)
        
        if "correction_events" not in state:
            state["correction_events"] = []
        state["correction_events"].extend(new_events)

        # --- 2. Apply BKT bonuses via Evaluator using Event Log ---
        self.evaluator.evaluate_mind_map(state, new_events)

        # --- 2. Advance to next topic ---
        state["current_topic_index"] += 1
        state["current_point_index"] = 0
        state["point_attempts"] = 0

        # --- 3. Check end of session ---
        ti = state["current_topic_index"]
        topics = state.get("topics", [])
        session_complete = ti >= len(topics)

        if session_complete:
            # Generate goodbye message
            kido_response = (
                "You did it! 🎉🌟 You taught me everything and I learned so much! "
                "Thank you for being the most amazing teacher ever! "
                "Check out your feedback report to see how well you did. "
                "I'll never forget what you taught me! 💖"
            )
            widget_type = "TEXT"

            session.status = "completed"
            session.end_time = datetime.utcnow()

            await self._persist_message(session_id, "kido", kido_response, widget_type=widget_type)
        else:
            # Mark next topic's first point as in_progress
            next_topic = topics[ti]
            if next_topic.get("points"):
                next_topic["points"][0]["status"] = "in_progress"

            next_topic_title = next_topic.get("topic_title", "the next topic")
            next_point_title = next_topic["points"][0]["point_title"] if next_topic.get("points") else "the first point"

            # Call Kido to introduce the new topic
            conversation_history = await self._build_conversation_history(session_id)
            instruction = f"Acknowledge the mind map review is done, and enthusiastically introduce the next topic: {next_topic_title}."
            
            kido_result = await self.kido.generate_response(
                session_state=state,
                evaluator_label="CORRECT",
                user_message="(Mind map reviewed — moving to next topic)",
                current_point=next_point_title,
                instruction_for_kido=instruction,
                identified_metaphors="",
                conversation_history=conversation_history,
                kido_learned_summary="",
                force_transition=True,
                next_point=next_point_title,
            )
            kido_response = kido_result.get("kido_response", f"Let's learn about {next_topic_title}!")
            widget_type = kido_result.get("widget_type", "text").upper()

            await self._persist_message(session_id, "kido", kido_response, widget_type=widget_type)

        # --- 4. Flush state ---
        session.session_state = deepcopy(state)
        session.bkt_score = self._aggregate_bkt(state)
        await self.db.commit()

        return {
            "kido_response": kido_response,
            "widget_type": widget_type,
            "session_state": state,
            "session_complete": session_complete,
        }

    # ------------------------------------------------------------------
    # Public API: Widget Submit Pipeline
    # ------------------------------------------------------------------

    async def process_widget_submit(
        self,
        session_id: int,
        submitted_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Process a widget submission (PROCESS/COMPARISON).

        1. Fetch last Kido message to get expected widget_data and widget_type.
        2. Grade via EvaluatorService.evaluate_widget (pure Python).
        3. Check transitions (point completed, max attempts).
        4. Call Kido with evaluator label for a natural reaction.

        Returns dict with keys:
            kido_response, widget_type, session_state, advanced,
            session_complete, evaluation_label
        """
        async with _get_session_lock(session_id):
            return await self._process_widget_submit_locked(session_id, submitted_data)

    async def _process_widget_submit_locked(
        self, session_id: int, submitted_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
        session = await self._get_session(session_id)
        state = self._ensure_state(session)
        segments = await self._get_segments(session)

        # --- 1. Fetch last Kido message for expected data ---
        last_kido = await self._get_last_kido_message(session_id)
        if not last_kido or not last_kido.widget_data:
            raise ValueError("No widget data found in last Kido message.")

        expected_data = last_kido.widget_data
        expected_widget_type = last_kido.widget_type or "TEXT"

        # --- 2. Grade via pure Python ---
        state, label, point_completed = self.evaluator.evaluate_widget(
            session_state=state,
            expected_data=expected_data,
            submitted_data=submitted_data,
            widget_type=expected_widget_type,
        )

        # --- 3. Check transitions ---
        advanced = False
        session_complete = False

        if point_completed:
            advanced = True
            state["point_attempts"] = 0
            state["current_point_index"] += 1

            # Check if all points in topic are done
            ti = state["current_topic_index"]
            topic_node = state["topics"][ti] if ti < len(state.get("topics", [])) else None
            all_done = topic_node and all(
                p.get("status") == "completed" for p in topic_node.get("points", [])
            )

            if all_done:
                # Will be handled by next chat or mind_map flow
                pass
            else:
                # Mark next point as in_progress
                next_point = self._resolve_current_point(state, segments)
                if next_point:
                    new_node = self._get_point_node(
                        state, state["current_topic_index"], state["current_point_index"]
                    )
                    if new_node:
                        new_node["status"] = "in_progress"

        # --- 4. Call Kido for reaction ---
        current_point = self._resolve_current_point(state, segments) or "this point"
        conversation_history = await self._build_conversation_history(session_id)
        
        instruction = (
            "Celebrate! The student successfully sorted or ordered the widget task correctly."
            if label == "CORRECT" else
            "Act confused! The student made a mistake on the widget task. Encourage them to try again."
        )

        kido_result = await self.kido.generate_response(
            session_state=state,
            evaluator_label=label,
            user_message=f"(Widget submission: {label})",
            current_point=current_point,
            instruction_for_kido=instruction,
            identified_metaphors="",
            conversation_history=conversation_history,
            kido_learned_summary="",
        )
        kido_response = kido_result.get("kido_response", "")
        kido_widget_type = kido_result.get("widget_type", "text").upper()

        await self._persist_message(session_id, "kido", kido_response, widget_type=kido_widget_type)

        # --- 5. Flush state ---
        overall_bkt = self._aggregate_bkt(state)
        session.session_state = deepcopy(state)
        session.bkt_score = overall_bkt
        await self.db.commit()

        return {
            "kido_response": kido_response,
            "widget_type": kido_widget_type,
            "session_state": state,
            "advanced": advanced,
            "session_complete": session_complete,
            "evaluation_label": label,
        }

    # ------------------------------------------------------------------
    # Public API: Hint
    # ------------------------------------------------------------------

    async def generate_hint(self, session_id: int) -> dict[str, Any]:
        """Generate a hint for the current point and persist as a 'system' message.

        Returns dict with keys: hint_text, widget_type.
        """
        async with _get_session_lock(session_id):
            return await self._generate_hint_locked(session_id)

    async def _generate_hint_locked(self, session_id: int) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
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
    # Public API: Skip Topic
    # ------------------------------------------------------------------

    async def skip_topic(self, session_id: int) -> dict[str, Any]:
        """Skip the current topic, generating a mind map snapshot first.

        Returns dict with keys:
            mind_map_generated  (bool)
            new_topic_index     (int)
            session_complete    (bool)
            mind_map_data       (list)
            session_state       (dict)
        """
        async with _get_session_lock(session_id):
            return await self._skip_topic_locked(session_id)

    async def _skip_topic_locked(self, session_id: int) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
        session = await self._get_session(session_id)
        state = self._ensure_state(session)

        ti = state["current_topic_index"]
        topics = state.get("topics", [])

        if "skipped_indices" not in state:
            state["skipped_indices"] = []
        if ti not in state["skipped_indices"]:
            state["skipped_indices"].append(ti)

        # --- 1. Generate mind map snapshot BEFORE skip ---
        mind_map_data = self._build_mind_map_dto(state, ti)

        if ti < len(topics):
            topic_node = topics[ti]
            points = topic_node.get("points", [])
            # Mark all remaining points in this topic as "skipped"
            for p in points:
                if p.get("status") != "completed":
                    p["status"] = "skipped"

        # --- 2. Advance topic index ---
        state["current_topic_index"] += 1
        state["current_point_index"] = 0
        state["point_attempts"] = 0

        new_ti = state["current_topic_index"]
        session_complete = new_ti >= len(topics)

        if session_complete:
            session.status = "completed"
            session.end_time = datetime.utcnow()
        else:
            # Mark next topic's first point as in_progress
            next_topic = topics[new_ti]
            if next_topic.get("points"):
                next_topic["points"][0]["status"] = "in_progress"

        # --- 3. Flush state ---
        session.session_state = deepcopy(state)
        session.bkt_score = self._aggregate_bkt(state)
        await self.db.commit()

        return {
            "mind_map_generated": True,
            "new_topic_index": new_ti,
            "session_complete": session_complete,
            "mind_map_data": mind_map_data,
            "session_state": state,
        }

    # ------------------------------------------------------------------
    # Public API: Get Mind Map (read-only snapshot)
    # ------------------------------------------------------------------

    async def get_mind_map(self, session_id: int, topic_index: int | None = None) -> dict[str, Any]:
        """Return the mind map snapshot for a given topic.

        Pure read — no LLM calls, no state mutation.

        Returns dict with keys:
            mind_map_data   (dict with topic_title and nodes)
        """
        session = await self._get_session(session_id)
        state = self._ensure_state(session)

        return {
            "mind_map_data": self._build_mind_map_dto(state, topic_index)
        }

    def _build_mind_map_dto(self, state: dict[str, Any], topic_index: int | None = None) -> dict[str, Any]:
        """Canonical builder for mind_map_data DTO."""
        topics = state.get("topics", [])
        ti = topic_index if topic_index is not None else state.get("current_topic_index", 0)

        if ti >= len(topics) or not topics:
            return {"nodes": []}

        topic_node = topics[ti]
        points = topic_node.get("points", [])

        if not points:
            return {"nodes": []}

        nodes = []
        for p in points:
            memory = p.get("kido_memory") or {}
            nodes.append({
                "point": p.get("point_title", ""),
                "kido_sentence": memory.get("summary", ""),
                "status": "correct" if p.get("bkt_score", 0) >= MASTERY_THRESHOLD else (
                    "incorrect" if p.get("status") == "completed" else "partial"
                ),
            })

        return {
            "topic_title": topic_node.get("topic_title", "Untitled"),
            "nodes": nodes,
        }

    # ------------------------------------------------------------------
    # Public API: Get Widget State (lock check)
    # ------------------------------------------------------------------

    async def get_widget_state(self, session_id: int) -> dict[str, Any]:
        """Return the current widget lock state.

        Widget is 'active' ONLY if the last Kido message contains widget_data.
        Otherwise it is 'locked'.

        Pure read — no state mutation.
        """
        last_kido = await self._get_last_kido_message(session_id)

        if not last_kido or not last_kido.widget_data:
            return {"widget_status": "locked", "widget_type": None, "widget_data": None}

        return {
            "widget_status": "ready",
            "widget_type": (last_kido.widget_type or "TEXT").lower(),
            "widget_data": last_kido.widget_data,
        }

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
        if session.slide_deck_id is not None:
            stmt = (
                select(SlideDeck)
                .where(
                    SlideDeck.id == session.slide_deck_id,
                    SlideDeck.user_id == session.user_id,
                )
                .limit(1)
            )
        else:
            # Legacy fallback: sessions created before slide_deck_id existed.
            stmt = (
                select(SlideDeck)
                .where(SlideDeck.user_id == session.user_id)
                .order_by(SlideDeck.created_at.desc())
                .limit(1)
            )

        deck = (await self.db.execute(stmt)).scalars().first()
        if deck is None or not deck.segmented_json:
            raise ValueError("No slide deck found for this session.")
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
        """Return the current concept string or None if all exhausted."""
        topic_idx = state["current_topic_index"]
        point_idx = state["current_point_index"]

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

        recent = rows[-20:] if len(rows) > 20 else rows
        lines: list[str] = []
        for msg in recent:
            role = msg.sender_role.upper()
            lines.append(f"[{role}]: {msg.message_text}")
        return "\n".join(lines) if lines else "(no messages yet)"

    async def _get_last_kido_message(self, session_id: int) -> SessionMessage | None:
        """Fetch the most recent Kido message for a session."""
        stmt = (
            select(SessionMessage)
            .where(
                SessionMessage.session_id == session_id,
                SessionMessage.sender_role == "kido",
            )
            .order_by(SessionMessage.created_at.desc())
            .limit(1)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def _persist_message(
        self,
        session_id: int,
        sender_role: str,
        text: str,
        widget_type: str | None,
        widget_data: dict | None = None,
    ) -> SessionMessage:
        msg = SessionMessage(
            session_id=session_id,
            sender_role=sender_role,
            message_text=text,
            widget_type=widget_type or "TEXT",
            widget_data=widget_data,
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
        """Strip markdown fences and parse JSON.

        Handles: ```json ... ```, embedded JSON in prose, and raw JSON.
        """
        cleaned = raw.strip()

        # Handle markdown code fences (line-by-line detection)
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            inner_lines: list[str] = []
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
            brace_start = cleaned.find("{")
            brace_end = cleaned.rfind("}")
            if brace_start != -1 and brace_end > brace_start:
                cleaned = cleaned[brace_start:brace_end + 1]

        return json.loads(cleaned)

    @staticmethod
    def _parse_key_pool(env_name: str) -> list[str]:
        raw = os.getenv(env_name, "").strip()
        if not raw:
            return []
        return [k.strip() for k in raw.split(",") if k.strip()]
