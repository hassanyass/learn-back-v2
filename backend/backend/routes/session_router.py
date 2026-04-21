"""Phase 3 — Session WebSocket & HTTP Router.

Transport-only layer.  All business logic lives in SessionService.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.services.session_service import SessionService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["session"])


# ──────────────────────────────────────────────────────────────────────
# Active WebSocket connections (session_id → WebSocket)
# ──────────────────────────────────────────────────────────────────────

_active_connections: dict[int, WebSocket] = {}


# ──────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────

@router.websocket("/ws/session/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: int) -> None:
    """Persistent WebSocket for a teaching session.

    Client sends plain-text user messages.
    Server responds with JSON payloads:
        { "type": "kido_response", "data": { ... } }
        { "type": "error", "detail": "..." }
    """
    await websocket.accept()
    _active_connections[session_id] = websocket
    logger.info("WebSocket connected for session %s", session_id)

    # Obtain a fresh DB session for the lifetime of this WS connection
    async for db in get_db():
        service = SessionService(db)

        try:
            while True:
                raw = await websocket.receive_text()
                user_text = raw.strip()
                if not user_text:
                    continue

                try:
                    result = await service.process_user_message(
                        session_id=session_id,
                        user_text=user_text,
                    )
                    await websocket.send_json({
                        "type": "kido_response",
                        "data": {
                            "kido_response": result["kido_response"],
                            "widget_type": result["widget_type"],
                            "advanced": result["advanced"],
                            "session_state": result["session_state"],
                        },
                    })
                except ValueError as exc:
                    logger.warning("Session error: %s", exc)
                    await websocket.send_json({
                        "type": "error",
                        "detail": str(exc),
                    })
                except RuntimeError as exc:
                    logger.error("LLM exhaustion: %s", exc)
                    await websocket.send_json({
                        "type": "error",
                        "detail": "All AI providers are currently unavailable. Please try again shortly.",
                    })

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for session %s", session_id)
        finally:
            _active_connections.pop(session_id, None)
        break  # exit the async-for after one DB session


# ──────────────────────────────────────────────────────────────────────
# HTTP hint endpoint
# ──────────────────────────────────────────────────────────────────────

@router.post("/session/{session_id}/hint")
async def request_hint(
    session_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a hint for the current point.

    Also broadcasts the hint to the active WebSocket if one exists.
    """
    service = SessionService(db)
    hint_result = await service.generate_hint(session_id)

    # Broadcast to connected WebSocket
    ws = _active_connections.get(session_id)
    if ws is not None:
        try:
            await ws.send_json({
                "type": "system_hint",
                "data": {
                    "hint_text": hint_result["hint_text"],
                    "widget_type": hint_result["widget_type"],
                },
            })
        except Exception:
            logger.warning("Failed to broadcast hint to WebSocket for session %s", session_id)

    return hint_result
