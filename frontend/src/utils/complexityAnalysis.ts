export interface ComplexityProfile {
  time: string;
  space: string;
  signature: string;
  reasons: string[];
}

const normalizeCode = (source: string): string => {
  let code = source.replace(/\r\n/g, '\n');
  code = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  code = code.replace(/(^|\s)#.*$/gm, ' ');
  code = code.replace(/\/\/.*$/gm, ' ');
  code = code.replace(/"(?:\\.|[^"\\])*"/g, '""');
  code = code.replace(/'(?:\\.|[^'\\])*'/g, "''");
  return code;
};

const countMatches = (text: string, pattern: RegExp): number => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const detectLoopDepthBraceStyle = (code: string): { maxDepth: number; totalLoops: number } => {
  const lines = code.split('\n');
  const stack: boolean[] = [];
  let activeLoopDepth = 0;
  let maxDepth = 0;
  let totalLoops = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let prefix = rawLine;
    while (prefix.trimStart().startsWith('}')) {
      const closeIndex = prefix.indexOf('}');
      if (closeIndex < 0) break;
      const marker = stack.pop();
      if (marker) activeLoopDepth = Math.max(0, activeLoopDepth - 1);
      prefix = prefix.slice(closeIndex + 1);
    }

    const isLoopLine = /\b(for|while|foreach)\b/.test(line);
    const openCount = countMatches(line, /\{/g);

    if (isLoopLine) {
      totalLoops += 1;
      const depth = activeLoopDepth + 1;
      if (depth > maxDepth) maxDepth = depth;
    }

    if (openCount > 0) {
      for (let i = 0; i < openCount; i += 1) {
        const loopFrame = isLoopLine && i === 0;
        stack.push(loopFrame);
        if (loopFrame) activeLoopDepth += 1;
      }
    }

    const closeCount = countMatches(line, /\}/g);
    const consumedPrefixClosures = rawLine.trimStart().match(/^\}+/)?.[0]?.length ?? 0;
    const remainingCloseCount = Math.max(0, closeCount - consumedPrefixClosures);
    for (let i = 0; i < remainingCloseCount; i += 1) {
      const marker = stack.pop();
      if (marker) activeLoopDepth = Math.max(0, activeLoopDepth - 1);
    }
  }

  return { maxDepth, totalLoops };
};

const detectLoopDepthPythonStyle = (code: string): { maxDepth: number; totalLoops: number } => {
  const lines = code.split('\n');
  const stack: Array<{ indent: number; loop: boolean }> = [];
  let maxDepth = 0;
  let totalLoops = 0;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    if (rawLine.trimStart().startsWith('#')) continue;

    const indentSpaces = rawLine.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0;

    while (stack.length > 0 && indentSpaces <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const line = rawLine.trim();
    const isLoop = /^(for|while)\b/.test(line);
    const startsBlock = /:\s*$/.test(line);

    if (isLoop) {
      totalLoops += 1;
      const parentLoopDepth = stack.filter((frame) => frame.loop).length;
      const depth = parentLoopDepth + 1;
      if (depth > maxDepth) maxDepth = depth;
    }

    if (startsBlock) {
      stack.push({ indent: indentSpaces, loop: isLoop });
    }
  }

  return { maxDepth, totalLoops };
};

