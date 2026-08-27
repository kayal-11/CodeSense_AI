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

export const detectSyntaxErrors = (
  code: string,
  language: string,
  isProblemUrlActive: boolean = false
): RealTimeSyntaxError[] => {
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

  // 3. Language-Specific Keyword, Delimiter & Typo checks
  for (let l = 0; l < lines.length; l++) {
    const rawLine = lines[l];
    const lineNum = l + 1;
    const cleanLine = rawLine.replace(/#.*$/, '').replace(/\/\/.*$/, '').trim();
    if (!cleanLine) continue;

    if (language === 'python') {
      const blockKeywords = /^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b|finally\b|with\s+|async\s+def\s+)/;
      if (blockKeywords.test(cleanLine) && !cleanLine.endsWith(':')) {
        if (!cleanLine.endsWith('(') && !cleanLine.endsWith('\\')) {
          errors.push({
            lineNumber: lineNum,
            title: 'Python Syntax Error: Missing Colon',
            description: `Expected ':' at the end of '${cleanLine.split(' ')[0]}' statement on line ${lineNum}.`,
          });
        }
      }

      const pyTypo = cleanLine.match(/\b(prnt|prin|printt|inpt|inputt|lengh)\s*\(/);
      if (pyTypo) {
        const found = pyTypo[1];
        const fix = found.includes('pr') ? 'print' : (found.includes('in') ? 'input' : 'len');
        errors.push({
          lineNumber: lineNum,
          title: 'Python NameError: Typo in Function Name',
          description: `Undefined function '${found}' on line ${lineNum}. Did you mean '${fix}'?`,
        });
      }
    }

    if (language === 'java' || language === 'c' || language === 'cpp') {
      // Typo: narrayList / ArrayLst / HashMp
      const classTypo = cleanLine.match(/\b(narrayList|nArraylist|nArrayLst|ArrayLst|Arraylist|HashMp|Hashmap)\b/);
      if (classTypo) {
        const found = classTypo[1];
        const fix = found.toLowerCase().includes('hash') ? 'HashMap' : 'ArrayList';
        errors.push({
          lineNumber: lineNum,
          title: 'Java Syntax / Type Error',
          description: `Typo in class name '${found}' on line ${lineNum}. Did you mean '${fix}'?`,
        });
      }

      // Typo: mapeed / maped
      const varTypo = cleanLine.match(/\b(mapeed|maped)\b/);
      if (varTypo) {
        const found = varTypo[1];
        errors.push({
          lineNumber: lineNum,
          title: 'Undefined Variable / Typo',
          description: `Typo in variable name '${found}' on line ${lineNum}. Did you mean 'map'?`,
        });
      }

      // Typo: Array.sort
      if (/\bArray\.sort\b/.test(cleanLine)) {
        errors.push({
          lineNumber: lineNum,
          title: 'Java API Error',
          description: `Incorrect class reference 'Array.sort' on line ${lineNum}. Did you mean 'Arrays.sort'?`,
        });
      }

      // Missing semicolon check on control flow & statements (continue, break, return, declarations)
      const isControlFlowNoSemi = /^\s*(continue|break|return(\s+[^;]+)?|throw\s+[^;]+)\s*$/.test(cleanLine);
      const isDeclNoSemi = /^\s*(int|long|double|float|boolean|char|String|var|auto|[a-zA-Z_][a-zA-Z0-9_<>]*)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[^;]+$/.test(cleanLine);

      if ((isControlFlowNoSemi || isDeclNoSemi) && !cleanLine.endsWith(';') && !cleanLine.endsWith('{') && !cleanLine.endsWith('}') && !cleanLine.endsWith('(') && !cleanLine.endsWith(',')) {
        const stmtKeyword = cleanLine.trim().split(/\s+/)[0];
        errors.push({
          lineNumber: lineNum,
          title: `${language.toUpperCase()} Syntax Error: Missing Semicolon`,
          description: `Missing ';' at end of '${stmtKeyword}' statement on line ${lineNum}.`,
        });
      }
    }
  }

  return errors;
};

export const extractCandidateTokens = (fullText: string): string[] => {
  const quoted = (fullText.match(/['"`]([a-zA-Z_][a-zA-Z0-9_.]*)['"`]/g) || []).map((s) => s.replace(/['"`]/g, ''));
  const phraseMatches = Array.from(fullText.matchAll(/\b(?:symbol|variable|class|method|function|identifier|type|name|unknown|undefined)\s+[:']*\s*([a-zA-Z_][a-zA-Z0-9_.]*)/gi)).map((m) => m[1]);
  const allWords = (fullText.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || []);

  const stopWords = new Set([
    'line', 'code', 'error', 'syntax', 'type', 'value', 'at', 'the', 'a', 'an', 'is', 'was', 'were',
    'fix', 'issue', 'missing', 'expected', 'found', 'defined', 'used', 'variable', 'function', 'statement',
    'int', 'str', 'bool', 'float', 'list', 'dict', 'none', 'true', 'false', 'var', 'let', 'const', 'def', 'class',
    'public', 'private', 'protected', 'void', 'return', 'if', 'else', 'for', 'while', 'cannot', 'find', 'symbol',
    'location', 'java', 'python', 'cpp', 'csharp', 'critical', 'high', 'medium', 'low', 'did', 'you', 'mean',
    'in', 'of', 'to', 'with', 'or', 'and', 'not', 'package', 'import', 'method', 'resolved', 'resolve', 'compiler'
  ]);

  const candidates: string[] = [];
  const seen = new Set<string>();

  [...quoted, ...phraseMatches, ...allWords].forEach((t) => {
    const clean = t.replace(/^\.+|\.+$/g, '').trim();
    if (clean.length >= 2 && !stopWords.has(clean.toLowerCase()) && !seen.has(clean)) {
      seen.add(clean);
      candidates.push(clean);
    }
  });

  return candidates;
};

export const recalculateFindingLine = (
  finding: { lineNumber: number | null; description?: string; title?: string; message?: string },
  codeLines: string[],
  code?: string,
  language?: string
): number | null => {
  if (codeLines.length === 0) return null;

  const textToSearch = `${finding.title || ''} ${finding.description || ''} ${finding.message || ''}`;

  // 1. Search candidate tokens against original Monaco Editor lines
  const candidates = extractCandidateTokens(textToSearch);
  for (const token of candidates) {
    const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (let idx = 0; idx < codeLines.length; idx++) {
      const cleanLine = codeLines[idx].replace(/#.*$/, '').replace(/\/\/.*$/, '');
      const isClassHeader = /^\s*(public\s+|private\s+)?(class|interface|enum)\s+/.test(cleanLine);
      if (isClassHeader && token !== 'Solution' && !cleanLine.includes(token)) {
        continue;
      }
      if (regex.test(cleanLine)) {
        return idx + 1; // Return exact 1-based line number from Monaco Editor
      }
    }
  }

  // 2. Pattern signature relocation for missing parenthesis in conditions or missing colons
  if (textToSearch.toLowerCase().includes('condition') || textToSearch.toLowerCase().includes("missing ')'")) {
    const matchIdx = codeLines.findIndex((line) => {
      const clean = line.replace(/\/\/.*$/, '').trim();
      return /^\s*\b(if|while)\b/.test(clean) && !/\)\s*\{|\)\s*$/.test(clean);
    });
    if (matchIdx !== -1) return matchIdx + 1;
  }

  if (textToSearch.toLowerCase().includes('colon')) {
    const matchIdx = codeLines.findIndex((line) => {
      const clean = line.replace(/#.*$/, '').trim();
      return /^(def\s+|class\s+|if\s+|elif\s+|else\b|for\s+|while\s+|try\b|except\b)/.test(clean) && !clean.endsWith(':');
    });
    if (matchIdx !== -1) return matchIdx + 1;
  }

  let rawLine = finding.lineNumber;

  if (code && language && rawLine) {
    const rootLine = traceRootSyntaxErrorLine(rawLine, code, language);
    if (rootLine && rootLine >= 1 && rootLine <= codeLines.length) {
      rawLine = rootLine;
    }
  }

  // 3. Header Protection: If rawLine points to Line 1/Line 2 or a class Solution header, do NOT leave it on line 1!
  if (rawLine && rawLine >= 1 && rawLine <= codeLines.length) {
    const content = codeLines[rawLine - 1] ? codeLines[rawLine - 1].trim() : '';
    const isHeader = /^\s*(public\s+|private\s+)?(class\s+Solution|class\s+[A-Z]|public\s+static\s+void\s+main|public\s+[a-zA-Z0-9_<>]+\s+[a-zA-Z0-9_]+\s*\()/.test(content) || (rawLine === 1 && content.includes('class Solution'));
    if (!isHeader && content.length > 0) {
      return rawLine;
    }
  }

  // Find first non-header code line in Monaco Editor body
  for (let idx = 0; idx < codeLines.length; idx++) {
    const clean = codeLines[idx].trim();
    const isHdr = /^\s*(public\s+|private\s+)?(class\s+Solution|class\s+[A-Z]|public\s+static\s+void\s+main|public\s+[a-zA-Z0-9_<>]+\s+[a-zA-Z0-9_]+\s*\()/.test(clean) || (idx === 0 && clean.includes('class Solution'));
    if (clean.length > 0 && !isHdr) {
      return idx + 1;
    }
  }

  return null;
};
