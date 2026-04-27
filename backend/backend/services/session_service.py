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
import re

print("🔥 SESSION SERVICE LOADED - NEW CODE ACTIVE")
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
# TEST MODE: DETERMINISTIC_WIDGET_OVERRIDE
# When True, forces specific widget types at specific points for
# controlled frontend testing.  Set to False for production.
# ──────────────────────────────────────────────────────────────────────
DETERMINISTIC_WIDGET_OVERRIDE: bool = True

_FORCED_WIDGET_INSTRUCTIONS: dict[str, str] = {
    "process": (
        "\n\n[SYSTEM ALARM — MANDATORY WIDGET GENERATION]\n"
        "You MUST set widget_type to \"process\" and generate widget_data.\n"
        "Your widget_data MUST contain steps as objects with id and text:\n"
        '{\n'
        '  "kido_response": "Can you put these in order for me?",\n'
        '  "widget_type": "process",\n'
        '  "widget_data": {\n'
        '    "steps": [\n'
        '      {"id": "s1", "text": "First action"},\n'
        '      {"id": "s2", "text": "Second action"},\n'
        '      {"id": "s3", "text": "Third action"}\n'
        '    ]\n'
        '  }\n'
        '}\n\n'
        "Rules:\n"
        "- Each step must be a short, clean sentence related to the current point.\n"
        "- DO NOT include numbering.\n"
        "- DO NOT include prefixes (Step, Process, First, etc.).\n"
        "- DO NOT include explanations.\n"
        "- Generate 3-5 ordered steps.\n"
        "- EACH step MUST be an object with 'id' (s1, s2, ...) and 'text'.\n"
        'This is NON-NEGOTIABLE. Do NOT output widget_type: "text".'
    ),
    "comparison": (
        "\n\n[SYSTEM ALARM — MANDATORY WIDGET GENERATION]\n"
        "You MUST generate a COMPARISON widget for this response.\n"
        "Your JSON output MUST include:\n"
        '  "widget_type": "comparison"\n'
        '  "widget_data": {{\n'
        '    "categories": ["Category A", "Category B"],\n'
        '    "items": [\n'
        '      {{"id": "i1", "text": "Trait 1", "category": "Category A"}},\n'
        '      {{"id": "i2", "text": "Trait 2", "category": "Category B"}}\n'
        '    ]\n'
        '  }}\n'
        "The categories and items must be related to the current point.\n"
        "Generate 2 categories and 4-6 items. EACH item MUST be an object with 'id', 'text', and 'category'.\n"
        'This is NON-NEGOTIABLE. Do NOT output widget_type: "text".'
    ),
}


def _check_forced_widget(state: dict[str, Any]) -> str | None:
    """TEST MODE: Return forced widget type slug, or None for default behavior.

    Rules (absolute session counter, never resets):
      session_interaction_count == 2  →  "process"
      session_interaction_count == 4  →  "comparison"
      everything else                 →  None
    """
    count = state.get("session_interaction_count", 0)
    print(f"🔥 ENTERED WIDGET CHECK session_count={count}")
    if count == 2:
        return "process"
    if count == 4:
        return "comparison"
    return None


def _validate_forced_widget_data(
    widget_type: str, widget_data: dict | None,
) -> str | None:
    """Validate widget_data matches the forced widget_type.

    Returns None on success, or an error message string on failure.
    """
    if widget_data is None:
        return f"widget_data is null — Kido did not generate {widget_type} data"
    if widget_type == "process":
        steps = widget_data.get("steps")
        if not isinstance(steps, list) or len(steps) < 2:
            return f"process widget_data.steps is invalid: {type(steps).__name__}, expected list of 2+"
    elif widget_type == "comparison":
        cats = widget_data.get("categories")
        items = widget_data.get("items")
        if not isinstance(cats, list) or len(cats) < 2:
            return f"comparison widget_data.categories is invalid: {type(cats).__name__}"
        if not isinstance(items, list) or len(items) < 2:
            return f"comparison widget_data.items is invalid: {type(items).__name__}"
    return None


_STEP_PREFIX_RE = re.compile(r'^\s*(step|process)?\s*\d+[:.\'\-\s]*', re.IGNORECASE)


