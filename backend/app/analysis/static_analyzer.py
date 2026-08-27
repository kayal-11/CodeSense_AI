import ast
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def _line_number(code: str, pattern: str) -> int:
    match = re.search(pattern, code, re.IGNORECASE | re.MULTILINE)
    if not match:
        return 1
    return code[: match.start()].count('\n') + 1


def _line_col_from_index(code: str, index: int) -> tuple[int, int]:
    safe_index = max(0, min(index, len(code)))
    line = code[:safe_index].count('\n') + 1
    last_newline = code.rfind('\n', 0, safe_index)
    if last_newline == -1:
        col = safe_index + 1
    else:
        col = safe_index - last_newline
    return line, max(1, col)


def _find_root_unclosed_bracket_line(code: str) -> int:
    lines = code.splitlines()
    stack: list[tuple[str, int]] = []
    opening = {'(', '[', '{'}
    closing = {')': '(', ']': '[', '}': '{'}
    in_string = False
    string_char = ''
    string_start_line = 1

    for idx, line in enumerate(lines):
        line_num = idx + 1
        for ch in line:
            if (ch == '"' or ch == "'" or ch == '`') and not in_string:
                in_string = True
                string_char = ch
                string_start_line = line_num
            elif in_string and ch == string_char:
                in_string = False
            elif not in_string:
                if ch in opening:
                    stack.append((ch, line_num))
                elif ch in closing:
                    if stack and stack[-1][0] == closing[ch]:
                        stack.pop()
                    elif not stack:
                        return line_num
    if in_string:
        return string_start_line
    if stack:
        return stack[0][1]
    return 1



def _append_issue(
    issues: list[dict[str, Any]],
    issue_type: str,
    severity: str,
    message: str,
    line: int,
    why_it_matters: str | None = None,
    suggested_fix: str | None = None,
    is_error: bool = False,
    start_col: int | None = None,
    end_col: int | None = None,
    level: str | None = None,
    end_line: int | None = None,
) -> None:
    item: dict[str, Any] = {
        'type': issue_type,
        'severity': severity,
        'message': message,
        'line': max(1, line),
    }
    if end_line is not None:
        item['end_line'] = max(item['line'], end_line)
    if why_it_matters:
        item['why_it_matters'] = why_it_matters
    if suggested_fix:
        item['suggested_fix'] = suggested_fix
    if is_error:
        item['is_error'] = True
        item['level'] = level or 'Level 1'
    elif level:
        item['level'] = level
    if start_col is not None:
        item['start_col'] = max(1, start_col)
    if end_col is not None:
        item['end_col'] = max(1, end_col)
    issues.append(item)


def _compiler_error_issue(
    issues: list[dict[str, Any]],
    language: str,
    line: int,
    column: int | None,
    message: str,
) -> None:
    lang_name = language.upper()
    col_text = f" at column {column}" if column else ''
    _append_issue(
        issues,
        f'{lang_name} Compiler Error',
        'critical',
        message,
        line,
        why_it_matters='This is an actual language parser/compiler error and blocks correct execution.',
        suggested_fix='Resolve the syntax/type/compiler error shown and re-run analysis.',
        is_error=True,
        start_col=column,
        end_col=(column + 1) if column else None,
    )


def _detect_java_class_name(code: str) -> str | None:
    match = re.search(r'\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)', code)
    if not match:
        return None
    return match.group(1)


def _write_temp_source(temp_dir: str, language: str, code: str, has_problem_url: bool = False) -> tuple[Path, int]:
    ext_map = {
        'python': '.py',
        'javascript': '.js',
        'typescript': '.ts',
        'java': '.java',
        'c': '.c',
        'cpp': '.cpp',
        'csharp': '.cs',
        'go': '.go',
        'rust': '.rs',
    }
    ext = ext_map.get(language, '.txt')
    prepended_lines = 0

    mock_prefix = ""
    if has_problem_url:
        if language == 'java':
            mock_prefix = (
                "import java.util.*;\n"
                "import java.util.stream.*;\n"
                "import java.io.*;\n"
                "import java.math.*;\n"
                "class ListNode { int val; ListNode next; ListNode() {} ListNode(int val) { this.val = val; } ListNode(int val, ListNode next) { this.val = val; this.next = next; } }\n"
                "class TreeNode { int val; TreeNode left; TreeNode right; TreeNode() {} TreeNode(int val) { this.val = val; } TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }\n"
                "class Node { int val; Node left; Node right; Node next; Node random; Node parent; java.util.List<Node> neighbors; Node() {} Node(int _val) { val = _val; } }\n"
                "class Point { int x, y; Point() {} Point(int a, int b) { x = a; y = b; } }\n"
                "class Pair<K,V> { K key; V value; Pair(K k, V v) { key = k; value = v; } K getKey() { return key; } V getValue() { return value; } }\n"
            )
            prepended_lines = mock_prefix.count('\n')
        elif language in {'cpp', 'c++'}:
            mock_prefix = (
                "#include <iostream>\n#include <vector>\n#include <string>\n#include <unordered_map>\n#include <unordered_set>\n#include <map>\n#include <set>\n#include <queue>\n#include <stack>\n#include <algorithm>\n#include <cmath>\n#include <climits>\n#include <numeric>\n#include <utility>\nusing namespace std;\n"
                "struct ListNode { int val; ListNode *next; ListNode() : val(0), next(nullptr) {} ListNode(int x) : val(x), next(nullptr) {} ListNode(int x, ListNode *next) : val(x), next(next) {} };\n"
                "struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode() : val(0), left(nullptr), right(nullptr) {} TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {} };\n"
                "struct Node { int val; std::vector<Node*> neighbors; Node* left; Node* right; Node* next; Node* random; Node() : val(0), left(nullptr), right(nullptr), next(nullptr), random(nullptr) {} Node(int _val) : val(_val), left(nullptr), right(nullptr), next(nullptr), random(nullptr) {} };\n"
            )
            prepended_lines = mock_prefix.count('\n')
        elif language == 'c':
            mock_prefix = (
                "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <stdbool.h>\n#include <math.h>\n#include <limits.h>\n"
                "struct ListNode { int val; struct ListNode *next; };\n"
                "struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };\n"
                "struct Node { int val; struct Node *left; struct Node *right; struct Node *next; struct Node *random; };\n"
                "typedef struct ListNode ListNode;\ntypedef struct TreeNode TreeNode;\ntypedef struct Node Node;\n"
            )
            prepended_lines = mock_prefix.count('\n')

    if language == 'java':
        class_name = _detect_java_class_name(code)
        file_name = f'{class_name}.java' if class_name else f'tmp_source{ext}'
    else:
        file_name = f'tmp_source{ext}'

    source_path = Path(temp_dir) / file_name
    source_path.write_text(mock_prefix + code, encoding='utf-8')
    return source_path, prepended_lines


