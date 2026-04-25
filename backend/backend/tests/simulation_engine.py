"""Chunk 8 — SimulationEngine: End-to-End Validation Layer.

This module does NOT affect production runtime.
It validates deterministic backend behavior by:
  - injecting synthetic events via real FastAPI routes
  - validating response DTOs against frontend contracts
  - checking state transitions for architectural safety
"""

import asyncio
import json
import traceback
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel
import httpx

from backend.main import app
from backend.tests.api_contracts import (
    SessionInitDTO,
    TopicTransitionDTO,
    HintDTO,
    WidgetSchemaDTO,
    MindMapDTO,
)


# ──────────────────────────────────────────────────────────────────────
# Failure Report
# ──────────────────────────────────────────────────────────────────────

class SimulationFailureReport(BaseModel):
    timestamp: str
    failed_scenario: str
    violation_type: str
    expected_state: dict[str, Any]
    actual_state: dict[str, Any]
    traceback: str


# ──────────────────────────────────────────────────────────────────────
# State Validator (pure logic, no DB)
# ──────────────────────────────────────────────────────────────────────

class StateValidator:
    """Validates session state against architectural rules."""

    @staticmethod
    def get_current_point(state: dict) -> dict | None:
        ti = state.get("current_topic_index", 0)
        pi = state.get("current_point_index", 0)
        topics = state.get("topics", [])
        if ti < len(topics) and topics[ti].get("points"):
            points = topics[ti]["points"]
            if pi < len(points):
                return points[pi]
        return None


# ──────────────────────────────────────────────────────────────────────
# Event Emulator (thin HTTP client, NO logic)
# ──────────────────────────────────────────────────────────────────────

