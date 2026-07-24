from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import logging

from app.analysis.static_analyzer import analyze_code
from app.services.llm_service import LLMService

router = APIRouter()
logger = logging.getLogger(__name__)


class ReviewRequest(BaseModel):
    code: str
    language: str = 'python'


class ReviewResponse(BaseModel):
    summary: str
    issues: list[dict[str, Any]] = []
    score: int
    overall_score: int | None = None
    bugs: list[dict[str, Any]] = []
    security_vulnerabilities: list[dict[str, Any]] = []
    performance_issues: list[dict[str, Any]] = []
    code_smells: list[dict[str, Any]] = []
    complexity_analysis: str = ''
    best_practice_violations: list[dict[str, Any]] = []
    ai_explanations: list[str] = []
    suggested_fixes: list[str] = []
    refactored_code: str = ''
    documentation_suggestions: list[str] = []
    unit_test_suggestions: list[str] = []


# Helper dependency to inject LLMService
def get_llm_service() -> LLMService:
    return LLMService()


from app.models.user import User
from app.services.auth_service import get_current_user


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized.append(item)
        elif isinstance(item, dict):
            message = item.get('message') or item.get('fix') or item.get('suggestion')
            if message:
                normalized.append(str(message))
            else:
                normalized.append(str(item))
        else:
            normalized.append(str(item))
    return normalized


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_issue_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            normalized.append(item)
    return normalized


def _fallback_review_response(message: str) -> ReviewResponse:
    return ReviewResponse(
        summary='Review completed with fallback analyzer due to a temporary AI processing issue.',
        issues=[
            {
                'type': 'Analyzer Notice',
                'severity': 'medium',
                'message': message,
                'line': 1,
            }
        ],
        score=70,
        overall_score=70,
        bugs=[],
        security_vulnerabilities=[],
        performance_issues=[],
        code_smells=[],
        complexity_analysis='Complexity insights are temporarily limited. Re-run analysis in a moment for full AI depth.',
        best_practice_violations=[],
        ai_explanations=['A fallback response was returned to prevent request failure.'],
        suggested_fixes=['Retry analysis after a short delay if you need deeper model-generated refactoring advice.'],
        refactored_code='',
        documentation_suggestions=[],
        unit_test_suggestions=[],
    )


@router.post('/', response_model=ReviewResponse)
async def review_code(
    payload: ReviewRequest,
    service: LLMService = Depends(get_llm_service),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    try:
        # Run static rule analyzer
        static_analysis = analyze_code(payload.code, payload.language)

        # Run AI audit (Ollama / Fallback) after static analysis, passing full analyzer context.
        ai_analysis = await service.review(payload.code, payload.language, static_analysis)
        if not isinstance(ai_analysis, dict):
            return _fallback_review_response('AI provider returned an unexpected response format.')

        suggested_fixes = _coerce_string_list(ai_analysis.get('suggested_fixes', []))
        ai_explanations = _coerce_string_list(ai_analysis.get('ai_explanations', []))
        documentation_suggestions = _coerce_string_list(ai_analysis.get('documentation_suggestions', []))
        unit_test_suggestions = _coerce_string_list(ai_analysis.get('unit_test_suggestions', []))

        overall_score = _coerce_int(ai_analysis.get('overall_score', ai_analysis.get('score', 100)), 100)
        score = _coerce_int(ai_analysis.get('score', overall_score), overall_score)

        return ReviewResponse(
            summary=str(ai_analysis.get('summary', 'Review complete.')),
            issues=_coerce_issue_list(ai_analysis.get('issues', [])),
            score=score,
            overall_score=overall_score,
            bugs=_coerce_issue_list(ai_analysis.get('bugs', [])),
            security_vulnerabilities=_coerce_issue_list(ai_analysis.get('security_vulnerabilities', [])),
            performance_issues=_coerce_issue_list(ai_analysis.get('performance_issues', [])),
            code_smells=_coerce_issue_list(ai_analysis.get('code_smells', [])),
            complexity_analysis=str(ai_analysis.get('complexity_analysis', '')),
            best_practice_violations=_coerce_issue_list(ai_analysis.get('best_practice_violations', [])),
            ai_explanations=ai_explanations,
            suggested_fixes=suggested_fixes,
            refactored_code=str(ai_analysis.get('refactored_code', '')),
            documentation_suggestions=documentation_suggestions,
            unit_test_suggestions=unit_test_suggestions,
        )
    except Exception as exc:
        logger.exception('Review pipeline failed. Returning fallback response: %s', exc)
        return _fallback_review_response('The analysis service encountered a temporary error and switched to fallback mode.')

