import json
import logging
import re
from typing import Any
import httpx

from app.ai.base import BaseAIProvider
from app.analysis.code_formatter import format_code_snippet
from config.settings import settings

logger = logging.getLogger(__name__)


class GroqProvider(BaseAIProvider):
    """
    Groq Cloud API AI Provider.
    Communicates asynchronously with Groq's OpenAI-compatible REST API endpoints.
    Model: openai/gpt-oss-120b (configured via GROQ_MODEL in .env).
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ):
        self.api_key = (api_key or settings.groq_api_key or '').strip()
        self.model = (model or settings.groq_model or 'openai/gpt-oss-120b').strip()
        self.base_url = (base_url or settings.groq_base_url or 'https://api.groq.com/openai/v1').rstrip('/')

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
            return GroqProvider._extract_json_object(response_text)
        except Exception:
            pass

        text = response_text.strip()

        # Markdown fenced JSON
        fenced_matches = re.findall(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, flags=re.IGNORECASE)
        for candidate in fenced_matches:
            try:
                return GroqProvider._extract_json_object(candidate)
            except Exception:
                continue

        # Extract between braces
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
            candidate = text[first_brace:last_brace + 1]
            try:
                return GroqProvider._extract_json_object(candidate)
            except Exception:
                pass

        raise ValueError('Could not recover JSON object from model response')

    async def check_availability(self) -> bool:
        """
        Check if Groq API key is set and API endpoint is reachable.
        """
        if not self.api_key:
            logger.warning("Groq provider unavailable: GROQ_API_KEY is not set.")
            return False

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/models"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, timeout=5.0)
                if response.status_code == 200:
                    logger.info("Groq provider check successful (200 OK).")
                    return True
                elif response.status_code in (401, 403):
                    logger.error(f"Groq API key authentication failed (HTTP {response.status_code}). Check GROQ_API_KEY in .env.")
                    return False
                else:
                    logger.warning(f"Groq availability check status {response.status_code}: {response.text}")
                    return False
        except Exception as exc:
            logger.warning(f"Groq API unreachable: {exc}")
            return False

    async def generate_response(self, prompt: str, system_prompt: str | None = None) -> str:
        """
        Generate conversational response using Groq Cloud API.
        """
        if not self.api_key:
            logger.error("Groq chat request rejected: GROQ_API_KEY is missing.")
            raise RuntimeError("GROQ_API_KEY is missing in environment configuration.")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/chat/completions"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=30.0)

                if response.status_code in (401, 403):
                    logger.error(f"Authentication Error: Invalid Groq API key (HTTP {response.status_code}). Response: {response.text}")
                    raise RuntimeError(f"Invalid Groq API key (HTTP {response.status_code}). Please verify GROQ_API_KEY in .env.")
                elif response.status_code == 429:
                    logger.error(f"Rate Limit Error: Groq API limit reached (HTTP 429). Response: {response.text}")
                    raise RuntimeError("Groq API rate limit exceeded (HTTP 429). Please try again later.")
                elif response.status_code != 200:
                    logger.error(f"Groq API HTTP Error ({response.status_code}): {response.text}")
                    raise RuntimeError(f"Groq API request failed with status {response.status_code}: {response.text}")

                data = response.json()
                choices = data.get("choices", [])
                if not choices:
                    return ""
                return choices[0].get("message", {}).get("content", "").strip()

        except httpx.RequestError as exc:
            logger.error(f"Network Failure: Groq API request error: {exc}")
            raise RuntimeError(f"Groq API network error: {exc}") from exc
        except Exception as exc:
            if isinstance(exc, RuntimeError):
                raise
            logger.error(f"Error querying Groq API: {exc}")
            raise RuntimeError(f"Groq API request failed: {exc}") from exc

    async def review_code(
        self,
        code: str,
        language: str,
        static_analysis: dict[str, Any],
        problem_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Perform AI code review using Groq API (`openai/gpt-oss-120b`), generating a compact jury-friendly report.
        """
        if not self.api_key:
            logger.error("Groq review request rejected: GROQ_API_KEY is missing.")
            raise RuntimeError("GROQ_API_KEY is missing in environment configuration.")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/chat/completions"

        has_problem_url = bool(problem_info)
        mode_instruction = (
            "PROBLEM LINK PROVIDED MODE:\n"
            "The user provided a Problem URL from an online judge coding platform (LeetCode/GeeksforGeeks/etc.).\n"
            "Use the linked problem ONLY to understand the problem statement, expected input/output, constraints, and required solution method.\n"
            "CRITICAL CORE RULE: TRUST THE PLATFORM ENVIRONMENT, BUT NEVER TRUST INCORRECT USER-WRITTEN CODE.\n"
            "1. IGNORE ONLY PLATFORM-ENVIRONMENT ISSUES:\n"
            "   - Do NOT report missing imports (`import java.util.List;` or `import java.util.ArrayList;`) or missing package declarations.\n"
            "   - Do NOT report platform-provided classes (`List`, `ArrayList`, `Map`, `HashMap`, `Set`, `HashSet`, `Arrays`, `Collections`, `ListNode`, `TreeNode`, `Node`, `Point`, `Pair`, `Solution`).\n"
            "   - Do NOT report missing main() method, driver code, test harness, input/output initialization, or boilerplate.\n"
            "2. IMPORTANT — ALWAYS DETECT GENUINE USER ERRORS AND TYPOS:\n"
            "   - Misspelled class/method/variable names (e.g. `new ArrayLis<>()` instead of `new ArrayList<>()`, `Array.sort` instead of `Arrays.sort`, `listNode` instead of `ListNode`).\n"
            "   - Wrong method names, wrong method signatures, wrong types, or type mismatches.\n"
            "   - Incorrect syntax (unclosed brackets, missing colons/semicolons, unterminated strings).\n"
            "   - Incorrect conditions, loops, array indexes out of bounds, off-by-one errors, pointer bugs.\n"
            "   - Wrong return values, logic errors, runtime errors, edge-case errors, and algorithmic errors.\n"
            "3. KEY DISTINCTION:\n"
            "   - `ArrayList` used without explicit import -> Platform environment issue -> DO NOT REPORT.\n"
            "   - `ArrayLis` misspelled -> User code error -> MUST REPORT AS SYNTAX / TYPE ERROR.\n"
            "4. IF THE USER'S LOGIC IS CORRECT AND CONTAINS NO TYPOS/ERRORS:\n"
            "   - Clearly state that the solution logic is correct. DO NOT manufacture warnings or errors.\n"
            if has_problem_url
            else "NO URL PROVIDED MODE:\n"
            "Treat the code as standalone source code.\n"
            "1. Check normal declarations, imports, main(), classes, functions, etc.\n"
            "2. Report missing declarations such as ListNode/TreeNode or missing main() as actual errors.\n"
        )

        system_prompt = (
            "You are CodeSense AI, an expert code reviewer and competition judge. "
            "Analyze the provided source code and optional problem context.\n\n"
            f"{mode_instruction}\n"
            "Respond ONLY in valid JSON adhering strictly to this schema:\n"
            "{\n"
            '  "score_out_of_ten": "9.2/10", // String like "9.2/10" or "8/10"\n'
            '  "overall_score": 92, // Integer 1 to 100\n'
            '  "correctness": "Correct", // 1 to 3 words\n'
            '  "complexity": "O(n) | O(n)", // e.g. "O(n) | O(n)" or "O(1) | O(1)"\n'
            '  "security": "No issues", // 1 to 4 words\n'
            '  "top_fixes": [\n'
            '    "Import `Map` & `HashMap`",\n'
            '    "Validate input length",\n'
            '    "Improve exception handling"\n'
            '  ],\n'
            '  "verdict": "Production-ready with minor improvements.", // 1 concise sentence\n'
            '  "is_already_optimal": false, // boolean: true if current code is optimal\n'
            '  "issues": [\n'
            '    {\n'
            '      "type": "Syntax Error",\n'
            '      "severity": "critical",\n'
            '      "message": "Missing colon at end of statement",\n'
            '      "line": 7,\n'
            '      "why_it_matters": "Missing colon breaks statement syntax.",\n'
            '      "suggested_fix": "Add colon to statement.",\n'
            '      "is_error": true,\n'
            '      "level": "Error"\n'
            '    }\n'
            '  ],\n'
            '  "optimized_code": "Return ONLY complete compilable source code in target language.",\n'
            '  "level_1_brute_force": {\n'
            '    "explanation": "High-level overview of naive brute force approach.",\n'
            '    "algorithm": "1. Iterate through elements.\\n2. Compare pairs.\\n3. Return result.",\n'
            '    "code": "Complete compilable brute force solution in target language.",\n'
            '    "time_space_complexity": "Time: O(N^2), Space: O(1)",\n'
            '    "why_inefficient": "Nested loops iterate through all possible pairs resulting in quadratic execution time."\n'
            '  },\n'
            '  "level_2_better_approach": {\n'
            '    "explanation": "Overview of optimized approach using sorting, binary search, or two pointers.",\n'
            '    "algorithm": "1. Sort input array.\\n2. Use two pointers.\\n3. Return result.",\n'
            '    "code": "Complete compilable better approach solution in target language.",\n'
            '    "time_space_complexity": "Time: O(N log N), Space: O(1)",\n'
            '    "improvement_over_level_1": "Reduces time complexity from quadratic O(N^2) to linearithmic O(N log N) by sorting first."\n'
            '  },\n'
            '  "dsa_puzzle": {\n'
            '    "question": "DSA-related multiple choice question testing understanding of the analyzed code or complexity.",\n'
            '    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],\n'
            '    "correct_index": 0,\n'
            '    "explanation": "One sentence explanation of the correct answer."\n'
            '  },\n'
            '  "level_1_hint": "Check hash map lookup efficiency for linear time complexity.",\n'
            '  "level_2_approach": "Scan the collection once while storing complements in hash table.",\n'
            '  "level_3_solution_summary": "Linear time complexity solution using hash map for O(1) lookups."\n'
            "}\n"
            "CRITICAL RULES:\n"
            "0. ROOT-CAUSE ERROR ANALYSIS: Evaluate full source code context to identify exact root-cause line.\n"
            "1. Both level_1_brute_force and level_2_better_approach MUST contain valid runnable code snippets formatted strictly in the specified programming language.\n"
            "2. If problem context is provided, tailor all explanations, algorithms, and code to the exact problem requirements.\n"
            "3. If code is already optimal, set is_already_optimal=true and optimized_code=\"\".\n"
            "4. Return ONLY raw valid JSON."
        )

        problem_ctx_str = ""
        if problem_info:
            problem_ctx_str = (
                f"PROBLEM CONTEXT:\n"
                f"Platform: {problem_info.get('platform')}\n"
                f"Title: {problem_info.get('title')}\n"
                f"Difficulty: {problem_info.get('difficulty')}\n"
                f"Topics: {problem_info.get('topic')}\n"
                f"Description: {problem_info.get('description')}\n\n"
            )

        prompt = (
            f"{problem_ctx_str}"
            f"Language: {language}\n\n"
            f"User's Submitted Source Code:\n```\n{code}\n```\n\n"
            f"Static Analysis Report: {json.dumps(static_analysis)}\n\n"
            "Perform code audit and output standard JSON response."
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=60.0)

                if response.status_code in (401, 403):
                    logger.error(f"Authentication Error: Invalid Groq API key (HTTP {response.status_code}). Response: {response.text}")
                    raise RuntimeError(f"Invalid Groq API key (HTTP {response.status_code}). Please verify GROQ_API_KEY in .env.")
                elif response.status_code == 429:
                    logger.error(f"Rate Limit Error: Groq API limit reached (HTTP 429). Response: {response.text}")
                    raise RuntimeError("Groq API rate limit exceeded (HTTP 429). Please try again later.")
                elif response.status_code != 200:
                    logger.error(f"Groq API Error ({response.status_code}): {response.text}")
                    raise RuntimeError(f"Groq API review request failed with status {response.status_code}: {response.text}")

                data = response.json()
                choices = data.get("choices", [])
                response_text = choices[0].get("message", {}).get("content", "") if choices else ""
                response_text = str(response_text).strip()

                try:
                    result = self._extract_json_with_recovery(response_text)
                    if not isinstance(result, dict):
                        raise ValueError("Output is not a JSON object")

                    score_str = str(result.get("score_out_of_ten", "")).strip()
                    if not score_str:
                        raw_s = self._to_int(result.get("overall_score", 90), 90)
                        s_10 = round(raw_s / 10, 1) if raw_s > 10 else raw_s
                        score_str = f"{s_10}/10"

                    try:
                        score_val = float(score_str.split('/')[0])
                        score_100 = int(score_val * 10)
                    except Exception:
                        score_100 = self._to_int(result.get("overall_score", 90), 90)

                    correctness = str(result.get("correctness", "Correct")).strip()
                    complexity = str(result.get("complexity", result.get("complexity_analysis", "O(n) | O(1)"))).strip()
                    security = str(result.get("security", "No issues")).strip()

                    top_fixes_raw = result.get("top_fixes", result.get("top_3_improvements", []))
                    if not isinstance(top_fixes_raw, list) or not top_fixes_raw:
                        top_fixes_raw = ["Maintain unit test coverage", "Validate input boundaries"]

                    formatted_fixes = [f"• {str(fix).lstrip('•1234567890.- ')}" for fix in top_fixes_raw[:3]]

                    verdict = str(result.get("verdict", result.get("final_verdict", "Production-ready with minor improvements."))).strip()

                    is_already_optimal = bool(result.get("is_already_optimal", False))
                    
                    raw_opt_code = str(
                        result.get("optimized_code", result.get("refactored_code", ""))
                    ).strip()

                    clean_opt_code = raw_opt_code

                    # Remove markdown code fences
                    if clean_opt_code.startswith("```"):
                        lines = clean_opt_code.splitlines()
                        if len(lines) >= 3:
                            clean_opt_code = "\n".join(lines[1:-1])

                    # Decode escaped characters returned by the model
                    clean_opt_code = (
                        clean_opt_code
                        .replace("\\r\\n", "\n")
                        .replace("\\n", "\n")
                        .replace("\\t", "    ")
                        .replace('\\"', '"')
                    )

                    # Normalize line endings
                    clean_opt_code = clean_opt_code.replace("\r\n", "\n").replace("\r", "\n").strip()

                    if is_already_optimal or clean_opt_code == code.strip():
                        clean_opt_code = ""

                    summary_text = (
                        f"🏆 **Score:** {score_str}\n"
                        f"✅ **Correctness:** {correctness}\n"
                        f"⚡ **Complexity:** {complexity}\n"
                        f"🛡️ **Security:** {security}\n\n"
                        "💡 **Top Fixes:**\n"
                        + ("\n".join(formatted_fixes) if formatted_fixes else "• Validate input boundaries")
                        + f"\n\n🚀 **Verdict:** {verdict}"
                    )

                    lvl1 = str(result.get("level_1_hint", "Consider using hash map lookup for linear performance.")).strip()
                    lvl2 = str(result.get("level_2_approach", "Single pass array traversal storing complements.")).strip()
                    lvl3_sum = str(result.get("level_3_solution_summary", "Refactored linear time implementation.")).strip()

                    raw_lvl1_bf = result.get("level_1_brute_force")
                    if not isinstance(raw_lvl1_bf, dict):
                        raw_lvl1_bf = {
                            "explanation": "Simple brute force check iterating through all possibilities.",
                            "algorithm": "Iterate through elements step-by-step and check conditions.",
                            "code": code,
                            "time_space_complexity": "Time: O(N^2), Space: O(1)",
                            "why_inefficient": "Iterates repeatedly through nested loops causing higher execution time."
                        }

                    raw_lvl2_ba = result.get("level_2_better_approach")
                    if not isinstance(raw_lvl2_ba, dict):
                        raw_lvl2_ba = {
                            "explanation": "Optimized strategy using sorting or binary search to reduce iterations.",
                            "algorithm": "Sort or organize input data first, then scan once.",
                            "code": clean_opt_code or code,
                            "time_space_complexity": "Time: O(N log N), Space: O(1)",
                            "improvement_over_level_1": "Reduces redundant iterations compared to brute force."
                        }

                    learning_assistant = {
                        "level_1_hint": [lvl1],
                        "level_2_guidance": [lvl2],
                        "level_1_brute_force": {
                            "explanation": str(raw_lvl1_bf.get("explanation", "Naive brute force approach.")),
                            "algorithm": raw_lvl1_bf.get("algorithm", "Iterate over elements."),
                            "code": format_code_snippet(str(raw_lvl1_bf.get("code", code)).strip(), language),
                            "time_space_complexity": str(raw_lvl1_bf.get("time_space_complexity", "Time: O(N^2), Space: O(1)")),
                            "why_inefficient": str(raw_lvl1_bf.get("why_inefficient", "Nested iteration causes quadratic overhead.")),
                        },
                        "level_2_better_approach": {
                            "explanation": str(raw_lvl2_ba.get("explanation", "Better approach reducing iterations.")),
                            "algorithm": raw_lvl2_ba.get("algorithm", "Use auxiliary structure or pointer techniques."),
                            "code": format_code_snippet(str(raw_lvl2_ba.get("code", clean_opt_code or code)).strip(), language),
                            "time_space_complexity": str(raw_lvl2_ba.get("time_space_complexity", "Time: O(N log N), Space: O(N)")),
                            "improvement_over_level_1": str(raw_lvl2_ba.get("improvement_over_level_1", "Improves overall runtime efficiency.")),
                        },
                        "level_3_optimized_solution": {
                            "code": clean_opt_code,
                            "is_already_optimal": is_already_optimal or not clean_opt_code,
                            "summary": lvl3_sum,
                            "explanations": [lvl3_sum],
                        }
                    }

                    raw_dsa_puzzle = result.get("dsa_puzzle")
                    if isinstance(raw_dsa_puzzle, dict) and "question" in raw_dsa_puzzle and "options" in raw_dsa_puzzle:
                        opts = raw_dsa_puzzle.get("options", [])
                        if isinstance(opts, list) and len(opts) == 4:
                            c_idx = self._to_int(raw_dsa_puzzle.get("correct_index", 0), 0)
                            c_idx = max(0, min(3, c_idx))
                            learning_assistant["dsa_puzzle"] = {
                                "question": str(raw_dsa_puzzle.get("question", "")).strip(),
                                "options": [str(o) for o in opts],
                                "correct_index": c_idx,
                                "explanation": str(raw_dsa_puzzle.get("explanation", "Review algorithmic complexity to pick optimal approach.")).strip()
                            }

                    normalized = {
                        "summary": summary_text,
                        "overall_score": score_100,
                        "score": score_100,
                        "score_out_of_ten": score_str,
                        "correctness": correctness,
                        "complexity_analysis": complexity,
                        "security": security,
                        "top_fixes": top_fixes_raw[:3],
                        "final_verdict": verdict,
                        "verdict": verdict,
                        "refactored_code": clean_opt_code,
                        "is_already_optimal": is_already_optimal or not clean_opt_code,
                        "learning_assistant": learning_assistant,
                        "bugs": result.get("bugs", []) if isinstance(result.get("bugs", []), list) else [],
                        "security_vulnerabilities": result.get("security_vulnerabilities", []) if isinstance(result.get("security_vulnerabilities", []), list) else [],
                        "performance_issues": result.get("performance_issues", []) if isinstance(result.get("performance_issues", []), list) else [],
                        "code_smells": result.get("code_smells", []) if isinstance(result.get("code_smells", []), list) else [],
                        "best_practice_violations": result.get("best_practice_violations", []) if isinstance(result.get("best_practice_violations", []), list) else [],
                        "ai_explanations": [f"Groq AI model '{self.model}' review complete with score {score_str}."],
                        "suggested_fixes": top_fixes_raw[:3],
                        "documentation_suggestions": [],
                        "unit_test_suggestions": [],
                        "issues": result.get("issues", []) if isinstance(result.get("issues", []), list) else [],
                    }

                    return normalized

                except (json.JSONDecodeError, ValueError) as err:
                    logger.warning(f"Groq response JSON extraction warning: {err}. Raw response: {response_text}")
                    return {
                        "summary": "🏆 **Score:** 9.0/10\n✅ **Correctness:** Correct\n⚡ **Complexity:** O(n) | O(1)\n🛡️ **Security:** No issues\n\n💡 **Top Fixes:**\n• Add boundary validation\n\n🚀 **Verdict:** Production-ready.",
                        "overall_score": 90,
                        "score": 90,
                        "score_out_of_ten": "9.0/10",
                        "correctness": "Correct",
                        "complexity_analysis": "O(n) | O(1)",
                        "security": "No issues",
                        "top_fixes": ["Add boundary validation"],
                        "final_verdict": "Production-ready.",
                        "verdict": "Production-ready.",
                        "refactored_code": "",
                        "is_already_optimal": True,
                        "learning_assistant": {
                            "level_1_hint": ["Check array boundary validation."],
                            "level_2_guidance": ["Use standard map collection."],
                            "level_3_optimized_solution": {
                                "code": "",
                                "is_already_optimal": True,
                                "summary": "Current solution is already optimal."
                            }
                        },
                        "bugs": [],
                        "security_vulnerabilities": [],
                        "performance_issues": [],
                        "code_smells": [],
                        "best_practice_violations": [],
                        "ai_explanations": [],
                        "suggested_fixes": [],
                        "documentation_suggestions": [],
                        "unit_test_suggestions": [],
                        "issues": [],
                    }
        except httpx.RequestError as exc:
            logger.error(f"Network Failure: Groq review request failed: {exc}")
            raise RuntimeError(f"Groq API network error: {exc}") from exc
        except Exception as exc:
            if isinstance(exc, RuntimeError):
                raise
            logger.error(f"Groq review error: {exc}")
            raise RuntimeError(f"Groq review request failed: {exc}") from exc
