"""
DIAGNOSTIC #2: Test if SQLAlchemy JSONB mutations persist.
This script:
1. Fetches a real session
2. Mutates session_state with a marker
3. Commits
4. Refetches and checks
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select, text
from copy import deepcopy

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

async def main():
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    async_session = async_sessionmaker(
        bind=engine, class_=AsyncSession,
        expire_on_commit=False, autoflush=False
    )

    # Step 1: Read current state
    async with async_session() as db:
        result = await db.execute(text(
            "SELECT id, session_state FROM learning_sessions ORDER BY start_time DESC LIMIT 1"
        ))
        row = result.fetchone()
        if not row:
            print("No sessions found")
            return
        
        sid = row[0]
        state = row[1] or {}
        print(f"Session {sid}")
        print(f"  mind_map_version BEFORE: {state.get('mind_map_version', 'MISSING')}")
        print(f"  _diagnostic_marker BEFORE: {state.get('_diagnostic_marker', 'MISSING')}")

    # Step 2: Simulate what SessionService does — get via ORM, mutate, deepcopy, commit
    from backend.models.core import LearningSession
    
    async with async_session() as db:
        stmt = select(LearningSession).where(LearningSession.id == sid)
        session_obj = (await db.execute(stmt)).scalar_one_or_none()
        
        if not session_obj:
            print("Session not found via ORM")
            return
        
        # This is EXACTLY what _ensure_state does
        state = session_obj.session_state
        if state is None:
            state = {}
            session_obj.session_state = state
        
        print(f"\n  ORM state is same object as session_obj.session_state? {state is session_obj.session_state}")
        
        # Simulate mutation (what process_user_message does)
        state["_diagnostic_marker"] = "WRITTEN_BY_DIAGNOSTIC"
        state["mind_map_version"] = 999
        
        print(f"  state after mutation: marker={state.get('_diagnostic_marker')}, mmv={state.get('mind_map_version')}")
        print(f"  session_obj.session_state after mutation: marker={session_obj.session_state.get('_diagnostic_marker')}, mmv={session_obj.session_state.get('mind_map_version')}")
        
        # This is EXACTLY what line 300 does
        session_obj.session_state = deepcopy(state)
        
        print(f"  After deepcopy reassignment:")
        print(f"    state is session_obj.session_state? {state is session_obj.session_state}")
        print(f"    session_obj.session_state marker: {session_obj.session_state.get('_diagnostic_marker')}")
        
        # Check if SQLAlchemy sees this as dirty
        dirty = db.dirty
        print(f"  SQLAlchemy dirty set: {dirty}")
        print(f"  session_obj in dirty? {session_obj in dirty}")
        
        # Now commit
        await db.commit()
        print("  Committed!")
    
    # Step 3: Refetch and verify
    async with async_session() as db:
        result = await db.execute(text(
            f"SELECT session_state FROM learning_sessions WHERE id = {sid}"
        ))
        row = result.fetchone()
        new_state = row[0] if row else {}
        
        print(f"\n  AFTER REFETCH:")
        print(f"  mind_map_version: {new_state.get('mind_map_version', 'MISSING')}")
        print(f"  _diagnostic_marker: {new_state.get('_diagnostic_marker', 'MISSING')}")
        
        if new_state.get("_diagnostic_marker") == "WRITTEN_BY_DIAGNOSTIC":
            print("\n  RESULT: SQLAlchemy JSONB deepcopy commit WORKS")
        else:
            print("\n  RESULT: SQLAlchemy JSONB deepcopy commit FAILED -- THIS IS THE BUG")
        
        # Cleanup: remove the marker
        await db.execute(text(
            f"UPDATE learning_sessions SET session_state = session_state - '_diagnostic_marker' WHERE id = {sid}"
        ))
        # Also reset mind_map_version back
        if new_state.get("mind_map_version") == 999:
            await db.execute(text(
                f"UPDATE learning_sessions SET session_state = jsonb_set(session_state, '{{mind_map_version}}', 'null') WHERE id = {sid}"
            ))
        await db.commit()
        print("  Cleanup done")

    await engine.dispose()

asyncio.run(main())
