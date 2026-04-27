"""
DIAGNOSTIC #3: Verify SQLAlchemy is NOT emitting UPDATE for JSONB.
Uses SQL echo to see what actually hits the wire.
"""
import asyncio
import json
import os
import sys
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select
from copy import deepcopy

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Enable SQLAlchemy SQL logging
logging.basicConfig()
logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)

async def main():
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, echo=True)
    async_session = async_sessionmaker(
        bind=engine, class_=AsyncSession,
        expire_on_commit=False, autoflush=False
    )

    from backend.models.core import LearningSession

    # Test A: In-place mutation + deepcopy reassign (CURRENT code)
    print("\n=== TEST A: In-place mutation + deepcopy (current code) ===")
    async with async_session() as db:
        stmt = select(LearningSession).order_by(LearningSession.start_time.desc()).limit(1)
        session_obj = (await db.execute(stmt)).scalar_one()
        
        state = session_obj.session_state
        state["_test_a"] = "hello"  # mutate in-place
        session_obj.session_state = deepcopy(state)  # deepcopy reassign
        
        print("--- COMMITTING TEST A ---")
        await db.commit()
    
    # Test B: Fresh deepcopy BEFORE mutation (proposed fix)
    print("\n=== TEST B: Deepcopy BEFORE mutation (proposed fix) ===")
    async with async_session() as db:
        stmt = select(LearningSession).order_by(LearningSession.start_time.desc()).limit(1)
        session_obj = (await db.execute(stmt)).scalar_one()
        
        state = deepcopy(session_obj.session_state)  # DEEP COPY FIRST
        state["_test_b"] = "hello"  # mutate the copy
        session_obj.session_state = state  # assign the copy
        
        print("--- COMMITTING TEST B ---")
        await db.commit()
    
    # Verify
    print("\n=== VERIFICATION ===")
    async with async_session() as db:
        from sqlalchemy import text
        result = await db.execute(text(
            "SELECT session_state FROM learning_sessions ORDER BY start_time DESC LIMIT 1"
        ))
        row = result.fetchone()
        s = row[0]
        print(f"  _test_a present? {s.get('_test_a', 'MISSING')}")
        print(f"  _test_b present? {s.get('_test_b', 'MISSING')}")
        
        # Cleanup
        await db.execute(text(
            "UPDATE learning_sessions SET session_state = session_state - '_test_a' - '_test_b' WHERE id = (SELECT id FROM learning_sessions ORDER BY start_time DESC LIMIT 1)"
        ))
        await db.commit()
        print("  Cleanup done")

    await engine.dispose()

asyncio.run(main())
