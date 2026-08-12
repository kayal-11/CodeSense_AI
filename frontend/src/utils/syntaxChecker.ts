export interface RealTimeSyntaxError {
  lineNumber: number;
  title: string;
  description: string;
}

export const traceRootSyntaxErrorLine = (
  rawLine: number | null,
  code: string,
  language: string
): number | null => {
  if (!code.trim()) return rawLine;

  const lines = code.split('\n');
  const maxLine = rawLine && rawLine >= 1 ? Math.min(rawLine, lines.length) : lines.length;

  // 1. Scan from line 1 up to maxLine for unclosed brackets or strings
  const stack: Array<{ char: string; line: number }> = [];
  const openingChars = new Set(['(', '[', '{']);
  const closingMap: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let inString = false;
  let stringChar = '';
  let stringStartLine = 0;
  let isEscaped = false;

  for (let l = 0; l < maxLine; l += 1) {
    const line = lines[l];
    const lineNum = l + 1;

    for (let c = 0; c < line.length; c += 1) {
      const char = line[c];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\' && inString) {
        isEscaped = true;
        continue;
      }

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
      if (char === '#' && language === 'python') break;
      if (char === '/' && line[c + 1] === '/') break;

      if (openingChars.has(char)) {
        stack.push({ char, line: lineNum });
      } else if (closingMap[char]) {
        if (stack.length > 0 && stack[stack.length - 1].char === closingMap[char]) {
          stack.pop();
        }
      }
    }

    if (inString && stringChar !== '`' && !code.includes('"""') && !code.includes("'''")) {
      if (lineNum > stringStartLine && !lines[lineNum - 2]?.endsWith('\\')) {
        return stringStartLine; // Root error is the unterminated string start line
      }
    }
  }

  // If an opening bracket opened on line X <= maxLine was left unclosed, line X is the root error line!
  if (stack.length > 0) {
    return stack[0].line; // Earliest unclosed bracket line
  }

  // 2. Check for missing block colons in Python between line 1 and maxLine
  if (language === 'python') {
    const blockKeywords = /^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b|finally\b|with\s+|async\s+def\s+)/;
    for (let l = 0; l < maxLine; l += 1) {
      const cleanLine = lines[l].replace(/#.*$/, '').trim();
      const lineNum = l + 1;
      if (blockKeywords.test(cleanLine) && !cleanLine.endsWith(':') && !cleanLine.endsWith('\\') && !cleanLine.endsWith('(')) {
        return lineNum; // Earliest missing colon line!
      }
    }
  }

  return rawLine;
};

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
            description: `Unexpected '${char}' on line ${lineNum} with no matching '${closingMap[char]}'.`,
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
    const unclosed = stack[0]; // Point to the EARLIEST unclosed opening bracket line (root cause)
    errors.push({
      lineNumber: unclosed.line,
      title: 'Syntax Error: Unclosed Bracket',
      description: `Unclosed '${unclosed.char}' opened on line ${unclosed.line}.`,
    });
  }

  // 3. Language-Specific Keyword & Colon checks
  if (errors.length === 0) {
    for (let l = 0; l < lines.length; l++) {
      const rawLine = lines[l];
      const lineNum = l + 1;
      const cleanLine = rawLine.replace(/#.*$/, '').trim();
      if (!cleanLine || cleanLine.startsWith('#') || cleanLine.startsWith('//')) continue;

      if (language === 'python') {
        const blockKeywords = /^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b|finally\b|with\s+|async\s+def\s+)/;
        if (blockKeywords.test(cleanLine) && !cleanLine.endsWith(':')) {
          if (!cleanLine.endsWith('(') && !cleanLine.endsWith('\\')) {
            errors.push({
              lineNumber: lineNum,
              title: 'Python Syntax Error: Missing Colon',
              description: `Expected ':' at the end of '${cleanLine.split(' ')[0]}' statement on line ${lineNum}.`,
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
  codeLines: string[],
  code?: string,
  language?: string
): number | null => {
  if (codeLines.length === 0) return null;

  let rawLine = finding.lineNumber;

  // Trace back cascading parser errors to earliest root mistake line
  if (code && language && rawLine) {
    const rootLine = traceRootSyntaxErrorLine(rawLine, code, language);
    if (rootLine && rootLine >= 1 && rootLine <= codeLines.length) {
      rawLine = rootLine;
    }
  }

  // 1. Source of truth check: If a valid lineNumber exists in range, check line content
  if (rawLine && rawLine >= 1 && rawLine <= codeLines.length) {
    if (codeLines[rawLine - 1].trim().length > 0) {
      return rawLine;
    }
    // If the exact raw line is blank, check adjacent non-empty code lines
    const offsets = [1, -1, 2, -2, 3, -3];
    for (const offset of offsets) {
      const idx = rawLine - 1 + offset;
      if (idx >= 0 && idx < codeLines.length && codeLines[idx].trim().length > 0) {
        return idx + 1;
      }
    }
  }

  // 2. Fallback search only when rawLine is missing/invalid: search code for specific quoted symbol names
  const stopWords = new Set([
    'line', 'code', 'error', 'syntax', 'type', 'value', 'at', 'the', 'a', 'an', 'is', 'was', 'were',
    'fix', 'issue', 'missing', 'expected', 'found', 'defined', 'used', 'variable', 'function', 'statement',
    'int', 'str', 'bool', 'float', 'list', 'dict', 'none', 'true', 'false', 'var', 'let', 'const', 'def', 'class'
  ]);

  const textToSearch = `${finding.description || ''} ${finding.title || ''}`;
  const symbolMatches = textToSearch.match(/['"`]([a-zA-Z_][a-zA-Z0-9_.]*)['"`]/g);
  if (symbolMatches) {
    for (const rawSym of symbolMatches) {
      const sym = rawSym.replace(/['"`]/g, '').trim();
      if (sym.length >= 2 && !stopWords.has(sym.toLowerCase())) {
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

  return null;
};