const detectRecursion = (code: string): { recursive: boolean; branching: boolean; divideConquer: boolean } => {
  const functionNameCandidates = new Set<string>();

  for (const match of code.matchAll(/\bdef\s+([A-Za-z_]\w*)\s*\(/g)) {
    functionNameCandidates.add(match[1]);
  }
  for (const match of code.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(/g)) {
    functionNameCandidates.add(match[1]);
  }
  for (const match of code.matchAll(/\b(?:public|private|protected|static|final|async|inline|virtual|\s)+[\w<>,\[\]\s:*&]+\s+([A-Za-z_]\w*)\s*\(/g)) {
    functionNameCandidates.add(match[1]);
  }

  let recursive = false;
  let branching = false;

  functionNameCandidates.forEach((name) => {
    const calls = countMatches(code, new RegExp(`\\b${name}\\s*\\(`, 'g'));
    if (calls >= 2) recursive = true;
    if (calls >= 3) branching = true;
  });

  const divideConquer =
    /\b(mid|pivot|half|left\s*\+\s*right\s*\/\s*2)\b/i.test(code) &&
    /\b(low\s*=\s*mid\s*[+]-?|high\s*=\s*mid\s*[+]-?)\b/i.test(code);

  return { recursive, branching, divideConquer };
};

const timeComplexityFromDepth = (depth: number): string => {
  if (depth <= 0) return 'O(1)';
  if (depth === 1) return 'O(n)';
  if (depth === 2) return 'O(n^2)';
  if (depth === 3) return 'O(n^3)';
  return 'O(n^k)';
};

const complexityRank: Record<string, number> = {
  'O(1)': 1,
  'O(log n)': 2,
  'O(n)': 3,
  'O(n log n)': 4,
  'O(n^2)': 5,
  'O(n^3)': 6,
  'O(n^k)': 7,
  'O(2^n)': 8,
};

export const deriveComplexity = (sourceCode: string): ComplexityProfile => {
  const code = normalizeCode(sourceCode || '');
  const lower = code.toLowerCase();

  const braceLoops = detectLoopDepthBraceStyle(code);
  const pythonLoops = detectLoopDepthPythonStyle(code);
  const maxLoopDepth = Math.max(braceLoops.maxDepth, pythonLoops.maxDepth);
  const totalLoops = Math.max(braceLoops.totalLoops, pythonLoops.totalLoops);

  const hasSort = /(\.sort\s*\(|\bsort\s*\(|\barrays\.sort\b|\bcollections\.sort\b|\bstable_sort\b|\bqsort\b)/i.test(code);
  const hasHashStructure = /(hashmap|unordered_map|dictionary|map<|new\s+map\s*\(|\bset\s*\(|hashset|unordered_set|dict\s*\()/i.test(lower);
  const hasBinarySearchPattern =
    /\bwhile\s*\(?.*low\s*<=\s*high.*\)?/i.test(code) &&
    /\bmid\b/i.test(code) &&
    /(low\s*=\s*mid\s*\+\s*1|high\s*=\s*mid\s*-\s*1)/i.test(code);
  const hasDirectIndexAccess = /(\[[^\]]+\])/i.test(code);

  const recursion = detectRecursion(code);

  let time = timeComplexityFromDepth(maxLoopDepth);
  const reasons: string[] = [];

  if (hasBinarySearchPattern && maxLoopDepth <= 1) {
    time = 'O(log n)';
    reasons.push('Detected binary-search update pattern (low/high/mid).');
  } else if (hasSort && complexityRank[time] <= complexityRank['O(n)']) {
    time = 'O(n log n)';
    reasons.push('Detected sorting operation.');
  } else if (hasHashStructure && maxLoopDepth <= 1 && totalLoops > 0) {
    time = 'O(n)';
    reasons.push('Single-pass loop with hash-based lookups.');
  } else if (recursion.branching) {
    time = 'O(2^n)';
    reasons.push('Detected branching recursion without memoization signal.');
  } else if (recursion.recursive && recursion.divideConquer && maxLoopDepth <= 1) {
    time = 'O(log n)';
    reasons.push('Detected divide-and-conquer recursion pattern.');
  } else if (recursion.recursive && maxLoopDepth <= 1) {
    time = 'O(n)';
    reasons.push('Detected linear recursion.');
  } else if (maxLoopDepth > 0) {
    reasons.push(`Detected loop nesting depth ${maxLoopDepth}.`);
  } else {
    reasons.push('No dominant iterative or recursive growth pattern detected.');
  }

  let space = 'O(1)';
  if (hasHashStructure) {
    space = 'O(n)';
  } else if (hasSort && !hasDirectIndexAccess) {
    space = 'O(n)';
  }

  if (recursion.recursive && space === 'O(1)') {
    space = recursion.divideConquer ? 'O(log n)' : 'O(n)';
  }

  const signature = [
    `time:${time}`,
    `space:${space}`,
    `depth:${maxLoopDepth}`,
    `sort:${hasSort ? 1 : 0}`,
    `hash:${hasHashStructure ? 1 : 0}`,
    `binary:${hasBinarySearchPattern ? 1 : 0}`,
    `recursive:${recursion.recursive ? 1 : 0}`,
    `branch:${recursion.branching ? 1 : 0}`,
  ].join('|');

  return { time, space, signature, reasons };
};
