from datetime import datetime, timezone
import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import logging
from sqlalchemy.orm import Session

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
from app.services.problem_service import ProblemService
from database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


class ReviewRequest(BaseModel):
    code: str
    language: str = 'python'
    analysis_profile: str = 'standard-v1'
    filename: str | None = None
    review_id: int | None = None
    problem_url: str | None = None


class ReviewResponse(BaseModel):
    id: int | None = None
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
from app.models.review import Review
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


@router.get('/history')
async def get_review_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    query = db.query(Review)
    if current_user:
        query = query.filter(Review.user_id == current_user.id)
    reviews = query.order_by(Review.created_at.desc()).all()
    results: list[dict[str, Any]] = []
    for r in reviews:
        report_data = None
        if r.report_json:
            try:
                report_data = json.loads(r.report_json)
            except Exception:
                pass
        results.append({
            'id': r.id,
            'filename': r.filename,
            'name': r.filename,
            'language': r.language,
            'score': r.score,
            'risk': r.risk,
            'findings_count': r.findings_count,
            'summary': r.summary,
            'code': r.code or '',
            'report': report_data,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        })
    return results


@router.get('/{review_id}')
async def get_review_detail(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    query = db.query(Review).filter(Review.id == review_id)
    if current_user:
        query = query.filter(Review.user_id == current_user.id)
    r = query.first()
    if not r:
        raise HTTPException(status_code=404, detail='Review not found')
    report_data = None
    if r.report_json:
        try:
            report_data = json.loads(r.report_json)
        except Exception:
            pass
    return {
        'id': r.id,
        'filename': r.filename,
        'name': r.filename,
        'language': r.language,
        'score': r.score,
        'risk': r.risk,
        'findings_count': r.findings_count,
        'summary': r.summary,
        'code': r.code or '',
        'report': report_data,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    }


@router.delete('/history/all')
async def delete_all_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    query = db.query(Review)
    if current_user:
        query = query.filter(Review.user_id == current_user.id)
    deleted_count = query.delete(synchronize_session=False)
    db.commit()
    ANALYSIS_CACHE.clear()
    return {'message': f'Successfully deleted {deleted_count} review(s).', 'deleted_count': deleted_count}


@router.delete('/{review_id}')
async def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    query = db.query(Review).filter(Review.id == review_id)
    if current_user:
        query = query.filter(Review.user_id == current_user.id)
    r = query.first()
    if not r:
        raise HTTPException(status_code=404, detail='Review artifact not found')
    db.delete(r)
    db.commit()
    ANALYSIS_CACHE.clear()
    return {'message': 'Review artifact deleted successfully.', 'id': review_id}


@router.post('/', response_model=ReviewResponse)
async def review_code(
    payload: ReviewRequest,
    service: LLMService = Depends(get_llm_service),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewResponse:
    normalized_language = normalize_language(payload.language)
    source_hash = code_hash(payload.code)
    prob_url_clean = (payload.problem_url or '').strip()
    settings_hash = settings_fingerprint(normalized_language, f"{payload.analysis_profile}:{service.provider_type}:{prob_url_clean}")
    cache_key = f"{source_hash}:{prob_url_clean}"

    cached_entry = ANALYSIS_CACHE.get(cache_key)
    if cached_entry and cached_entry[0] == settings_hash and not payload.review_id:
        cached_response = cached_entry[1].model_copy(deep=True)
        cached_response.cached = True
        fname = (payload.filename or '').strip() or f"example.{payload.language}"
        now_time = datetime.now(timezone.utc)
        serialized_report = json.dumps(cached_response.model_dump())
        db_review = Review(
            user_id=current_user.id if current_user else None,
            filename=fname,
            language=normalized_language,
            score=cached_response.score or 0,
            risk=cached_response.severity_breakdown.get('critical', 0) > 0 and 'Critical' or 'Low',
            findings_count=len(cached_response.issues or []),
            summary=cached_response.summary,
            code=payload.code,
            report_json=serialized_report,
            created_at=now_time,
        )
        try:
            db.add(db_review)
            db.commit()
            db.refresh(db_review)
            cached_response.id = db_review.id
        except Exception as db_exc:
            logger.exception('Failed to save cached review into database: %s', db_exc)
            db.rollback()
        return cached_response

    problem_info = None
    if prob_url_clean:
        problem_info, err_msg = await ProblemService.fetch_problem_details(prob_url_clean)
        if err_msg or not problem_info:
            raise HTTPException(status_code=400, detail=err_msg or "Invalid or unidentified Problem URL.")

    try:
        # Run static rule analyzer with problem context awareness
        static_analysis = analyze_code(payload.code, normalized_language, problem_info=problem_info)

        # Run AI audit after static analysis, passing full analyzer context and optional problem info.
        ai_analysis = await service.review(payload.code, normalized_language, static_analysis, problem_info=problem_info)
        if not isinstance(ai_analysis, dict):
            return _fallback_review_response('AI provider returned an unexpected response format.', source_hash=source_hash, source_code=payload.code)

        suggested_fixes = _coerce_string_list(ai_analysis.get('suggested_fixes', []))
        ai_explanations = _coerce_string_list(ai_analysis.get('ai_explanations', []))
        documentation_suggestions = _coerce_string_list(ai_analysis.get('documentation_suggestions', []))
        unit_test_suggestions = _coerce_string_list(ai_analysis.get('unit_test_suggestions', []))

        raw_issues: list[dict[str, Any]] = []
        # Groq AI is the primary source and final decision maker for code errors
        ai_issues = _coerce_issue_list(ai_analysis.get('issues', []))
        raw_issues.extend(ai_issues)

        for group_name in ['bugs', 'security_vulnerabilities', 'performance_issues', 'code_smells', 'best_practice_violations']:
            raw_issues.extend(_coerce_issue_list(ai_analysis.get(group_name, [])))

        # Fallback to static analysis ONLY if AI returned no summary (e.g. offline fallback mode)
        if not raw_issues and not ai_analysis.get('summary') and static_analysis.get('issues'):
            raw_issues.extend(_coerce_issue_list(static_analysis.get('issues', [])))

        has_prob_url = bool(problem_info)
        normalized_issues = dedupe_and_sort_issues([normalize_issue(issue) for issue in raw_issues], source_code=payload.code, has_problem_url=has_prob_url)
        buckets = split_issue_buckets(normalized_issues)
        breakdown = severity_breakdown(normalized_issues)

        # Use AI-generated score and summary if returned by active provider
        ai_score = ai_analysis.get('score') or ai_analysis.get('overall_score')
        if not normalized_issues and has_prob_url:
            score = 100
            overall_score = 100
        elif ai_score is not None:
            score = _coerce_int(ai_score, deterministic_score(normalized_issues))
            overall_score = score
        else:
            score = deterministic_score(normalized_issues)
            overall_score = score

        complexity_analysis = str(ai_analysis.get('complexity_analysis', '')).strip()
        refactored_code = str(ai_analysis.get('refactored_code', '')).strip()

        ai_summary = ai_analysis.get('summary')
        if ai_summary and isinstance(ai_summary, str) and ai_summary.strip():
            summary = ai_summary.strip()
        elif not normalized_issues and has_prob_url:
            summary = f"No issues detected for {normalized_language}. Solution logic is correct."
        else:
            summary = deterministic_summary(normalized_language, normalized_issues, breakdown, score)

        ai_learning_assistant = ai_analysis.get('learning_assistant')
        if isinstance(ai_learning_assistant, dict) and ai_learning_assistant:
            learning_assistant = ai_learning_assistant
        else:
            learning_assistant = learning_assistant_payload(
                language=normalized_language,
                source_code=payload.code,
                issues=normalized_issues,
                complexity_analysis=complexity_analysis,
                suggested_fixes=suggested_fixes,
                ai_explanations=ai_explanations,
                refactored_code=refactored_code or payload.code,
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

        # Calculate risk based on highest severity issue present
        critical_cnt = breakdown.get('critical', 0)
        high_cnt = breakdown.get('high', 0)
        medium_cnt = breakdown.get('medium', 0)
        if critical_cnt > 0:
            risk = 'Critical'
        elif high_cnt > 0:
            risk = 'High'
        elif medium_cnt > 0:
            risk = 'Medium'
        else:
            risk = 'Low'

        fname = (payload.filename or '').strip()
        if not fname:
            fname = f"example.{payload.language}"

        serialized_report = json.dumps(response_payload.model_dump())
        now_time = datetime.now(timezone.utc)

        target_review = None
        if payload.review_id:
            query = db.query(Review).filter(Review.id == payload.review_id)
            if current_user:
                query = query.filter(Review.user_id == current_user.id)
            target_review = query.first()

        try:
            if target_review:
                target_review.filename = fname
                target_review.language = normalized_language
                target_review.score = score
                target_review.risk = risk
                target_review.findings_count = len(normalized_issues)
                target_review.summary = summary
                target_review.code = payload.code
                target_review.report_json = serialized_report
                target_review.created_at = now_time
                db.commit()
                db.refresh(target_review)
                response_payload.id = target_review.id
            else:
                db_review = Review(
                    user_id=current_user.id if current_user else None,
                    filename=fname,
                    language=normalized_language,
                    score=score,
                    risk=risk,
                    findings_count=len(normalized_issues),
                    summary=summary,
                    code=payload.code,
                    report_json=serialized_report,
                    created_at=now_time,
                )
                db.add(db_review)
                db.commit()
                db.refresh(db_review)
                response_payload.id = db_review.id
        except Exception as db_exc:
            logger.exception('Failed to save review into database: %s', db_exc)
            db.rollback()

        _store_cache_entry(cache_key, settings_hash, response_payload.model_copy(deep=True))
        return response_payload

    except Exception as exc:
        logger.exception('Review pipeline failed. Returning fallback response: %s', exc)
        return _fallback_review_response('The analysis service encountered a temporary error and switched to fallback mode.', source_hash=source_hash, source_code=payload.code)


