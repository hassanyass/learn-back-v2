"""
DIAGNOSTIC: Verify the _ensure_state deepcopy fix works.
Simulates the EXACT same path SessionService now uses.
"""
import asyncio
import os
import sys
from copy import deepcopy

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select, text

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

async def main():
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    async_session = async_sessionmaker(
        bind=engine, class_=AsyncSession,
        expire_on_commit=False, autoflush=False
    )
    from backend.models.core import LearningSession

    # ---- THE NEW PATTERN (what _ensure_state now does) ----
    print("=== Testing NEW pattern: deepcopy FIRST ===")
    async with async_session() as db:
        stmt = select(LearningSession).order_by(LearningSession.start_time.desc()).limit(1)
        session_obj = (await db.execute(stmt)).scalar_one()
        sid = session_obj.id
        
        # This is what _ensure_state() now does
        state = deepcopy(session_obj.session_state) if session_obj.session_state else {}
        
        print(f"  Session {sid}")
        print(f"  state is session_obj.session_state? {state is session_obj.session_state}")
        
        # Simulate mutations that happen in process_user_message
        state["_verify_fix"] = "JSONB_FIX_WORKS"
        state["mind_map_version"] = state.get("mind_map_version", 0) + 1
        
        # This is what line 300 does
        session_obj.session_state = deepcopy(state)
        await db.commit()
        print("  Committed!")
    
    # Verify
    async with async_session() as db:
        result = await db.execute(text(
            f"SELECT session_state FROM learning_sessions WHERE id = {sid}"
        ))
        row = result.fetchone()
        new_state = row[0] if row else {}
        
        marker = new_state.get("_verify_fix", "MISSING")
        mmv = new_state.get("mind_map_version", "MISSING")
        
        print(f"\n  AFTER REFETCH:")
        print(f"  _verify_fix: {marker}")
        print(f"  mind_map_version: {mmv}")
        
        if marker == "JSONB_FIX_WORKS":
            print("\n  === JSONB FIX VERIFIED: STATE PERSISTS ===")
        else:
            print("\n  === FIX FAILED ===")
        
        # Cleanup
        await db.execute(text(
            f"UPDATE learning_sessions SET session_state = session_state - '_verify_fix' WHERE id = {sid}"
        ))
        await db.commit()
        print("  Cleanup done")

    await engine.dispose()

asyncio.run(main())
