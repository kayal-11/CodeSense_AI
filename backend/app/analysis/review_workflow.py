import hashlib
import re
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



def is_platform_environment_issue(issue: dict[str, Any], has_problem_url: bool = True) -> bool:
    if not has_problem_url:
        return False

    msg = str(issue.get('message', '')).lower()
    issue_type = str(issue.get('type', '')).lower()
    why = str(issue.get('why_it_matters', '')).lower()
    fix = str(issue.get('suggested_fix', '')).lower()
    text = f"{issue_type} {msg} {why} {fix}"

    # Genuine typos in user code must NEVER be filtered out as platform environment issues
    typo_tokens = ['arraylst', 'hashmp', 'hashmap', 'array.sort', 'prnt', 'inpt', 'lengh', 'printt']
    if any(typo in text for typo in typo_tokens):
        return False

    # Check missing main / driver / entry point
    if any(token in text for token in [
        'main method', 'missing main', 'undefined reference to main', 'entry point', 'main method not found',
        'driver code', 'input handling', 'no main function', 'in function `main`', 'missing main()', 'no main class'
    ]):
        return True

    # Check missing imports / headers / package declarations
    if any(token in text for token in [
        'missing import', 'used without importing', 'import statement', 'missing header', 'header is missing',
        'stdio.h', 'iostream', 'package declaration', 'package does not exist', 'should be declared in a file named'
    ]):
        return True

    # Check platform-provided types/classes
    platform_types = [
        'listnode', 'treenode', 'node', 'point', 'pair', 'quadtree', 'solution',
        'list', 'arraylist', 'map', 'hashmap', 'set', 'hashset', 'arrays', 'collections',
        'vector', 'string', 'queue', 'priorityqueue', 'deque', 'stack'
    ]
    action_words = ['cannot find', 'not found', 'missing', 'undefined', 'not declared', 'unknown type', 'import', 'symbol', 'package', 'module']

    if any(ptype in text for ptype in platform_types):
        if any(action in text for action in action_words):
            return True

    return False


