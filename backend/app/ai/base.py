from abc import ABC, abstractmethod
from typing import Any


class BaseAIProvider(ABC):
    """
    Abstract Base Class for AI providers in CodeSense AI.
    """

    @abstractmethod
    async def generate_response(self, prompt: str, system_prompt: str | None = None) -> str:
        """
        Generate a conversational response for a given prompt and optional system prompt.
        """
        pass

    @abstractmethod
    async def review_code(
        self,
        code: str,
        language: str,
        static_analysis: dict[str, Any],
        problem_info: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
                Review code snippet, incorporating static analysis findings, and return structured insights.
        Returns a dict containing:
          - summary: str
          - issues: list[dict[str, Any]] (each with 'type', 'severity', 'message', 'line')
          - score: int
        """
        pass

    @abstractmethod
    async def check_availability(self) -> bool:
        """
        Check if the AI provider's underlying service is reachable/available.
        """
        pass