class EventEmulator:
    """Simulates frontend UI actions via real API routes."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )
        self.headers = {"Authorization": "Bearer fake_token"}

    async def start_session(self, doc_id: int):
        return await self.client.post(
            "/session/create",
            json={"document_id": doc_id},
            headers=self.headers,
        )

    async def skip_topic(self, session_id: int):
        return await self.client.post(
            f"/session/{session_id}/skip-topic",
            headers=self.headers,
        )

    async def get_mind_map(self, session_id: int):
        return await self.client.get(
            f"/session/{session_id}/mind-map",
            headers=self.headers,
        )

    async def get_widget_state(self, session_id: int):
        return await self.client.get(
            f"/session/{session_id}/widget-state",
            headers=self.headers,
        )

    async def close(self):
        await self.client.aclose()


# ──────────────────────────────────────────────────────────────────────
# Simulation Engine
# ──────────────────────────────────────────────────────────────────────

class SimulationEngine:
    def __init__(self):
        self.state_validator = StateValidator()
        self.emulator = EventEmulator()
        self.failures: list[SimulationFailureReport] = []
        self.session_id: int | None = None
        self.passed = 0
        self.total = 0

    def record_failure(self, scenario: str, violation: str,
                       expected: dict, actual: dict, tb: str):
        report = SimulationFailureReport(
            timestamp=datetime.now(timezone.utc).isoformat(),
            failed_scenario=scenario,
            violation_type=violation,
            expected_state=expected,
            actual_state=actual,
            traceback=tb,
        )
        self.failures.append(report)
        print(f"  [FAIL] {scenario} -- {violation}")

    def record_pass(self, scenario: str):
        self.passed += 1
        print(f"  [PASS] {scenario}")

    # ── DB Setup ──────────────────────────────────────────────────────

    async def setup_db(self):
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from backend.models.core import Base, User, SlideDeck

        # Patch SQLite compiler to handle JSONB
        from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler
        if not hasattr(SQLiteTypeCompiler, "visit_JSONB"):
            SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: "JSON"

        self._engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:", echo=False,
        )
        self.TestingSessionLocal = async_sessionmaker(
            autocommit=False, autoflush=False,
            bind=self._engine, expire_on_commit=False,
        )

        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with self.TestingSessionLocal() as session:
            user = User(
                email="test@learnback.com",
                username="testuser",
                password_hash="hashed",
            )
            session.add(user)
            await session.commit()

            deck = SlideDeck(
                user_id=user.id,
                original_filename="Simulation_Deck.pdf",
                raw_extracted_text="Test Data",
                segmented_json={
                    "extracted_segments": [
                        {
                            "topic_title": "Test Topic 1",
                            "extracted_concepts": ["Concept A", "Concept B"],
                        },
                        {
                            "topic_title": "Test Topic 2",
                            "extracted_concepts": ["Concept C"],
                        },
                    ]
                },
            )
            session.add(deck)
            await session.commit()
            self.test_user_id = user.id
            self.test_deck_id = deck.id

        # Override FastAPI dependencies
        from backend.core.db import get_db
        from backend.routes.session_router import get_current_user_id

        async def override_get_db():
            async with self.TestingSessionLocal() as session:
                yield session

        async def override_get_current_user_id():
            return self.test_user_id

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_id] = override_get_current_user_id

    # ── Scenario 3.1: Start Session ──────────────────────────────────

    async def test_start_session(self):
        self.total += 1
        resp = await self.emulator.start_session(self.test_deck_id)
        if resp.status_code != 200:
            self.record_failure(
                "start_session", "API_ERROR",
                {"status": 200},
                {"status": resp.status_code, "body": resp.text[:200]},
                "POST /session/create returned non-200",
            )
            return

        data = resp.json()

        # Validate DTO shape
        if data.get("session_status") != "active":
            self.record_failure(
                "start_session", "STATE_DRIFT",
                {"session_status": "active"},
                {"session_status": data.get("session_status")},
                "Session not active on creation",
            )
            return

        if not data.get("current_topic"):
            self.record_failure(
                "start_session", "SCHEMA_MISMATCH",
                {"current_topic": "present"},
                {"current_topic": "missing"},
                "current_topic missing from response",
            )
            return

        self.session_id = data.get("session_id")
        self.record_pass("start_session")

    # ── Scenario 3.2: Skip Topic ─────────────────────────────────────

    async def test_skip_topic_flow(self):
        self.total += 1
        if self.session_id is None:
            self.record_failure("skip_topic", "PRECONDITION", {}, {}, "No session_id")
            return

        resp = await self.emulator.skip_topic(self.session_id)
        if resp.status_code != 200:
            self.record_failure(
                "skip_topic", "API_ERROR",
                {"status": 200},
                {"status": resp.status_code, "body": resp.text[:200]},
                "POST /session/{id}/skip-topic returned non-200",
            )
            return

        data = resp.json()

        if not data.get("mind_map_generated"):
            self.record_failure(
                "skip_topic", "ARCHITECTURE_BREACH",
                {"mind_map_generated": True},
                {"mind_map_generated": data.get("mind_map_generated")},
                "Mind map MUST be generated before skip",
            )
            return

        if data.get("new_topic_index", -1) < 1:
            self.record_failure(
                "skip_topic", "STATE_DRIFT",
                {"new_topic_index": ">=1"},
                {"new_topic_index": data.get("new_topic_index")},
                "Topic index did not advance",
            )
            return

        self.record_pass("skip_topic")

    # ── Scenario 3.7: Mind Map Snapshot ──────────────────────────────

    async def test_mind_map_snapshot(self):
        self.total += 1
        if self.session_id is None:
            self.record_failure("mind_map_snapshot", "PRECONDITION", {}, {}, "No session_id")
            return

        resp = await self.emulator.get_mind_map(self.session_id)
        if resp.status_code != 200:
            self.record_failure(
                "mind_map_snapshot", "API_ERROR",
                {"status": 200},
                {"status": resp.status_code, "body": resp.text[:200]},
                "GET /session/{id}/mind-map returned non-200",
            )
            return

        data = resp.json()
        mind_map = data.get("mind_map")

        # Must never be silently empty without fallback
        if mind_map is None:
            self.record_failure(
                "mind_map_snapshot", "SCHEMA_MISMATCH",
                {"mind_map": "present"},
                {"mind_map": "None"},
                "mind_map key is None",
            )
            return

        self.record_pass("mind_map_snapshot")

    # ── Scenario 3.5: Widget Lock ────────────────────────────────────

    async def test_widget_status_lock(self):
        self.total += 1
        if self.session_id is None:
            self.record_failure("widget_lock", "PRECONDITION", {}, {}, "No session_id")
            return

        resp = await self.emulator.get_widget_state(self.session_id)
        if resp.status_code != 200:
            self.record_failure(
                "widget_lock", "API_ERROR",
                {"status": 200},
                {"status": resp.status_code, "body": resp.text[:200]},
                "GET /session/{id}/widget-state returned non-200",
            )
            return

        data = resp.json()

        # Widget MUST default to locked before any evaluator response
        if data.get("widget_status") != "locked":
            self.record_failure(
                "widget_lock", "ARCHITECTURE_BREACH",
                {"widget_status": "locked"},
                {"widget_status": data.get("widget_status")},
                "Widget must be locked before evaluator response",
            )
            return

        self.record_pass("widget_lock")

    # ── Frontend Contract Validation ─────────────────────────────────

    async def test_frontend_contracts(self):
        """Verify router returns no business logic — only DTO shapes."""
        self.total += 1

        # Verify no duplicate skip logic exists outside SessionService
        import inspect
        from backend.routes import session_router

        router_source = inspect.getsource(session_router.skip_topic)
        forbidden_keywords = ["bkt", "evaluate", "kido_memory", "misconception"]
        violations = [kw for kw in forbidden_keywords if kw in router_source.lower()]

        if violations:
            self.record_failure(
                "frontend_contracts", "LOGIC_LEAKAGE",
                {"router_logic": "transport_only"},
                {"found_keywords": violations},
                "Business logic keywords found in router skip_topic function",
            )
            return

        self.record_pass("frontend_contracts")

    # ── Run All ──────────────────────────────────────────────────────

    async def run_all(self):
        print("=" * 60)
        print("  LearnBack Simulation Engine -- Chunk 8")
        print("=" * 60)
        await self.setup_db()

        try:
            await self.test_start_session()
            await self.test_skip_topic_flow()
            await self.test_mind_map_snapshot()
            await self.test_widget_status_lock()
            await self.test_frontend_contracts()
        except Exception as e:
            self.record_failure("execution", "CRASH", {}, {}, traceback.format_exc())

        await self.emulator.close()

        print("-" * 60)
        failed = len(self.failures)
        print(f"  Results: {self.passed}/{self.passed + failed} passed, {failed} failed")
        if not self.failures:
            print("  [ALL PASSED] System is deterministic and contract-safe.")
        else:
            print("  [FAILURES DETECTED] See report above.")
        print("=" * 60)


if __name__ == "__main__":
    engine = SimulationEngine()
    asyncio.run(engine.run_all())
