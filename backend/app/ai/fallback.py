import re
from typing import Any
from app.ai.base import BaseAIProvider
from app.analysis.code_formatter import format_code_snippet
from config.settings import settings


class FallbackProvider(BaseAIProvider):
    """
    Fallback AI Provider.
    Used when primary AI provider (Groq) is offline, invalid, or unavailable.
    Provides helpful static code patterns and message routing.
    """

    async def check_availability(self) -> bool:
        # The fallback provider is always available as a local rule engine.
        return True

    async def generate_response(self, prompt: str, system_prompt: str | None = None) -> str:
        prompt_lower = prompt.lower()
        provider_name = (settings.llm_provider or 'groq').capitalize()

        # Simple conversational simulated replies
        if "hello" in prompt_lower or "hi" in prompt_lower:
            reply = (
                f"Hello! I am your CodeSense review copilot. Currently, the configured {provider_name} provider is offline or unconfigured. "
                "I am running in heuristic mode. You can ask me general questions about security, "
                "performance, or code structure, but conversational reasoning will be limited."
            )
        elif "security" in prompt_lower or "vuln" in prompt_lower:
            reply = (
                "[Offline Mode] To ensure code security, always: \n"
                "1. Use parameterized queries/ORMs instead of dynamic SQL strings.\n"
                "2. Avoid using functions like eval(), exec(), or child_process.exec() with untrusted inputs.\n"
                "3. Enable strict validation and sanitization for all input fields."
            )
        elif "performance" in prompt_lower or "slow" in prompt_lower:
            reply = (
                "[Offline Mode] Common performance suggestions:\n"
                "- Cache expensive database/API requests.\n"
                "- Avoid nested loops for O(N^2) complexity where O(N log N) is possible.\n"
                "- Keep database transactions short and use appropriate indexes."
            )
        elif "explain" in prompt_lower or "how to" in prompt_lower:
            reply = (
                f"[Offline Mode] I can explain code snippets. Please configure a valid API key or endpoint for provider '{provider_name}' "
                "for interactive explanation."
            )
        else:
            reply = (
                f"*(Note: {provider_name} AI provider is offline or unconfigured. Running in rule-based fallback mode)*\n\n"
                f"I received your message: Let me know how I can help. To enable full AI chat capabilities, "
                f"please verify your settings for provider '{provider_name}' in .env."
            )
        return reply

    async def review_code(
        self,
        code: str,
        language: str,
        static_analysis: dict[str, Any],
        problem_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        issues = []
        static_findings = static_analysis.get("issues", []) if isinstance(static_analysis, dict) else []
        provider_name = (settings.llm_provider or 'groq').capitalize()

        has_problem_url = bool(problem_info)

        # Start with static analysis findings
        for finding in static_findings:
            msg = str(finding.get("message", "")).lower()
            if has_problem_url and any(kw in msg for kw in [
                'main method', 'missing main', 'undefined reference to main', 'driver', 'input/output',
                'scanner', 'stdin', 'initialization', 'used without importing', 'missing import'
            ]):
                continue
            item = {
                "type": finding.get("type", "Static analysis warning"),
                "severity": finding.get("severity", "medium"),
                "message": finding.get("message", "Issue detected by static rules."),
                "line": finding.get("line", 1)
            }
            if finding.get("why_it_matters"):
                item["why_it_matters"] = finding.get("why_it_matters")
            if finding.get("suggested_fix"):
                item["suggested_fix"] = finding.get("suggested_fix")
            if "is_error" in finding:
                item["is_error"] = finding.get("is_error")
            issues.append(item)

        # Apply basic heuristics to find common issues across different languages
        code_lines = code.split("\n")

        for idx, line in enumerate(code_lines):
            line_num = idx + 1

            # Check for secrets/passwords (all languages)
            if re.search(r'\b(password|secret|passwd|api_key|token)\b\s*=\s*[\'"][^\'"]+[\'"]', line, re.IGNORECASE):
                issues.append({
                    "type": "Security Risk",
                    "severity": "high",
                    "message": "Hardcoded secret or credential detected in variable assignment.",
                    "line": line_num
                })

            # Language-specific checks
            if language in ("python", "py"):
                if "import os" in line or "import subprocess" in line:
                    if any("system(" in l or "popen(" in l for l in code_lines[idx:idx+5]):
                        issues.append({
                            "type": "Code Smell",
                            "severity": "medium",
                            "message": "Prefer subprocess.run or subprocess.Popen over os.system to avoid shell injection risk.",
                            "line": line_num
                        })
                if "except:" in line or "except Exception:" in line:
                    if idx + 1 < len(code_lines) and "pass" in code_lines[idx + 1]:
                        issues.append({
                            "type": "Error Handling",
                            "severity": "low",
                            "message": "Avoid silent exception swallowing (empty try-except block).",
                            "line": line_num
                        })
                if "requests." in line and "timeout=" not in line:
                    issues.append({
                        "type": "Performance",
                        "severity": "medium",
                        "message": "HTTP requests should specify a timeout to prevent indefinite blocking.",
                        "line": line_num
                    })

            elif language in ("javascript", "typescript", "js", "ts"):
                if "eval(" in line:
                    issues.append({
                        "type": "Security Risk",
                        "severity": "high",
                        "message": "Use of eval() is highly discouraged due to security and performance issues.",
                        "line": line_num
                    })
                if "var " in line:
                    issues.append({
                        "type": "Code Smell",
                        "severity": "low",
                        "message": "Avoid using 'var'. Use 'let' or 'const' for proper block scoping.",
                        "line": line_num
                    })
                if "console.log(" in line:
                    issues.append({
                        "type": "Code Smell",
                        "severity": "low",
                        "message": "Production code should not contain active console.log statements.",
                        "line": line_num
                    })
                if "innerHTML" in line:
                    issues.append({
                        "type": "Security Risk",
                        "severity": "medium",
                        "message": "Direct use of innerHTML can expose application to Cross-Site Scripting (XSS). Use textContent instead.",
                        "line": line_num
                    })

            elif language in ("java", "java"):
                if "System.out.println(" in line:
                    issues.append({
                        "type": "Code Smell",
                        "severity": "low",
                        "message": "Use a proper logger (SLF4J/Logback) instead of writing to standard out.",
                        "line": line_num
                    })
                if "catch (Exception e)" in line:
                    if idx + 1 < len(code_lines) and ("}" in code_lines[idx + 1] or "e.printStackTrace()" in code_lines[idx+1]):
                        issues.append({
                            "type": "Error Handling",
                            "severity": "medium",
                            "message": "Avoid empty catch blocks or simple printStackTrace calls. Handle exceptions robustly.",
                            "line": line_num
                        })

        # Calculate a quality score based on issues
        deductions = 0
        for issue in issues:
            sev = issue["severity"].lower()
            if sev == "high":
                deductions += 15
            elif sev == "medium":
                deductions += 10
            else:
                deductions += 5
        score = max(50, 100 - deductions)

        # Deduplicate issues on the same line with same message
        seen = set()
        deduped_issues = []
        for issue in issues:
            key = (issue["type"], issue["line"], issue["message"])
            if key not in seen:
                seen.add(key)
                deduped_issues.append(issue)

        summary = (
            f"*({provider_name} AI provider is offline or unconfigured. Review generated via rule-based fallback analyzer)*\n\n"
            f"Conducted heuristics analysis for {language}. Detected {len(deduped_issues)} potential issues. "
            f"Configure valid credentials/endpoint for provider '{provider_name}' to unlock advanced deep semantic auditing."
        )

        bugs = [issue for issue in deduped_issues if issue["type"].lower() in ("syntaxerror", "bug")]
        security_vulnerabilities = [issue for issue in deduped_issues if "security" in issue["type"].lower() or "injection" in issue["type"].lower()]
        performance_issues = [issue for issue in deduped_issues if "performance" in issue["type"].lower()]
        code_smells = [issue for issue in deduped_issues if "smell" in issue["type"].lower() or issue["type"].lower() == "code smell"]
        best_practice_violations = [
            issue for issue in deduped_issues
            if issue not in bugs and issue not in security_vulnerabilities and issue not in performance_issues and issue not in code_smells
        ]

        prob_title = problem_info.get("title", "DSA Problem") if problem_info else "DSA Problem"

        learning_assistant = {
            "level_1_hint": ["Review basic loop boundaries and linear vs quadratic checks."],
            "level_2_guidance": ["Consider using hash map or binary search for optimization."],
            "level_1_brute_force": {
                "explanation": f"Brute force solution for {prob_title} checking all element pairs/subsets.",
                "algorithm": "1. Iterate through elements with nested loops.\n2. Verify conditions for each pair.\n3. Return answer.",
                "code": format_code_snippet(code, language),
                "time_space_complexity": "Time: O(N^2), Space: O(1)",
                "why_inefficient": "Redundant checking of every pair leads to quadratic execution time."
            },
            "level_2_better_approach": {
                "explanation": f"Improved solution for {prob_title} utilizing sorting or two-pointer strategy.",
                "algorithm": "1. Sort input array or build index map.\n2. Traversal with single pass or binary search.\n3. Return result.",
                "code": format_code_snippet(code, language),
                "time_space_complexity": "Time: O(N log N), Space: O(N)",
                "improvement_over_level_1": "Reduces iterations from quadratic O(N^2) to linearithmic or linear time."
            },
            "level_3_optimized_solution": {
                "code": "",
                "is_already_optimal": True,
                "summary": "Fallback analyzer provided heuristics review.",
                "explanations": ["Current code checked against offline rules."]
            }
        }

        return {
            "summary": summary,
            "overall_score": score,
            "bugs": bugs,
            "security_vulnerabilities": security_vulnerabilities,
            "performance_issues": performance_issues,
            "code_smells": code_smells,
            "complexity_analysis": "Cyclomatic complexity appears manageable; run Radon for exact metrics.",
            "best_practice_violations": best_practice_violations,
            "ai_explanations": [
                "Fallback mode used deterministic heuristics across syntax, security, performance, and style dimensions."
            ],
            "suggested_fixes": [issue["message"] for issue in deduped_issues[:8]],
            "refactored_code": "",
            "documentation_suggestions": [
                "Document public functions with clear parameter and return descriptions.",
                "Add a short module-level overview describing assumptions and side effects."
            ],
            "unit_test_suggestions": [
                "Add tests for happy-path behavior and expected return values.",
                "Add negative tests for invalid inputs and edge-case handling.",
                "Add security-focused tests for injection and unsafe-input scenarios."
            ],
            "issues": deduped_issues,
            "learning_assistant": learning_assistant,
            "score": score
        }