def extract_candidate_tokens(full_text: str) -> list[str]:
    quoted = re.findall(r"['\"`]([a-zA-Z_][a-zA-Z0-9_.]*)['\"`]", full_text)
    phrase_matches = re.findall(r"\b(?:symbol|variable|class|method|function|identifier|type|name|unknown|undefined)\s+[:']*\s*([a-zA-Z_][a-zA-Z0-9_.]*)", full_text, re.IGNORECASE)
    all_words = re.findall(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b", full_text)

    stop_words = {
        'line', 'code', 'error', 'syntax', 'type', 'value', 'at', 'the', 'a', 'an', 'is', 'was', 'were',
        'fix', 'issue', 'missing', 'expected', 'found', 'defined', 'used', 'variable', 'function', 'statement',
        'int', 'str', 'bool', 'float', 'list', 'dict', 'none', 'true', 'false', 'var', 'let', 'const', 'def', 'class',
        'public', 'private', 'protected', 'void', 'return', 'if', 'else', 'for', 'while', 'cannot', 'find', 'symbol',
        'location', 'java', 'python', 'cpp', 'csharp', 'critical', 'high', 'medium', 'low', 'did', 'you', 'mean',
        'in', 'of', 'to', 'with', 'or', 'and', 'not', 'package', 'import', 'method', 'resolved', 'resolve', 'compiler'
    }

    candidates: list[str] = []
    seen: set[str] = set()

    for t in quoted + phrase_matches + all_words:
        clean_t = t.strip('.')
        if len(clean_t) >= 2 and clean_t.lower() not in stop_words and clean_t not in seen:
            seen.add(clean_t)
            candidates.append(clean_t)

    return candidates


def validate_and_relocate_issue_line(issue: dict[str, Any], source_code: str | None = None) -> dict[str, Any]:
    if not source_code:
        return issue

    lines = source_code.splitlines()
    if not lines:
        return issue

    full_text = f"{issue.get('type', '')} {issue.get('message', '')} {issue.get('why_it_matters', '')} {issue.get('suggested_fix', '')}"

    # 1. Search candidate tokens against original code lines
    candidates = extract_candidate_tokens(full_text)
    for token in candidates:
        pattern = re.compile(rf'\b{re.escape(token)}\b')
        for idx, line_str in enumerate(lines):
            clean = re.sub(r'#.*$', '', re.sub(r'//.*$', '', line_str))
            # Protect class/interface/method headers unless token is 'Solution' or matches class name
            is_class_header = bool(re.search(r'^\s*(public\s+|private\s+)?(class|interface|enum)\s+', clean))
            if is_class_header and token not in ('Solution', clean):
                continue
            if pattern.search(clean):
                issue['line'] = idx + 1
                return issue

    # 2. Check condition / colon statements
    if 'condition' in full_text.lower() or "missing ')'" in full_text.lower():
        for idx, line_str in enumerate(lines):
            if re.search(r'^\s*\b(if|while)\b', line_str) and not re.search(r'\)\s*\{|\)\s*$', line_str):
                issue['line'] = idx + 1
                return issue

    if 'colon' in full_text.lower():
        for idx, line_str in enumerate(lines):
            clean = re.sub(r'#.*$', '', line_str).strip()
            if re.search(r'^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b)', clean) and not clean.endswith(':'):
                issue['line'] = idx + 1
                return issue

    raw_line = int(issue.get('line', 1))

    # 3. Header protection: If raw_line points to Line 1/Line 2 or a class Solution header, do NOT keep it on line 1!
    if 1 <= raw_line <= len(lines):
        line_content = lines[raw_line - 1].strip()
        is_header = bool(re.search(r'^\s*(public\s+|private\s+)?(class\s+Solution|class\s+[A-Z]|public\s+static\s+void\s+main|public\s+[a-zA-Z0-9_<>]+\s+[a-zA-Z0-9_]+\s*\()', line_content)) or (raw_line == 1 and 'class Solution' in line_content)
        if not is_header and line_content:
            return issue

    # Find first non-header, non-empty code line inside function/method body
    for idx, line_str in enumerate(lines):
        clean = line_str.strip()
        is_hdr = bool(re.search(r'^\s*(public\s+|private\s+)?(class\s+Solution|class\s+[A-Z]|public\s+static\s+void\s+main|public\s+[a-zA-Z0-9_<>]+\s+[a-zA-Z0-9_]+\s*\()', clean)) or (idx == 0 and 'class Solution' in clean)
        if clean and not is_hdr:
            issue['line'] = idx + 1
            return issue

    return issue


def dedupe_and_sort_issues(
    issues: list[dict[str, Any]],
    source_code: str | None = None,
    has_problem_url: bool = False,
) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, int, str]] = set()
    normalized: list[dict[str, Any]] = []

    for issue in issues:
        item = normalize_issue(issue)
        item = validate_and_relocate_issue_line(item, source_code)
        if is_platform_environment_issue(item, has_problem_url=has_problem_url):
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

    # Cascading error suppression: If line L has an unclosed delimiter or missing colon error,
    # generic syntax errors (e.g. "unexpected token", "expected ';'") on lines > L are suppressed.
    if normalized:
        syntax_delimiter_errors = [
            it for it in normalized
            if any(kw in str(it.get('message', '')).lower() for kw in ['unclosed', 'unmatched', 'missing colon', 'unterminated string'])
        ]
        if syntax_delimiter_errors:
            syntax_delimiter_errors.sort(key=lambda item: int(item.get('line', 1)))
            root_delim_line = int(syntax_delimiter_errors[0].get('line', 1))
            filtered: list[dict[str, Any]] = []
            for item in normalized:
                item_line = int(item.get('line', 1))
                item_msg = str(item.get('message', '')).lower()
                # Drop generic cascading parser error on downstream line if caused by unclosed delimiter
                if item_line > root_delim_line and any(kw in item_msg for kw in ['unexpected token', 'expected \';\'', 'invalid syntax']):
                    continue
                filtered.append(item)
            normalized = filtered

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
