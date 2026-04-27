"""Phase 3D — Session WebSocket & HTTP Router.

Transport-only layer.  All business logic lives in SessionService.

WebSocket payloads:
  Client → Server:
    {"type": "chat", "text": "..."}
    {"type": "mind_map_submit", "corrections": {...}}
  Server → Client:
    {"type": "kido_response", "data": {...}}
    {"type": "session_complete", "data": {...}}
    {"type": "error", "detail": "..."}
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.db import get_db
from backend.models.core import LearningSession, SlideDeck
from backend.schemas.api_schemas import (
    ChatPayload,
    MindMapPayload,
    SessionCreateRequest,
    WidgetSubmitPayload,
)
from pydantic import ValidationError
from backend.services.auth_service import AuthService
from backend.services.bkt_service import BKTService
from backend.services.session_service import SessionService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["session"])
bearer_scheme = HTTPBearer(auto_error=True)


# ──────────────────────────────────────────────────────────────────────
# Auth dependency (mirrors ingestion_router / dashboard_router pattern)
# ──────────────────────────────────────────────────────────────────────

async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> int:
    auth_service = AuthService(db)
    return auth_service.decode_token(credentials.credentials)


# ──────────────────────────────────────────────────────────────────────
# Active WebSocket connections (session_id → WebSocket)
# ──────────────────────────────────────────────────────────────────────

_active_connections: dict[int, WebSocket] = {}


# ──────────────────────────────────────────────────────────────────────
# HTTP: Create session endpoint
# ──────────────────────────────────────────────────────────────────────

@router.post("/session/create")
async def create_session(
    payload: SessionCreateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new learning session for the requested slide deck.

    Initialises session_state as a complete map of the lesson, built from
    the SlideDeck's segmented_json.  Every topic and every point within it
    gets its own BKT score, misconceptions list, and kido_memory slot.
    """
    # ── Guard: only one active session per user ──────────────────────
    existing_active = (await db.execute(
        select(LearningSession).where(
            LearningSession.user_id == user_id,
            LearningSession.status == "in_progress",
        ).limit(1)
    )).scalar_one_or_none()
    if existing_active:
        raise HTTPException(
            status_code=409,
            detail="You already have an active session. Please end or complete it first.",
        )

    # Bind the session to the explicit document_id from the frontend so we
    # never silently switch to a different SlideDeck by created_at ordering.
    stmt = (
        select(SlideDeck)
        .where(
            SlideDeck.id == payload.document_id,
            SlideDeck.user_id == user_id,
        )
        .limit(1)
    )
    deck = (await db.execute(stmt)).scalar_one_or_none()
    if not deck:
        raise HTTPException(
            status_code=404,
            detail="Slide deck not found for the provided document_id.",
        )

    # Extract segments from the AI-generated curriculum
    segments = deck.segmented_json.get("extracted_segments", [])
    if not segments:
        raise HTTPException(
            status_code=422,
            detail="This slide deck has no segmented content. Please re-upload.",
        )
    topic = segments[0].get("topic_title", "Untitled Topic")

    # ── Build the nested session_state from segments ──────────────────
    bkt = BKTService()
    topics: list[dict[str, Any]] = []
    for t_idx, seg in enumerate(segments):
        points: list[dict[str, Any]] = []
        for p_idx, concept in enumerate(seg.get("extracted_concepts", [])):
            points.append({
                "id": f"topic_{t_idx}_point_{p_idx}",
                "point_title": concept,
                "bkt_score": bkt.initial_probability(),
                "status": "pending",     # pending → in_progress → completed
                "is_visited": False,
                "is_correct": None,
                "total_attempts": 0,     # Accumulated across all exchanges for this point
                "widget_used": False,    # True if a non-TEXT widget was rendered
                "misconceptions": [],
                "kido_memory": None,     # {"title": "...", "summary": "..."} on completion
            })
        topics.append({
            "topic_title": seg.get("topic_title", "Untitled"),
            "points": points,
        })

    # Set the very first point to in_progress and visited
    if topics and topics[0]["points"]:
        topics[0]["points"][0]["status"] = "in_progress"
        topics[0]["points"][0]["is_visited"] = True

    session_state: dict[str, Any] = {
        "current_topic_index": 0,
        "current_point_index": 0,
        "point_attempts": 0,
        "current_difficulty": 1,
        "topics": topics,
        "skipped_indices": [],
        "correction_events": [],
    }

    # Create the learning session with the full state machine
    session = LearningSession(
        user_id=user_id,
        slide_deck_id=deck.id,
        topic=topic,
        status="in_progress",
        start_time=datetime.utcnow(),
        created_at=datetime.utcnow(),
        session_state=session_state,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    current_topic = topics[0] if topics else {}
    current_point = current_topic.get("points", [{}])[0] if current_topic else {}

    return {
        "session_id": session.id,
        "session_status": "active",
        "current_topic": current_topic,
        "current_point": current_point,
        "kido_message": "Let's begin!"
    }


# ──────────────────────────────────────────────────────────────────────
# HTTP: Get session state (REST bootstrap for session.js)
# ──────────────────────────────────────────────────────────────────────

@router.get("/session/{session_id}")
async def get_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return the current session state for frontend hydration.

    Called by session.js on page load to populate the UI before the
    WebSocket connection is opened.
    """
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    state = session.session_state or {}

    # Extract topic titles for the roadmap sidebar
    topic_titles: list[str] = []
    for t in state.get("topics", []):
        topic_titles.append(t.get("topic_title", "Untitled"))

    return {
        "session_id": session.id,
        "title": session.topic,
        "session_title": session.topic,
        "status": session.status,
        "current_topic_index": state.get("current_topic_index", 0),
        "topics": topic_titles,
        "slide_deck_id": session.slide_deck_id,
        "pdf_url": session.slide_deck.pdf_storage_url if session.slide_deck else None,
        "file_type": session.slide_deck.file_type if session.slide_deck else None,
        "has_preview": session.slide_deck.has_preview if session.slide_deck else False,
        "deck_status": session.slide_deck.status if session.slide_deck else None,
        "started_at": session.start_time.isoformat() if session.start_time else None,
        "completed_at": session.end_time.isoformat() if session.end_time else None,
        "session_state": state,
    }

# ──────────────────────────────────────────────────────────────────────
# WebSocket endpoint (Phase 3D: JSON-typed payloads)
# ──────────────────────────────────────────────────────────────────────

@router.websocket("/ws/session/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: int) -> None:
    """Persistent WebSocket for a teaching session.

    Client sends JSON payloads:
        {"type": "chat", "text": "..."}
        {"type": "mind_map_submit", "corrections": {...}}
    Server responds with JSON payloads:
        {"type": "kido_response", "data": {...}}
        {"type": "session_complete", "data": {...}}
        {"type": "error", "detail": "..."}
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    # Obtain a fresh DB session for the lifetime of this WS connection
    async for db in get_db():
        # Authenticate and enforce ownership before accepting the WebSocket.
        try:
            auth_service = AuthService(db)
            user_id = auth_service.decode_token(token)
        except HTTPException:
            await websocket.close(code=1008)
            return

        session = await db.get(LearningSession, session_id)
        if not session or session.user_id != user_id:
            await websocket.close(code=1008)
            return

        # Reject duplicate connections to the same session
        if session_id in _active_connections:
            await websocket.close(code=1008)
            logger.warning("Duplicate WS connection rejected for session %s", session_id)
            return

        await websocket.accept()
        _active_connections[session_id] = websocket
        logger.info("WebSocket connected for session %s (user %s)", session_id, user_id)

        service = SessionService(db)

        try:
            while True:
                raw = await websocket.receive_text()
                raw_stripped = raw.strip()
                if not raw_stripped:
                    continue

                # ── Parse incoming payload ────────────────────────────
                try:
                    payload = json.loads(raw_stripped)
                except json.JSONDecodeError:
                    # Legacy fallback: treat as plain-text chat message
                    payload = {"type": "chat", "text": raw_stripped}

                msg_type = payload.get("type", "chat")

                try:
                    if msg_type == "chat":
                        try:
                            validated = ChatPayload(**payload)
                        except ValidationError as ve:
                            await websocket.send_json({
                                "type": "error",
                                "detail": f"Invalid message: {ve.errors()[0]['msg']}",
                            })
                            continue
                        user_text = validated.text.strip()
                        if not user_text:
                            continue

                        result = await service.process_user_message(
                            session_id=session_id,
                            user_text=user_text,
                        )

                        # Check if session completed
                        if result.get("session_complete"):
                            await websocket.send_json({
                                "type": "session_complete",
                                "data": {
                                    "kido_response": result["kido_response"],
                                    "session_state": result["session_state"],
                                },
                            })
                            # Close WebSocket with standard code
                            await websocket.close(code=1000)
                            return

                        # Normal response (may include topic checkpoint)
                        response_data: dict[str, Any] = {
                            "kido_response": result["kido_response"],
                            "evaluator_label": result.get("evaluator_label", ""),
                            "widget_type": result["widget_type"],
                            "widget_data": result.get("widget_data"),
                            "advanced": result["advanced"],
                            "session_state": result["session_state"],
                        }

                        # TEST MODE: include widget debug info if present
                        if result.get("widget_debug"):
                            response_data["widget_debug"] = result["widget_debug"]

                        # Include checkpoint data if present
                        if result.get("topic_checkpoint"):
                            response_data["topic_checkpoint"] = True
                            response_data["mind_map_data"] = result.get("mind_map_data", {})

                        # STEP 2 — EMIT KWL DURING NORMAL FLOW
                        if result.get("advanced"):
                            state_obj = result["session_state"]
                            ti = state_obj.get("current_topic_index", 0)
                            pi = state_obj.get("current_point_index", 0)
                            try:
                                # The point that was just completed is at pi - 1
                                point_node = state_obj["topics"][ti]["points"][pi - 1]
                                if "kido_memory" in point_node:
                                    response_data["kwl_update"] = {
                                        "title": point_node["kido_memory"]["title"],
                                        "summary": point_node["kido_memory"]["summary"]
                                    }
                            except (IndexError, KeyError):
                                pass

                        await websocket.send_json({
                            "type": "kido_response",
                            "data": response_data,
                        })

                    elif msg_type == "mind_map_submit":
                        try:
                            validated_mm = MindMapPayload(**payload)
                        except ValidationError as ve:
                            await websocket.send_json({
                                "type": "error",
                                "detail": f"Invalid mind map submission: {ve.errors()[0]['msg']}",
                            })
                            continue
                        corrections = validated_mm.corrections

                        result = await service.process_mind_map(
                            session_id=session_id,
                            corrections=corrections,
                            target_topic_index=validated_mm.target_topic_index,
                        )

                        if result.get("session_complete"):
                            await websocket.send_json({
                                "type": "session_complete",
                                "data": {
                                    "kido_response": result["kido_response"],
                                    "session_state": result["session_state"],
                                },
                            })
                            await websocket.close(code=1000)
                            return

                        await websocket.send_json({
                            "type": "kido_response",
                            "data": {
                                "kido_response": result["kido_response"],
                                "widget_type": result["widget_type"],
                                "advanced": True,
                                "session_state": result["session_state"],
                            },
                        })

                    elif msg_type == "widget_submit":
                        try:
                            validated_ws = WidgetSubmitPayload(**payload)
                        except ValidationError as ve:
                            await websocket.send_json({
                                "type": "error",
                                "detail": f"Invalid widget submission: {ve.errors()[0]['msg']}",
                            })
                            continue
                        submitted_data = validated_ws.submitted_data

                        result = await service.process_widget_submit(
                            session_id=session_id,
                            submitted_data=submitted_data,
                        )

                        response_data = {
                            "kido_response": result["kido_response"],
                            "widget_type": result["widget_type"],
                            "advanced": result.get("advanced", False),
                            "session_state": result["session_state"],
                            "evaluation_label": result.get("evaluation_label", ""),
                        }

                        await websocket.send_json({
                            "type": "kido_response",
                            "data": response_data,
                        })

                    else:
                        await websocket.send_json({
                            "type": "error",
                            "detail": f"Unknown message type: {msg_type}",
                        })

                except ValueError as exc:
                    logger.warning("Session error: %s", exc)
                    await db.rollback()
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Invalid request or session state.",
                    })
                except RuntimeError as exc:
                    logger.error("LLM exhaustion: %s", exc)
                    await db.rollback()
                    await websocket.send_json({
                        "type": "error",
                        "detail": "All AI providers are currently unavailable. Please try again shortly.",
                    })
                except Exception as exc:
                    logger.error("Unexpected error in WS loop: %s", exc)
                    await db.rollback()
                    await websocket.send_json({
                        "type": "error",
                        "detail": "An unexpected server error occurred.",
                    })

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for session %s", session_id)
        finally:
            _active_connections.pop(session_id, None)

            # ── Orphan session cleanup ──────────────────────────────────
            # If the session is still in_progress after WS disconnect (user
            # closed tab, lost connection, etc.), auto-complete it to prevent
            # permanent orphans blocking the 1-active-session-per-user guard.
            try:
                await db.refresh(session)
                if session.status == "in_progress":
                    from copy import deepcopy
                    state = session.session_state or {}
                    state["completion_type"] = "abandoned"
                    session.session_state = deepcopy(state)
                    session.status = "completed"
                    session.end_time = datetime.utcnow()
                    await db.commit()
                    logger.info(
                        "Orphan session %s auto-completed (WS disconnect cleanup)",
                        session_id,
                    )
            except Exception as cleanup_exc:
                logger.error(
                    "Failed to auto-complete orphan session %s: %s",
                    session_id, cleanup_exc,
                )

        break  # exit the async-for after one DB session


