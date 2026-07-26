import asyncio
import logging
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from config.settings import settings
from app.ai.groq import GroqProvider
from app.ai.ollama import OllamaProvider
from app.services.llm_service import LLMService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify_groq")


async def main():
    print("=== CodeSense AI - Groq Cloud API Migration Verification ===")
    print(f"Configured LLM_PROVIDER: {settings.llm_provider}")
    print(f"Configured GROQ_MODEL: {settings.groq_model}")
    print(f"GROQ_API_KEY set: {'Yes' if bool(settings.groq_api_key) else 'No (empty key)'}")

    # 1. Test GroqProvider initialization and availability check
    groq_provider = GroqProvider()
    is_available = await groq_provider.check_availability()
    print(f"\n1. GroqProvider Availability Check: {is_available}")

    # 2. Test LLMService initialization & provider detection
    service = LLMService()
    configured_provider = service.get_configured_provider()
    active_provider = await service.get_active_provider()
    print(f"2. LLMService Configured Provider: {configured_provider.__class__.__name__}")
    print(f"   LLMService Active Provider: {active_provider.__class__.__name__}")

    # 3. Test Chat functionality
    print("\n3. Testing Chat generation...")
    test_prompt = "In one short sentence, what is a buffer overflow?"
    chat_response = await service.chat(test_prompt)
    print(f"Chat Response:\n{chat_response}")

    # 4. Test Code Review functionality
    print("\n4. Testing Code Review...")
    sample_code = """
def authenticate(user_input_pass):
    secret = "hardcoded_admin_key"
    if user_input_pass == secret:
        return True
    return False
"""
    static_analysis = {
        "score": 75,
        "summary": "Detected hardcoded password in auth method.",
        "issues": [
            {
                "type": "Security Vulnerability",
                "severity": "high",
                "message": "Hardcoded secret key found in source code.",
                "line": 3
            }
        ]
    }

    review_result = await service.review(sample_code, "python", static_analysis)
    print(f"Review Summary: {review_result.get('summary')}")
    print(f"Overall Score: {review_result.get('score')}")
    print(f"Issues Count: {len(review_result.get('issues', []))}")

    # 5. Test error handling for invalid API key
    print("\n5. Testing Error Handling (Invalid API key scenario)...")
    invalid_groq = GroqProvider(api_key="invalid_test_key_12345")
    is_invalid_avail = await invalid_groq.check_availability()
    print(f"Invalid API Key Availability Check (expected False): {is_invalid_avail}")

    try:
        await invalid_groq.generate_response("Test prompt with invalid key")
    except RuntimeError as exc:
        print(f"Caught expected exception for invalid key: {exc}")

    # 6. Test provider switching (Ollama provider selection)
    print("\n6. Testing Provider Switching (LLM_PROVIDER=ollama simulation)...")
    settings.llm_provider = 'ollama'
    ollama_service = LLMService()
    ollama_configured = ollama_service.get_configured_provider()
    print(f"Configured Provider for LLM_PROVIDER=ollama: {ollama_configured.__class__.__name__}")
    assert isinstance(ollama_configured, OllamaProvider), "Expected OllamaProvider when LLM_PROVIDER=ollama"
    settings.llm_provider = 'groq' # Restore to groq

    print("\n=== All Verification Steps Completed Successfully ===")

if __name__ == "__main__":
    asyncio.run(main())