def _sanitize_widget_steps(widget_data: dict | None) -> dict | None:
    """Normalize and sanitize process widget steps.

    Handles two LLM output formats:
      1. Objects: [{"id": "s1", "text": "..."}]  — preferred
      2. Strings: ["Step 1: ..."]  — system prompt fallback

    Strips numbering/prefix labels from step text.
    Assigns IDs if missing (s1, s2, ...).
    """
    if widget_data is None:
        return None
    steps = widget_data.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        return widget_data

    normalized: list[dict[str, str]] = []
    for i, step in enumerate(steps):
        if isinstance(step, str):
            # Plain string → convert to {id, text}
            clean = _STEP_PREFIX_RE.sub("", step).strip()
            normalized.append({"id": f"s{i + 1}", "text": clean})
        elif isinstance(step, dict) and "text" in step:
            step["text"] = _STEP_PREFIX_RE.sub("", step["text"]).strip()
            if "id" not in step:
                step["id"] = f"s{i + 1}"
            normalized.append(step)
        else:
            # Unknown format — skip
            normalized.append({"id": f"s{i + 1}", "text": str(step)})

    widget_data["steps"] = normalized
    return widget_data


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
    # Widget Data Generation (dedicated LLM call)
    # ------------------------------------------------------------------

    _WIDGET_DATA_PROMPTS: dict[str, str] = {
        "process": (
            "You are a data generation module. Generate a JSON object for a "
            '"sort the steps" quiz about: "{point}"\n\n'
            "Return ONLY valid JSON in this exact format, nothing else:\n"
            '{{"steps": [{{"id": "s1", "text": "..."}}, {{"id": "s2", "text": "..."}}, '
            '{{"id": "s3", "text": "..."}}]}}\n\n'
            "Rules:\n"
            "- 3-5 steps in the CORRECT chronological order\n"
            "- Each step is a short, clean sentence\n"
            "- No numbering, no prefixes (Step, Process, First, etc.)\n"
            "- No explanations\n"
            "- ONLY return the JSON object, nothing else"
        ),
        "comparison": (
            "You are a data generation module. Generate a JSON object for a "
            '"category sorting" quiz about: "{point}"\n\n'
            "Return ONLY valid JSON in this exact format, nothing else:\n"
            '{{"categories": ["Category A", "Category B"], "items": ['
            '{{"id": "i1", "text": "...", "category": "Category A"}}, '
            '{{"id": "i2", "text": "...", "category": "Category B"}}, '
            '{{"id": "i3", "text": "...", "category": "Category A"}}, '
            '{{"id": "i4", "text": "...", "category": "Category B"}}]}}\n\n'
            "Rules:\n"
            "- Exactly 2 categories related to the topic\n"
            "- 4-6 items, each assigned to one category\n"
            "- category values MUST exactly match one of the category names\n"
            "- ONLY return the JSON object, nothing else"
        ),
    }

    async def _generate_widget_data(
        self, widget_type: str, current_point: str,
    ) -> dict | None:
        """Make a SEPARATE LLM call to generate widget data.

        This call uses NO Kido persona or system prompt — just a clean
        data-generation prompt. This avoids the LLM ignoring widget
        instructions when the Kido system prompt is dominant.
        """
        prompt_template = self._WIDGET_DATA_PROMPTS.get(widget_type)
        if not prompt_template:
            print(f"[WIDGET_GEN] No prompt template for widget_type={widget_type}")
            return None

        prompt = prompt_template.replace("{point}", current_point)
        print(f"[WIDGET_GEN] Calling dedicated LLM for {widget_type} widget data...")

        try:
            raw = await self.kido.llm_manager.call_with_fallback(prompt)
            print(f"[WIDGET_GEN] Raw LLM response: {raw[:300]}")

            # Parse JSON from the response
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                data = json.loads(json_match.group())
                print(f"[WIDGET_GEN] Parsed successfully: {list(data.keys())}")
                return data
            else:
                print(f"[WIDGET_GEN] No JSON found in response")
                return None
        except json.JSONDecodeError as e:
            print(f"[WIDGET_GEN] JSON parse error: {e}")
            return None
        except Exception as e:
            print(f"[WIDGET_GEN] LLM call failed: {e}")
            return None

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
        print("🔥 HIT PROCESS_USER_MESSAGE")
        async with _get_session_lock(session_id):
            return await self._process_user_message_locked(session_id, user_text)

    async def _process_user_message_locked(
        self, session_id: int, user_text: str,
    ) -> dict[str, Any]:
        """Inner implementation — always runs under session lock."""
        print("🔥 HIT PROCESS_USER_MESSAGE")
        session = await self._get_session(session_id)
        state = self._ensure_state(session)
        print(f"[STATE DEBUG] ENTRY: id={id(state)}, count={state.get('session_interaction_count', 0)}, point={state.get('current_point_index')}")

        # TEST MODE: increment absolute session counter and decide widget
        forced_widget: str | None = None
        if DETERMINISTIC_WIDGET_OVERRIDE:
            state["session_interaction_count"] = state.get("session_interaction_count", 0) + 1
            print(f"[STATE DEBUG] BEFORE DECISION: session_count={state['session_interaction_count']}, point={state.get('current_point_index')}")
            forced_widget = _check_forced_widget(state)
            print(f"[DEBUG_WIDGET] AFTER DECISION: forced_widget={forced_widget}")

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
            point_node["total_attempts"] = point_node.get("total_attempts", 0) + 1

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

        # --- 4b. Populate kido_memory LIVE during learning ---
        # This ensures the Mind Map shows Kido's evolving understanding
        # at every stage, not only after point completion.
        mem_title = evaluator_output.get("memory_title")
        mem_summary = evaluator_output.get("memory_summary")
        if point_node and (mem_title or mem_summary):
            existing_memory = point_node.get("kido_memory") or {}
            point_node["kido_memory"] = {
                "title": mem_title or existing_memory.get("title", current_point or "Unknown"),
                "summary": mem_summary or existing_memory.get("summary", ""),
            }
        elif point_node and not point_node.get("kido_memory") and learned_summary:
            # Fallback: use kido_learned_summary if no memory fields provided
            point_node["kido_memory"] = {
                "title": current_point or "Unknown",
                "summary": learned_summary,
            }

        # --- 5. Increment attempt counter (only on INCORRECT/NEEDS_INFO) ---
        if label in ("INCORRECT", "NEEDS_INFO"):
            state["point_attempts"] += 1

        # --- 6. Limit Check (Python-enforced) ---
        advanced = False
        session_complete = False
        topic_checkpoint = False
        mind_map_data: dict[str, Any] = {}
        instruction_for_kido = evaluator_output.get("instruction_for_kido", "")

        if state["point_attempts"] >= MAX_ATTEMPTS_PER_POINT or self.bkt.is_mastered(new_score):
            advanced = True

            # Mark current point as completed + populate kido_memory
            if point_node:
                point_node["status"] = "completed"
                point_node["is_correct"] = (label == "CORRECT")
                
                # Ensure kido_memory is populated on completion
                # (Step 3d already populates it live, but guarantee it here)
                if not point_node.get("kido_memory"):
                    point_node["kido_memory"] = {
                        "title": current_point or "Unknown",
                        "summary": evaluator_output.get("kido_learned_summary", ""),
                    }

            state["point_attempts"] = 0
            # NOTE: session_interaction_count is NEVER reset — it's absolute
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
                # Trigger Mind Map checkpoint and build the DTO for the frontend.
                topic_checkpoint = True
                mind_map_data = self._build_mind_map_dto(state, ti)
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

        # ── TEST MODE: Injection Point A — log forced widget (do NOT inject into Kido prompt) ──
        widget_debug: dict[str, Any] | None = None
        if DETERMINISTIC_WIDGET_OVERRIDE and forced_widget:
            logger.info(
                "[TEST_MODE] Widget forced: type=%s, session_count=%s",
                forced_widget, state.get("session_interaction_count", 0),
            )

        # --- 7. Call Kido (chat response only — no widget generation) ---
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

        # ── TEST MODE: Injection Point B — generate widget data via SEPARATE LLM call ──
        if DETERMINISTIC_WIDGET_OVERRIDE and forced_widget:
            widget_type = forced_widget.upper()
            widget_data = await self._generate_widget_data(
                forced_widget, current_point or "Unknown Point"
            )

            # Normalize comparison: LLM system prompt uses "attributes",
            # but frontend expects "items"
            if forced_widget == "comparison" and isinstance(widget_data, dict):
                if "attributes" in widget_data and "items" not in widget_data:
                    widget_data["items"] = widget_data.pop("attributes")
                    print(f"[NORMALIZE] Renamed 'attributes' → 'items'")

            # Backend sanitization: strip LLM prefixes from step text
            if forced_widget == "process" and widget_data:
                widget_data = _sanitize_widget_steps(widget_data)

            validation_error = _validate_forced_widget_data(forced_widget, widget_data)
            if validation_error:
                logger.error(
                    "[TEST_MODE] Validation FAILED: %s  — widget still returned for visibility",
                    validation_error,
                )
            else:
                logger.info("[TEST_MODE] Validation PASSED ✅")

            # NEVER drop the widget — always attach debug for test visibility
            widget_debug = {
                "forced": True,
                "expected_type": forced_widget,
                "validation_error": validation_error,
                "trigger_rule": (
                    f"session_count={state.get('session_interaction_count', 0)}"
                ),
            }
        else:
            widget_type = kido_result.get("widget_type", widget_type.lower())
            widget_data = kido_result.get("widget_data", None)

        # --- 8. Persist Kido message ---
        await self._persist_message(
            session_id, "kido", kido_response,
            widget_type=widget_type.upper(), widget_data=widget_data,
        )

        # Track widget usage on the point node
        if point_node and widget_type.upper() != "TEXT":
            point_node["widget_used"] = True

        # --- 9. Flush state back to DB ---
        state["mind_map_version"] = state.get("mind_map_version", 0) + 1
        session.session_state = deepcopy(state)
        session.bkt_score = overall_bkt
        if session_complete:
            session.status = "completed"
            session.end_time = datetime.utcnow()
            state["completion_type"] = "natural"
        await self.db.commit()

        print(f"[STATE DEBUG] BEFORE RETURN: session_count={state.get('session_interaction_count', 0)}, point={state.get('current_point_index')}")
        print(f"[DEBUG_WIDGET] 3. PAYLOAD RETURN: widget_type={widget_type.upper()}, widget_data={'<PRESENT>' if widget_data else 'None'}, widget_debug={widget_debug}")

        result = {
            "kido_response": kido_response,
            "evaluator_label": evaluator_label,
            "widget_type": widget_type.upper(),
            "widget_data": widget_data,
            "session_state": state,
            "advanced": advanced,
            "session_complete": session_complete,
            "topic_checkpoint": topic_checkpoint,
            "mind_map_data": mind_map_data,
        }
        if widget_debug is not None:
            result["widget_debug"] = widget_debug
        return result

    # ------------------------------------------------------------------
    # Public API: Mind Map Submission Pipeline
    # ------------------------------------------------------------------

    async def process_mind_map(
        self,
        session_id: int,
        corrections: dict[str, str],
        target_topic_index: int | None = None,
    ) -> dict[str, Any]:
        """Process mind map corrections and advance to next topic.

        Returns a dict with keys:
            kido_response    (str)
            widget_type      (str)
            session_state    (dict)
            session_complete (bool)
        """
        async with _get_session_lock(session_id):
            return await self._process_mind_map_locked(session_id, corrections, target_topic_index)

    async def _process_mind_map_locked(
        self, session_id: int, corrections: dict[str, str], target_topic_index: int | None = None,
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
                    "impact_type": "ANNOTATION",
                }
                new_events.append(evt)
        
        if "correction_events" not in state:
            state["correction_events"] = []
        state["correction_events"].extend(new_events)

        # --- 2. NO State Mutation ---
        # Per strict causality model: MIND_MAP_CORRECTION logs events ONLY.
        # It does NOT mutate BKT, and does NOT advance the session state.

        # --- 3. Flush state (moved AFTER skip/normal logic) ---
        state["mind_map_version"] = state.get("mind_map_version", 0) + 1

        if target_topic_index is not None and 0 <= target_topic_index < len(state.get("topics", [])):
            # Handle Topic Advancement (either natural completion → next, or skip → jump)
            current_ti = state.get("current_topic_index", 0)
            is_natural_advance = (target_topic_index == current_ti + 1)
            
            # Mark intermediate topics as skipped (not the current completed one)
            if "skipped_indices" not in state:
                state["skipped_indices"] = []
            
            if target_topic_index > current_ti + 1:
                # True skip: mark topics between current+1 and target as skipped
                for i in range(current_ti + 1, target_topic_index):
                    if i not in state["skipped_indices"]:
                        state["skipped_indices"].append(i)
            
            state["current_topic_index"] = target_topic_index
            state["current_point_index"] = 0
            state["point_attempts"] = 0
            
            # Clear pending states
            state["needs_review"] = False
            state["awaiting_topic_confirmation"] = False
            
            target_topic_title = state["topics"][target_topic_index]["topic_title"]
            first_point_title = state["topics"][target_topic_index]["points"][0]["point_title"]
            
            if is_natural_advance:
                kido_response = (
                    f"Great work on that topic! Now let's move on to '{target_topic_title}'. "
                    f"Let's start with: {first_point_title}. What do you already know about this?"
                )
            else:
                kido_response = (
                    f"Got it! Skipping ahead to '{target_topic_title}'. "
                    f"Let's start with the first point: {first_point_title}. What do you already know about this?"
                )
            widget_type = "TEXT"
            await self._persist_message(session_id, "kido", kido_response, widget_type=widget_type)
            
        else:
            # Generate acknowledgment message for normal submission
            if corrections:
                kido_response = (
                    "Thanks for the corrections! I've updated my notes with your feedback. "
                    "Let's keep going — what should I learn next?"
                )
            else:
                kido_response = (
                    "Got it! My understanding looks good so far. "
                    "Let's keep going — continue teaching or pick the next topic in the Roadmap!"
                )
            widget_type = "TEXT"
            await self._persist_message(session_id, "kido", kido_response, widget_type=widget_type)

        # --- Persist FINAL state (AFTER all mutations including skip) ---
        session.session_state = deepcopy(state)
        # Note: session_complete remains what it was
        session_complete = state.get("current_topic_index", 0) >= len(state.get("topics", []))
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
            # NOTE: session_interaction_count is NEVER reset
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
        state["mind_map_version"] = state.get("mind_map_version", 0) + 1
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
        # NOTE: session_interaction_count is NEVER reset

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
        state["mind_map_version"] = state.get("mind_map_version", 0) + 1
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
        for index, p in enumerate(points):
            memory = p.get("kido_memory") or {}
            misconceptions = p.get("misconceptions", [])
            # Get the latest misconception text if any
            latest_misconception = misconceptions[-1]["misconception"] if misconceptions else None
            nodes.append({
                "node_id": p.get("node_id", index + 1),
                "point": p.get("point_title", ""),
                "kido_sentence": memory.get("summary", ""),
                "misconception": latest_misconception,
                "status": "correct" if p.get("bkt_score", 0) >= MASTERY_THRESHOLD else (
                    "incorrect" if p.get("status") == "completed" else "partial"
                ),
            })

        version = state.get("mind_map_version", 1)
        event_id = f"mm_evt_v{version}"

        return {
            "event_id": event_id,
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
        """Return a detached copy of the session state for safe mutation.

        SQLAlchemy JSONB columns track changes by comparing the committed
        snapshot with the current attribute value.  If we return the *same*
        dict object, in-place mutations silently corrupt the snapshot and
        the ORM skips the UPDATE on commit.  Returning a deepcopy keeps the
        snapshot pristine so ``session.session_state = deepcopy(state)``
        always triggers a real database write.
        """
        if session.session_state is None:
            session.session_state = _default_session_state()
        return deepcopy(session.session_state)

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

    # ──────────────────────────────────────────────────────────────────
    # Manual Session Termination
    # ──────────────────────────────────────────────────────────────────

    async def end_session(self, session_id: int) -> dict[str, Any]:
        """Manually end a session — idempotent, with eager feedback generation.

        Returns:
            dict with status, completion_type, session_id, message.
        """
        from backend.services.feedback_service import FeedbackService

        session = await self.db.get(LearningSession, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found.")

        state = session.session_state or {}

        # Idempotent: already completed → return cached data, no error
        if session.status == "completed":
            logger.info("[END_SESSION] session_id=%s already completed (idempotent return)", session_id)
            return {
                "status": "completed",
                "completion_type": state.get("completion_type", "natural"),
                "session_id": session_id,
                "message": "Session was already completed.",
            }

        # 1. Compute final BKT score
        overall_bkt = self._aggregate_bkt(state)

        # 2. Count progress for logging
        topics = state.get("topics", [])
        completed_count = 0
        total_count = 0
        for t in topics:
            for p in t.get("points", []):
                total_count += 1
                if p.get("status") == "completed":
                    completed_count += 1

        # 3. Set terminal state
        state["completion_type"] = "manual"
        session.session_state = deepcopy(state)
        session.status = "completed"
        session.end_time = datetime.utcnow()
        session.bkt_score = overall_bkt
        await self.db.commit()

        logger.info(
            "[END_SESSION] session_id=%s completion_type=manual bkt_score=%.3f topics_completed=%d/%d",
            session_id, overall_bkt, completed_count, total_count,
        )

        # 4. Eager feedback generation (blocks but cached for instant redirect)
        try:
            feedback_svc = FeedbackService(self.db)
            await feedback_svc.generate_session_feedback(session_id)
            logger.info("[END_SESSION] Eager feedback generated for session_id=%s", session_id)
        except Exception as exc:
            logger.error("[END_SESSION] Eager feedback generation failed for session_id=%s: %s", session_id, exc)
            # Non-fatal — feedback page will retry on load

        return {
            "status": "completed",
            "completion_type": "manual",
            "session_id": session_id,
            "message": "Session ended successfully.",
        }

