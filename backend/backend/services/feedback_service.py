"""Phase 4 — Feedback Service.

Analyzes the session history and BKT scores to generate a final feedback report.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.llm_manager import LLMManager
from backend.models.core import LearningSession, SessionMessage, SlideDeck
from backend.prompts.feedback_prompts import FEEDBACK_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class FeedbackService:
    """Generates and manages end-of-session feedback reports."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

        # Reuse LLM settings
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

    async def generate_session_feedback(self, session_id: int) -> dict[str, Any]:
        """Generate, persist, and return the final feedback report for a session.

        Implements:
          - Feedback caching (return cached if exists)
          - feedback_status lock (prevent concurrent generation)
          - 10s LLM timeout with asyncio.wait_for
          - Deterministic fallback on LLM failure/timeout
          - Structured response with per-point breakdown
          - Structured logging with [FEEDBACK] prefix
        """
        import asyncio
        import time

        # 1. Fetch Session
        stmt_session = select(LearningSession).where(LearningSession.id == session_id)
        session = (await self.db.execute(stmt_session)).scalar_one_or_none()
        if not session:
            raise ValueError(f"Session {session_id} not found.")

        # Feedback caching: return cached if exists
        if session.feedback_data:
            logger.info("[FEEDBACK] Returning cached feedback for session_id=%s", session_id)
            return session.feedback_data

        state = session.session_state or {}

        # Feedback lock: prevent concurrent generation
        if state.get("feedback_status") == "generating":
            logger.info("[FEEDBACK_LOCK] Another request is generating for session_id=%s. Waiting...", session_id)
            for _ in range(3):
                await asyncio.sleep(2)
                await self.db.refresh(session)
                if session.feedback_data:
                    logger.info("[FEEDBACK_LOCK] Feedback became available for session_id=%s", session_id)
                    return session.feedback_data
            logger.warning("[FEEDBACK_LOCK] Timed out waiting for lock on session_id=%s. Generating ourselves.", session_id)

        # Acquire lock
        state["feedback_status"] = "generating"
        session.session_state = state
        await self.db.commit()
        logger.info("[FEEDBACK_LOCK] Acquired lock for session_id=%s", session_id)

        # 2. Fetch Topics — demos use session_state; uploads use SlideDeck
        state_topics = state.get("topics", [])
        source_type = state.get("source_type")
        max_topic_idx = state.get("current_topic_index", 0)

        if source_type == "demo" or session.slide_deck_id is None:
            # Demo sessions embed curriculum in session_state.topics directly.
            # Also covers edge-case uploads where the deck row was deleted.
            if not state_topics:
                logger.warning("[FEEDBACK] No topics in session_state for session_id=%s (source=%s)", session_id, source_type)
                # Build a minimal response so the frontend isn't left blank
                return await self._build_and_persist_response(
                    session, state, [], [], session_id
                )
            all_topics = [
                {
                    "topic_title": t.get("topic_title", f"Topic {i}"),
                    "extracted_concepts": [
                        p.get("point_title", f"Point {j}")
                        for j, p in enumerate(t.get("points", []))
                    ],
                }
                for i, t in enumerate(state_topics)
            ]
            visited_topics = all_topics[: max_topic_idx + 1]
            logger.info("[FEEDBACK] Using session_state topics for session_id=%s (%d topics)", session_id, len(all_topics))
        else:
            # Normal upload path — read from SlideDeck
            stmt_deck = (
                select(SlideDeck)
                .where(
                    SlideDeck.id == session.slide_deck_id,
                    SlideDeck.user_id == session.user_id,
                )
                .limit(1)
            )
            deck = (await self.db.execute(stmt_deck)).scalars().first()
            if deck and deck.segmented_json:
                all_topics = deck.segmented_json.get("extracted_segments", [])
            elif state_topics:
                # Deck missing/corrupted — fall back to session_state
                logger.warning("[FEEDBACK] SlideDeck missing for session_id=%s, falling back to session_state topics", session_id)
                all_topics = [
                    {
                        "topic_title": t.get("topic_title", f"Topic {i}"),
                        "extracted_concepts": [
                            p.get("point_title", f"Point {j}")
                            for j, p in enumerate(t.get("points", []))
                        ],
                    }
                    for i, t in enumerate(state_topics)
                ]
            else:
                logger.error("[FEEDBACK] No slide deck and no session_state topics for session_id=%s", session_id)
                return await self._build_and_persist_response(
                    session, state, [], [], session_id
                )
            visited_topics = all_topics[: max_topic_idx + 1]

        # 3. Fetch Conversation History
        stmt_msgs = select(SessionMessage).where(SessionMessage.session_id == session_id).order_by(SessionMessage.created_at.asc())
        messages = (await self.db.execute(stmt_msgs)).scalars().all()
        user_messages = [m for m in messages if m.sender_role == "user"]
        history_text = "\n".join(f"[{msg.sender_role.upper()}]: {msg.message_text}" for msg in messages)
        if not history_text:
            history_text = "(no conversation recorded)"

        # 4. Check for proper interaction — skip LLM if no user messages
        has_interaction = len(user_messages) > 0
        if not has_interaction:
            logger.info("[FEEDBACK] No user messages found for session_id=%s. Skipping LLM, using deterministic fallback.", session_id)
            topic_cards = self._build_deterministic_fallback(state_topics)
            # Jump straight to building the structured response (skip LLM section)
            return await self._build_and_persist_response(
                session, state, state_topics, topic_cards, session_id
            )

        # 5. Prepare LLM inputs
        topics_summary = []
        for i, topic in enumerate(visited_topics):
            topic_title = topic.get("topic_title", f"Topic {i}")
            concepts = topic.get("extracted_concepts", [])
            concept_scores = []
            for j, concept in enumerate(concepts):
                score = 0.0
                if i < len(state_topics):
                    state_points = state_topics[i].get("points", [])
                    if j < len(state_points):
                        score = state_points[j].get("bkt_score", 0.0)
                concept_scores.append(f"  - {concept}: {score:.2f}")
            topics_summary.append(f"Topic {i}: {topic_title}\n" + "\n".join(concept_scores))

        topics_text = "\n\n".join(topics_summary)
        prompt = (
            f"{FEEDBACK_SYSTEM_PROMPT}\n\n"
            f"## Discussed Topics & Concepts (with BKT Scores)\n{topics_text}\n\n"
            f"## Conversation History\n{history_text}"
        )

        # 5. Call LLM with 10s timeout + fallback
        topic_cards: list[dict[str, Any]] = []
        llm_start = time.monotonic()
        try:
            raw_output = await asyncio.wait_for(
                self.llm_manager.call_with_fallback(prompt),
                timeout=10.0,
            )
            elapsed = time.monotonic() - llm_start
            logger.info("[FEEDBACK_LLM] LLM call succeeded in %.2fs for session_id=%s", elapsed, session_id)
            parsed_report = self._parse_json(raw_output)
            topic_cards = parsed_report.get("topic_cards", [])
        except asyncio.TimeoutError:
            logger.error("[FEEDBACK_LLM] LLM timed out after 10s for session_id=%s. Using deterministic fallback.", session_id)
            topic_cards = self._build_deterministic_fallback(state_topics)
        except Exception as exc:
            logger.error("[FEEDBACK_LLM] LLM failed for session_id=%s: %s. Using deterministic fallback.", session_id, exc)
            topic_cards = self._build_deterministic_fallback(state_topics)

        # 6. Build structured response, persist, and return
        return await self._build_and_persist_response(
            session, state, state_topics, topic_cards, session_id
        )

    async def _build_and_persist_response(
        self,
        session: LearningSession,
        state: dict[str, Any],
        state_topics: list[dict[str, Any]],
        topic_cards: list[dict[str, Any]],
        session_id: int,
    ) -> dict[str, Any]:
        """Build the structured feedback response, persist it, and return."""
        skipped_indices = set(state.get("skipped_indices", []))
        completion_type = state.get("completion_type", "natural")
        overall_bkt_raw = session.bkt_score or 0.0
        overall_mastery = min(100, max(0, round(overall_bkt_raw * 100)))

        # Duration safety
        if session.end_time and session.start_time:
            delta = session.end_time - session.start_time
            duration_minutes = max(1, round(delta.total_seconds() / 60))
        else:
            duration_minutes = None

        # Build per-topic enriched data
        enriched_topics: list[dict[str, Any]] = []
        global_strengths: list[str] = []
        global_weak_areas: list[str] = []

        for i, st_topic in enumerate(state_topics):
            topic_title = st_topic.get("topic_title", f"Topic {i + 1}")
            points_data = st_topic.get("points", [])
            is_skipped = i in skipped_indices

            # Compute topic-level BKT
            point_scores = [p.get("bkt_score", 0.0) for p in points_data]
            avg_bkt = sum(point_scores) / len(point_scores) if point_scores else 0.0

            # Derive understanding level
            if is_skipped:
                understanding = "skipped"
                topic_status = "skipped"
            elif avg_bkt >= 0.7:
                understanding = "strong"
                topic_status = "completed"
            elif avg_bkt >= 0.4:
                understanding = "good"
                topic_status = "partial"
            else:
                understanding = "weak"
                topic_status = "partial"

            # Match LLM card by index (if available)
            llm_card = topic_cards[i] if i < len(topic_cards) else {}
            feedback_text = ""
            recommendation = ""
            card_strengths = llm_card.get("strengths", [])
            card_weaknesses = llm_card.get("weaknesses", [])
            card_suggestions = llm_card.get("suggestions", [])

            if card_strengths:
                feedback_text = ". ".join(card_strengths)
                global_strengths.extend(card_strengths[:1])
            if card_weaknesses:
                if feedback_text:
                    feedback_text += " However, " + ". ".join(card_weaknesses).lower()
                else:
                    feedback_text = ". ".join(card_weaknesses)
                global_weak_areas.extend(card_weaknesses[:1])
            if card_suggestions:
                recommendation = ". ".join(card_suggestions)

            if not feedback_text and is_skipped:
                feedback_text = "This topic was skipped during the session."
            elif not feedback_text:
                completed_pts = sum(1 for p in points_data if p.get("status") == "completed")
                feedback_text = f"Covered {completed_pts}/{len(points_data)} points."

            # Collect misconceptions as flat string list for this topic
            topic_misconceptions: list[str] = []
            for p in points_data:
                for m in p.get("misconceptions", []):
                    misc_text = m.get("misconception", "") if isinstance(m, dict) else str(m)
                    if misc_text:
                        topic_misconceptions.append(misc_text)

            # Build per-point breakdown
            enriched_points: list[dict[str, Any]] = []
            for j, pt in enumerate(points_data):
                enriched_points.append({
                    "title": pt.get("point_title", f"Point {j + 1}"),
                    "status": pt.get("status", "pending"),
                    "bkt_score": round(pt.get("bkt_score", 0.0), 2),
                    "is_correct": pt.get("is_correct"),
                    "attempts": pt.get("total_attempts", 0),
                    "widget_used": pt.get("widget_used", False),
                    "was_visited": pt.get("is_visited", False),
                    "kido_memory": (pt.get("kido_memory") or {}).get("summary") if pt.get("kido_memory") else None,
                    "misconceptions": [
                        m.get("misconception", "") if isinstance(m, dict) else str(m)
                        for m in pt.get("misconceptions", [])
                    ],
                })

            enriched_topics.append({
                "id": f"topic-{i}",
                "title": topic_title,
                "status": topic_status,
                "understanding": understanding,
                "bkt_score": round(avg_bkt, 2),
                "feedback": feedback_text,
                "misconceptions": topic_misconceptions,
                "recommendation": recommendation,
                "points": enriched_points,
            })

        # Assemble final response
        final_feedback_data: dict[str, Any] = {
            "session_id": session_id,
            "session_title": session.topic or "Untitled Session",
            "completion_type": completion_type,
            "overall_mastery": overall_mastery,
            "duration_minutes": duration_minutes,
            "topics": enriched_topics,
            "strengths": global_strengths[:5],
            "weak_areas": global_weak_areas[:5],
        }

        # Persist, release lock, and return
        session.feedback_data = final_feedback_data
        state["feedback_status"] = "ready"
        session.session_state = state
        await self.db.commit()
        logger.info("[FEEDBACK_LOCK] Released lock for session_id=%s status=ready", session_id)
        logger.info("[FEEDBACK] Generated feedback for session_id=%s (mastery=%d%%, topics=%d)", session_id, overall_mastery, len(enriched_topics))

        return final_feedback_data

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
    def _build_deterministic_fallback(state_topics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Build minimal feedback cards from raw session data when LLM is unavailable."""
        cards = []
        for i, topic in enumerate(state_topics):
            points = topic.get("points", [])
            completed = sum(1 for p in points if p.get("status") == "completed")
            total = len(points)
            all_misc: list[str] = []
            for p in points:
                for m in p.get("misconceptions", []):
                    text = m.get("misconception", "") if isinstance(m, dict) else str(m)
                    if text:
                        all_misc.append(text)

            cards.append({
                "topic": topic.get("topic_title", f"Topic {i + 1}"),
                "strengths": [f"Covered {completed}/{total} points"] if completed > 0 else ["Session started"],
                "weaknesses": all_misc[:3] if all_misc else ["No issues detected"],
                "suggestions": ["Review any remaining points to strengthen understanding"],
            })
        return cards

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