def _find_first_available(commands: list[str]) -> str | None:
    for command in commands:
        if shutil.which(command):
            return command
    return None


def _language_compile_command(language: str, source_path: Path) -> list[str] | None:
    if language == 'python':
        return None

    if language == 'javascript':
        node_cmd = _find_first_available(['node'])
        if not node_cmd:
            return None
        return [node_cmd, '--check', str(source_path)]

    if language == 'typescript':
        tsc_cmd = _find_first_available(['tsc'])
        if not tsc_cmd:
            return None
        return [tsc_cmd, '--pretty', 'false', '--noEmit', str(source_path)]

    if language == 'java':
        javac_cmd = _find_first_available(['javac'])
        if not javac_cmd:
            return None
        return [javac_cmd, '-Xlint:none', '-Xmaxerrs', '200', str(source_path)]

    if language == 'c':
        c_cmd = _find_first_available(['gcc', 'clang'])
        if not c_cmd:
            return None
        return [c_cmd, '-fsyntax-only', '-fmax-errors=200', str(source_path)]

    if language == 'cpp':
        cpp_cmd = _find_first_available(['g++', 'clang++'])
        if not cpp_cmd:
            return None
        return [cpp_cmd, '-fsyntax-only', '-fmax-errors=200', str(source_path)]

    if language == 'csharp':
        csc_cmd = _find_first_available(['csc'])
        if not csc_cmd:
            return None
        out_path = source_path.parent / 'tmp_source.dll'
        return [csc_cmd, '/nologo', '/t:library', f'/out:{out_path}', str(source_path)]

    if language == 'go':
        go_cmd = _find_first_available(['go'])
        if not go_cmd:
            return None
        return [go_cmd, 'build', str(source_path)]

    if language == 'rust':
        rustc_cmd = _find_first_available(['rustc'])
        if not rustc_cmd:
            return None
        return [rustc_cmd, '--emit=metadata', str(source_path)]

    return None


def _parse_compiler_output(language: str, output: str, source_path: Path) -> list[tuple[int, int | None, str]]:
    diagnostics: list[tuple[int, int | None, str]] = []
    if not output.strip():
        return diagnostics

    source_name = re.escape(source_path.name)

    # file:line:col: error: message
    pattern_1 = re.compile(rf'(?m)^.*{source_name}:(\d+):(\d+):\s*(?:fatal\s+)?error:\s*(.+)$')
    for match in pattern_1.finditer(output):
        diagnostics.append((int(match.group(1)), int(match.group(2)), match.group(3).strip()))

    # file:line: error: message
    pattern_2 = re.compile(rf'(?m)^.*{source_name}:(\d+):\s*error:\s*(.+)$')
    for match in pattern_2.finditer(output):
        diagnostics.append((int(match.group(1)), None, match.group(2).strip()))

    # TypeScript/C# style: file(line,col): error XXX: message
    pattern_3 = re.compile(rf'(?m)^.*{source_name}\((\d+),(\d+)\):\s*error\s+[A-Z]+\d*:\s*(.+)$')
    for match in pattern_3.finditer(output):
        diagnostics.append((int(match.group(1)), int(match.group(2)), match.group(3).strip()))

    # Node --check often emits file:line then SyntaxError line.
    if language == 'javascript' and not diagnostics:
        line_match = re.search(rf'(?m)^.*{source_name}:(\d+)\s*$', output)
        msg_match = re.search(r'(?m)^(SyntaxError:\s*.+)$', output)
        if line_match and msg_match:
            diagnostics.append((int(line_match.group(1)), None, msg_match.group(1).strip()))

    # Go and Rust often use 'file:line:col: message' without explicit 'error:' token.
    if language in {'go', 'rust'}:
        generic = re.compile(rf'(?m)^.*{source_name}:(\d+):(\d+):\s*(.+)$')
        for match in generic.finditer(output):
            msg = match.group(3).strip()
            if 'warning:' in msg.lower():
                continue
            diagnostics.append((int(match.group(1)), int(match.group(2)), msg))

    # Keep order while removing exact duplicates.
    seen: set[tuple[int, int | None, str]] = set()
    deduped: list[tuple[int, int | None, str]] = []
    for item in diagnostics:
        key = (item[0], item[1], item[2].lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def _collect_compiler_diagnostics(code: str, language: str, has_problem_url: bool = False) -> list[dict[str, Any]]:
    normalized = language.lower()
    alias_map = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'c++': 'cpp',
        'cs': 'csharp',
        'c#': 'csharp',
    }
    normalized = alias_map.get(normalized, normalized)

    if normalized not in {'javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust'}:
        return []

    issues: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix='codesense-') as temp_dir:
        source_path, prepended_lines = _write_temp_source(temp_dir, normalized, code, has_problem_url=has_problem_url)
        command = _language_compile_command(normalized, source_path)
        if not command:
            return []

        try:
            result = subprocess.run(
                command,
                cwd=temp_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=15,
                check=False,
            )
        except (subprocess.SubprocessError, OSError):
            return []

        if result.returncode == 0:
            return []

        output = (result.stderr or '') + '\n' + (result.stdout or '')
        diagnostics = _parse_compiler_output(normalized, output, source_path)
        if not diagnostics:
            return []

        for line, col, msg in diagnostics:
            actual_line = max(1, line - prepended_lines)
            lowered = msg.lower()
            if has_problem_url and any(t in lowered for t in [
                'main method', 'missing main', 'undefined reference to main', 'driver entrypoint', 'no main class',
                'main function', 'in function `main`', 'cannot find symbol: method main', 'should be declared in a file named',
                'package does not exist', 'missing package', 'import java.util'
            ]):
                continue
            _compiler_error_issue(issues, normalized, actual_line, col, msg)

        # Deduplicate compiler diagnostics while preserving independent errors on different lines
        if issues:
            distinct_issues: list[dict[str, Any]] = []
            seen_keys: set[tuple[int, str]] = set()
            for item in issues:
                key = (int(item.get('line', 1)), str(item.get('message', '')).lower())
                if key not in seen_keys:
                    seen_keys.add(key)
                    distinct_issues.append(item)
            issues = distinct_issues

    return issues


