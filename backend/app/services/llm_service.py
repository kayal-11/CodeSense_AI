import logging
from typing import Any
from app.ai.base import BaseAIProvider
from app.ai.fallback import FallbackProvider
from app.ai.ollama import OllamaProvider

logger = logging.getLogger(__name__)


class LLMService:
    """
    Service coordinating AI providers.
    Dynamically routes to Ollama (if running) or FallbackProvider (if offline).
    """

    def __init__(self) -> None:
        self.ollama_provider = OllamaProvider()
        self.fallback_provider = FallbackProvider()

    def _build_static_fallback_review(self, language: str, static_analysis: dict[str, Any]) -> dict[str, Any]:
        issues = static_analysis.get('issues', []) if isinstance(static_analysis, dict) else []
        static_score = int(static_analysis.get('score', 70)) if isinstance(static_analysis, dict) else 70
        summary = static_analysis.get('summary', 'Static analysis review complete.') if isinstance(static_analysis, dict) else 'Static analysis review complete.'

        def match_issue(*keywords: str) -> list[dict[str, Any]]:
            lowered = [keyword.lower() for keyword in keywords]
            matched: list[dict[str, Any]] = []
            for issue in issues:
                issue_type = str(issue.get('type', '')).lower()
                issue_message = str(issue.get('message', '')).lower()
                if any(keyword in issue_type or keyword in issue_message for keyword in lowered):
                    matched.append(issue)
            return matched

        bugs = match_issue('bug', 'syntax')
        security_vulnerabilities = match_issue('security', 'injection', 'xss', 'csrf', 'secret')
        performance_issues = match_issue('performance', 'nested loop', 'o(n', 'optimization')
        code_smells = match_issue('smell', 'quality')

        best_practice_violations = [
            issue for issue in issues
            if issue not in bugs and issue not in security_vulnerabilities and issue not in performance_issues and issue not in code_smells
        ]

        suggested_fixes = [str(issue.get('message', 'Review and address the detected issue.')) for issue in issues[:10]]

        return {
            'summary': f"{summary} (Ollama unavailable - static analysis fallback used)",
            'overall_score': static_score,
            'score': static_score,
            'bugs': bugs,
            'security_vulnerabilities': security_vulnerabilities,
            'performance_issues': performance_issues,
            'code_smells': code_smells,
            'complexity_analysis': 'Complexity estimated from static analyzer findings. Run dedicated complexity tools (e.g., Radon) for exact metrics.',
            'best_practice_violations': best_practice_violations,
            'ai_explanations': [
                f"Static analysis identified {len(issues)} issue(s). Start Ollama with model '{self.ollama_provider.model}' for deeper semantic AI review."
            ],
            'suggested_fixes': suggested_fixes,
            'refactored_code': '',
            'documentation_suggestions': [
                'Document public methods, parameters, return values, and side effects.',
                'Add module-level README notes for architecture and assumptions.'
            ],
            'unit_test_suggestions': [
                'Add happy-path tests for main flows.',
                'Add negative and edge-case tests for invalid inputs and failures.',
                'Add security-focused tests for injection and unsafe data handling.'
            ],
            'issues': issues,
        }

    async def get_active_provider(self) -> BaseAIProvider:
        """
        Detects active provider. Returns Ollama if online, fallback if offline.
        """
        is_ollama_available = await self.ollama_provider.check_availability()
        if is_ollama_available:
            logger.info("Ollama provider detected and activated.")
            return self.ollama_provider
        else:
            logger.warning("Ollama provider unreachable. Using fallback offline provider.")
            return self.fallback_provider

    async def chat(self, message: str) -> str:
        """
        Generates conversational response using the active provider.
        """
        provider = await self.get_active_provider()
        system_prompt = (
            "You are CodeSense AI, an intelligent companion for code reviews. "
            "Help the user inspect, optimize, secure, and debug their software systems."
        )
        try:
            return await provider.generate_response(message, system_prompt=system_prompt)
        except Exception as exc:
            logger.error(f"Error in chat generation: {exc}. Retrying with fallback...")
            return await self.fallback_provider.generate_response(message, system_prompt=system_prompt)

    async def review(
        self,
        code: str,
        language: str,
        static_analysis: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Performs code review using the active provider, incorporating static findings.
        """
        is_ollama_available = await self.ollama_provider.check_availability()
        if is_ollama_available:
            try:
                return await self.ollama_provider.review_code(code, language, static_analysis)
            except Exception as exc:
                logger.error(f"Error in Ollama code review: {exc}. Using static analysis fallback.")
                return self._build_static_fallback_review(language, static_analysis)

        logger.warning('Ollama unavailable for review. Using static analysis fallback output.')
        return self._build_static_fallback_review(language, static_analysis)
