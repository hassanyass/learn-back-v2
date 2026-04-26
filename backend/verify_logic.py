import json
import logging

class MockWebSocket:
    def __init__(self):
        self.emitted = []
    
    async def send_json(self, payload):
        self.emitted.append(payload)

logger = logging.getLogger("test")
logging.basicConfig(level=logging.ERROR)

async def test_dual_emission(topic_checkpoint=True, fail_normalization=False):
    websocket = MockWebSocket()
    
    # Mock result from SessionService
    result = {
        "kido_response": "I learned so much!",
        "widget_type": "TEXT",
        "advanced": True,
        "topic_checkpoint": topic_checkpoint,
        "mind_map_data": {"topic_title": "Biology", "nodes": []},
        "session_state": {
            "topics": [
                {
                    "topic_title": "Biology",
                    "points": [
                        {
                            "point_title": "Cell Structure",
                            "kido_memory": {
                                "title": "Cells",
                                "summary": "Cells are the building blocks of life."
                            }
                        },
                        {
                            "point_title": "DNA",
                            "kido_memory": {
                                "title": "Genetics",
                                "summary": "DNA carries genetic instructions."
                            }
                        }
                    ]
                }
            ]
        }
    }
    
    if fail_normalization:
        # Corrupt the structure to force an exception
        result["session_state"]["topics"] = None
    
    # --- EXACT ROUTER LOGIC COPY ---
    response_data = {
        "kido_response": result["kido_response"],
        "widget_type": result["widget_type"],
        "advanced": result["advanced"],
        "session_state": result["session_state"],
    }
    
    if result.get("topic_checkpoint"):
        response_data["topic_checkpoint"] = True
        response_data["mind_map_data"] = result.get("mind_map_data", {})
        
    await websocket.send_json({
        "type": "kido_response",
        "data": response_data,
    })
    
    # Dual Emission: Normalization Adapter (Pure side-process)
    if result.get("topic_checkpoint"):
        try:
            topics = result["session_state"].get("topics", [])
            kwl_obj = {"k": [], "w": [], "l": []}
            for topic in topics:
                for point in topic.get("points", []):
                    mem = point.get("kido_memory")
                    if mem and isinstance(mem, dict):
                        if mem.get("title") and mem.get("summary"):
                            kwl_obj["l"].append({
                                "title": mem["title"],
                                "summary": mem["summary"]
                            })
            
            await websocket.send_json({
                "type": "mind_map_checkpoint",
                "state": {
                    "topics": topics,
                    "kwl": kwl_obj
                },
                "mind_map_data": result.get("mind_map_data", {})
            })
        except Exception as e:
            logger.error("Normalization adapter failed: %s", e)
    # --- END ROUTER LOGIC COPY ---
    
    return websocket.emitted

import asyncio

async def run_verification():
    print("========================================")
    print("1. RUNNING NORMAL DUAL EMISSION TEST")
    print("========================================")
    emitted = await test_dual_emission()
    
    for i, payload in enumerate(emitted):
        print(f"\n[Payload {i+1}] Type: {payload['type']}")
        if payload['type'] == 'mind_map_checkpoint':
            print("--- TRANSFORMED KWL OUTPUT ---")
            print(json.dumps(payload['state']['kwl'], indent=2))
        else:
            # Don't print the whole state for kido_response to save space
            print(f"Has session_state: {'session_state' in payload['data']}")
            
    print("\n========================================")
    print("2. RUNNING FAILURE SAFETY TEST")
    print("========================================")
    emitted_fail = await test_dual_emission(fail_normalization=True)
    
    print("\nEmitted Payloads after forced failure:")
    for i, payload in enumerate(emitted_fail):
        print(f"[Payload {i+1}] Type: {payload['type']}")

if __name__ == "__main__":
    asyncio.run(run_verification())
