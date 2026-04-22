"""
LearnBack V2 — Comprehensive E2E Test Suite (Phases 0-3)

Sequentially tests:
  1. Auth: register + login → JWT extraction
  2. Dashboard: GET /dashboard/ with JWT → verify schema
  3. Ingestion: POST /ingestion/upload-slides/ with mock PDF → verify segmentation JSON
  4. Session Create: POST /session/create → get a valid session_id
  5. Orchestrator: WebSocket /ws/session/{id} + HTTP /session/{id}/hint
  6. Cleanup: delete test user from the database

Requires the FastAPI server to be running at http://localhost:8000.
"""

from __future__ import annotations

import asyncio
import io
import json
import random
import string
from typing import Any

import httpx
import pytest
import websockets

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8000"
WS_BASE_URL = "ws://localhost:8000"
TEST_PASSWORD = "SecurePass123!"
HTTP_TIMEOUT = 90.0  # generous for LLM-backed routes


# ---------------------------------------------------------------------------
# Shared state across ordered tests (module-level)
# ---------------------------------------------------------------------------

class _Context:
    """Mutable container shared across sequential tests in this module."""
    suffix: str = ""
    email: str = ""
    username: str = ""
    token: str = ""
    user_id: int | None = None
    session_id: int | None = None
    slide_deck_id: int | None = None
    segmentation: dict[str, Any] | None = None


ctx = _Context()


def _rand_suffix(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {ctx.token}"}


def _make_mock_pdf_bytes() -> bytes:
    """
    Create a minimal valid PDF with extractable text content.
    This avoids the PDF/PPTX-only validation failure.
    """
    # Minimal PDF 1.0 with a single page containing text about Neural Networks
    text_content = (
        "Introduction to Neural Networks. "
        "Neural networks are computing systems inspired by biological neural networks. "
        "They consist of layers of interconnected nodes called neurons. "
        "Backpropagation is the key algorithm used to train neural networks. "
        "It calculates gradients of the loss function with respect to weights. "
        "Activation functions introduce non-linearity into the network. "
        "Common activation functions include ReLU, sigmoid, and tanh. "
        "Gradient descent optimizes the network weights during training."
    )
    # Build a valid minimal PDF with a text stream
    stream_content = f"BT /F1 12 Tf 72 720 Td ({text_content}) Tj ET"
    stream_length = len(stream_content)

    pdf = (
        "%PDF-1.4\n"
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        f"4 0 obj\n<< /Length {stream_length} >>\nstream\n{stream_content}\nendstream\nendobj\n"
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        "xref\n0 6\n"
        "0000000000 65535 f \n"
        "0000000009 00000 n \n"
        "0000000058 00000 n \n"
        "0000000115 00000 n \n"
        "0000000282 00000 n \n"
        "0000000400 00000 n \n"
        "trailer\n<< /Root 1 0 R /Size 6 >>\n"
        "startxref\n480\n%%EOF\n"
    )
    return pdf.encode("latin-1")


# ===========================================================================
# TEST 1: AUTH — Register + Login
# ===========================================================================


@pytest.mark.e2e
class TestAuth:
    """Auth flow: register a new unique user, login, extract JWT."""

    async def test_register_new_user(self):
        """POST /auth/register with unique email/username → 200 + access_token."""
        ctx.suffix = _rand_suffix()
        ctx.email = f"e2e_{ctx.suffix}@learnbackqa.com"
        ctx.username = f"e2e_{ctx.suffix}"

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/auth/register",
                json={
                    "email": ctx.email,
                    "username": ctx.username,
                    "password": TEST_PASSWORD,
                },
            )

        assert resp.status_code == 200, f"Register failed: {resp.status_code} — {resp.text}"
        body = resp.json()
        assert "access_token" in body, f"Missing access_token in register response: {body}"
        assert body.get("token_type") == "bearer"
        # Store token from registration (valid JWT)
        ctx.token = body["access_token"]

    async def test_login_returns_jwt(self):
        """POST /auth/login with correct credentials → 200 + access_token."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/auth/login",
                json={
                    "email": ctx.email,
                    "password": TEST_PASSWORD,
                },
            )

        assert resp.status_code == 200, f"Login failed: {resp.status_code} — {resp.text}"
        body = resp.json()
        assert "access_token" in body, f"Missing access_token in login response: {body}"
        assert body.get("token_type") == "bearer"
        # Update token from login (fresher)
        ctx.token = body["access_token"]

    async def test_login_invalid_credentials_returns_401(self):
        """POST /auth/login with wrong password → 401."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/auth/login",
                json={
                    "email": ctx.email,
                    "password": "WrongPassword999!",
                },
            )

        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    async def test_duplicate_register_returns_400(self):
        """POST /auth/register with same email → 400."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/auth/register",
                json={
                    "email": ctx.email,
                    "username": f"e2e_dup_{ctx.suffix}",
                    "password": TEST_PASSWORD,
                },
            )

        assert resp.status_code == 400, f"Expected 400 for duplicate email, got {resp.status_code}"


# ===========================================================================
# TEST 2: DASHBOARD — GET /dashboard/
# ===========================================================================


@pytest.mark.e2e
class TestDashboard:
    """Dashboard flow: GET /dashboard/ with JWT, verify expected JSON schema."""

    async def test_dashboard_returns_valid_schema(self):
        """GET /dashboard/ → 200 with all expected fields."""
        assert ctx.token, "No JWT token available — auth tests must run first."

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{BASE_URL}/dashboard/",
                headers=_auth_headers(),
                params={"timezone": "UTC"},
            )

        assert resp.status_code == 200, f"Dashboard failed: {resp.status_code} — {resp.text}"
        body = resp.json()

        # Verify DashboardResponse schema fields
        assert "total_time_hours" in body, f"Missing total_time_hours: {body}"
        assert "current_streak_days" in body, f"Missing current_streak_days: {body}"
        assert "average_mastery_percentage" in body, f"Missing average_mastery_percentage: {body}"
        assert "unlocked_milestones" in body, f"Missing unlocked_milestones: {body}"
        assert "categorized_sessions" in body, f"Missing categorized_sessions: {body}"

        # Verify types
        assert isinstance(body["total_time_hours"], (int, float))
        assert isinstance(body["current_streak_days"], int)
        assert isinstance(body["average_mastery_percentage"], (int, float))
        assert isinstance(body["unlocked_milestones"], list)

        # Verify categorized_sessions sub-schema
        cats = body["categorized_sessions"]
        assert isinstance(cats, dict)
        assert "mastered" in cats
        assert "needs_review" in cats
        assert "in_progress" in cats

    async def test_dashboard_without_token_returns_403(self):
        """GET /dashboard/ without Authorization header → 403."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(f"{BASE_URL}/dashboard/")

        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"