class PythonErrorDetector(ast.NodeVisitor):
    def __init__(self, code: str, has_problem_url: bool = False):
        self.code = code
        self.has_problem_url = has_problem_url
        self.issues: list[dict[str, Any]] = []
        self.scopes: list[set[str]] = [set()]
        self.imports: set[str] = set()

        self.builtins = {
            'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray',
            'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex', 'delattr',
            'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float',
            'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help',
            'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len',
            'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object',
            'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr',
            'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod',
            'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip', '__import__',
            'True', 'False', 'None', 'Exception', 'BaseException', 'ValueError',
            'TypeError', 'KeyError', 'IndexError', 'AttributeError', 'RuntimeError',
            'NameError', 'SyntaxError', 'ZeroDivisionError', 'ImportError',
            'ModuleNotFoundError', 'StopIteration', 'FileNotFoundError', 'OSError',
            'IOError', 'NotImplementedError', '__name__', '__file__', '__doc__',
            'self', 'cls', 'args', 'kwargs',
            'ListNode', 'TreeNode', 'Node', 'Point', 'Pair', 'Tree', 'QuadTree', 'Solution',
            'Optional', 'List', 'Dict', 'Set', 'Tuple', 'Any', 'Union', 'Iterable', 'Sequence',
            'Callable', 'TypeVar', 'Generic', 'deque', 'defaultdict', 'Counter',
            'heapq', 'heappush', 'heappop', 'heapify', 'bisect', 'bisect_left', 'bisect_right', 'inf', 'nan'
        }

        self.std_modules = {
            'math', 'sys', 'os', 're', 'json', 'time', 'random', 'datetime',
            'collections', 'typing', 'asyncio', 'functools', 'itertools',
            'pathlib', 'urllib', 'requests', 'heapq', 'bisect', 'np', 'pd', 'plt'
        }

    def _is_defined(self, name: str) -> bool:
        if name in self.builtins or name in self.imports:
            return True
        if self.has_problem_url and (name in self.std_modules or name in self.builtins):
            return True
        for scope in reversed(self.scopes):
            if name in scope:
                return True
        return False

    def _add_defined(self, name: str) -> None:
        self.scopes[-1].add(name)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            name = alias.asname or alias.name
            self.imports.add(name)
            self.imports.add(alias.name.split('.')[0])
            self._add_defined(name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self.imports.add(node.module.split('.')[0])
        for alias in node.names:
            name = alias.asname or alias.name
            self.imports.add(name)
            self._add_defined(name)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._add_defined(node.name)
        self.scopes.append(set())
        for arg in node.args.args + node.args.kwonlyargs:
            self.scopes[-1].add(arg.arg)
        if node.args.vararg:
            self.scopes[-1].add(node.args.vararg.arg)
        if node.args.kwarg:
            self.scopes[-1].add(node.args.kwarg.arg)

        self.generic_visit(node)
        self.scopes.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._add_defined(node.name)
        self.scopes.append(set())
        for arg in node.args.args + node.args.kwonlyargs:
            self.scopes[-1].add(arg.arg)
        if node.args.vararg:
            self.scopes[-1].add(node.args.vararg.arg)
        if node.args.kwarg:
            self.scopes[-1].add(node.args.kwarg.arg)

        self.generic_visit(node)
        self.scopes.pop()

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._add_defined(node.name)
        self.scopes.append(set())
        self.generic_visit(node)
        self.scopes.pop()

    def visit_ListComp(self, node: ast.ListComp) -> None:
        self.scopes.append(set())
        for gen in node.generators:
            if isinstance(gen.target, ast.Name):
                self._add_defined(gen.target.id)
            elif isinstance(gen.target, (ast.Tuple, ast.List)):
                for elt in gen.target.elts:
                    if isinstance(elt, ast.Name):
                        self._add_defined(elt.id)
        self.generic_visit(node)
        self.scopes.pop()

    def visit_SetComp(self, node: ast.SetComp) -> None:
        self.scopes.append(set())
        for gen in node.generators:
            if isinstance(gen.target, ast.Name):
                self._add_defined(gen.target.id)
        self.generic_visit(node)
        self.scopes.pop()

    def visit_DictComp(self, node: ast.DictComp) -> None:
        self.scopes.append(set())
        for gen in node.generators:
            if isinstance(gen.target, ast.Name):
                self._add_defined(gen.target.id)
        self.generic_visit(node)
        self.scopes.pop()

    def visit_GeneratorExp(self, node: ast.GeneratorExp) -> None:
        self.scopes.append(set())
        for gen in node.generators:
            if isinstance(gen.target, ast.Name):
                self._add_defined(gen.target.id)
        self.generic_visit(node)
        self.scopes.pop()

    def visit_Assign(self, node: ast.Assign) -> None:
        self.visit(node.value)
        for target in node.targets:
            if isinstance(target, ast.Name):
                self._add_defined(target.id)
            elif isinstance(target, (ast.Tuple, ast.List)):
                for elt in target.elts:
                    if isinstance(elt, ast.Name):
                        self._add_defined(elt.id)

    def visit_AugAssign(self, node: ast.AugAssign) -> None:
        self.visit(node.value)
        if isinstance(node.target, ast.Name):
            if not self._is_defined(node.target.id):
                _append_issue(
                    self.issues,
                    'Undefined Variable',
                    'high',
                    f"'{node.target.id}' is used before it is declared or assigned.",
                    node.lineno,
                    why_it_matters='Augmented assignment requires the variable to be defined beforehand.',
                    suggested_fix=f"Declare or initialize '{node.target.id}' before augmented assignment.",
                    is_error=True,
                    start_col=getattr(node, 'col_offset', 0) + 1,
                    end_col=(getattr(node, 'col_offset', 0) + len(node.target.id) + 1),
                )
            self._add_defined(node.target.id)

    def visit_For(self, node: ast.For) -> None:
        self.visit(node.iter)
        if isinstance(node.target, ast.Name):
            self._add_defined(node.target.id)
        elif isinstance(node.target, (ast.Tuple, ast.List)):
            for elt in node.target.elts:
                if isinstance(elt, ast.Name):
                    self._add_defined(elt.id)
        for item in node.body:
            self.visit(item)
        for item in node.orelse:
            self.visit(item)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            if not self.has_problem_url and node.id in self.std_modules and node.id not in self.imports and node.id not in self.scopes[0]:
                _append_issue(
                    self.issues,
                    'Missing Import',
                    'high',
                    f"'{node.id}' module is used without being imported.",
                    node.lineno,
                    why_it_matters=f"Using '{node.id}' without import causes NameError at runtime.",
                    suggested_fix=f"Add 'import {node.id}' at the top of the file.",
                    is_error=True,
                    start_col=getattr(node, 'col_offset', 0) + 1,
                    end_col=getattr(node, 'col_offset', 0) + len(node.id) + 1,
                )
            elif not self._is_defined(node.id):
                if self.has_problem_url and (node.id in self.builtins or node.id in self.std_modules):
                    return
                _append_issue(
                    self.issues,
                    'Undefined Variable',
                    'high',
                    f"'{node.id}' is used before it is declared.",
                    node.lineno,
                    why_it_matters='Variables must be declared or assigned before access.',
                    suggested_fix=f"Declare or define '{node.id}' before using it.",
                    is_error=True,
                    start_col=getattr(node, 'col_offset', 0) + 1,
                    end_col=getattr(node, 'col_offset', 0) + len(node.id) + 1,
                )

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Attribute) and node.func.attr == 'append':
            if len(node.args) > 1:
                _append_issue(
                    self.issues,
                    'Incorrect Function Usage',
                    'high',
                    f'append() takes exactly 1 argument ({len(node.args)} given).',
                    node.lineno,
                    why_it_matters='Calling append() with multiple arguments raises a TypeError.',
                    suggested_fix='Pass a single item to append() or use extend() for multiple items.',
                    is_error=True,
                    start_col=getattr(node, 'col_offset', 0) + 1,
                    end_col=getattr(node, 'end_col_offset', getattr(node, 'col_offset', 0) + 1),
                )
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
            if isinstance(node.right, ast.Constant) and node.right.value == 0:
                _append_issue(
                    self.issues,
                    'Runtime Error',
                    'critical',
                    'Division or modulo by zero detected.',
                    node.lineno,
                    why_it_matters='Dividing by zero raises ZeroDivisionError at runtime.',
                    suggested_fix='Ensure divisor is non-zero before division.',
                    is_error=True,
                    start_col=getattr(node.right, 'col_offset', 0) + 1,
                    end_col=getattr(node.right, 'end_col_offset', getattr(node.right, 'col_offset', 0) + 2),
                )
        elif isinstance(node.op, ast.Add):
            left_is_str = isinstance(node.left, ast.Constant) and isinstance(node.left.value, str)
            right_is_str = isinstance(node.right, ast.Constant) and isinstance(node.right.value, str)
            left_is_num = isinstance(node.left, ast.Constant) and isinstance(node.left.value, (int, float))
            right_is_num = isinstance(node.right, ast.Constant) and isinstance(node.right.value, (int, float))

            if (left_is_str and right_is_num) or (left_is_num and right_is_str):
                _append_issue(
                    self.issues,
                    'Type Mismatch',
                    'high',
                    'Cannot concatenate string and numeric types directly.',
                    node.lineno,
                    why_it_matters='Python does not implicitly convert number to string during addition.',
                    suggested_fix='Convert number with str() or use f-strings.',
                    is_error=True,
                    start_col=getattr(node, 'col_offset', 0) + 1,
                    end_col=getattr(node, 'end_col_offset', getattr(node, 'col_offset', 0) + 1),
                )
        self.generic_visit(node)


