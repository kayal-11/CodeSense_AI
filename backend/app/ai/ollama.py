import json
import logging
import re
import hashlib
from typing import Any
import httpx
from app.ai.base import BaseAIProvider
from config.settings import settings

logger = logging.getLogger(__name__)


class OllamaProvider(BaseAIProvider):
    """
    Ollama-based AI Provider.
    Calls a local Ollama instance asynchronously.
    """

    def __init__(self, base_url: str | None = None, model: str | None = None):
        self.base_url = base_url or settings.ollama_base_url
        self.model = model or settings.ollama_model

    @staticmethod
    def _to_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _extract_json_object(response_text: str) -> dict[str, Any]:
        text = response_text.strip()
        if not text:
            raise ValueError('Empty model response')

        # Case 1: already strict JSON
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, str):
            nested = json.loads(parsed)
            if isinstance(nested, dict):
                return nested

        raise ValueError('Response is not a JSON object')

    @staticmethod
    def _extract_json_with_recovery(response_text: str) -> dict[str, Any]:
        try:
            return OllamaProvider._extract_json_object(response_text)
        except Exception:
            pass

        text = response_text.strip()

        # Case 2: markdown fenced JSON
        fenced_matches = re.findall(r"```(?:json)?\\s*(\{[\s\S]*?\})\\s*```", text, flags=re.IGNORECASE)
        for candidate in fenced_matches:
            try:
                return OllamaProvider._extract_json_object(candidate)
            except Exception:
                continue

        # Case 3: additional text around JSON payload
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
            candidate = text[first_brace:last_brace + 1]
            try:
                return OllamaProvider._extract_json_object(candidate)
            except Exception:
                pass

        raise ValueError('Could not recover JSON object from model response')

    async def check_availability(self) -> bool:
        """
        Check if local Ollama daemon is reachable and the configured model is available.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/api/tags", timeout=2.5)
                response.raise_for_status()
                data = response.json()
                models = data.get("models", []) if isinstance(data, dict) else []
                model_names = [str(item.get("name", "")) for item in models if isinstance(item, dict)]

                # Accept exact match (qwen2.5-coder) or tagged variants (qwen2.5-coder:7b)
                return any(name == self.model or name.startswith(f"{self.model}:") for name in model_names)
        except Exception:
            return False

    async def generate_response(self, prompt: str, system_prompt: str | None = None) -> str:
        """
        Generate conversational responses using Ollama.
        """
        url = f"{self.base_url}/api/chat"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                return data.get("message", {}).get("content", "").strip()
        except Exception as exc:
            logger.error(f"Error querying Ollama API: {exc}")
            raise RuntimeError(f"Ollama API request failed: {exc}") from exc

    async def review_code(
        self,
        code: str,
        language: str,
        static_analysis: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Perform an AI code review using Ollama, enforcing JSON response schema.
        """
        system_prompt = (
            "You are an elite code review and security assistant. "
            "Your task is to analyze the provided source code, taking into account static analysis output. "
            "You MUST respond ONLY in valid JSON. Do not include markdown codeblocks or extra text. "
            "The JSON output must follow this schema:\n"
            "{\n"
            '  "summary": "High-level summary of code quality and risk.",\n'
            '  "overall_score": 85,\n'
            '  "bugs": [],\n'
            '  "security_vulnerabilities": [],\n'
            '  "performance_issues": [],\n'
            '  "code_smells": [],\n'
            '  "complexity_analysis": "",\n'
            '  "best_practice_violations": [],\n'
            '  "ai_explanations": [],\n'
            '  "suggested_fixes": [],\n'
            '  "refactored_code": "",\n'
            '  "documentation_suggestions": [],\n'
            '  "unit_test_suggestions": []\n'
            "}\n"
            "Use concise, actionable outputs. FIRST check for detectable errors (syntax, compilation, runtime, undefined variables, missing imports, type mismatches) and prioritize error items in bugs and suggested_fixes."
        )

        prompt = (
            f"Language: {language}\n\n"
            f"Source Code:\n```\n{code}\n```\n\n"
            f"Static Analysis Report: {json.dumps(static_analysis)}\n\n"
            "Review the code and provide your audit report in JSON."
        )

        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system_prompt,
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0,
                "top_p": 1,
                "repeat_penalty": 1,
                "seed": int(hashlib.sha256(code.encode('utf-8')).hexdigest()[:8], 16),
            },
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=45.0)
                response.raise_for_status()
                data = response.json()
                response_payload = data.get("response", "")
                response_text = response_payload if isinstance(response_payload, str) else json.dumps(response_payload)
                response_text = response_text.strip()

                # Parse JSON output
                try:
                    result = self._extract_json_with_recovery(response_text)
                    # Basic validation of keys
                    if not isinstance(result, dict):
                        raise ValueError("Output is not a JSON object")
                    normalized = {
                        "summary": result.get("summary", "Review complete."),
                        "overall_score": self._to_int(result.get("overall_score", 90), 90),
                        "bugs": result.get("bugs", []) if isinstance(result.get("bugs", []), list) else [],
                        "security_vulnerabilities": result.get("security_vulnerabilities", []) if isinstance(result.get("security_vulnerabilities", []), list) else [],
                        "performance_issues": result.get("performance_issues", []) if isinstance(result.get("performance_issues", []), list) else [],
                        "code_smells": result.get("code_smells", []) if isinstance(result.get("code_smells", []), list) else [],
                        "complexity_analysis": result.get("complexity_analysis", ""),
                        "best_practice_violations": result.get("best_practice_violations", []) if isinstance(result.get("best_practice_violations", []), list) else [],
                        "ai_explanations": result.get("ai_explanations", []) if isinstance(result.get("ai_explanations", []), list) else [],
                        "suggested_fixes": result.get("suggested_fixes", []) if isinstance(result.get("suggested_fixes", []), list) else [],
                        "refactored_code": result.get("refactored_code", ""),
                        "documentation_suggestions": result.get("documentation_suggestions", []) if isinstance(result.get("documentation_suggestions", []), list) else [],
                        "unit_test_suggestions": result.get("unit_test_suggestions", []) if isinstance(result.get("unit_test_suggestions", []), list) else [],
                    }

                    merged_issues: list[dict[str, Any]] = []
                    for group_name in ["bugs", "security_vulnerabilities", "performance_issues", "code_smells", "best_practice_violations"]:
                        group_items = normalized.get(group_name, [])
                        if isinstance(group_items, list):
                            for item in group_items:
                                if isinstance(item, dict):
                                    merged_issues.append({
                                        "type": item.get("type", group_name.replace("_", " ").title()),
                                        "severity": item.get("severity", "medium"),
                                        "message": item.get("message", "Issue detected."),
                                        "line": self._to_int(item.get("line", 1), 1),
                                    })

                    normalized["issues"] = merged_issues
                    normalized["score"] = normalized["overall_score"]
                    return normalized
                except (json.JSONDecodeError, ValueError) as err:
                    logger.warning(f"Ollama returned invalid JSON, attempting raw extract: {err}. Response: {response_text}")
                    # In case format constraint was partially ignored, fallback:
                    return {
                        "summary": "AI generated review output, but it could not be parsed as standard JSON. Review the code content manually.",
                        "overall_score": 70,
                        "bugs": [],
                        "security_vulnerabilities": [],
                        "performance_issues": [],
                        "code_smells": [],
                        "complexity_analysis": "Complexity analysis unavailable due to invalid model output.",
                        "best_practice_violations": [],
                        "ai_explanations": ["Failed to parse AI response as JSON."],
                        "suggested_fixes": [],
                        "refactored_code": "",
                        "documentation_suggestions": [],
                        "unit_test_suggestions": [],
                        "issues": [{"type": "AI Error", "severity": "medium", "message": "Failed to parse AI response as JSON.", "line": 1}],
                        "score": 70,
                        "raw_response": response_text
                    }
        except Exception as exc:
            logger.error(f"Ollama review request failed: {exc}")
            raise RuntimeError(f"Ollama review request failed: {exc}") from exc
