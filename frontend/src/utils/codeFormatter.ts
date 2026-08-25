/**
 * Automatically formats and pretty-prints code snippets for AI Review (Level 1, Level 2, etc.).
 * Ensures consistent indentation, proper newline splitting for squished statements,
 * correct spacing around keywords and braces, and clean block hierarchy.
 */

export const formatCodeSnippet = (rawCode: string | undefined | null, lang: string = 'python'): string => {
  if (!rawCode) return '';

  let code = String(rawCode).trim();

  // 1. Strip Markdown Code Fences (```python ... ``` or ``` ...)
  if (code.startsWith('```')) {
    const firstNewline = code.indexOf('\n');
    if (firstNewline !== -1) {
      code = code.slice(firstNewline + 1);
    }
    if (code.endsWith('```')) {
      code = code.slice(0, -3);
    }
    code = code.trim();
  }

  // 2. Convert literal escaped character sequences (\n, \t, \", \') to real characters
  if (code.includes('\\n') || code.includes('\\t')) {
    code = code
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '    ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }

  const normalizedLang = (lang || '').toLowerCase().trim();
  const isPython = normalizedLang === 'python' || normalizedLang === 'py';

  // 3. Pre-process lines: If C/C++/Java/JS code has multiple statements squished into one line using ';' or '{' or '}'
  let rawLines: string[] = [];

  if (!isPython && !code.includes('\n') && (code.includes(';') || code.includes('{'))) {
    let buffer = '';
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      buffer += char;
      if (char === ';' || char === '{' || char === '}') {
        rawLines.push(buffer.trim());
        buffer = '';
      }
    }
    if (buffer.trim()) {
      rawLines.push(buffer.trim());
    }
  } else {
    rawLines = code.split('\n');
  }

  // 4. Format lines with block-level indentation & keyword spacing
  const formattedLines: string[] = [];
  let indentLevel = 0;

  for (let idx = 0; idx < rawLines.length; idx++) {
    let line = rawLines[idx].trim();

    // Skip empty lines at the very top or consecutive blank lines
    if (!line) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }

    // Keyword & brace spacing normalizations for C/C++/Java/JS/Python
    line = line
      .replace(/\b(if|for|while|switch|catch)\s*\(/g, '$1 (')
      .replace(/\)\s*\{/g, ') {')
      .replace(/\belse\s*\{/g, 'else {')
      .replace(/\btry\s*\{/g, 'try {')
      .replace(/\bdo\s*\{/g, 'do {')
      .replace(/\bfinally\s*\{/g, 'finally {');

    if (isPython) {
      // Python indentation logic
      const isDedentLine = /^(elif\b|else\b|except\b|finally\b)/.test(line);

      if (isDedentLine && indentLevel > 0) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const currentIndent = '    '.repeat(indentLevel);
      formattedLines.push(currentIndent + line);

      if (line.endsWith(':') || line.includes(': #') || line.includes(':#')) {
        indentLevel++;
      }
    } else {
      // C / C++ / Java / JS indentation logic based on braces '{' and '}'
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      if (line.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const currentIndent = '    '.repeat(indentLevel);
      formattedLines.push(currentIndent + line);

      if (!line.startsWith('}')) {
        const netChange = openBraces - closeBraces;
        indentLevel = Math.max(0, indentLevel + netChange);
      } else {
        const netChange = openBraces - (closeBraces - 1);
        if (netChange > 0) {
          indentLevel += netChange;
        }
      }
    }
  }

  // Remove trailing empty lines
  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
    formattedLines.pop();
  }

  return formattedLines.join('\n');
};
