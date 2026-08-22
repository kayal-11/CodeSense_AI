import hashlib
from typing import Any

SEVERITY_ORDER: dict[str, int] = {
    'critical': 4,
    'high': 3,
    'medium': 2,
    'low': 1,
}

SEVERITY_DEDUCTIONS: dict[str, int] = {
    'critical': 24,
    'high': 14,
    'medium': 8,
    'low': 4,
}


def normalize_language(language: str) -> str:
    normalized = (language or 'python').strip().lower()
    alias_map = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'c++': 'cpp',
        'cs': 'csharp',
        'c#': 'csharp',
    }
    return alias_map.get(normalized, normalized)


def code_hash(code: str) -> str:
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def settings_fingerprint(language: str, analysis_profile: str) -> str:
    key = f"{normalize_language(language)}|{(analysis_profile or 'standard-v1').strip().lower()}"
    return hashlib.sha256(key.encode('utf-8')).hexdigest()


def coerce_line(value: Any) -> int:
    try:
        line = int(value)
        return line if line > 0 else 1
    except (TypeError, ValueError):
        return 1


def normalize_issue(issue: dict[str, Any], fallback_type: str = 'Issue') -> dict[str, Any]:
    raw_type = str(issue.get('type', fallback_type)).strip() or fallback_type
    raw_severity = str(issue.get('severity', 'medium')).strip().lower() or 'medium'
    severity = raw_severity if raw_severity in SEVERITY_ORDER else 'medium'
    message = str(issue.get('message', 'Issue detected by analyzer.')).strip() or 'Issue detected by analyzer.'

    normalized: dict[str, Any] = {
        'type': raw_type,
        'severity': severity,
        'message': message,
        'line': coerce_line(issue.get('line', 1)),
    }
    why = issue.get('why_it_matters') or issue.get('why')
    if why and isinstance(why, str):
        normalized['why_it_matters'] = why.strip()
    fix = issue.get('suggested_fix') or issue.get('fix')
    if fix and isinstance(fix, str):
        normalized['suggested_fix'] = fix.strip()
    if 'is_error' in issue:
        normalized['is_error'] = bool(issue.get('is_error'))
    if 'level' in issue:
        normalized['level'] = str(issue.get('level')).strip()
    if 'start_col' in issue:
        normalized['start_col'] = issue.get('start_col')
    if 'end_col' in issue:
        normalized['end_col'] = issue.get('end_col')
    if 'end_line' in issue:
        normalized['end_line'] = issue.get('end_line')
    return normalized



def is_platform_environment_issue(issue: dict[str, Any]) -> bool:
    msg = str(issue.get('message', '')).lower()
    issue_type = str(issue.get('type', '')).lower()
    why = str(issue.get('why_it_matters', '')).lower()
    text = f"{issue_type} {msg} {why}"

    platform_types = ['listnode', 'treenode', 'node', 'point', 'pair', 'quadtree', 'solution']
    action_words = ['cannot find', 'not found', 'missing', 'undefined', 'not declared', 'unknown type', 'import', 'symbol']

    if any(ptype in text for ptype in platform_types):
        if any(action in text for action in action_words):
            return True

    if any(token in text for token in ['main method', 'missing main', 'undefined reference to main', 'entry point', 'main method not found']):
        return True

    return False


