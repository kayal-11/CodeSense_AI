import ast
import re
from typing import Any


def _line_number(code: str, pattern: str) -> int:
    match = re.search(pattern, code, re.IGNORECASE | re.MULTILINE)
    if not match:
        return 1
    return code[: match.start()].count('\n') + 1


def _append_issue(issues: list[dict[str, Any]], issue_type: str, severity: str, message: str, line: int) -> None:
    issues.append({'type': issue_type, 'severity': severity, 'message': message, 'line': line})


def analyze_code(code: str, language: str) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    normalized_language = language.lower()

    # Cross-language secret detection
    if re.search(r'\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["\'][^"\']{8,}["\']', code, re.IGNORECASE):
        _append_issue(
            issues,
            'Security Issue',
            'high',
            'Hardcoded API Key or secret detected. Move credentials to environment variables or secret manager.',
            _line_number(code, r'\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["\'][^"\']{8,}["\']'),
        )

    if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b.+(\+\s*[a-zA-Z_]|\{)', code, re.IGNORECASE):
        _append_issue(
            issues,
            'Critical Issue',
            'critical',
            'SQL Injection detected. Avoid dynamic query construction; use parameterized queries or prepared statements.',
            _line_number(code, r'\b(SELECT|INSERT|UPDATE|DELETE)\b.+(\+\s*[a-zA-Z_]|\{)'),
        )

    if language == 'python':
        try:
            ast.parse(code)
        except SyntaxError as exc:
            _append_issue(issues, 'Critical Issue', 'high', str(exc), max(1, getattr(exc, 'lineno', 1)))

        if re.search(r'\bexec\(|eval\(', code):
            _append_issue(
                issues,
                'Code Quality Issue',
                'medium',
                'Avoid using eval or exec for dynamic code execution.',
                _line_number(code, r'\bexec\(|eval\('),
            )

        if re.search(r'\bSELECT\b.*\{', code, re.IGNORECASE):
            _append_issue(
                issues,
                'Critical Issue',
                'critical',
                'SQL Injection detected. Dynamic query construction found.',
                _line_number(code, r'\bSELECT\b.*\{'),
            )

    if normalized_language in {'java'}:
        if re.search(r'System\.out\.println\(', code):
            _append_issue(
                issues,
                'Code Quality Issue',
                'medium',
                'Use a logger instead of System.out.println().',
                _line_number(code, r'System\.out\.println\('),
            )

        method_pattern = re.compile(
            r'(public|private|protected)\s+[\w<>\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{',
            re.MULTILINE,
        )
        for method_match in method_pattern.finditer(code):
            method_name = method_match.group(2)
            if not re.match(r'^[a-z][a-zA-Z0-9]*$', method_name):
                _append_issue(
                    issues,
                    'Best Practice Violation',
                    'low',
                    "Method name doesn't follow Java conventions.",
                    code[: method_match.start()].count('\n') + 1,
                )
                break

        lines = code.splitlines()

        # Nested loop detector (simple heuristic)
        nested_loop_found = False
        for index, line in enumerate(lines):
            if re.search(r'\b(for|while)\s*\(', line):
                search_window = lines[index + 1 : min(index + 12, len(lines))]
                if any(re.search(r'\b(for|while)\s*\(', window_line) for window_line in search_window):
                    _append_issue(
                        issues,
                        'Performance Issue',
                        'medium',
                        'Nested loop detected (O(n²)). Consider reducing time complexity.',
                        index + 1,
                    )
                    nested_loop_found = True
                    break

        if 'ArrayList<' in code and '.contains(' in code and nested_loop_found:
            _append_issue(
                issues,
                'Optimization Opportunity',
                'medium',
                'Replace ArrayList lookup with HashSet for faster membership checks.',
                _line_number(code, r'ArrayList<'),
            )

        # Method length heuristic
        for method_match in method_pattern.finditer(code):
            start_pos = method_match.end()
            brace_depth = 1
            cursor = start_pos
            while cursor < len(code) and brace_depth > 0:
                if code[cursor] == '{':
                    brace_depth += 1
                elif code[cursor] == '}':
                    brace_depth -= 1
                cursor += 1
            method_body = code[start_pos:cursor]
            method_line_count = len([line for line in method_body.splitlines() if line.strip()])
            if method_line_count > 30:
                _append_issue(
                    issues,
                    'Maintainability Issue',
                    'medium',
                    'Method exceeds recommended length. Break it into smaller focused methods.',
                    code[: method_match.start()].count('\n') + 1,
                )
                break
            loop_count = len(re.findall(r'\b(for|while)\s*\(', method_body))
            statement_count = len([line for line in method_body.splitlines() if line.strip().endswith(';')])
            if loop_count >= 2 and statement_count >= 6:
                _append_issue(
                    issues,
                    'Maintainability Issue',
                    'medium',
                    'Method exceeds recommended complexity and should be split into smaller methods.',
                    code[: method_match.start()].count('\n') + 1,
                )
                break

        # Duplicate statement heuristic for helper extraction recommendation
        stripped_lines = [line.strip() for line in lines if line.strip() and not line.strip().startswith('//')]
        repeated_line = next((line for line in set(stripped_lines) if stripped_lines.count(line) >= 3 and len(line) > 5), None)
        if repeated_line:
            _append_issue(
                issues,
                'AI Recommendation',
                'low',
                'Extract repeated logic into a helper method to improve reuse and readability.',
                _line_number(code, re.escape(repeated_line)),
            )

    deductions = 0
    for issue in issues:
        severity = str(issue.get('severity', 'low')).lower()
        if severity in {'critical'}:
            deductions += 18
        elif severity in {'high'}:
            deductions += 14
        elif severity in {'medium'}:
            deductions += 9
        else:
            deductions += 5

    score = max(45, 100 - deductions)
    summary = 'Static analysis completed successfully. Review findings are ready for AI-assisted remediation.'
    return {'summary': summary, 'issues': issues, 'score': score}
