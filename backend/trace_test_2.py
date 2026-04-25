import asyncio
from backend.services.kido_service import KidoService

async def run_test():
    kido = KidoService()
    
    class MockLLM:
        async def call_with_fallback(self, prompt):
            # Suppress print to avoid windows charmap errors
            return '{"kido_response": "Dummy response", "widget_type": "text", "widget_data": null}'

    kido.llm_manager = MockLLM()
    
    try:
        result = await kido.generate_response(
            session_state={"current_difficulty": 1, "current_topic_index": 0, "topics": [{"topic_title": "Test Topic"}]},
            evaluator_label="CORRECT",
            user_message="I think it's A.",
            current_point="Point A",
            instruction_for_kido="",
            identified_metaphors="",
            conversation_history="",
            kido_learned_summary=""
        )
        print("Crash Test: PASSED (No crash)")
        if "Dummy response" in result["kido_response"]:
             print("Result returned correctly.")
             
        # Check prompt dominance
        from backend.prompts.kido_prompts import KIDO_SYSTEM_PROMPT
        assert "RESPONSE GENERATION MODULE ONLY" in KIDO_SYSTEM_PROMPT
        assert "You are NOT allowed to re-evaluate correctness." in KIDO_SYSTEM_PROMPT
        print("Prompt Dominance Test: PASSED")
             
    except Exception as e:
        print(f"Crash Test: FAILED with {e}")

if __name__ == "__main__":
    asyncio.run(run_test())