def _append_regex_error(
    issues: list[dict[str, Any]],
    code: str,
    match: re.Match[str],
    issue_type: str,
    severity: str,
    message: str,
    why_it_matters: str,
    suggested_fix: str,
) -> None:
    line, col = _line_col_from_index(code, match.start())
    _append_issue(
        issues,
        issue_type,
        severity,
        message,
        line,
        why_it_matters=why_it_matters,
        suggested_fix=suggested_fix,
        is_error=True,
        start_col=col,
        end_col=col + max(1, match.end() - match.start()),
    )


def _dedupe_issues(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, int, int, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for issue in issues:
        key = (
            str(issue.get('type', '')).lower(),
            int(issue.get('line', 1)),
            int(issue.get('start_col', 1) or 1),
            str(issue.get('severity', '')).lower(),
            str(issue.get('message', '')).strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(issue)

    deduped.sort(
        key=lambda item: (
            0 if item.get('is_error') else 1,
            {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}.get(str(item.get('severity', 'low')).lower(), 3),
            int(item.get('line', 1)),
            int(item.get('start_col', 1) or 1),
        )
    )
    return deduped


def analyze_code(code: str, language: str, problem_info: dict[str, Any] | None = None) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    normalized_language = (language or 'python').strip().lower()
    alias_map = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'c++': 'cpp',
        'cs': 'csharp',
        'c#': 'csharp',
    }
    normalized_language = alias_map.get(normalized_language, normalized_language)
    has_problem_url = bool(problem_info)

    # Use real parser/compiler diagnostics whenever toolchain is available.
    issues.extend(_collect_compiler_diagnostics(code, normalized_language, has_problem_url=has_problem_url))

    # Language-agnostic high-confidence regex detections.
    lines = code.splitlines()
    for idx, line_text in enumerate(lines):
        line_num = idx + 1
        stripped = line_text.strip()
        if not stripped or stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('/*'):
            continue

        missing_eq = re.search(
            r'^\s*\b(int|long|double|float|boolean|short|byte|char|String|var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+([0-9]+|"[^"]*"|\'[^\']*\'|[a-zA-Z_][a-zA-Z0-9_]*)\s*;',
            line_text,
        )
        if missing_eq:
            type_name = missing_eq.group(1)
            var_name = missing_eq.group(2)
            val = missing_eq.group(3)
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                "Missing '=' operator.",
                line_num,
                why_it_matters="Variable assignment requires '='.",
                suggested_fix=f'{type_name} {var_name} = {val};',
                is_error=True,
                start_col=missing_eq.start() + 1,
                end_col=missing_eq.end() + 1,
            )

        missing_val = re.search(
            r'^\s*\b(int|long|double|float|boolean|short|byte|char|String|var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*;',
            line_text,
        )
        if missing_val:
            type_name = missing_val.group(1)
            var_name = missing_val.group(2)
            default_val = '""' if type_name.lower() == 'string' else '0'
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                'Missing value in variable assignment.',
                line_num,
                why_it_matters="'=' must be followed by a valid expression before ';'.",
                suggested_fix=f'{type_name} {var_name} = {default_val};',
                is_error=True,
                start_col=missing_val.start() + 1,
                end_col=missing_val.end() + 1,
            )

        missing_close_call = re.search(r'\b(System\.out\.println|print|printf|console\.log)\s*\([^\)]*$', line_text)
        if missing_close_call:
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                "Missing ')' operator.",
                line_num,
                why_it_matters="Function calls require matching ')'.",
                suggested_fix=f'{stripped})',
                is_error=True,
                start_col=missing_close_call.start() + 1,
                end_col=missing_close_call.end() + 1,
            )

        missing_close_cond = re.search(r'^\s*\b(if|while)\s*\([^\)]*\{', line_text)
        if missing_close_cond:
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                "Missing ')' in condition statement.",
                line_num,
                why_it_matters="Conditional expressions must close ')' before '{'.",
                suggested_fix=re.sub(r'\{', ') {', stripped),
                is_error=True,
                start_col=missing_close_cond.start() + 1,
                end_col=missing_close_cond.end() + 1,
            )

        type_mismatch = re.search(
            r'^\s*\bint\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*("[^"]*");',
            line_text,
        )
        if type_mismatch:
            var_name = type_mismatch.group(1)
            val = type_mismatch.group(2)
            _append_issue(
                issues,
                'Type Mismatch',
                'high',
                f"Type mismatch: cannot assign String value {val} to int variable '{var_name}'.",
                line_num,
                why_it_matters='Statically typed declarations must match value type.',
                suggested_fix=f'String {var_name} = {val};',
                is_error=True,
                start_col=type_mismatch.start() + 1,
                end_col=type_mismatch.end() + 1,
            )

        # Typo: narrayList / ArrayLst -> ArrayList
        arraylst = re.search(r'\b(narrayList|nArraylist|nArrayLst|ArrayLst|Arraylist)\b', line_text)
        if arraylst:
            found_str = arraylst.group(1)
            _append_issue(
                issues,
                'Syntax / Type Error',
                'critical',
                f"Typo in class name: '{found_str}' is undefined. Did you mean 'ArrayList'?",
                line_num,
                why_it_matters="Spelling errors in identifier names result in compilation or symbol resolution errors.",
                suggested_fix="Change to 'ArrayList'.",
                is_error=True,
                start_col=arraylst.start() + 1,
                end_col=arraylst.end() + 1,
            )

        # Typo: HashMp / Hashmap -> HashMap
        hashmp = re.search(r'\b(HashMp|Hashmap)\b', line_text)
        if hashmp:
            _append_issue(
                issues,
                'Syntax / Type Error',
                'critical',
                f"Typo in class name: '{hashmp.group(1)}' is undefined. Did you mean 'HashMap'?",
                line_num,
                why_it_matters="Java class names are case-sensitive and must be spelled correctly.",
                suggested_fix=f"Change '{hashmp.group(1)}' to 'HashMap'.",
                is_error=True,
                start_col=hashmp.start() + 1,
                end_col=hashmp.end() + 1,
            )

        # Typo: mapeed / maped -> map
        mapeed_typo = re.search(r'\b(mapeed|maped)\b', line_text)
        if mapeed_typo:
            found_var = mapeed_typo.group(1)
            _append_issue(
                issues,
                'Undefined Variable / Typo',
                'critical',
                f"Typo in variable name: '{found_var}' is undefined. Did you mean 'map'?",
                line_num,
                why_it_matters="Accessing misspelled or undeclared variable names causes symbol resolution errors.",
                suggested_fix=f"Change '{found_var}' to 'map'.",
                is_error=True,
                start_col=mapeed_typo.start() + 1,
                end_col=mapeed_typo.end() + 1,
            )

        # Typo: Array.sort -> Arrays.sort
        array_sort = re.search(r'\bArray\.sort\b', line_text)
        if array_sort:
            _append_issue(
                issues,
                'API Error',
                'critical',
                "Incorrect class reference: 'Array.sort' is invalid. Did you mean 'Arrays.sort'?",
                line_num,
                why_it_matters="Utility methods for array operations are in java.util.Arrays.",
                suggested_fix="Change 'Array.sort' to 'Arrays.sort'.",
                is_error=True,
                start_col=array_sort.start() + 1,
                end_col=array_sort.end() + 1,
            )

        # Typo in Python function names
        if normalized_language == 'python':
            prnt_typo = re.search(r'\b(prnt|prin|printt|inpt|inputt|lengh)\s*\(', line_text)
            if prnt_typo:
                func_found = prnt_typo.group(1)
                suggested = 'print' if 'pr' in func_found else ('input' if 'in' in func_found else 'len')
                _append_issue(
                    issues,
                    'NameError / Syntax Error',
                    'critical',
                    f"Undefined function '{func_found}'. Did you mean '{suggested}'?",
                    line_num,
                    why_it_matters=f"Calling misspelled function '{func_found}' raises a NameError at runtime.",
                    suggested_fix=f"Change '{func_found}' to '{suggested}'.",
                    is_error=True,
                    start_col=prnt_typo.start() + 1,
                    end_col=prnt_typo.end() + 1,
                )

        undef_func = re.search(r'^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)\s*;', line_text)
        if undef_func:
            func_name = undef_func.group(1)
            known_builtins = {'main', 'println', 'print', 'printf', 'log', 'toString', 'valueOf', 'close'}
            if func_name not in known_builtins and not re.search(r'\b(def|function|void|int|String|boolean|double|float|long)\s+' + re.escape(func_name) + r'\b', code):
                _append_issue(
                    issues,
                    'Undefined Function',
                    'high',
                    f"Undefined function '{func_name}'.",
                    line_num,
                    why_it_matters=f"'{func_name}' is called but not defined or imported in scope.",
                    suggested_fix=f"Define or import function '{func_name}' before calling it.",
                    is_error=True,
                    start_col=undef_func.start(1) + 1,
                    end_col=undef_func.end(1) + 1,
                )

    # Cross-language security findings (not Level 1 unless actual syntax/runtime error).
    secret_match = re.search(r'\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["\'][^"\']{8,}["\']', code, re.IGNORECASE)
    if secret_match:
        line, col = _line_col_from_index(code, secret_match.start())
        _append_issue(
            issues,
            'Security Issue',
            'high',
            'Hardcoded API key or secret detected. Move credentials to environment variables or secret manager.',
            line,
            why_it_matters='Hardcoded secrets expose credentials in source repositories.',
            suggested_fix='Use environment variables or a secret vault instead of hardcoded strings.',
            is_error=False,
            start_col=col,
            end_col=col + max(1, secret_match.end() - secret_match.start()),
        )

    sqli_match = re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b.+(\+\s*[a-zA-Z_]|\{)', code, re.IGNORECASE)
    if sqli_match:
        line, col = _line_col_from_index(code, sqli_match.start())
        _append_issue(
            issues,
            'Critical Issue',
            'critical',
            'SQL Injection detected. Avoid dynamic query construction; use parameterized queries or prepared statements.',
            line,
            why_it_matters='Dynamic query string building enables SQL injection vulnerabilities.',
            suggested_fix='Use parameterized queries or ORM query builders.',
            is_error=True,
            start_col=col,
            end_col=col + max(1, sqli_match.end() - sqli_match.start()),
        )

    if normalized_language == 'python':
        try:
            tree = ast.parse(code)
            detector = PythonErrorDetector(code, has_problem_url=has_problem_url)
            detector.visit(tree)
            issues.extend(detector.issues)
        except SyntaxError as exc:
            lineno = max(1, getattr(exc, 'lineno', 1) or 1)
            offset = getattr(exc, 'offset', None)
            msg = str(getattr(exc, 'msg', exc))
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                f'Syntax Error: {msg}',
                lineno,
                why_it_matters='Python code contains invalid syntax and cannot be executed.',
                suggested_fix=f'Fix the syntax error at line {lineno}.',
                is_error=True,
                start_col=offset,
                end_col=(offset + 1) if isinstance(offset, int) else None,
            )

        if re.search(r'\bexec\(|eval\(', code):
            _append_issue(
                issues,
                'Code Quality Issue',
                'medium',
                'Avoid using eval or exec for dynamic code execution.',
                _line_number(code, r'\bexec\(|eval\('),
                why_it_matters='Dynamic code execution introduces security and debugging risks.',
                suggested_fix='Replace eval/exec with explicit data structures or safe functions.',
                is_error=False,
            )

    elif normalized_language in {'javascript', 'typescript'}:
        open_braces = code.count('{') - code.count('}')
        open_parens = code.count('(') - code.count(')')
        open_brackets = code.count('[') - code.count(']')
        if open_braces != 0 or open_parens != 0 or open_brackets != 0:
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                'Unbalanced braces, parentheses, or brackets detected.',
                _find_root_unclosed_bracket_line(code),
                why_it_matters='Mismatched delimiters prevent parsing or execution.',
                suggested_fix='Check matching pairs for {}, (), and [].',
                is_error=True,
            )

        # Fallback declared/used variable checks for JS/TS when compiler is unavailable.
        declared_vars: dict[str, int] = {}
        js_lines = code.splitlines()
        for idx, line_text in enumerate(js_lines):
            matches = re.findall(r'\b(const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', line_text)
            for _, var_name in matches:
                declared_vars.setdefault(var_name, idx + 1)

        builtins_js = {
            'console', 'window', 'document', 'process', 'require', 'module', 'exports',
            'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
            'RegExp', 'Error', 'Set', 'Map', 'Promise', 'undefined', 'null', 'true', 'false',
            'if', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'class', 'import',
            'from', 'export', 'else', 'switch', 'case', 'break', 'default', 'try', 'catch',
            'finally', 'throw', 'new', 'typeof', 'instanceof', 'this', 'super', 'await', 'async',
            'number', 'string', 'boolean', 'any', 'unknown', 'void', 'never', 'object', 'bigint', 'symbol'
        }

        for idx, line_text in enumerate(js_lines):
            line_num = idx + 1
            stripped = line_text.strip()
            if not stripped or stripped.startswith('//'):
                continue

            used_words = set(re.findall(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b', line_text))
            for word in used_words:
                if word in builtins_js:
                    continue
                if word in declared_vars and declared_vars[word] > line_num:
                    col_match = re.search(rf'\b{re.escape(word)}\b', line_text)
                    _append_issue(
                        issues,
                        'Undefined Variable',
                        'high',
                        f"'{word}' is used before it is declared.",
                        line_num,
                        why_it_matters='Accessing block-scoped variables before declaration causes runtime errors.',
                        suggested_fix=f"Declare '{word}' before line {line_num} using let/const.",
                        is_error=True,
                        start_col=(col_match.start() + 1) if col_match else None,
                        end_col=(col_match.end() + 1) if col_match else None,
                    )
                elif (
                    word not in declared_vars
                    and re.search(r'\b' + re.escape(word) + r'\s*=\s*', line_text)
                    and not re.search(r'\b(const|let|var)\s+' + re.escape(word) + r'\b', line_text)
                ):
                    col_match = re.search(rf'\b{re.escape(word)}\b', line_text)
                    _append_issue(
                        issues,
                        'Undefined Variable',
                        'high',
                        f"'{word}' is used before it is declared.",
                        line_num,
                        why_it_matters='Assignments to undeclared identifiers are error-prone and can fail at runtime.',
                        suggested_fix=f"Declare '{word}' with let or const before assigning it.",
                        is_error=True,
                        start_col=(col_match.start() + 1) if col_match else None,
                        end_col=(col_match.end() + 1) if col_match else None,
                    )

        if ('fs.' in code or 'readFileSync(' in code) and 'require(' not in code and 'import ' not in code:
            _append_issue(
                issues,
                'Missing Import',
                'high',
                "'fs' module is used without being imported or required.",
                _line_number(code, r'fs\.|readFileSync\('),
                why_it_matters='Using Node.js modules without import/require causes runtime failures.',
                suggested_fix="Add import fs from 'fs'; or const fs = require('fs');",
                is_error=True,
            )

        if normalized_language == 'typescript':
            for idx, line_text in enumerate(js_lines):
                line_num = idx + 1
                checks = [
                    (r'\b(const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*number\s*=\s*["\']', 'number', 'string'),
                    (r'\b(const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*string\s*=\s*\d', 'string', 'number'),
                    (r'\b(const|let|var)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*boolean\s*=\s*(?:\d|["\'])', 'boolean', 'number/string'),
                ]
                for pattern, declared_type, value_type in checks:
                    match = re.search(pattern, line_text)
                    if not match:
                        continue
                    _append_issue(
                        issues,
                        'Type Mismatch',
                        'high',
                        f"Type '{value_type}' is not assignable to type '{declared_type}'.",
                        line_num,
                        why_it_matters='TypeScript enforces declared type contracts during compilation.',
                        suggested_fix=f"Assign a value of type '{declared_type}' or update the declared type.",
                        is_error=True,
                        start_col=match.start() + 1,
                        end_col=match.end() + 1,
                    )

            ts_type_mismatch = re.finditer(
                r'\b(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(number|string|boolean)\s*=\s*("[^"]*"|\'[^\']*\'|\d+(?:\.\d+)?|true|false)',
                code,
            )
            for match in ts_type_mismatch:
                declared_type = match.group(3)
                value_literal = match.group(4)
                value_type = 'string' if value_literal.startswith(('"', "'")) else ('boolean' if value_literal in {'true', 'false'} else 'number')
                if declared_type != value_type:
                    line, col = _line_col_from_index(code, match.start(4))
                    _append_issue(
                        issues,
                        'Type Mismatch',
                        'high',
                        f"Type '{value_type}' is not assignable to type '{declared_type}'.",
                        line,
                        why_it_matters='TypeScript enforces declared type contracts during compilation.',
                        suggested_fix=f"Assign a value of type '{declared_type}' or update the declared type.",
                        is_error=True,
                        start_col=col,
                        end_col=col + len(value_literal),
                    )

    elif normalized_language == 'java':
        if re.search(r'System\.out\.println\(', code):
            _append_issue(
                issues,
                'Code Quality Issue',
                'medium',
                'Use a logger instead of System.out.println().',
                _line_number(code, r'System\.out\.println\('),
                why_it_matters='println reduces production logging control.',
                suggested_fix='Use a logger framework (SLF4J/Log4j).',
                is_error=False,
            )

        if not has_problem_url:
            java_util_classes = ['List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet', 'Scanner']
            for cls_name in java_util_classes:
                if re.search(r'\b' + cls_name + r'\b', code) and 'import java.util' not in code:
                    _append_issue(
                        issues,
                        'Missing Import',
                        'high',
                        f"'{cls_name}' is used without importing java.util.{cls_name}.",
                        _line_number(code, r'\b' + cls_name + r'\b'),
                        why_it_matters=f"Using '{cls_name}' without import causes compilation error.",
                        suggested_fix=f"Add 'import java.util.{cls_name};' or 'import java.util.*;' at the top.",
                        is_error=True,
                    )

        lines_local = code.splitlines()
        nested_loop_found = False
        for index, line_text in enumerate(lines_local):
            if re.search(r'\b(for|while)\s*\(', line_text):
                search_window = lines_local[index + 1: min(index + 12, len(lines_local))]
                if any(re.search(r'\b(for|while)\s*\(', window_line) for window_line in search_window):
                    _append_issue(
                        issues,
                        'Performance Issue',
                        'medium',
                        'Nested loop detected (O(n²)). Consider reducing time complexity.',
                        index + 1,
                        why_it_matters='Nested loops can increase execution time quadratically.',
                        suggested_fix='Use HashMap/Set lookups to reduce repeated scans.',
                        is_error=False,
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
                why_it_matters='ArrayList.contains is O(n), HashSet.contains is O(1).',
                suggested_fix='Use HashSet to make membership lookups constant-time.',
                is_error=False,
            )

    elif normalized_language in {'c', 'cpp', 'csharp', 'go', 'rust'}:
        if not has_problem_url and normalized_language in {'c', 'cpp'}:
            if ('printf(' in code or 'scanf(' in code) and '#include <stdio.h>' not in code and '#include <cstdio>' not in code:
                _append_issue(
                    issues,
                    'Missing Import',
                    'high',
                    "'stdio.h' header is missing for printf/scanf.",
                    _line_number(code, r'printf\(|scanf\('),
                    why_it_matters='Missing required headers causes compile failures.',
                    suggested_fix="Add '#include <stdio.h>' at the top.",
                    is_error=True,
                )
            if ('cout' in code or 'cin' in code) and '#include <iostream>' not in code:
                _append_issue(
                    issues,
                    'Missing Import',
                    'high',
                    "'iostream' header is missing for std::cout/std::cin.",
                    _line_number(code, r'cout|cin'),
                    why_it_matters='Missing iostream causes compile failures.',
                    suggested_fix="Add '#include <iostream>' at the top.",
                    is_error=True,
                )

        open_braces = code.count('{') - code.count('}')
        open_parens = code.count('(') - code.count(')')
        if open_braces != 0 or open_parens != 0:
            _append_issue(
                issues,
                'Syntax Error',
                'critical',
                'Unbalanced braces or parentheses detected.',
                _find_root_unclosed_bracket_line(code),
                why_it_matters='Mismatched braces/parentheses cause syntax and compile errors.',
                suggested_fix="Ensure all '{' and '(' tokens are properly closed.",
                is_error=True,
            )

    issues = _dedupe_issues(issues)

    deductions = 0
    for issue in issues:
        severity = str(issue.get('severity', 'low')).lower()
        if severity == 'critical':
            deductions += 18
        elif severity == 'high':
            deductions += 14
        elif severity == 'medium':
            deductions += 9
        else:
            deductions += 5

    score = max(45, 100 - deductions)
    summary = 'Static analysis completed successfully. Review findings are ready for AI-assisted remediation.'
    return {'summary': summary, 'issues': issues, 'score': score}