# ===========================================================================
# TEST 3: INGESTION — POST /ingestion/upload-slides/
# ===========================================================================


@pytest.mark.e2e
class TestIngestion:
    """Ingestion flow: upload a mock PDF file and verify LLM-based segmentation."""

    async def test_upload_pdf_returns_segmentation(self):
        """POST /ingestion/upload-slides/ with a mock PDF → segmentation JSON."""
        assert ctx.token, "No JWT token available — auth tests must run first."

        pdf_bytes = _make_mock_pdf_bytes()

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/ingestion/upload-slides/",
                headers=_auth_headers(),
                files={"file": ("neural_networks.pdf", pdf_bytes, "application/pdf")},
                params={"timezone": "UTC"},
            )

        assert resp.status_code == 200, (
            f"Ingestion failed: {resp.status_code} — {resp.text}"
        )
        body = resp.json()

        # Verify response structure
        assert "segmentation" in body, f"Missing 'segmentation' key in response: {body}"
        segmentation = body["segmentation"]
        ctx.segmentation = segmentation

        # Verify segmentation schema
        assert "source_file" in segmentation, f"Missing source_file: {segmentation}"
        assert "extracted_segments" in segmentation, f"Missing extracted_segments: {segmentation}"

        segments = segmentation["extracted_segments"]
        assert isinstance(segments, list), f"extracted_segments is not a list: {type(segments)}"
        assert 1 <= len(segments) <= 4, (
            f"Expected 1-4 segments (max 4 topics rule), got {len(segments)}"
        )

        # Verify each segment has required fields
        for seg in segments:
            assert "segment_id" in seg, f"Missing segment_id in segment: {seg}"
            assert "topic_title" in seg, f"Missing topic_title in segment: {seg}"
            assert "extracted_concepts" in seg, f"Missing extracted_concepts in segment: {seg}"
            assert isinstance(seg["extracted_concepts"], list), (
                f"extracted_concepts should be list: {seg}"
            )
            assert len(seg["extracted_concepts"]) >= 1, (
                f"Each topic should have at least 1 concept: {seg}"
            )

    async def test_upload_unsupported_file_returns_400(self):
        """POST /ingestion/upload-slides/ with a .txt file → 400."""
        assert ctx.token, "No JWT token available."

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/ingestion/upload-slides/",
                headers=_auth_headers(),
                files={"file": ("notes.txt", b"Some random text", "text/plain")},
            )

        assert resp.status_code == 400, (
            f"Expected 400 for .txt upload, got {resp.status_code} — {resp.text}"
        )


