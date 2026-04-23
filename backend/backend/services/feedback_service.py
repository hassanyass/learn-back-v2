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
        """Generate, persist, and return the final feedback report for a session."""
        # 1. Fetch Session
        stmt_session = select(LearningSession).where(LearningSession.id == session_id)
        session = (await self.db.execute(stmt_session)).scalar_one_or_none()
        if not session:
            raise ValueError(f"Session {session_id} not found.")

        # If it already has feedback, just return it
        if session.feedback_data:
            return session.feedback_data

        state = session.session_state or {}

        # 2. Fetch Topics from SlideDeck
        if session.slide_deck_id is not None:
            stmt_deck = (
                select(SlideDeck)
                .where(
                    SlideDeck.id == session.slide_deck_id,
                    SlideDeck.user_id == session.user_id,
                )
                .limit(1)
            )
        else:
            # Legacy fallback: sessions created before slide_deck_id existed.
            stmt_deck = (
                select(SlideDeck)
                .where(SlideDeck.user_id == session.user_id)
                .order_by(SlideDeck.created_at.desc())
                .limit(1)
            )

        deck = (await self.db.execute(stmt_deck)).scalars().first()
        if not deck or not deck.segmented_json:
            raise ValueError("No slide deck found to analyze topics.")

        all_topics = deck.segmented_json.get("extracted_segments", [])
        
        # Only analyze topics that were actually reached
        max_topic_idx = state.get("current_topic_index", 0)
        visited_topics = all_topics[:max_topic_idx + 1]

        # 3. Fetch Conversation History
        stmt_msgs = select(SessionMessage).where(SessionMessage.session_id == session_id).order_by(SessionMessage.created_at.asc())
        messages = (await self.db.execute(stmt_msgs)).scalars().all()
        history_text = "\n".join(f"[{msg.sender_role.upper()}]: {msg.message_text}" for msg in messages)
        if not history_text:
            history_text = "(no conversation recorded)"

        # 4. Prepare Inputs for LLM — read from nested topics in state
        state_topics = state.get("topics", [])

        # Format visited topics with their point-level BKT scores
        topics_summary = []
        for i, topic in enumerate(visited_topics):
            topic_title = topic.get("topic_title", f"Topic {i}")
            concepts = topic.get("extracted_concepts", [])
            concept_scores = []
            for j, concept in enumerate(concepts):
                # Read BKT from nested state if available
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

        # 5. Call LLM
        raw_output = await self.llm_manager.call_with_fallback(prompt)

        try:
            parsed_report = self._parse_json(raw_output)
            topic_cards = parsed_report.get("topic_cards", [])
        except Exception as exc:
            logger.error("Failed to parse LLM feedback report: %s", exc)
            topic_cards = []

        # 6. Post-process to match exact frontend schema
        # Inject per-topic BKT scores into the cards (LLM doesn't generate them)
        for i, card in enumerate(topic_cards):
            if i < len(state_topics):
                points = state_topics[i].get("points", [])
                total_score = sum(pt.get("bkt_score", 0.0) for pt in points)
                avg_score = total_score / len(points) if points else 0.0
                card["bkt_score"] = round(avg_score, 2)
            elif i < len(visited_topics):
                card["bkt_score"] = 0.0
            else:
                card["bkt_score"] = 0.0

        # Collect all misconceptions from nested points
        all_misconceptions = []
        for ti, st_topic in enumerate(state_topics):
            for pi, pt in enumerate(st_topic.get("points", [])):
                for m in pt.get("misconceptions", []):
                    all_misconceptions.append({
                        "topic_index": ti,
                        "point_index": pi,
                        **m,
                    })

        overall_bkt_score = session.bkt_score or 0.0

        final_feedback_data = {
            "overall_bkt_score": round(overall_bkt_score, 2),
            "misconceptions": all_misconceptions,
            "topic_cards": topic_cards,
        }

        # 7. Persist and return
        session.feedback_data = final_feedback_data
        await self.db.commit()

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
    def _parse_json(raw: str) -> dict[str, Any]:
        """Strip markdown fences and parse JSON."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        return json.loads(cleaned)
