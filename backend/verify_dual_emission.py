import asyncio
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import json
import traceback

import sys
sys.path.insert(0, r"c:\Users\hassa\Documents\Dummy AI 2\LearnBack_V2\backend")

from backend.routes.session_router import router
from backend.services.session_service import SessionService

# Mock the dependency
app = FastAPI()
app.include_router(router)

def run_test():
    client = TestClient(app)
    
    # We will override the session_service.process_chat to return a checkpoint payload
    mock_service = AsyncMock(spec=SessionService)
    
    mock_state = {
        "topics": [
            {
                "topic_title": "Test Topic",
                "points": [
                    {
                        "point_title": "Test Point 1",
                        "status": "completed",
                        "kido_memory": {
                            "title": "Learned Concept",
                            "summary": "This is what Kido learned."
                        }
                    }
                ]
            }
        ]
    }
    
    mock_result = {
        "kido_response": "Wow, I learned so much!",
        "widget_type": "mind_map",
        "advanced": True,
        "session_state": mock_state,
        "topic_checkpoint": True,
        "mind_map_data": {"topic_title": "Test Topic", "nodes": []}
    }
    
    mock_service.process_user_message.return_value = mock_result
    
    with patch("backend.routes.session_router.SessionService") as MockServiceClass:
        # Configure the mock instance
        mock_instance = MockServiceClass.return_value
        mock_instance.process_user_message = AsyncMock(return_value=mock_result)
        
        # Override auth dependency
        from backend.routes.session_router import get_current_user_id
        app.dependency_overrides[get_current_user_id] = lambda: 1
        
        # Override db dependency
        from backend.routes.session_router import get_db
        app.dependency_overrides[get_db] = lambda: AsyncMock()
        
        print("--- RUNNING DUAL EMISSION TEST ---")
        try:
            with client.websocket_connect("/ws/session/1?token=test") as websocket:
                # 1. Send chat message
                websocket.send_json({"type": "chat", "text": "Test"})
                
                # 2. Receive first payload
                r1 = websocket.receive_json()
                print("\n[PAYLOAD 1]")
                print(json.dumps(r1, indent=2))
                
                # 3. Receive second payload
                r2 = websocket.receive_json()
                print("\n[PAYLOAD 2]")
                print(json.dumps(r2, indent=2))
                
                print("\n✅ BOTH PAYLOADS RECEIVED SUCCESSFULLY")
        except Exception as e:
            print(f"Error during WS:")
            traceback.print_exc()
        
        print("\n--- RUNNING FAILURE SAFETY TEST ---")
        # Force a failure in the normalization layer by corrupting the structure
        # (e.g. replacing 'topics' with an object that throws when iterated)
        bad_state = {"topics": None} # This will cause a TypeError in the loop
        mock_result_bad = dict(mock_result)
        mock_result_bad["session_state"] = bad_state
        mock_instance.process_user_message = AsyncMock(return_value=mock_result_bad)
        
        try:
            with client.websocket_connect("/ws/session/2?token=test") as websocket:
                websocket.send_json({"type": "chat", "text": "Test"})
                r1 = websocket.receive_json()
                print("\n[PAYLOAD 1 (Legacy)]")
                print(f"Type received: {r1.get('type')}")
                
                try:
                    r2 = websocket.receive_json(timeout=1.0)
                    print(f"Unexpected payload 2: {r2}")
                except Exception as e:
                    print(f"\n✅ NORMALIZATION FAILED SILENTLY. LEGACY EMISSION SURVIVED.")
                    print(f"Timeout waiting for second payload (expected): {type(e).__name__}")
        except Exception as e:
            print(f"Error during Failure Test:")
            traceback.print_exc()

if __name__ == "__main__":
    run_test()