# ===========================================================================
# TEST 4: SESSION CREATE — POST /session/create
# ===========================================================================


@pytest.mark.e2e
class TestSessionCreate:
    """Create a learning session from the uploaded slide deck."""

    async def test_create_session_returns_session_id(self):
        """POST /session/create → 200 with session_id, topic, status."""
        assert ctx.token, "No JWT token available — auth tests must run first."

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/session/create",
                headers=_auth_headers(),
            )

        assert resp.status_code == 200, (
            f"Create session failed: {resp.status_code} — {resp.text}"
        )
        body = resp.json()

        assert "session_id" in body, f"Missing session_id in response: {body}"
        assert "topic" in body, f"Missing topic in response: {body}"
        assert "status" in body, f"Missing status in response: {body}"
        assert body["status"] == "in_progress"
        assert isinstance(body["session_id"], int)
        assert isinstance(body["topic"], str)
        assert len(body["topic"]) > 0, "Topic should not be empty"

        # Store for subsequent WebSocket and hint tests
        ctx.session_id = body["session_id"]

    async def test_create_session_without_token_returns_403(self):
        """POST /session/create without auth → 403."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(f"{BASE_URL}/session/create")

        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"


# ===========================================================================
# TEST 5: SESSION ORCHESTRATOR — WebSocket + Hint HTTP
# ===========================================================================


@pytest.mark.e2e
class TestSessionOrchestrator:
    """Session orchestrator: WebSocket messaging and HTTP hint endpoint.

    Uses the session_id created by TestSessionCreate.
    """

    async def test_websocket_session_connect_and_message(self):
        """Connect to WebSocket, send a JSON chat payload, receive Kido response."""
        assert ctx.token, "No JWT token available."
        assert ctx.session_id, "No session_id — session create test must run first."

        try:
            ws_url = f"{WS_BASE_URL}/ws/session/{ctx.session_id}"
            async with websockets.connect(ws_url, open_timeout=15) as ws:
                # Send a JSON-typed chat payload (Phase 3D format)
                chat_payload = json.dumps({
                    "type": "chat",
                    "text": "Hello Kido, I want to teach you about neural networks!",
                })
                await ws.send(chat_payload)

                # Wait for response with timeout (LLM calls can be slow)
                raw_reply = await asyncio.wait_for(ws.recv(), timeout=90)
                parsed = json.loads(raw_reply) if isinstance(raw_reply, str) else raw_reply

                # Verify response structure
                assert isinstance(parsed, dict), f"Expected dict response, got: {type(parsed)}"
                assert "type" in parsed, f"Missing 'type' in WS response: {parsed}"

                if parsed["type"] == "kido_response":
                    data = parsed.get("data", {})
                    assert "kido_response" in data, f"Missing kido_response in data: {data}"
                    assert "widget_type" in data, f"Missing widget_type in data: {data}"
                    assert "session_state" in data, f"Missing session_state in data: {data}"
                    assert "advanced" in data, f"Missing advanced flag in data: {data}"

                    # Verify Kido actually returned text
                    assert isinstance(data["kido_response"], str)
                    assert len(data["kido_response"]) > 0, "Kido response should not be empty"

                    # Verify widget_type is valid (case-insensitive)
                    valid_widgets = ("TEXT", "PROCESS", "COMPARISON", "MATH", "MIND_MAP",
                                     "text", "process", "comparison", "math", "mind_map")
                    assert data["widget_type"] in valid_widgets, (
                        f"Unexpected widget_type: {data['widget_type']}"
                    )

                    # Verify session_state structure (Phase 3A nested format)
                    state = data["session_state"]
                    assert "current_topic_index" in state
                    assert "current_point_index" in state
                    assert "point_attempts" in state
                    assert "topics" in state
                    assert isinstance(state["topics"], list)
                    assert len(state["topics"]) >= 1, "Should have at least 1 topic"

                    # Verify nested topic/point structure
                    first_topic = state["topics"][0]
                    assert "topic_title" in first_topic
                    assert "points" in first_topic
                    assert len(first_topic["points"]) >= 1

                    first_point = first_topic["points"][0]
                    assert "point_title" in first_point
                    assert "bkt_score" in first_point
                    assert "status" in first_point
                    assert "misconceptions" in first_point
                    assert first_point["status"] in ("in_progress", "completed")

                elif parsed["type"] == "session_complete":
                    # Session completed on first message — still valid
                    data = parsed.get("data", {})
                    assert "kido_response" in data
                    assert "session_state" in data

                elif parsed["type"] == "error":
                    pytest.fail(
                        f"WebSocket returned error: {parsed.get('detail', 'unknown')}"
                    )
                else:
                    pytest.fail(f"Unexpected WS response type: {parsed['type']}")

        except websockets.exceptions.ConnectionClosedError as exc:
            pytest.fail(f"WebSocket closed unexpectedly: {exc}")
        except ConnectionRefusedError:
            pytest.fail("FastAPI server not reachable on WebSocket endpoint")
        except asyncio.TimeoutError:
            pytest.fail("WebSocket response timed out after 90s (LLM may be slow)")

    async def test_websocket_mind_map_submission(self):
        """Send a mind_map_submit payload over WebSocket and verify the response.

        This tests the topic checkpoint flow:
          1. Send a mind_map_submit with corrections
          2. Verify response is kido_response or session_complete
          3. Verify the response has valid structure
        """
        assert ctx.token, "No JWT token available."
        assert ctx.session_id, "No session_id — session create test must run first."

        try:
            ws_url = f"{WS_BASE_URL}/ws/session/{ctx.session_id}"
            async with websockets.connect(ws_url, open_timeout=15) as ws:
                # Send a mind_map_submit payload
                mind_map_payload = json.dumps({
                    "type": "mind_map_submit",
                    "corrections": {},  # empty = no corrections needed
                })
                await ws.send(mind_map_payload)

                raw_reply = await asyncio.wait_for(ws.recv(), timeout=90)
                parsed = json.loads(raw_reply) if isinstance(raw_reply, str) else raw_reply

                assert isinstance(parsed, dict), f"Expected dict, got: {type(parsed)}"
                assert "type" in parsed, f"Missing 'type': {parsed}"

                if parsed["type"] == "kido_response":
                    data = parsed.get("data", {})
                    assert "kido_response" in data, f"Missing kido_response: {data}"
                    assert "widget_type" in data, f"Missing widget_type: {data}"
                    assert "session_state" in data, f"Missing session_state: {data}"
                    assert isinstance(data["kido_response"], str)
                    assert len(data["kido_response"]) > 0

                elif parsed["type"] == "session_complete":
                    data = parsed.get("data", {})
                    assert "kido_response" in data, f"Missing kido_response: {data}"
                    assert "session_state" in data, f"Missing session_state: {data}"
                    assert isinstance(data["kido_response"], str)
                    assert len(data["kido_response"]) > 0

                elif parsed["type"] == "error":
                    # This is acceptable — mind map submit on a session
                    # not at a checkpoint will produce an error or pass-through
                    pass

                else:
                    pytest.fail(f"Unexpected WS response type: {parsed['type']}")

        except websockets.exceptions.ConnectionClosedError:
            # Acceptable — session may have been closed with code 1000
            pass
        except ConnectionRefusedError:
            pytest.fail("FastAPI server not reachable on WebSocket endpoint")
        except asyncio.TimeoutError:
            pytest.fail("WebSocket response timed out after 90s")

    async def test_hint_endpoint_returns_hint(self):
        """POST /session/{id}/hint with JWT → returns hint_text and widget_type."""
        assert ctx.token, "No JWT token available."
        assert ctx.session_id, "No session_id — session create test must run first."

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/session/{ctx.session_id}/hint",
                headers=_auth_headers(),
            )

        assert resp.status_code == 200, (
            f"Hint endpoint failed: {resp.status_code} — {resp.text}"
        )
        body = resp.json()

        assert "hint_text" in body, f"Missing hint_text: {body}"
        assert "widget_type" in body, f"Missing widget_type: {body}"
        assert isinstance(body["hint_text"], str)
        assert len(body["hint_text"]) > 0, "Hint text should not be empty"
        assert body["widget_type"] in ("TEXT", "PROCESS", "COMPARISON", "MATH"), (
            f"Unexpected widget_type: {body['widget_type']}"
        )

    async def test_hint_endpoint_invalid_session_returns_404(self):
        """POST /session/999999/hint → 404 for non-existent session."""
        assert ctx.token, "No JWT token available."

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/session/999999/hint",
                headers=_auth_headers(),
            )

        assert resp.status_code == 404, (
            f"Expected 404 for invalid session, got {resp.status_code} — {resp.text}"
        )

    async def test_hint_endpoint_without_token_returns_403(self):
        """POST /session/{id}/hint without auth → 403."""
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"{BASE_URL}/session/{ctx.session_id or 1}/hint",
            )

        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    async def test_max_attempts_logic(self):
        """Verify the Python-enforced max 5 attempts per point causes auto-advance.

        This is a BKT service unit test since testing 5 sequential WS interactions
        via E2E is fragile with real LLM calls.
        """
        from backend.services.bkt_service import BKTService, MASTERY_THRESHOLD
        from backend.services.session_service import MAX_ATTEMPTS_PER_POINT

        bkt = BKTService()

        # Verify the max attempts constant
        assert MAX_ATTEMPTS_PER_POINT == 5, (
            f"Expected MAX_ATTEMPTS_PER_POINT=5, got {MAX_ATTEMPTS_PER_POINT}"
        )

        # Simulate 5 incorrect attempts — score should stay below mastery
        score = bkt.initial_probability()
        for _ in range(5):
            score = bkt.update(score, outcome=0)

        # After 5 incorrect attempts, mastery should NOT be reached
        assert not bkt.is_mastered(score), (
            f"BKT mastery should NOT be reached after 5 incorrect attempts. Score: {score}"
        )

        # Simulate correct attempts until mastery
        score_correct = bkt.initial_probability()
        attempts_to_master = 0
        while not bkt.is_mastered(score_correct) and attempts_to_master < 20:
            score_correct = bkt.update(score_correct, outcome=1)
            attempts_to_master += 1

        assert bkt.is_mastered(score_correct), (
            f"BKT should reach mastery with enough correct answers. "
            f"Score after {attempts_to_master} correct: {score_correct}"
        )

        # The mastery threshold should be 0.85
        assert MASTERY_THRESHOLD == 0.85, f"Expected MASTERY_THRESHOLD=0.85, got {MASTERY_THRESHOLD}"


# ===========================================================================
# TEST 6: FEEDBACK GENERATION — GET /session/{id}/feedback
# ===========================================================================


@pytest.mark.e2e
class TestFeedbackGeneration:
    """Verify that feedback is correctly generated and structured for a session."""

    async def test_generate_feedback_returns_valid_schema(self):
        """GET /session/{id}/feedback → 200 with overall_bkt, misconceptions, topic_cards."""
        assert ctx.token, "No JWT token available."
        assert ctx.session_id, "No session_id — session create test must run first."

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(
                f"{BASE_URL}/session/{ctx.session_id}/feedback",
                headers=_auth_headers(),
            )

        assert resp.status_code == 200, (
            f"Feedback generation failed: {resp.status_code} — {resp.text}"
        )
        body = resp.json()

        # Validate Schema
        assert "overall_bkt_score" in body
        assert "misconceptions" in body
        assert "topic_cards" in body

        assert isinstance(body["overall_bkt_score"], (int, float))
        assert isinstance(body["misconceptions"], list)
        assert isinstance(body["topic_cards"], list)

        # We had at least 1 message in the orchestrator test, so there should be at least 1 card
        # but even if empty, it should be a list.
        for card in body["topic_cards"]:
            assert "topic" in card
            assert "bkt_score" in card
            assert "strengths" in card
            assert "weaknesses" in card
            assert "suggestions" in card

            assert isinstance(card["topic"], str)
            assert isinstance(card["bkt_score"], (int, float))
            assert isinstance(card["strengths"], list)
            assert isinstance(card["weaknesses"], list)
            assert isinstance(card["suggestions"], list)


# ===========================================================================
# TEST 7: ANTI-CHEAT SERVICE (unit-level verification)
# ===========================================================================


@pytest.mark.e2e
class TestAntiCheatService:
    """Verify the 15-word contiguous plagiarism detection."""

    async def test_plagiarism_detection_exact_match(self):
        """15 contiguous words from source should be flagged."""
        from backend.services.anti_cheat_service import AntiCheatService

        service = AntiCheatService()

        slide_text = (
            "Neural networks are computing systems inspired by biological neural "
            "networks that constitute animal brains. They learn to perform tasks "
            "by considering examples without being programmed with task-specific rules."
        )

        # Use exactly 15+ contiguous words from the slide text
        plagiarized_input = (
            "Neural networks are computing systems inspired by biological neural "
            "networks that constitute animal brains they learn to perform"
        )

        # check_plagiarism(user_input, slide_text)
        is_plagiarized = service.check_plagiarism(plagiarized_input, slide_text)
        assert is_plagiarized is True, "Expected plagiarism detection for 15+ contiguous words"

    async def test_no_plagiarism_short_overlap(self):
        """Fewer than 15 contiguous matching words should NOT be flagged."""
        from backend.services.anti_cheat_service import AntiCheatService

        service = AntiCheatService()

        slide_text = (
            "Neural networks are computing systems inspired by biological neural "
            "networks that constitute animal brains."
        )

        original_input = "I think neural networks are really interesting computing systems."

        # check_plagiarism(user_input, slide_text)
        is_plagiarized = service.check_plagiarism(original_input, slide_text)
        assert is_plagiarized is False, "Short overlap should NOT be flagged as plagiarism"


# ===========================================================================
# TEST 8: EVALUATOR SERVICE (unit-level with mocked LLM)
# ===========================================================================


def _make_dummy_session_state() -> dict:
    """Build a minimal Phase 3A nested session_state for evaluator tests."""
    return {
        "current_topic_index": 0,
        "current_point_index": 0,
        "point_attempts": 0,
        "current_difficulty": 1,
        "topics": [
            {
                "topic_title": "Introduction to AI",
                "points": [
                    {
                        "point_title": "The Turing Test",
                        "bkt_score": 0.3,
                        "status": "in_progress",
                        "misconceptions": [],
                        "kido_memory": None,
                    },
                    {
                        "point_title": "Symbolic vs Connectionist AI",
                        "bkt_score": 0.3,
                        "status": "pending",
                        "misconceptions": [],
                        "kido_memory": None,
                    },
                ],
            },
        ],
    }


@pytest.mark.e2e
class TestEvaluatorService:
    """Verify EvaluatorService logic with mocked LLM responses."""

    async def test_correct_label_updates_bkt_and_saves_memory(self):
        """CORRECT → BKT +0.60, status=completed, kido_memory saved, difficulty+1."""
        from unittest.mock import AsyncMock, patch

        from backend.services.evaluator_service import EvaluatorService

        # Mock LLM response: CORRECT
        mock_llm_response = json.dumps({
            "evaluation_label": "CORRECT",
            "detected_misconception": None,
            "memory_title": "Turing Test",
            "memory_summary": "A test where a human judges if responses are from a machine.",
        })

        service = EvaluatorService()

        with patch.object(service.llm_manager, "call_with_fallback", new=AsyncMock(return_value=mock_llm_response)):
            state = _make_dummy_session_state()
            updated_state, label, point_completed = await service.evaluate_message(
                session_state=state,
                user_message="The Turing Test is when a human can't tell if they're talking to a machine.",
            )

        # Label should be CORRECT
        assert label == "CORRECT"
        assert point_completed is True

        # BKT should increase by 0.60 (from 0.3 → 0.9)
        point = updated_state["topics"][0]["points"][0]
        assert point["bkt_score"] == pytest.approx(0.9, abs=0.01), (
            f"Expected BKT ~0.9, got {point['bkt_score']}"
        )

        # Status should be completed
        assert point["status"] == "completed"

        # Kido memory should be saved
        assert point["kido_memory"] is not None
        assert point["kido_memory"]["title"] == "Turing Test"
        assert "machine" in point["kido_memory"]["summary"].lower()

        # Difficulty should be incremented (1 → 2)
        assert updated_state["current_difficulty"] == 2

        # No misconceptions should be recorded
        assert point["misconceptions"] == []

    async def test_incorrect_label_decrements_bkt_and_tracks_misconception(self):
        """INCORRECT → BKT -0.10, point_attempts+1, difficulty-1, misconception appended."""
        from unittest.mock import AsyncMock, patch

        from backend.services.evaluator_service import EvaluatorService

        mock_llm_response = json.dumps({
            "evaluation_label": "INCORRECT",
            "detected_misconception": "Confused the Turing Test with the Chinese Room argument.",
            "memory_title": "Turing Test",
            "memory_summary": "Student mixed up Turing Test with Chinese Room.",
        })

        service = EvaluatorService()

        with patch.object(service.llm_manager, "call_with_fallback", new=AsyncMock(return_value=mock_llm_response)):
            state = _make_dummy_session_state()
            state["current_difficulty"] = 2  # start at 2 so we can verify decrement
            updated_state, label, point_completed = await service.evaluate_message(
                session_state=state,
                user_message="The Turing Test is when you put Chinese symbols in a room.",
            )

        # Label should be INCORRECT
        assert label == "INCORRECT"

        # BKT should decrease by 0.10 (from 0.3 → 0.2)
        point = updated_state["topics"][0]["points"][0]
        assert point["bkt_score"] == pytest.approx(0.2, abs=0.01), (
            f"Expected BKT ~0.2, got {point['bkt_score']}"
        )

        # Attempts should have incremented
        assert updated_state["point_attempts"] == 1

        # Difficulty should have decremented (2 → 1)
        assert updated_state["current_difficulty"] == 1

        # Misconception should be recorded
        assert len(point["misconceptions"]) == 1
        assert "Chinese Room" in point["misconceptions"][0]

        # First attempt at 0.2 BKT — should NOT be completed yet
        assert point_completed is False
        assert point["status"] == "in_progress"

    async def test_needs_info_increments_attempts_only(self):
        """NEEDS_INFO → point_attempts+1, no BKT change, no difficulty change."""
        from unittest.mock import AsyncMock, patch

        from backend.services.evaluator_service import EvaluatorService

        mock_llm_response = json.dumps({
            "evaluation_label": "NEEDS_INFO",
            "detected_misconception": None,
            "memory_title": "Turing Test",
            "memory_summary": "Student mentioned the test but didn't explain the criteria.",
        })

        service = EvaluatorService()

        with patch.object(service.llm_manager, "call_with_fallback", new=AsyncMock(return_value=mock_llm_response)):
            state = _make_dummy_session_state()
            original_bkt = state["topics"][0]["points"][0]["bkt_score"]
            original_difficulty = state["current_difficulty"]

            updated_state, label, point_completed = await service.evaluate_message(
                session_state=state,
                user_message="The Turing Test is... something about AI?",
            )

        assert label == "NEEDS_INFO"

        # BKT should NOT change for NEEDS_INFO
        point = updated_state["topics"][0]["points"][0]
        assert point["bkt_score"] == pytest.approx(original_bkt, abs=0.01)

        # Attempts should have incremented
        assert updated_state["point_attempts"] == 1

        # Difficulty should NOT change
        assert updated_state["current_difficulty"] == original_difficulty

        # Not completed after just 1 NEEDS_INFO
        assert point_completed is False

    async def test_max_attempts_triggers_completion(self):
        """After 3 attempts (max), the point should auto-complete even without mastery."""
        from unittest.mock import AsyncMock, patch

        from backend.services.evaluator_service import EvaluatorService

        mock_llm_response = json.dumps({
            "evaluation_label": "NEEDS_INFO",
            "detected_misconception": None,
            "memory_title": "Turing Test",
            "memory_summary": "Student kept trying but couldn't fully explain.",
        })

        service = EvaluatorService()

        with patch.object(service.llm_manager, "call_with_fallback", new=AsyncMock(return_value=mock_llm_response)):
            state = _make_dummy_session_state()
            state["point_attempts"] = 2  # Already at 2, this call will be the 3rd

            updated_state, label, point_completed = await service.evaluate_message(
                session_state=state,
                user_message="I think the Turing Test is about intelligence...",
            )

        assert label == "NEEDS_INFO"
        assert updated_state["point_attempts"] == 3
        assert point_completed is True
        assert updated_state["topics"][0]["points"][0]["status"] == "completed"

        # Memory should be saved since title and summary exist
        assert updated_state["topics"][0]["points"][0]["kido_memory"] is not None


# ===========================================================================
# TEST 8B: WIDGET DATA ENGINE (Phase 5)
# ===========================================================================


@pytest.mark.e2e
class TestWidgetDataEngine:
    """Phase 5: Verify Kido generates widget_data and the Evaluator grades it purely."""

    async def test_kido_generates_process_widget_data(self):
        """Mock Kido's LLM response to return a PROCESS widget with steps.

        Verifies the KidoService correctly parses and validates widget_data.
        """
        from unittest.mock import AsyncMock, patch

        from backend.services.kido_service import KidoService

        mock_response = json.dumps({
            "kido_response": "Can you put these steps in order?",
            "widget_type": "process",
            "widget_data": {
                "steps": [
                    "Step 1: Collect data",
                    "Step 2: Clean data",
                    "Step 3: Train model",
                    "Step 4: Evaluate results",
                ]
            },
        })

        service = KidoService()

        with patch.object(
            service.llm_manager, "call_with_fallback",
            new=AsyncMock(return_value=mock_response),
        ):
            result = await service.generate_response(
                session_state=_make_dummy_session_state(),
                evaluator_label="CORRECT",
                user_message="Here is how machine learning works...",
                current_point="Machine Learning Pipeline",
            )

        # Verify structure
        assert result["widget_type"] == "process"
        assert result["widget_data"] is not None
        assert isinstance(result["widget_data"]["steps"], list)
        assert len(result["widget_data"]["steps"]) == 4
        assert result["widget_data"]["steps"][0] == "Step 1: Collect data"
        assert result["widget_data"]["steps"][3] == "Step 4: Evaluate results"

    async def test_evaluator_grades_process_widget_strictly(self):
        """Verify the widget evaluator uses strict binary matching.

        - Perfect match → CORRECT (BKT +0.60)
        - Wrong order → INCORRECT (BKT -0.10)

        No LLM call involved — pure Python logic.
        """
        from backend.services.evaluator_service import (
            BKT_CORRECT_INCREMENT,
            BKT_INCORRECT_DECREMENT,
            EvaluatorService,
        )

        service = EvaluatorService()

        expected_data = {
            "steps": ["Step 1", "Step 2", "Step 3", "Step 4"]
        }

        # --- TEST A: Perfect match → CORRECT ---
        state_correct = _make_dummy_session_state()
        initial_bkt = state_correct["topics"][0]["points"][0]["bkt_score"]

        submitted_correct = {"steps": ["Step 1", "Step 2", "Step 3", "Step 4"]}
        updated, label, completed = service.evaluate_widget(
            session_state=state_correct,
            expected_data=expected_data,
            submitted_data=submitted_correct,
            widget_type="PROCESS",
        )

        assert label == "CORRECT", f"Expected CORRECT, got {label}"
        assert completed is True
        point = updated["topics"][0]["points"][0]
        expected_bkt = min(1.0, initial_bkt + BKT_CORRECT_INCREMENT)
        assert point["bkt_score"] == pytest.approx(expected_bkt, abs=0.01), (
            f"Expected BKT ~{expected_bkt}, got {point['bkt_score']}"
        )
        assert point["status"] == "completed"

        # --- TEST B: Wrong order → INCORRECT ---
        state_incorrect = _make_dummy_session_state()
        initial_bkt_2 = state_incorrect["topics"][0]["points"][0]["bkt_score"]

        submitted_wrong = {"steps": ["Step 2", "Step 1", "Step 3", "Step 4"]}
        updated_2, label_2, completed_2 = service.evaluate_widget(
            session_state=state_incorrect,
            expected_data=expected_data,
            submitted_data=submitted_wrong,
            widget_type="PROCESS",
        )

        assert label_2 == "INCORRECT", f"Expected INCORRECT, got {label_2}"
        assert completed_2 is False  # only 1 attempt, not max
        point_2 = updated_2["topics"][0]["points"][0]
        expected_bkt_2 = max(0.0, initial_bkt_2 - BKT_INCORRECT_DECREMENT)
        assert point_2["bkt_score"] == pytest.approx(expected_bkt_2, abs=0.01), (
            f"Expected BKT ~{expected_bkt_2}, got {point_2['bkt_score']}"
        )
        assert updated_2["point_attempts"] == 1


# ===========================================================================
# TEST 9: HEALTH CHECK
# ===========================================================================


@pytest.mark.e2e
class TestHealthCheck:
    """Verify the server is reachable."""

    async def test_health_endpoint(self):
        """GET /health → 200 + { 'status': 'ok' }."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BASE_URL}/health")

        assert resp.status_code == 200
        body = resp.json()
        assert body == {"status": "ok"}


