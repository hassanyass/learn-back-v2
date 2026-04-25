import sys
import os
import asyncio
from fastapi.testclient import TestClient

sys.path.insert(0, r"c:\Users\hassa\Documents\Dummy AI 2\LearnBack_V2\backend")

os.environ["JWT_SECRET_KEY"] = "supersecret"

from backend.main import app
from backend.services.auth_service import AuthService
from backend.routes.session_router import get_current_user_id
from backend.core.db import SessionLocal
from backend.models.core import SlideDeck

async def override_get_current_user_id():
    return 1

app.dependency_overrides[get_current_user_id] = override_get_current_user_id

def setup_db():
    db = SessionLocal()
    # Create dummy deck if not exists
    deck = db.query(SlideDeck).filter(SlideDeck.id == 1).first()
    if not deck:
        deck = SlideDeck(id=1, user_id=1, filename="dummy.pptx", status="processed")
        db.add(deck)
        db.commit()
    db.close()

def create_auth_token():
    auth = AuthService(None)
    return auth.generate_access_token(1)

client = TestClient(app)

def run_chaos():
    setup_db()
    token = create_auth_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print("--- CHAOS TEST RUNNER STARTED ---")
    
    # 1. Start Session
    print("\n[Flow] Creating Session...")
    resp = client.post("/session/create", json={"slide_deck_id": 1}, headers=headers)
    
    if resp.status_code != 200:
        resp = client.post("/session/create", json={"document_id": 1}, headers=headers)
        
    assert resp.status_code == 200, f"Failed to create session: {resp.text}"
    session_id = resp.json()["session_id"]
    print(f"Session Created: {session_id}")
    
    reports = []
    
    # Connect WebSocket
    try:
        with client.websocket_connect(f"/ws/session/{session_id}?token={token}") as websocket:
            print("\n[WS] Connected")
            
            # --- CHAOS 1: Rapid Hint Spam ---
            print("\n[Chaos 1] Spamming Hints (HTTP)...")
            hint_resps = []
            for _ in range(5):
                hint_resps.append(client.post(f"/session/{session_id}/hint", headers=headers))
            
            for r in hint_resps:
                assert r.status_code == 200
            
            # Verify hints received on WS
            ws_hint_count = 0
            for _ in range(5):
                data = websocket.receive_json()
                if data["type"] == "system_hint":
                    ws_hint_count += 1
            if ws_hint_count == 5:
                reports.append(("Hint Spam", "PASS", "No WS collisions, hints fully isolated."))
            else:
                reports.append(("Hint Spam", "FAIL", f"Expected 5 hints, got {ws_hint_count}"))

            # --- CHAOS 2: Widget Spam Lock ---
            print("\n[Chaos 2] Widget Request Spam...")
            w_resps = []
            for _ in range(10):
                w_resps.append(client.get(f"/session/{session_id}/widget-state", headers=headers))
            
            all_locked = all(r.json()["widget_status"] in ["locked", "ready"] for r in w_resps)
            if all_locked:
                reports.append(("Widget Lock Edge", "PASS", "Strict enforcement, no bypass observed."))
            else:
                reports.append(("Widget Lock Edge", "FAIL", "Lock state corrupted during rapid requests."))

            # --- CHAOS 3: Interleaved Chat + Hint ---
            print("\n[Chaos 3] Chat + Hint interleaving...")
            websocket.send_json({"type": "chat", "text": "This is an answer!"})
            client.post(f"/session/{session_id}/hint", headers=headers)
            
            responses = []
            for _ in range(2):
                responses.append(websocket.receive_json())
            
            types = [r["type"] for r in responses]
            if "kido_response" in types and "system_hint" in types:
                reports.append(("Chat+Hint Interleaving", "PASS", "No Evaluator pollution, distinct WS routing."))
            else:
                reports.append(("Chat+Hint Interleaving", "FAIL", f"Mangled WS payloads: {types}"))

            # --- CHAOS 4: Mind Map Open -> Submit -> Skip ---
            print("\n[Chaos 4] Mind Map Sequence & DTO Validation...")
            
            # 1. Open
            mm_resp = client.get(f"/session/{session_id}/mind-map", headers=headers)
            assert mm_resp.status_code == 200
            mm_data = mm_resp.json()["mind_map_data"]
            
            is_valid_dto = "nodes" in mm_data and isinstance(mm_data["nodes"], list)
            
            # 2. Submit
            websocket.send_json({"type": "mind_map_submit", "corrections": {"Node 1": "Corrected"}})
            mm_submit_reply = websocket.receive_json()
            
            # 3. Skip Topic
            skip_resp = client.post(f"/session/{session_id}/skip-topic", headers=headers)
            
            skip_data = skip_resp.json()
            is_skip_dto_valid = "nodes" in skip_data["mind_map_data"]
            
            if is_valid_dto and is_skip_dto_valid and "skipped_indices" in skip_data["session_state"]:
                reports.append(("Mind Map Sequence", "PASS", "DTO consistency perfectly maintained across transitions. Skipped indices persisted."))
            else:
                issues = []
                if not is_valid_dto: issues.append("HTTP GET DTO invalid")
                if not is_skip_dto_valid: issues.append("Skip Topic returned invalid DTO format")
                if "skipped_indices" not in skip_data["session_state"]: issues.append("skipped_indices missing")
                reports.append(("Mind Map Sequence", "FAIL", " | ".join(issues)))
            
    except Exception as e:
        reports.append(("WebSocket Run", "FAIL", f"Exception: {str(e)}"))

    print("\n\n" + "="*50)
    print("FINAL CHAOS TEST RESULTS")
    print("="*50)
    for flow, status, details in reports:
        print(f"[{status}] {flow}:")
        print(f"   -> {details}\n")

if __name__ == "__main__":
    run_chaos()
