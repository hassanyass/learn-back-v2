import asyncio
import inspect
from backend.services.session_service import SessionService
from backend.services.kido_service import KidoService
from backend.prompts.kido_prompts import KIDO_SYSTEM_PROMPT

def run_trace():
    print("Checking KidoService signature...")
    sig = inspect.signature(KidoService.generate_response)
    params = list(sig.parameters.keys())
    print("Signature:", params)

    assert "instruction_for_kido" in params
    assert "identified_metaphors" in params
    assert "conversation_history" in params
    assert "kido_learned_summary" in params

    print("\nChecking Prompt Constraints...")
    assert "RESPONSE GENERATION MODULE ONLY" in KIDO_SYSTEM_PROMPT
    assert "instruction_for_kido (highest priority teaching directive)" in KIDO_SYSTEM_PROMPT
    print("Prompt rules present.")

    print("\nTrace Validation Complete: All guarantees satisfied.")

if __name__ == "__main__":
    run_trace()
