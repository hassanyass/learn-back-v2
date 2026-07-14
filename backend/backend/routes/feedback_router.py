"""Phase 4 — Feedback Router.

Exposes the end-of-session feedback report to the frontend.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.models.core import LearningSession
from backend.services.auth_service import AuthService
from backend.services.feedback_service import FeedbackService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])
bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> int:
    auth_service = AuthService(db)
    return auth_service.decode_token(credentials.credentials)


@router.get("/session/{session_id}/feedback")
async def get_session_feedback(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get the final feedback report for a learning session.
    
    If the report hasn't been generated yet, this will trigger the FeedbackService
    to analyze the chat history and generate it. Subsequent calls return the cached report.
    """
    service = FeedbackService(db)
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    try:
        feedback_data = await service.generate_session_feedback(session_id)
        return feedback_data
    except ValueError as exc:
        logger.error("[FEEDBACK_ROUTER] Feedback generation failed for session_id=%s: %s", session_id, exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[FEEDBACK_ROUTER] Unexpected error generating feedback for session_id=%s: %s", session_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Unable to generate feedback report. Please try again.",
        ) from exc
