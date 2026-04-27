"""
DIAGNOSTIC SCRIPT — Mind Map Pipeline Truth Verification
Queries the live database and dumps:
1. Real session_state for the most recent session
2. Points array with kido_memory status
3. Simulated _build_mind_map_dto output
4. topic_checkpoint readiness
"""
import asyncio
import json
import os
import sys

# Add the backend to path
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
    async_session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Find the most recent session with messages
        result = await db.execute(text("""
            SELECT ls.id, ls.topic, ls.status, ls.bkt_score,
                   ls.session_state,
                   (SELECT COUNT(*) FROM session_messages sm WHERE sm.session_id = ls.id) as msg_count
            FROM learning_sessions ls
            ORDER BY ls.start_time DESC
            LIMIT 3
        """))
        sessions = result.fetchall()
        
        if not sessions:
            print("❌ NO SESSIONS FOUND IN DATABASE")
            return

        for row in sessions:
            sid, topic, status, bkt, state_raw, msg_count = row
            print(f"\n{'='*80}")
            print(f"📋 Session ID: {sid}")
            print(f"   Topic: {topic}")
            print(f"   Status: {status}")
            print(f"   BKT Score: {bkt}")
            print(f"   Message Count: {msg_count}")
            
            if not state_raw:
                print("   ❌ session_state is NULL/empty")
                continue
                
            state = state_raw if isinstance(state_raw, dict) else json.loads(state_raw)
            
            print(f"\n   --- Session State Keys ---")
            print(f"   Keys: {list(state.keys())}")
            print(f"   current_topic_index: {state.get('current_topic_index', 'MISSING')}")
            print(f"   current_point_index: {state.get('current_point_index', 'MISSING')}")
            print(f"   point_attempts: {state.get('point_attempts', 'MISSING')}")
            print(f"   mind_map_version: {state.get('mind_map_version', 'MISSING')}")
            
            topics = state.get("topics", [])
            print(f"\n   --- Topics ({len(topics)}) ---")
            
            for ti, topic_node in enumerate(topics):
                points = topic_node.get("points", [])
                print(f"\n   [Topic {ti}] {topic_node.get('topic_title', 'UNTITLED')}")
                print(f"     Points: {len(points)}")
                
                for pi, p in enumerate(points):
                    km = p.get("kido_memory")
                    print(f"\n     [Point {pi}] {p.get('point_title', 'UNTITLED')}")
                    print(f"       status: {p.get('status', 'MISSING')}")
                    print(f"       bkt_score: {p.get('bkt_score', 'MISSING')}")
                    print(f"       is_correct: {p.get('is_correct', 'MISSING')}")
                    print(f"       is_visited: {p.get('is_visited', 'MISSING')}")
                    print(f"       node_id: {p.get('node_id', 'MISSING')}")
                    print(f"       kido_memory: {json.dumps(km, indent=8) if km else '❌ NULL/MISSING'}")
                    print(f"       misconceptions: {len(p.get('misconceptions', []))}")
                    
            # Simulate _build_mind_map_dto
            ti = state.get("current_topic_index", 0)
            if ti < len(topics):
                topic_node = topics[ti]
                points = topic_node.get("points", [])
                
                print(f"\n   --- Simulated _build_mind_map_dto(state, {ti}) ---")
                nodes = []
                for index, p in enumerate(points):
                    memory = p.get("kido_memory") or {}
                    nodes.append({
                        "node_id": p.get("node_id", index + 1),
                        "point": p.get("point_title", ""),
                        "kido_sentence": memory.get("summary", ""),
                        "status": "correct" if p.get("bkt_score", 0) >= 0.7 else (
                            "incorrect" if p.get("status") == "completed" else "partial"
                        ),
                    })
                
                dto = {
                    "event_id": f"mm_evt_v{state.get('mind_map_version', 1)}",
                    "topic_title": topic_node.get("topic_title", "Untitled"),
                    "nodes": nodes,
                }
                print(f"   DTO: {json.dumps(dto, indent=4)}")
                print(f"\n   Node count: {len(nodes)}")
                print(f"   Nodes with kido_sentence: {sum(1 for n in nodes if n['kido_sentence'])}")
                print(f"   Nodes without kido_sentence: {sum(1 for n in nodes if not n['kido_sentence'])}")
            
            # Check if topic_checkpoint would fire
            if ti < len(topics):
                topic_node = topics[ti]
                points = topic_node.get("points", [])
                all_done = all(p.get("status") in ("completed", "skipped") for p in points) if points else False
                print(f"\n   --- Topic Checkpoint Status ---")
                print(f"   all_points_done: {all_done}")
                print(f"   Would topic_checkpoint fire? {'✅ YES' if all_done else '❌ NO'}")
                for pi, p in enumerate(points):
                    print(f"     Point {pi} ({p.get('point_title', '?')[:30]}): status={p.get('status', '?')}")

        # 2. Fetch last few messages to see interaction pattern
        if sessions:
            sid = sessions[0][0]
            result = await db.execute(text(f"""
                SELECT id, sender_role, message_text, widget_type, created_at
                FROM session_messages
                WHERE session_id = {sid}
                ORDER BY created_at DESC
                LIMIT 6
            """))
            msgs = result.fetchall()
            print(f"\n{'='*80}")
            print(f"📨 Last 6 messages for session {sid}:")
            for m in reversed(msgs):
                mid, role, msg_text, wtype, created = m
                preview = (msg_text or "")[:100].replace("\n", " ")
                print(f"   [{role:5s}] (wtype={wtype}) {preview}...")

    await engine.dispose()

asyncio.run(main())
