export type LanguageConfidence = 'high' | 'medium' | 'low';

export interface LanguageDetectionResult {
  language: string;
  confidence: LanguageConfidence;
  detectedLanguage: string;
  reason: string;
}

type PatternRule = {
  language: string;
  weight: number;
  regex: RegExp;
};

const extensionToLanguage: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  go: 'go',
  rs: 'rust',
  cs: 'csharp',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  sh: 'shell',
  bash: 'shell',
};

const patternRules: PatternRule[] = [
  // Explicit high-confidence signatures requested by user
  { language: 'java', weight: 4, regex: /^\s*public\s+class\s+[A-Z][A-Za-z0-9_]*\b/m },
  { language: 'java', weight: 4, regex: /^\s*package\s+[a-zA-Z_][\w.]*\s*;/m },
  { language: 'java', weight: 4, regex: /^\s*import\s+java\.[\w.*]+\s*;/m },

  { language: 'python', weight: 4, regex: /^\s*def\s+[a-zA-Z_]\w*\s*\(/m },
  { language: 'python', weight: 3, regex: /^\s*import\s+[a-zA-Z_][\w.]*\s*$/m },
  { language: 'python', weight: 5, regex: /if\s+__name__\s*==\s*["']__main__["']\s*:/m },

  { language: 'cpp', weight: 5, regex: /^\s*#include\s*<iostream>\s*$/m },
  { language: 'cpp', weight: 4, regex: /\busing\s+namespace\s+std\s*;/m },

  { language: 'c', weight: 5, regex: /^\s*#include\s*<stdio\.h>\s*$/m },

  { language: 'csharp', weight: 4, regex: /^\s*using\s+System\s*;\s*$/m },
  { language: 'csharp', weight: 3, regex: /^\s*namespace\s+[A-Z][A-Za-z0-9_.]*\b/m },
  { language: 'csharp', weight: 3, regex: /\bclass\s+Program\b/m },

  { language: 'python', weight: 3, regex: /^\s*def\s+[a-zA-Z_]\w*\s*\(/m },
  { language: 'python', weight: 2, regex: /^\s*import\s+[a-zA-Z0-9_.]+\s*$/m },
  { language: 'python', weight: 2, regex: /^\s*from\s+[a-zA-Z0-9_.]+\s+import\s+/m },
  { language: 'python', weight: 2, regex: /:\s*(#.*)?$/m },

  { language: 'javascript', weight: 2, regex: /\bfunction\s+[a-zA-Z_]\w*\s*\(/ },
  { language: 'javascript', weight: 2, regex: /\b(const|let|var)\s+[a-zA-Z_$][\w$]*\s*=/ },
  { language: 'javascript', weight: 2, regex: /\bconsole\.log\s*\(/ },

  { language: 'typescript', weight: 2, regex: /\binterface\s+[A-Z][A-Za-z0-9_]*\b/ },
  { language: 'typescript', weight: 2, regex: /\btype\s+[A-Z][A-Za-z0-9_]*\s*=/ },
  { language: 'typescript', weight: 2, regex: /\b[a-zA-Z_][\w$]*\s*:\s*(string|number|boolean|unknown|any|Record<)/ },

  { language: 'java', weight: 3, regex: /\bpublic\s+class\s+[A-Z][A-Za-z0-9_]*\b/ },
  { language: 'java', weight: 2, regex: /\bSystem\.out\.println\s*\(/ },
  { language: 'java', weight: 2, regex: /\bpublic\s+static\s+void\s+main\s*\(/ },

  { language: 'c', weight: 2, regex: /#include\s*<stdio\.h>/ },
  { language: 'c', weight: 2, regex: /\bint\s+main\s*\(\s*(void)?\s*\)/ },

  { language: 'cpp', weight: 2, regex: /#include\s*<iostream>/ },
  { language: 'cpp', weight: 2, regex: /\bstd::(cout|cin|vector|string)\b/ },

  { language: 'go', weight: 3, regex: /^\s*package\s+main\b/m },
  { language: 'go', weight: 2, regex: /^\s*func\s+[A-Za-z_]\w*\s*\(/m },

  { language: 'rust', weight: 2, regex: /\bfn\s+main\s*\(/ },
  { language: 'rust', weight: 2, regex: /\blet\s+mut\s+[a-zA-Z_]\w*/ },

  { language: 'csharp', weight: 2, regex: /\bnamespace\s+[A-Z][A-Za-z0-9_.]*\b/ },
  { language: 'csharp', weight: 2, regex: /\busing\s+System\b/ },

  { language: 'sql', weight: 3, regex: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b/i },
  { language: 'html', weight: 3, regex: /<\/?[a-zA-Z][^>]*>/ },
  { language: 'css', weight: 2, regex: /[.#]?[a-zA-Z_-][\w-]*\s*\{[^}]*\}/ },
  { language: 'json', weight: 2, regex: /^\s*\{[\s\S]*\}\s*$/m },
  { language: 'shell', weight: 2, regex: /^\s*#!/m },
  { language: 'shell', weight: 2, regex: /^\s*(echo|cd|export|if\s+\[)/m },
];

const scoreThresholds = {
  high: 6,
  medium: 4,
};

const labelForLanguage = (language: string): string => {
  switch (language) {
    case 'plaintext':
      return 'Plain Text';
    case 'python':
      return 'Python';
    case 'javascript':
      return 'JavaScript';
    case 'typescript':
      return 'TypeScript';
    case 'java':
      return 'Java';
    case 'c':
      return 'C';
    case 'cpp':
      return 'C++';
    case 'go':
      return 'Go';
    case 'rust':
      return 'Rust';
    case 'csharp':
      return 'C#';
    case 'sql':
      return 'SQL';
    case 'html':
      return 'HTML';
    case 'css':
      return 'CSS';
    case 'json':
      return 'JSON';
    case 'shell':
      return 'Shell';
    default:
      return language;
  }
};

const normalizeExtension = (fileName: string): string => {
  const clean = fileName.trim().toLowerCase();
  const idx = clean.lastIndexOf('.');
  if (idx < 0 || idx === clean.length - 1) {
    return '';
  }
  return clean.slice(idx + 1);
};

export const detectLanguage = (code: string, fileNameHint?: string): LanguageDetectionResult => {
  const scores: Record<string, number> = {};
  const extension = normalizeExtension(fileNameHint ?? '');
  const extensionLanguage = extensionToLanguage[extension];

  if (extensionLanguage) {
    scores[extensionLanguage] = (scores[extensionLanguage] ?? 0) + 6;
  }

  for (const rule of patternRules) {
    if (rule.regex.test(code)) {
      scores[rule.language] = (scores[rule.language] ?? 0) + rule.weight;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return {
      language: 'plaintext',
      confidence: 'low',
      detectedLanguage: 'Plain Text',
      reason: 'No recognizable syntax pattern or file extension was found.',
    };
  }

  const [topLanguage, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const gap = topScore - secondScore;

  const syntaxScoreForExtension = extensionLanguage ? scores[extensionLanguage] ?? 0 : 0;
  const extensionValidated = Boolean(extensionLanguage && syntaxScoreForExtension >= 7);
  const extensionConflicted = Boolean(extensionLanguage && topLanguage !== extensionLanguage && topScore >= syntaxScoreForExtension + 2);

  if (extensionLanguage && extensionConflicted) {
    return {
      language: topLanguage,
      confidence: topScore >= scoreThresholds.high ? 'high' : 'medium',
      detectedLanguage: labelForLanguage(topLanguage),
      reason: `Extension suggested ${labelForLanguage(extensionLanguage)}, but syntax strongly matches ${labelForLanguage(topLanguage)} (score ${topScore}).`,
    };
  }

  if (extensionLanguage && extensionValidated) {
    return {
      language: extensionLanguage,
      confidence: 'high',
      detectedLanguage: labelForLanguage(extensionLanguage),
      reason: `Detected from extension first and validated by syntax patterns (score ${syntaxScoreForExtension}).`,
    };
  }

  if (extensionLanguage && !extensionValidated) {
    return {
      language: extensionLanguage,
      confidence: topScore >= scoreThresholds.medium ? 'medium' : 'low',
      detectedLanguage: labelForLanguage(extensionLanguage),
      reason: `Detected from extension first, but syntax validation is limited (score ${syntaxScoreForExtension}).`,
    };
  }

  const confidence: LanguageConfidence =
    topScore >= scoreThresholds.high && gap >= 2
      ? 'high'
      : topScore >= scoreThresholds.medium && gap >= 1
      ? 'medium'
      : 'low';

  if (confidence === 'low') {
    return {
      language: 'plaintext',
      confidence,
      detectedLanguage: labelForLanguage(topLanguage),
      reason: `Low-confidence detection (score ${topScore}). Defaulting to Plain Text until you choose a language.`,
    };
  }

  const sourceNote = 'syntax';

  return {
    language: topLanguage,
    confidence,
    detectedLanguage: labelForLanguage(topLanguage),
    reason: `Detected from ${sourceNote} with score ${topScore}.`,
  };
};
