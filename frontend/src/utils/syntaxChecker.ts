export interface RealTimeSyntaxError {
  lineNumber: number;
  title: string;
  description: string;
}

export const detectSyntaxErrors = (code: string, language: string): RealTimeSyntaxError[] => {
  if (!code.trim()) return [];

  const lines = code.split('\n');
  const errors: RealTimeSyntaxError[] = [];

  // 1. JSON check
  if (language === 'json') {
    try {
      JSON.parse(code);
    } catch (e: any) {
      const msg = e?.message || 'Invalid JSON syntax';
      const lineMatch = msg.match(/line (\d+)/i) || msg.match(/at position (\d+)/i);
      let lineNum = 1;
      if (lineMatch?.[1]) {
        const posOrLine = Number(lineMatch[1]);
        if (msg.includes('position')) {
          lineNum = code.slice(0, posOrLine).split('\n').length;
        } else {
          lineNum = posOrLine;
        }
      }
      errors.push({
        lineNumber: Math.min(lines.length, Math.max(1, lineNum)),
        title: 'JSON Syntax Error',
        description: msg,
      });
    }
    return errors;
  }

  // 2. Bracket / Parentheses / Brace Matching
  const stack: Array<{ char: string; line: number }> = [];
  const openingChars = new Set(['(', '[', '{']);
  const closingMap: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  let inString = false;
  let stringChar = '';
  let stringStartLine = 0;
  let isEscaped = false;

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    const lineNum = l + 1;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        isEscaped = true;
        continue;
      }

      // Handle quotes
      if ((char === '"' || char === "'" || char === '`') && !inString) {
        if (language === 'python' && (line.slice(c, c + 3) === '"""' || line.slice(c, c + 3) === "'''")) {
          c += 2;
          continue;
        }
        inString = true;
        stringChar = char;
        stringStartLine = lineNum;
        continue;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
        continue;
      }

      if (inString) continue;

      // Handle comments
      if (char === '#' && language === 'python') break;
      if (char === '/' && line[c + 1] === '/') break;

      if (openingChars.has(char)) {
        stack.push({ char, line: lineNum });
      } else if (closingMap[char]) {
        if (stack.length === 0) {
          errors.push({
            lineNumber: lineNum,
            title: 'Syntax Error: Unmatched Closing Bracket',
            description: `Unexpected '${char}' with no matching '${closingMap[char]}'.`,
          });
          break;
        }
        const top = stack.pop();
        if (top && top.char !== closingMap[char]) {
          errors.push({
            lineNumber: lineNum,
            title: 'Syntax Error: Mismatched Bracket',
            description: `Closing '${char}' does not match opening '${top.char}' from line ${top.line}.`,
          });
          break;
        }
      }
    }

    if (inString && stringChar !== '`' && !code.includes('"""') && !code.includes("'''")) {
      if (lineNum > stringStartLine && !lines[lineNum - 2]?.endsWith('\\')) {
        errors.push({
          lineNumber: stringStartLine,
          title: 'Syntax Error: Unterminated String Literal',
          description: `Unterminated string starting with ${stringChar} at line ${stringStartLine}.`,
        });
        inString = false;
      }
    }
  }

  if (stack.length > 0 && errors.length === 0) {
    const unclosed = stack[stack.length - 1];
    errors.push({
      lineNumber: unclosed.line,
      title: 'Syntax Error: Unclosed Bracket',
      description: `Unclosed '${unclosed.char}' opened on line ${unclosed.line}.`,
    });
  }

  // 3. Language-Specific Keyword & Colon checks
  if (errors.length === 0) {
    for (let l = 0; l < lines.length; l++) {
      const line = lines[l].trim();
      const lineNum = l + 1;
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      if (language === 'python') {
        const blockKeywords = /^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b|finally\b|with\s+|async\s+def\s+)/;
        if (blockKeywords.test(line) && !line.endsWith(':') && !line.includes('#')) {
          if (!line.endsWith('(') && !line.endsWith('\\')) {
            errors.push({
              lineNumber: lineNum,
              title: 'Python Syntax Error: Missing Colon',
              description: `Expected ':' at the end of '${line.split(' ')[0]}' statement on line ${lineNum}.`,
            });
            break;
          }
        }
      }
    }
  }

  return errors;
};

export const recalculateFindingLine = (
  finding: { lineNumber: number | null; description?: string; title?: string },
  codeLines: string[]
): number | null => {
  if (codeLines.length === 0) return null;

  // Try extracting single-quoted or backtick-quoted symbols from description/title
  const symbolMatches = ((finding.description || '') + ' ' + (finding.title || '')).match(/['"`]([a-zA-Z_][a-zA-Z0-9_.]*)['"`]/g);
  if (symbolMatches) {
    for (const rawSym of symbolMatches) {
      const sym = rawSym.replace(/['"`]/g, '').trim();
      if (
        sym.length >= 2 &&
        !['int', 'str', 'bool', 'float', 'list', 'dict', 'none', 'true', 'false', 'var', 'let', 'const', 'function', 'def', 'class'].includes(
          sym.toLowerCase()
        )
      ) {
        const matchingLineIdx = codeLines.findIndex((line) => {
          const trimmed = line.trim();
          return !trimmed.startsWith('#') && !trimmed.startsWith('//') && line.includes(sym);
        });
        if (matchingLineIdx !== -1) {
          return matchingLineIdx + 1;
        }
      }
    }
  }

  // Check rawLine
  const rawLine = finding.lineNumber;
  if (rawLine && rawLine >= 1 && rawLine <= codeLines.length) {
    if (codeLines[rawLine - 1].trim().length > 0) {
      return rawLine;
    }
    const offsets = [1, -1, 2, -2, 3, -3];
    for (const offset of offsets) {
      const idx = rawLine - 1 + offset;
      if (idx >= 0 && idx < codeLines.length && codeLines[idx].trim().length > 0) {
        return idx + 1;
      }
    }
  }

  return null;
};
