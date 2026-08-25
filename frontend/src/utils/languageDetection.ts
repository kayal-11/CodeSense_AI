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
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
};

const patternRules: PatternRule[] = [
  // Java
  { language: 'java', weight: 5, regex: /^\s*(public|private|protected)\s+(class|interface|enum)\b/m },
  { language: 'java', weight: 5, regex: /\bpublic\s+static\s+void\s+main\s*\(/ },
  { language: 'java', weight: 4, regex: /^\s*package\s+[a-zA-Z_][\w.]*\s*;/m },
  { language: 'java', weight: 4, regex: /^\s*import\s+java\.[\w.*]+\s*;/m },
  { language: 'java', weight: 3, regex: /\bSystem\.(out|err)\.print(ln)?\s*\(/ },
  { language: 'java', weight: 3, regex: /\bnew\s+[A-Z][A-Za-z0-9_]*\s*<.*>\s*\(/ },
  { language: 'java', weight: 2, regex: /\b(String|Integer|Boolean|Double|List|Map|HashMap|ArrayList)\s+[a-zA-Z_]\w*\s*=/ },

  // Python
  { language: 'python', weight: 5, regex: /^\s*def\s+[a-zA-Z_]\w*\s*\(/m },
  { language: 'python', weight: 5, regex: /^\s*class\s+[a-zA-Z_]\w*\s*(\(.*\))?\s*:/m },
  { language: 'python', weight: 4, regex: /^\s*(from\s+[a-zA-Z0-9_.]+\s+)?import\s+/m },
  { language: 'python', weight: 5, regex: /if\s+__name__\s*==\s*["']__main__["']\s*:/m },
  { language: 'python', weight: 3, regex: /\bprint\s*\(.*\)/ },
  { language: 'python', weight: 3, regex: /:\s*#.*$/m },
  { language: 'python', weight: 3, regex: /^\s*(elif|except)\b/m },
  { language: 'python', weight: 2, regex: /self\.[a-zA-Z_]\w*/ },

  // C++
  { language: 'cpp', weight: 5, regex: /^\s*#include\s*<(iostream|vector|map|unordered_map|algorithm|string|set|queue|stack|bits\/stdc\+\+\.h)>\s*$/m },
  { language: 'cpp', weight: 5, regex: /\busing\s+namespace\s+std\s*;/m },
  { language: 'cpp', weight: 4, regex: /\bstd::(cout|cin|cerr|vector|string|map|set|unique_ptr|shared_ptr)\b/ },
  { language: 'cpp', weight: 4, regex: /\b(cout|cin)\s*<<|\bcin\s*>>/ },
  { language: 'cpp', weight: 3, regex: /\bvector\s*<\s*[\w:]+\s*>/ },
  { language: 'cpp', weight: 3, regex: /\btemplate\s*<\s*typename\b|\btemplate\s*<\s*class\b/ },
  { language: 'cpp', weight: 3, regex: /\bstatic_cast\s*<|\bdynamic_cast\s*</ },

  // C
  { language: 'c', weight: 5, regex: /^\s*#include\s*<(stdio\.h|stdlib\.h|string\.h|math\.h|stdbool\.h|limits\.h)>\s*$/m },
  { language: 'c', weight: 4, regex: /\b(printf|scanf|malloc|free|calloc|realloc)\s*\(/ },
  { language: 'c', weight: 4, regex: /\bint\s+main\s*\(\s*(void|int\s+argc)?/ },
  { language: 'c', weight: 3, regex: /\bstruct\s+[a-zA-Z_]\w*\s*\{/ },
  { language: 'c', weight: 3, regex: /#define\s+[A-Z0-9_]+\s+/ },
];

const scoreThresholds = {
  high: 5,
  medium: 3,
};

const labelForLanguage = (language: string): string => {
  switch (language) {
    case 'python':
      return 'Python';
    case 'java':
      return 'Java';
    case 'c':
      return 'C';
    case 'cpp':
      return 'C++';
    default:
      return 'Python';
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
  const scores: Record<string, number> = {
    python: 0,
    java: 0,
    c: 0,
    cpp: 0,
  };

  const extension = normalizeExtension(fileNameHint ?? '');
  const extensionLanguage = extensionToLanguage[extension];

  if (extensionLanguage && scores[extensionLanguage] !== undefined) {
    scores[extensionLanguage] += 6;
  }

  for (const rule of patternRules) {
    if (rule.regex.test(code)) {
      scores[rule.language] = (scores[rule.language] ?? 0) + rule.weight;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLanguage, topScore] = ranked[0];

  if (topScore === 0) {
    return {
      language: 'python',
      confidence: 'low',
      detectedLanguage: 'Python',
      reason: 'No recognizable C/C++/Java/Python syntax signature was detected. Defaulting to Python.',
    };
  }

  const secondScore = ranked[1]?.[1] ?? 0;
  const gap = topScore - secondScore;

  const syntaxScoreForExtension = extensionLanguage ? scores[extensionLanguage] ?? 0 : 0;
  const extensionValidated = Boolean(extensionLanguage && syntaxScoreForExtension >= 6);

  if (extensionLanguage && extensionValidated) {
    return {
      language: extensionLanguage,
      confidence: 'high',
      detectedLanguage: labelForLanguage(extensionLanguage),
      reason: `Detected from file extension (.${extension}) and confirmed by syntax analysis.`,
    };
  }

  const confidence: LanguageConfidence =
    topScore >= scoreThresholds.high && gap >= 2
      ? 'high'
      : topScore >= scoreThresholds.medium
      ? 'medium'
      : 'low';

  return {
    language: topLanguage,
    confidence,
    detectedLanguage: labelForLanguage(topLanguage),
    reason: `Detected ${labelForLanguage(topLanguage)} syntax with score ${topScore}.`,
  };
};