def dedupe_and_sort_issues(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, int, str]] = set()
    normalized: list[dict[str, Any]] = []

    for issue in issues:
        item = normalize_issue(issue)
        if is_platform_environment_issue(item):
            continue
        key = (
            item['type'].lower(),
            item['severity'],
            item['line'],
            item['message'].lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        normalized.append(item)

    normalized.sort(
        key=lambda item: (
            -SEVERITY_ORDER.get(str(item.get('severity', 'low')).lower(), 1),
            int(item.get('line', 1)),
            str(item.get('type', '')).lower(),
            str(item.get('message', '')).lower(),
        )
    )
    return normalized


def split_issue_buckets(issues: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    bugs: list[dict[str, Any]] = []
    security: list[dict[str, Any]] = []
    performance: list[dict[str, Any]] = []
    code_smells: list[dict[str, Any]] = []
    best_practice: list[dict[str, Any]] = []

    for issue in issues:
        issue_type = str(issue.get('type', '')).lower()
        message = str(issue.get('message', '')).lower()
        text = f"{issue_type} {message}"

        if any(token in text for token in ['security', 'injection', 'xss', 'csrf', 'secret', 'credential']):
            security.append(issue)
        elif any(token in text for token in ['performance', 'complexity', 'o(n', 'optimization', 'latency']):
            performance.append(issue)
        elif any(token in text for token in ['bug', 'syntax', 'error', 'exception', 'runtime']):
            bugs.append(issue)
        elif any(token in text for token in ['smell', 'quality', 'maintainability', 'style']):
            code_smells.append(issue)
        else:
            best_practice.append(issue)

    return {
        'bugs': bugs,
        'security_vulnerabilities': security,
        'performance_issues': performance,
        'code_smells': code_smells,
        'best_practice_violations': best_practice,
    }


def severity_breakdown(issues: list[dict[str, Any]]) -> dict[str, int]:
    result = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    for issue in issues:
        severity = str(issue.get('severity', 'low')).lower()
        if severity not in result:
            severity = 'low'
        result[severity] += 1
    return result


def deterministic_score(issues: list[dict[str, Any]]) -> int:
    deductions = 0
    for issue in issues:
        severity = str(issue.get('severity', 'low')).lower()
        deductions += SEVERITY_DEDUCTIONS.get(severity, SEVERITY_DEDUCTIONS['low'])
    return max(0, min(100, 100 - deductions))


def deterministic_summary(language: str, issues: list[dict[str, Any]], breakdown: dict[str, int], score: int) -> str:
    if not issues:
        return f"No issues detected for {language}. Overall score: {score}/100."

    top = issues[0]
    top_type = str(top.get('type', 'Issue'))
    top_line = int(top.get('line', 1))
    return (
        f"Analyzed {language} code and found {len(issues)} issue(s): "
        f"{breakdown['critical']} critical, {breakdown['high']} high, {breakdown['medium']} medium, {breakdown['low']} low. "
        f"Top risk: {top_type} at line {top_line}. Overall score: {score}/100."
    )


def learning_assistant_payload(
    language: str,
    source_code: str,
    issues: list[dict[str, Any]],
    complexity_analysis: str,
    suggested_fixes: list[str],
    ai_explanations: list[str],
    refactored_code: str,
) -> dict[str, Any]:
    if not issues:
        return {
            'level_1_hint': [
                'Try adding robust test cases for edge conditions to strengthen reliability.',
            ],
            'level_2_guidance': [
                'The code looks clean by current heuristics; consider adding observability and benchmark tests for production readiness.',
            ],
            'level_3_optimized_solution': {
                'code': refactored_code or source_code,
                'explanations': ['No critical refactor needed; focus on maintainability and test coverage.'],
                'complexity_improvements': ['Current complexity appears acceptable for the analyzed snippet.'],
                'best_practices': ['Document assumptions and add targeted regression tests.'],
            },
        }

    top_issues = issues[:3]
    level_1 = [
        f"Check line {int(item.get('line', 1))}: look for a safer way to handle {str(item.get('type', 'issue')).lower()}."
        for item in top_issues
    ]

    level_2: list[str] = []
    for item in top_issues:
        level_2.append(
            f"{item.get('type', 'Issue')} at line {int(item.get('line', 1))}: {item.get('message', 'Resolve this issue.')}."
        )

    level_2.extend(suggested_fixes[:3])
    level_2.extend(ai_explanations[:2])

    complexity_notes = [complexity_analysis] if complexity_analysis else []
    if not complexity_notes:
        complexity_notes = ['Reduce nested loops and repeated scans to improve runtime behavior where possible.']

    best_practices = [
        f"Use language-idiomatic patterns and explicit error handling for {language}.",
        'Validate external input and avoid dynamic execution or unsafe interpolation.',
        'Keep functions small and test behavior at boundaries and failure points.',
    ]

    optimized_code = refactored_code
    if not optimized_code:
        optimized_code = source_code

    return {
        'level_1_hint': level_1,
        'level_2_guidance': level_2,
        'level_3_optimized_solution': {
            'code': optimized_code,
            'explanations': [
                'This is a complete code listing suitable for execution and regression testing.',
                'Apply the listed guidance to further improve structure, safety, and maintainability when needed.',
            ],
            'complexity_improvements': complexity_notes,
            'best_practices': best_practices,
        },
    }
