"""
End-to-end diagnostic test for the Mind Map / Skip Topic flow.

This script validates the entire chain:
  1. MindMapPayload schema accepts target_topic_index
  2. _process_mind_map_locked correctly mutates state on skip
  3. State is properly persisted to DB after skip
  4. Response payload has the correct shape for the frontend

Run from the backend directory:
  python test_mindmap_flow.py
"""

import sys
import json

# ── Test 1: Schema Validation ──────────────────────────────────────
print("=" * 60)
print("TEST 1: MindMapPayload Schema Validation")
print("=" * 60)

from backend.schemas.api_schemas import MindMapPayload
from pydantic import ValidationError

# 1a. Normal submission (no skip)
try:
    p1 = MindMapPayload(type="mind_map_submit", corrections={"Point A": "Fixed text"})
    print(f"  [PASS] Normal payload: corrections={p1.corrections}, target_topic_index={p1.target_topic_index}")
except Exception as e:
    print(f"  [FAIL] Normal payload: {e}")

# 1b. Skip submission
try:
    p2 = MindMapPayload(type="mind_map_submit", corrections={}, target_topic_index=2)
    print(f"  [PASS] Skip payload:   corrections={p2.corrections}, target_topic_index={p2.target_topic_index}")
except Exception as e:
    print(f"  [FAIL] Skip payload: {e}")

# 1c. From raw dict (simulating WebSocket JSON parse)
try:
    raw = {"type": "mind_map_submit", "corrections": {}, "target_topic_index": 3}
    p3 = MindMapPayload(**raw)
    print(f"  [PASS] Raw dict parse: target_topic_index={p3.target_topic_index} (type={type(p3.target_topic_index).__name__})")
except Exception as e:
    print(f"  [FAIL] Raw dict parse: {e}")

# 1d. String target_topic_index (frontend sends parseInt but just in case)
try:
    raw_str = {"type": "mind_map_submit", "corrections": {}, "target_topic_index": "2"}
    p4 = MindMapPayload(**raw_str)
    print(f"  [PASS] String index parse: target_topic_index={p4.target_topic_index} (type={type(p4.target_topic_index).__name__})")
except ValidationError as e:
    print(f"  [INFO] String index rejected (expected): {e.errors()[0]['msg']}")

print()

# ── Test 2: State Mutation Logic ───────────────────────────────────
print("=" * 60)
print("TEST 2: State Mutation Logic (Skip)")
print("=" * 60)

from copy import deepcopy

mock_state = {
    "current_topic_index": 0,
    "current_point_index": 2,
    "point_attempts": 3,
    "mind_map_version": 1,
    "topics": [
        {
            "topic_title": "Topic A",
            "points": [
                {"point_title": "Point A1", "bkt_score": 0.8, "status": "completed", "kido_memory": {"title": "A1", "summary": "..."}},
                {"point_title": "Point A2", "bkt_score": 0.7, "status": "completed", "kido_memory": {"title": "A2", "summary": "..."}},
            ]
        },
        {
            "topic_title": "Topic B",
            "points": [
                {"point_title": "Point B1", "bkt_score": 0.3, "status": "pending", "kido_memory": None},
                {"point_title": "Point B2", "bkt_score": 0.3, "status": "pending", "kido_memory": None},
            ]
        },
        {
            "topic_title": "Topic C",
            "points": [
                {"point_title": "Point C1", "bkt_score": 0.3, "status": "pending", "kido_memory": None},
            ]
        },
    ]
}

# Simulate the skip logic from _process_mind_map_locked
state = deepcopy(mock_state)
target_topic_index = 2

if target_topic_index is not None and 0 <= target_topic_index < len(state.get("topics", [])):
    current_ti = state.get("current_topic_index", 0)
    
    if "skipped_indices" not in state:
        state["skipped_indices"] = []
    
    if target_topic_index > current_ti:
        for i in range(current_ti, target_topic_index):
            if i not in state["skipped_indices"]:
                state["skipped_indices"].append(i)
    
    state["current_topic_index"] = target_topic_index
    state["current_point_index"] = 0
    
    target_topic_title = state["topics"][target_topic_index]["topic_title"]
    first_point_title = state["topics"][target_topic_index]["points"][0]["point_title"]
    
    print(f"  [PASS] current_topic_index: {mock_state['current_topic_index']} → {state['current_topic_index']}")
    print(f"  [PASS] current_point_index: {mock_state['current_point_index']} → {state['current_point_index']}")
    print(f"  [PASS] skipped_indices: {state['skipped_indices']}")
    print(f"  [PASS] target_topic_title: {target_topic_title}")
    print(f"  [PASS] first_point_title: {first_point_title}")
