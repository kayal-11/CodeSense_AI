import re

def format_code_snippet(raw_code: str | None, language: str = 'python') -> str:
    """
    Pretty-prints and formats code snippets (Level 1, Level 2, etc.).
    Ensures consistent indentation, spacing, and block structure.
    """
    if not raw_code:
        return ''

    code = str(raw_code).strip()

    # 1. Strip Markdown Code Fences
    if code.startswith('```'):
        first_newline = code.find('\n')
        if first_newline != -1:
            code = code[first_newline + 1:]
        if code.endswith('```'):
            code = code[:-3]
        code = code.strip()

    # 2. Unescape literal string representations
    if '\\n' in code or '\\t' in code:
        code = code.replace('\\n', '\n').replace('\\t', '    ').replace('\\"', '"').replace("\\'", "'")

    norm_lang = (language or '').lower().strip()
    is_python = norm_lang in ('python', 'py')

    # 3. Pre-process lines for squished C/C++/Java/JS single-liners
    raw_lines: list[str] = []
    if not is_python and '\n' not in code and (';' in code or '{' in code):
        buffer = ''
        for char in code:
            buffer += char
            if char in (';', '{', '}'):
                raw_lines.append(buffer.strip())
                buffer = ''
        if buffer.strip():
            raw_lines.append(buffer.strip())
    else:
        raw_lines = code.split('\n')

    formatted_lines: list[str] = []
    indent_level = 0

    for raw_line in raw_lines:
        line = raw_line.strip()
        if not line:
            if formatted_lines and formatted_lines[-1] != '':
                formatted_lines.append('')
            continue

        # Spacing fixes around control keywords and braces
        line = re.sub(r'\b(if|for|while|switch|catch)\s*\(', r'\1 (', line)
        line = re.sub(r'\)\s*\{', ') {', line)
        line = re.sub(r'\belse\s*\{', 'else {', line)
        line = re.sub(r'\btry\s*\{', 'try {', line)
        line = re.sub(r'\bdo\s*\{', 'do {', line)

        if is_python:
            is_dedent = bool(re.match(r'^(elif\b|else\b|except\b|finally\b)', line))
            if is_dedent and indent_level > 0:
                indent_level = max(0, indent_level - 1)

            current_indent = '    ' * indent_level
            formatted_lines.append(current_indent + line)

            if line.endswith(':') or ': #' in line or ':#' in line:
                indent_level += 1
        else:
            open_braces = line.count('{')
            close_braces = line.count('}')

            if line.startswith('}'):
                indent_level = max(0, indent_level - 1)

            current_indent = '    ' * indent_level
            formatted_lines.append(current_indent + line)

            if not line.startswith('}'):
                net_change = open_braces - close_braces
                indent_level = max(0, indent_level + net_change)
            else:
                net_change = open_braces - (close_braces - 1)
                if net_change > 0:
                    indent_level += net_change

    while formatted_lines and formatted_lines[-1] == '':
        formatted_lines.pop()

    return '\n'.join(formatted_lines)
