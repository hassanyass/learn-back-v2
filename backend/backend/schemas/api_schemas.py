"""Pydantic schemas for API request/response validation."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────
# Auth / Dashboard Schemas
# ──────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CategorizedSessions(BaseModel):
    mastered: int = 0
    needs_review: int = 0
    in_progress: int = 0


class DashboardResponse(BaseModel):
    total_time_hours: float = Field(default=0.0, ge=0.0)
    current_streak_days: int = Field(default=0, ge=0)
    average_mastery_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    unlocked_milestones: list[str] = Field(default_factory=list)
    categorized_sessions: CategorizedSessions = Field(default_factory=CategorizedSessions)


# ──────────────────────────────────────────────────────────────────────
# WebSocket Payload Schemas (Phase 3D)
# ──────────────────────────────────────────────────────────────────────

class ChatPayload(BaseModel):
    """Client → Server: normal chat message."""
    type: str = Field("chat", pattern="^chat$")
    text: str = Field(..., min_length=1, max_length=5000)


class MindMapPayload(BaseModel):
    """Client → Server: mind map correction submission at topic checkpoint."""
    type: str = Field("mind_map_submit", pattern="^mind_map_submit$")
    corrections: dict[str, str] = Field(
        default_factory=dict,
        description="Map of point_title → corrected_summary. Empty dict = no corrections.",
    )
