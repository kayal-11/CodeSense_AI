from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import logging

from app.analysis.static_analyzer import analyze_code
from app.analysis.review_workflow import (
    code_hash,
    dedupe_and_sort_issues,
    deterministic_score,
    deterministic_summary,
    learning_assistant_payload,
    normalize_issue,
    normalize_language,
    settings_fingerprint,
    severity_breakdown,
    split_issue_buckets,
)
from app.services.llm_service import LLMService

router = APIRouter()
logger = logging.getLogger(__name__)


class ReviewRequest(BaseModel):
    code: str
    language: str = 'python'
    analysis_profile: str = 'standard-v1'


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
    severity_breakdown: dict[str, int] = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    learning_assistant: dict[str, Any] = {}
    code_hash: str = ''
    cached: bool = False


# Helper dependency to inject LLMService
def get_llm_service() -> LLMService:
    return LLMService()


from app.models.user import User
from app.services.auth_service import get_current_user


ANALYSIS_CACHE: dict[str, tuple[str, ReviewResponse]] = {}
MAX_CACHE_ITEMS = 200


def _store_cache_entry(cache_key: str, settings_hash: str, response: ReviewResponse) -> None:
    if cache_key in ANALYSIS_CACHE:
        ANALYSIS_CACHE.pop(cache_key, None)

    ANALYSIS_CACHE[cache_key] = (settings_hash, response)
    while len(ANALYSIS_CACHE) > MAX_CACHE_ITEMS:
        first_key = next(iter(ANALYSIS_CACHE), None)
        if first_key is None:
            break
        ANALYSIS_CACHE.pop(first_key, None)


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


def _fallback_review_response(message: str, source_hash: str = '', source_code: str = '') -> ReviewResponse:
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
        refactored_code=source_code,
        documentation_suggestions=[],
        unit_test_suggestions=[],
        severity_breakdown={'critical': 0, 'high': 0, 'medium': 1, 'low': 0},
        learning_assistant={
            'level_1_hint': ['Inspect the analyzer notice and confirm tool availability.'],
            'level_2_guidance': ['Retry once services are healthy to get a full deterministic review.'],
            'level_3_optimized_solution': {
                'code': source_code,
                'explanations': ['Complete code is provided to keep the output executable in fallback mode.'],
                'complexity_improvements': ['Re-run analysis when provider is available.'],
                'best_practices': ['Keep dependencies healthy and monitor provider uptime.'],
            },
        },
        code_hash=source_hash,
        cached=False,
    )


@router.post('/', response_model=ReviewResponse)
async def review_code(
    payload: ReviewRequest,
    service: LLMService = Depends(get_llm_service),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    normalized_language = normalize_language(payload.language)
    source_hash = code_hash(payload.code)
    settings_hash = settings_fingerprint(normalized_language, payload.analysis_profile)
    cache_key = source_hash

    cached_entry = ANALYSIS_CACHE.get(cache_key)
    if cached_entry and cached_entry[0] == settings_hash:
        cached_response = cached_entry[1].model_copy(deep=True)
        cached_response.cached = True
        return cached_response

    try:
        # Run static rule analyzer
        static_analysis = analyze_code(payload.code, normalized_language)

        # Run AI audit (Ollama / Fallback) after static analysis, passing full analyzer context.
        ai_analysis = await service.review(payload.code, normalized_language, static_analysis)
        if not isinstance(ai_analysis, dict):
            return _fallback_review_response('AI provider returned an unexpected response format.', source_hash=source_hash, source_code=payload.code)

        suggested_fixes = _coerce_string_list(ai_analysis.get('suggested_fixes', []))
        ai_explanations = _coerce_string_list(ai_analysis.get('ai_explanations', []))
        documentation_suggestions = _coerce_string_list(ai_analysis.get('documentation_suggestions', []))
        unit_test_suggestions = _coerce_string_list(ai_analysis.get('unit_test_suggestions', []))

        raw_issues: list[dict[str, Any]] = []
        raw_issues.extend(_coerce_issue_list(static_analysis.get('issues', [])))
        raw_issues.extend(_coerce_issue_list(ai_analysis.get('issues', [])))

        for group_name in ['bugs', 'security_vulnerabilities', 'performance_issues', 'code_smells', 'best_practice_violations']:
            raw_issues.extend(_coerce_issue_list(ai_analysis.get(group_name, [])))

        normalized_issues = dedupe_and_sort_issues([normalize_issue(issue) for issue in raw_issues])
        buckets = split_issue_buckets(normalized_issues)
        breakdown = severity_breakdown(normalized_issues)
        score = deterministic_score(normalized_issues)
        overall_score = score
        complexity_analysis = str(ai_analysis.get('complexity_analysis', '')).strip()
        refactored_code = str(ai_analysis.get('refactored_code', '')).strip() or payload.code
        summary = deterministic_summary(normalized_language, normalized_issues, breakdown, score)

        learning_assistant = learning_assistant_payload(
            language=normalized_language,
            source_code=payload.code,
            issues=normalized_issues,
            complexity_analysis=complexity_analysis,
            suggested_fixes=suggested_fixes,
            ai_explanations=ai_explanations,
            refactored_code=refactored_code,
        )

        response_payload = ReviewResponse(
            summary=summary,
            issues=normalized_issues,
            score=score,
            overall_score=overall_score,
            bugs=buckets['bugs'],
            security_vulnerabilities=buckets['security_vulnerabilities'],
            performance_issues=buckets['performance_issues'],
            code_smells=buckets['code_smells'],
            complexity_analysis=complexity_analysis,
            best_practice_violations=buckets['best_practice_violations'],
            ai_explanations=ai_explanations,
            suggested_fixes=suggested_fixes,
            refactored_code=refactored_code,
            documentation_suggestions=documentation_suggestions,
            unit_test_suggestions=unit_test_suggestions,
            severity_breakdown=breakdown,
            learning_assistant=learning_assistant,
            code_hash=source_hash,
            cached=False,
        )

        _store_cache_entry(cache_key, settings_hash, response_payload.model_copy(deep=True))
        return response_payload
    except Exception as exc:
        logger.exception('Review pipeline failed. Returning fallback response: %s', exc)
        return _fallback_review_response('The analysis service encountered a temporary error and switched to fallback mode.', source_hash=source_hash, source_code=payload.code)