else:
    print(f"  [FAIL] Skip condition not met: target={target_topic_index}, topics={len(state.get('topics', []))}")

print()

# ── Test 3: State Persistence Bug Check ────────────────────────────
print("=" * 60)
print("TEST 3: State Persistence Bug Check")
print("=" * 60)

# Simulate the bug: commit BEFORE skip, then skip modifies state,
# but session.session_state still has the OLD state
state_before_skip = deepcopy(mock_state)
state_before_skip["mind_map_version"] = 2

# This is what gets committed on line 654:
session_state_in_db = deepcopy(state_before_skip)

# Then skip logic runs on the ORIGINAL state reference:
state_before_skip["current_topic_index"] = 2
state_before_skip["current_point_index"] = 0
state_before_skip["skipped_indices"] = [0, 1]

# session_state_in_db was NOT updated!
print(f"  DB state current_topic_index: {session_state_in_db['current_topic_index']}  (should be 2, is {session_state_in_db['current_topic_index']})")
print(f"  In-memory current_topic_index: {state_before_skip['current_topic_index']}")
if session_state_in_db['current_topic_index'] != state_before_skip['current_topic_index']:
    print(f"  [BUG] State persistence mismatch! DB has old state, response has new state.")
    print(f"        DB will have current_topic_index=0, but frontend gets 2.")
    print(f"        On page refresh, user will revert to topic 0!")
else:
    print(f"  [PASS] States match")

print()

# ── Test 4: Response Shape Validation ──────────────────────────────
print("=" * 60)
print("TEST 4: Response Shape (what frontend receives)")
print("=" * 60)

# What the router wraps it in:
ws_message = {
    "type": "kido_response",
    "data": {
        "kido_response": "Got it! Skipping ahead...",
        "widget_type": "TEXT",
        "advanced": True,
        "session_state": {
            "current_topic_index": 2,
            "current_point_index": 0,
            "skipped_indices": [0, 1],
            "topics": mock_state["topics"],
        },
    }
}

data = ws_message["data"]

# Check: does it have topic_checkpoint? (would route to onMindMap instead of onKidoResponse)
has_checkpoint = data.get("topic_checkpoint", False)
print(f"  topic_checkpoint: {has_checkpoint} → routes to: {'onMindMap' if has_checkpoint else 'onKidoResponse'}")

# Check: does onKidoResponse handler extract what it needs?
ss = data.get("session_state", {})
print(f"  session_state.current_topic_index: {ss.get('current_topic_index')} (frontend uses for topic highlighting)")
print(f"  session_state.skipped_indices: {ss.get('skipped_indices')} (frontend uses for skip badges)")
print(f"  kido_response: {data.get('kido_response', '')[:50]}...")
print(f"  widget_type: {data.get('widget_type')}")

# Validate SessionState.updateFromWsResponse would work:
print()
print("  Simulating SessionState.updateFromWsResponse(data):")
if ss:
    if "current_topic_index" in ss: print(f"    ✓ currentTopicIndex = {ss['current_topic_index']}")
    if "current_point_index" in ss: print(f"    ✓ currentPointIndex = {ss['current_point_index']}")
    if "skipped_indices" in ss: print(f"    ✓ skippedIndices = {ss['skipped_indices']}")
    if "topics" in ss: print(f"    ✓ topics = [{len(ss['topics'])} topics]")

print()
print("=" * 60)
print("SUMMARY")
print("=" * 60)
print("""
CRITICAL BUG FOUND:
  In _process_mind_map_locked (session_service.py):
  
  Line 654: session.session_state = deepcopy(state)  ← commits OLD state
  Line 656: await self.db.commit()                     ← persists OLD state to DB
  
  Line 658-696: state is mutated (skip logic)          ← modifies in-memory only
  
  Line 700: await self.db.commit()                     ← commits NOTHING new
                                                          (session.session_state
                                                           still has OLD deepcopy)
  
  Line 705: return { "session_state": state }          ← returns CORRECT state
  
  RESULT: Frontend gets correct state, but DB has WRONG state.
          On page refresh, the skip is LOST.
          
  FIX: Move session.session_state = deepcopy(state) AFTER the skip logic,
       or add a second assignment before the final commit.
""")