# ──────────────────────────────────────────────────────────────────────
# HTTP hint endpoint (JWT-protected)
# ──────────────────────────────────────────────────────────────────────

@router.post("/session/{session_id}/hint")
async def request_hint(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generate a hint for the current point.

    Also broadcasts the hint to the active WebSocket if one exists.
    Requires JWT authentication.
    """
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    service = SessionService(db)
    try:
        hint_result = await service.generate_hint(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

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


# ──────────────────────────────────────────────────────────────────────
# HTTP: Skip Topic (JWT-protected)
# ──────────────────────────────────────────────────────────────────────

@router.post("/session/{session_id}/skip-topic")
async def skip_topic(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Skip the current topic — transport only, logic in SessionService."""
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    service = SessionService(db)
    return await service.skip_topic(session_id)


# ──────────────────────────────────────────────────────────────────────
# HTTP: End Session (JWT-protected, idempotent)
# ──────────────────────────────────────────────────────────────────────

@router.post("/session/{session_id}/end")
async def end_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Manually end a teaching session — transport only, logic in SessionService.

    Idempotent: calling on an already-completed session returns 200 with cached data.
    Triggers eager feedback generation so the feedback page loads instantly.
    """
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    service = SessionService(db)
    try:
        return await service.end_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ──────────────────────────────────────────────────────────────────────
# HTTP: Get Mind Map snapshot (JWT-protected, read-only)
# ──────────────────────────────────────────────────────────────────────

@router.get("/session/{session_id}/mind-map")
async def get_mind_map(
    session_id: int,
    topic_index: int | None = None,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Fetch the mind map snapshot — transport only, logic in SessionService."""
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    service = SessionService(db)
    return await service.get_mind_map(session_id, topic_index=topic_index)


# ──────────────────────────────────────────────────────────────────────
# HTTP: Get Widget State (JWT-protected, read-only)
# ──────────────────────────────────────────────────────────────────────

@router.get("/session/{session_id}/widget-state")
async def get_widget_state(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return widget lock state — transport only, logic in SessionService."""
    session = await db.get(LearningSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    service = SessionService(db)
    return await service.get_widget_state(session_id)