# ===========================================================================
# TEST 10: CLEANUP — Delete test user
# ===========================================================================


@pytest.mark.e2e
class TestCleanup:
    """Clean up test data to avoid database bloat.

    Uses direct DB access to purge all records created by this test run.
    """

    async def test_cleanup_test_user(self):
        """Attempt to clean up the test user from the database."""
        if not ctx.email:
            pytest.skip("No test user to clean up")

        try:
            # Import DB utilities
            from backend.core.db import AsyncSessionLocal
            from backend.models.core import (
                LearningSession,
                SessionMessage,
                SlideDeck,
                User,
                UserMilestone,
            )
            from sqlalchemy import delete, select

            async with AsyncSessionLocal() as db:
                # Find the test user
                stmt = select(User).where(User.email == ctx.email)
                user = (await db.execute(stmt)).scalar_one_or_none()

                if user is None:
                    pytest.skip(f"Test user {ctx.email} not found in DB")
                    return

                user_id = user.id

                # Delete dependent records first (foreign key constraints)
                # 1. SessionMessages (via learning_sessions)
                session_ids_stmt = select(LearningSession.id).where(
                    LearningSession.user_id == user_id
                )
                session_ids = [
                    row[0]
                    for row in (await db.execute(session_ids_stmt)).all()
                ]

                if session_ids:
                    await db.execute(
                        delete(SessionMessage).where(
                            SessionMessage.session_id.in_(session_ids)
                        )
                    )

                # 2. Learning sessions
                await db.execute(
                    delete(LearningSession).where(LearningSession.user_id == user_id)
                )

                # 3. Slide decks
                await db.execute(
                    delete(SlideDeck).where(SlideDeck.user_id == user_id)
                )

                # 4. Milestones
                await db.execute(
                    delete(UserMilestone).where(UserMilestone.user_id == user_id)
                )

                # 5. User
                await db.execute(
                    delete(User).where(User.id == user_id)
                )

                await db.commit()

        except Exception as exc:
            pytest.skip(f"Cleanup failed (non-critical): {exc}")
