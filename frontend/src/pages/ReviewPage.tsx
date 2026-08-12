import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { motion } from 'framer-motion';
import axios from 'axios';
import { detectLanguage } from '../utils/languageDetection';
import { deriveComplexity } from '../utils/complexityAnalysis';
import { Copy, Download, Save, Sparkles, Upload } from 'lucide-react';
import { detectSyntaxErrors, recalculateFindingLine } from '../utils/syntaxChecker';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

type SupportedLanguage = 'python' | 'java' | 'javascript' | 'typescript' | 'c' | 'cpp' | 'csharp' | 'go' | 'rust' | 'plaintext';

interface LanguageTemplate {
  label: string;
  fileName: string;
  sampleCode: string;
}

const LANGUAGE_TEMPLATES: Record<SupportedLanguage, LanguageTemplate> = {
  python: {
    label: 'Python',
    fileName: 'example.py',
    sampleCode: `def two_sum(nums: list[int], target: int) -> list[int]:
    seen: dict[int, int] = {}
    for index, value in enumerate(nums):
        needed = target - value
        if needed in seen:
            return [seen[needed], index]
        seen[value] = index
    return []
`,
  },
  java: {
    label: 'Java',
    fileName: 'example.java',
    sampleCode: `import java.util.HashMap;
import java.util.Map;

public class Example {
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int needed = target - nums[i];
            if (seen.containsKey(needed)) {
                return new int[]{seen.get(needed), i};
            }
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}
`,
  },
  javascript: {
    label: 'JavaScript',
    fileName: 'example.js',
    sampleCode: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i += 1) {
    const needed = target - nums[i];
    if (seen.has(needed)) {
      return [seen.get(needed), i];
    }
    seen.set(nums[i], i);
  }
  return [];
}
`,
  },
  typescript: {
    label: 'TypeScript',
    fileName: 'example.ts',
    sampleCode: `export function twoSum(nums: number[], target: number): [number, number] | [] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i += 1) {
    const needed = target - nums[i];
    if (seen.has(needed)) {
      return [seen.get(needed) as number, i];
    }
    seen.set(nums[i], i);
  }
  return [];
}
`,
  },
  c: {
    label: 'C',
    fileName: 'example.c',
    sampleCode: `#include <stdio.h>

int main(void) {
    int nums[] = {2, 7, 11, 15};
    int target = 9;
    for (int i = 0; i < 4; i++) {
        for (int j = i + 1; j < 4; j++) {
            if (nums[i] + nums[j] == target) {
                printf("[%d, %d]\\n", i, j);
                return 0;
            }
        }
    }
    return 0;
}
`,
  },
  cpp: {
    label: 'C++',
    fileName: 'example.cpp',
    sampleCode: `#include <iostream>
#include <unordered_map>
#include <vector>

std::vector<int> twoSum(const std::vector<int>& nums, int target) {
    std::unordered_map<int, int> seen;
    for (int i = 0; i < static_cast<int>(nums.size()); i++) {
        int needed = target - nums[i];
        auto it = seen.find(needed);
        if (it != seen.end()) {
            return {it->second, i};
        }
        seen[nums[i]] = i;
    }
    return {};
}
`,
  },
  csharp: {
    label: 'C#',
    fileName: 'example.cs',
    sampleCode: `using System.Collections.Generic;

public static class Example {
    public static int[] TwoSum(int[] nums, int target) {
        var seen = new Dictionary<int, int>();
        for (var i = 0; i < nums.Length; i++) {
            var needed = target - nums[i];
            if (seen.TryGetValue(needed, out var index)) {
                return new[] { index, i };
            }
            seen[nums[i]] = i;
        }
        return new int[0];
    }
}
`,
  },
  go: {
    label: 'Go',
    fileName: 'example.go',
    sampleCode: `package main

func twoSum(nums []int, target int) []int {
    seen := map[int]int{}
    for i, value := range nums {
        needed := target - value
        if index, ok := seen[needed]; ok {
            return []int{index, i}
        }
        seen[value] = i
    }
    return []int{}
}
`,
  },
  rust: {
    label: 'Rust',
    fileName: 'example.rs',
    sampleCode: `use std::collections::HashMap;

fn two_sum(nums: Vec<i32>, target: i32) -> Vec<usize> {
    let mut seen: HashMap<i32, usize> = HashMap::new();
    for (index, value) in nums.iter().enumerate() {
        let needed = target - value;
        if let Some(found) = seen.get(&needed) {
            return vec![*found, index];
        }
        seen.insert(*value, index);
    }
    vec![]
}
`,
  },
  plaintext: {
    label: 'Plain Text',
    fileName: 'example.txt',
    sampleCode: 'Paste or upload source code to begin analysis.',
  },
};

const DEFAULT_LANGUAGE: SupportedLanguage = 'plaintext';

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  Object.prototype.hasOwnProperty.call(LANGUAGE_TEMPLATES, value);

const templateForLanguage = (language: string): LanguageTemplate => {
  if (isSupportedLanguage(language)) {
    return LANGUAGE_TEMPLATES[language];
  }
  return LANGUAGE_TEMPLATES.plaintext;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

interface Issue {
  type: string;
  severity: string;
  message: string;
  line: number;
  end_line?: number;
  start_col?: number;
  end_col?: number;
  title?: string;
  description?: string;
  why_it_matters?: string;
  suggested_fix?: string;
  improved_code?: string;
}

interface ReviewResponse {
  id?: number;
  summary: string;
  issues: Issue[];
  score: number;
  overall_score?: number;
  bugs?: Issue[];
  security_vulnerabilities?: Issue[];
  performance_issues?: Issue[];
  code_smells?: Issue[];
  complexity_analysis?: string;
  best_practice_violations?: Issue[];
  ai_explanations?: string[];
  suggested_fixes?: string[];
  refactored_code?: string;
  documentation_suggestions?: string[];
  unit_test_suggestions?: string[];
  severity_breakdown?: Record<string, number>;
  learning_assistant?: {
    level_1_hint?: string[];
    level_2_guidance?: string[];
    level_3_optimized_solution?: {
      code?: string;
      is_already_optimal?: boolean;
      explanations?: string[];
      complexity_improvements?: string[];
      best_practices?: string[];
    };
  };
  code_hash?: string;
  cached?: boolean;
}

interface FindingCard {
  id: string;
  category: string;
  severity: string;
  title: string;
  lineNumber: number | null;
  endLineNumber?: number;
  description: string;
  whyItMatters: string;
  suggestedFix: string;
  improvedCode?: string;
  isError?: boolean;
  level?: string;
  startCol?: number;
  endCol?: number;
}

const severityRank: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const severityDisplay = (severity: string): string => {
  const normalized = severity.toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
};

const titleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const getValidErrorLineNumber = (
  rawLine: number | null | undefined,
  codeLines: string[]
): number | null => {
  if (!rawLine || rawLine < 1 || rawLine > codeLines.length) {
    return null;
  }

  const targetLineIdx = rawLine - 1;
  if (codeLines[targetLineIdx].trim().length > 0) {
    return rawLine;
  }

  // If the target line is blank/empty, check adjacent lines (+1, -1, +2, -2) for nearest non-empty code line
  const offsets = [1, -1, 2, -2];
  for (const offset of offsets) {
    const candidateIdx = targetLineIdx + offset;
    if (candidateIdx >= 0 && candidateIdx < codeLines.length) {
      if (codeLines[candidateIdx].trim().length > 0) {
        return candidateIdx + 1;
      }
    }
  }

  return null;
};

const textFromAny = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (!value) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const parseLooseObjectString = (value: string): Record<string, string> | null => {
  const text = value.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return null;
  }

  const fields = ['type', 'category', 'severity', 'title', 'message', 'description', 'line', 'why', 'why_it_matters', 'fix', 'suggested_fix', 'improved_code'];
  const parsed: Record<string, string> = {};

  for (const field of fields) {
    const regex = new RegExp(`['\"]${field}['\"]\\s*:\\s*(['\"])([\\s\\S]*?)\\1`, 'i');
    const match = text.match(regex);
    if (match?.[2]) {
      parsed[field] = match[2].trim();
      continue;
    }

    if (field === 'line') {
      const lineMatch = text.match(/['\"]line['\"]\s*:\s*(\d+)/i);
      if (lineMatch?.[1]) {
        parsed.line = lineMatch[1];
      }
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
};

const inferWhyItMatters = (category: string, severity: string): string => {
  const categoryText = category.toLowerCase();
  if (categoryText.includes('security')) {
    return 'This can expose sensitive data or open attack paths if exploited.';
  }
  if (categoryText.includes('performance') || categoryText.includes('complexity')) {
    return 'This can increase execution time and degrade user experience at scale.';
  }
  if (categoryText.includes('bug') || severity.toLowerCase() === 'critical') {
    return 'This can cause incorrect behavior or runtime failures in production.';
  }
  if (categoryText.includes('smell') || categoryText.includes('practice')) {
    return 'This increases maintenance cost and makes the codebase harder to evolve safely.';
  }
  return 'Addressing this improves reliability, maintainability, and overall code quality.';
};

const asFindingCard = (input: Record<string, unknown>, fallbackCategory: string, id: string): FindingCard => {
  const category = textFromAny(input.type || input.category || fallbackCategory) || fallbackCategory;
  const severity = (textFromAny(input.severity) || 'medium').toLowerCase();
  const description = textFromAny(input.description || input.message || 'Issue detected by analyzer.');
  const title = textFromAny(input.title) || titleCase(category);
  const lineRaw = textFromAny(input.line);
  const lineNumber = lineRaw && /^\d+$/.test(lineRaw) ? Number(lineRaw) : null;
  const endLineRaw = textFromAny(input.end_line);
  const endLineNumber = endLineRaw && /^\d+$/.test(endLineRaw) ? Number(endLineRaw) : undefined;
  const whyItMatters = textFromAny(input.why_it_matters || input.why) || inferWhyItMatters(category, severity);
  const suggestedFix = textFromAny(input.suggested_fix || input.fix) || 'Refactor the affected line and add a focused test to verify the improvement.';
  const improvedCode = textFromAny(input.improved_code) || undefined;
  const isError = Boolean(input.is_error);
  const level = textFromAny(input.level) || (isError ? 'Level 1' : undefined);
  const startCol = typeof input.start_col === 'number' ? input.start_col : undefined;
  const endCol = typeof input.end_col === 'number' ? input.end_col : undefined;

  return {
    id,
    category: titleCase(category),
    severity,
    title,
    lineNumber,
    endLineNumber,
    description,
    whyItMatters,
    suggestedFix,
    improvedCode,
    isError,
    level,
    startCol,
    endCol,
  };
};

const isErrorFinding = (finding: FindingCard): boolean => {
  if (finding.isError) return true;
  if ((finding.level || '').toLowerCase() === 'level 1') return true;
  const cat = finding.category.toLowerCase();
  const title = finding.title.toLowerCase();
  const desc = finding.description.toLowerCase();
  const combined = `${cat} ${title} ${desc}`;
  const errorKeywords = [
    'syntax error',
    'compilation error',
    'runtime error',
    'undefined variable',
    'used before it is declared',
    'used before assignment',
    'missing import',
    'type mismatch',
    'incorrect function usage',
    'incorrect method usage',
    'zero division',
    'division by zero',
    'referenceerror',
    'typeerror',
    'nameerror',
    'syntaxerror',
    'bug',
  ];
  return errorKeywords.some((kw) => combined.includes(kw));
};

const extractFindingsFromTextList = (items: string[], prefix: string): FindingCard[] => {
  const cards: FindingCard[] = [];
  items.forEach((item, index) => {
    const parsed = parseLooseObjectString(item);
    if (parsed) {
      cards.push(asFindingCard(parsed, 'AI Suggestion', `${prefix}-obj-${index}`));
      return;
    }
    cards.push(
      asFindingCard(
        {
          type: 'AI Suggestion',
          severity: 'low',
          title: 'AI Suggestion',
          description: item,
          suggested_fix: item,
        },
        'AI Suggestion',
        `${prefix}-txt-${index}`
      )
    );
  });
  return cards;
};

const severityBadgeClass = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'border-red-500/40 bg-red-500/15 text-red-200';
    case 'high':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-200';
    case 'medium':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-200';
    default:
      return 'border-blue-500/40 bg-blue-500/15 text-blue-200';
  }
};

const stableCodeHash = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
};

const normalizedSeverityBreakdown = (breakdown?: Record<string, number>): Record<string, number> => ({
  critical: breakdown?.critical ?? 0,
  high: breakdown?.high ?? 0,
  medium: breakdown?.medium ?? 0,
  low: breakdown?.low ?? 0,
});

interface AuditSummaryFields {
  score: string;
  correctness: string;
  complexity: string;
  security: string;
  verdict: string;
}

const oneLineText = (value: string, maxLength = 140): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
};

const unescapeCode = (raw: string): string => {
  if (!raw) return '';
  let text = raw.trim();
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n');
    if (firstNewline !== -1) text = text.slice(firstNewline + 1);
    if (text.endsWith('```')) text = text.slice(0, -3);
    text = text.trim();
  }
  if (text.includes('\\n') && text.split('\n').length <= 2) {
    text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return text;
};

const parseAuditSummary = (
  summaryText: string,
  scoreValue: number | null,
  complexityAnalysis: string,
  findings: FindingCard[],
  sourceCode: string
): AuditSummaryFields => {
  const extract = (pattern: RegExp): string => {
    const match = summaryText.match(pattern);
    return match?.[1]?.replace(/\*\*/g, '').trim() || '';
  };

  const score =
    extract(/🏆\s*\*?\*?Score:\*?\*?\s*([^\n]+)/i) ||
    extract(/Score:\*?\*?\s*([^\n]+)/i) ||
    (scoreValue !== null ? `${scoreValue}/100` : 'Pending');

  const correctness =
    extract(/✅\s*\*?\*?Correctness:\*?\*?\s*([^\n]+)/i) ||
    extract(/Correctness:\*?\*?\s*([^\n]+)/i) ||
    'Review required';

  const derived = deriveComplexity(sourceCode);
  const complexity =
    extract(/⚡\s*\*?\*?(?:Time\s*&\s*Space\s*)?Complexity:\*?\*?\s*([^\n]+)/i) ||
    extract(/Complexity:\*?\*?\s*([^\n]+)/i) ||
    complexityAnalysis ||
    `${derived.time} | ${derived.space}`;

  const securityIssueCount = findings.filter((finding) => finding.category.toLowerCase().includes('security')).length;
  const security =
    extract(/🛡️\s*\*?\*?Security:\*?\*?\s*([^\n]+)/i) ||
    extract(/Security:\*?\*?\s*([^\n]+)/i) ||
    (securityIssueCount === 0 ? 'No issues detected' : `${securityIssueCount} issue(s) found`);

  const verdict =
    extract(/🚀\s*\*?\*?Verdict:\*?\*?\s*([^\n]+)/i) ||
    extract(/Verdict:\*?\*?\s*([^\n]+)/i) ||
    oneLineText(summaryText.split('\n').filter((line) => line.trim()).slice(-1)[0] || 'Analysis complete.');

  return { score, correctness, complexity, security, verdict };
};

const formatLineLabel = (lineNumber: number | null): string => {
  if (!lineNumber) return '—';
  return `Line ${lineNumber}`;
};

const formatLineRangeLabel = (lineNumber: number | null, endLineNumber?: number): string => {
  if (!lineNumber) return '—';
  if (endLineNumber && endLineNumber > lineNumber) {
    return `Lines ${lineNumber}-${endLineNumber}`;
  }
  return `Line ${lineNumber}`;
};

const suggestionKey = (finding: FindingCard): string =>
  `${finding.severity}|${finding.lineNumber ?? 0}|${finding.endLineNumber ?? 0}|${finding.startCol ?? 0}|${finding.endCol ?? 0}|${finding.title}|${finding.description}`.toLowerCase();

const isActionableSuggestion = (finding: FindingCard): boolean => {
  const combined = `${finding.title} ${finding.description} ${finding.suggestedFix}`.trim();
  if (!combined || combined.length < 4) return false;

  const lower = combined.toLowerCase();
  const blockedPhrases = [
    'groq ai model',
    'groq review complete',
    'review complete with score',
    'static analysis review complete',
    'provider unavailable',
    'fallback analyzer',
    're-run analysis when provider',
    'temporarily limited',
  ];
  if (blockedPhrases.some((phrase) => lower.includes(phrase))) return false;

  if (
    finding.category.toLowerCase() === 'ai suggestion' &&
    finding.title.toLowerCase() === 'ai suggestion' &&
    !finding.lineNumber &&
    finding.description === finding.suggestedFix
  ) {
    return false;
  }

  return true;
};

const computeModifiedLines = (original: string, optimized: string): number[] => {
  if (!optimized.trim()) return [];
  const origLines = original.split('\n');
  const optLines = optimized.split('\n');
  const maxLen = Math.max(origLines.length, optLines.length);
  const changed: number[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    if ((origLines[i] ?? '').trim() !== (optLines[i] ?? '').trim()) {
      changed.push(i + 1);
    }
  }
  return changed;
};

const ReviewPage = () => {
  const location = useLocation();
  const [activeReviewId, setActiveReviewId] = useState<number | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [code, setCode] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].sampleCode);
  const [fileNameHint, setFileNameHint] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].fileName);
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [detectedLanguage, setDetectedLanguage] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].label);
  const [detectionConfidence, setDetectionConfidence] = useState<'high' | 'medium' | 'low'>('high');
  const [detectionReason, setDetectionReason] = useState('Initialized with language template.');
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [summary, setSummary] = useState('Review ready to run.');
  const [findings, setFindings] = useState<FindingCard[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [severityBreakdown, setSeverityBreakdown] = useState<Record<string, number>>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [analysisHash, setAnalysisHash] = useState('');
  const [wasCached, setWasCached] = useState(false);
  const [assistantViewLevel, setAssistantViewLevel] = useState<1 | 2 | 3>(1);
  const [learningAssistant, setLearningAssistant] = useState<ReviewResponse['learning_assistant']>({});
  const [complexityAnalysis, setComplexityAnalysis] = useState('');
  const [refactoredCode, setRefactoredCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [editorWidthPct, setEditorWidthPct] = useState(68);
  const [splitterDragging, setSplitterDragging] = useState(false);
  const [isWideLayout, setIsWideLayout] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const localAnalysisCache = useRef<Map<string, ReviewResponse>>(new Map());
  const lastAnalyzedCodeRef = useRef<string>('');
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const cursorPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);
  const splitterDraggingRef = useRef(false);

  const clearAnalysisStateAndHighlights = useCallback(() => {
    setFindings([]);
    setScore(null);
    setSeverityBreakdown({ critical: 0, high: 0, medium: 0, low: 0 });
    setAnalysisHash('');
    setWasCached(false);
    setLearningAssistant({});
    setComplexityAnalysis('');
    setRefactoredCode('');
    setSummary('Review ready to run.');
    setActiveLine(null);

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor && monaco) {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, 'codesense-errors', []);
      }
    }
  }, []);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    try {
      const savedStateStr = localStorage.getItem('codesense_saved_editor');
      const savedState = savedStateStr ? JSON.parse(savedStateStr) : {};
      savedState.code = newCode;
      localStorage.setItem('codesense_saved_editor', JSON.stringify(savedState));
    } catch {}

    if (newCode !== lastAnalyzedCodeRef.current && lastAnalyzedCodeRef.current !== '') {
      clearAnalysisStateAndHighlights();
      lastAnalyzedCodeRef.current = '';
    }
  }, [clearAnalysisStateAndHighlights]);

  const languageOptions = useMemo(
    () => [
      { value: 'python', label: LANGUAGE_TEMPLATES.python.label },
      { value: 'java', label: LANGUAGE_TEMPLATES.java.label },
      { value: 'javascript', label: LANGUAGE_TEMPLATES.javascript.label },
      { value: 'typescript', label: LANGUAGE_TEMPLATES.typescript.label },
      { value: 'c', label: LANGUAGE_TEMPLATES.c.label },
      { value: 'cpp', label: LANGUAGE_TEMPLATES.cpp.label },
      { value: 'csharp', label: LANGUAGE_TEMPLATES.csharp.label },
      { value: 'go', label: LANGUAGE_TEMPLATES.go.label },
      { value: 'rust', label: LANGUAGE_TEMPLATES.rust.label },
      { value: 'plaintext', label: LANGUAGE_TEMPLATES.plaintext.label },
    ],
    []
  );

  const supportedLanguages = useMemo(() => new Set(languageOptions.map((option) => option.value)), [languageOptions]);

  useEffect(() => {
    const detection = detectLanguage(code, fileNameHint);

    if (!autoDetectEnabled) {
      const manualTemplate = templateForLanguage(language);
      setDetectedLanguage(detection.detectedLanguage || manualTemplate.label);
      setDetectionConfidence(detection.confidence);
      setDetectionReason(`Manual selection active (${manualTemplate.label}). Code syntax matches ${detection.detectedLanguage}.`);
      return;
    }

    setDetectedLanguage(detection.detectedLanguage);
    setDetectionConfidence(detection.confidence);
    setDetectionReason(detection.reason);

    const autoLanguage = supportedLanguages.has(detection.language) ? detection.language : 'plaintext';
    if (isSupportedLanguage(autoLanguage) && autoLanguage !== language) {
      setLanguage(autoLanguage);
    }
  }, [autoDetectEnabled, code, fileNameHint, language, supportedLanguages]);

  useEffect(() => {
    const onResize = () => setIsWideLayout(window.innerWidth >= 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!splitterDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const nextPct = ((event.clientX - rect.left) / rect.width) * 100;
      setEditorWidthPct(Math.min(72, Math.max(62, nextPct)));
    };
    const onMouseUp = () => {
      splitterDraggingRef.current = false;
      setSplitterDragging(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const saveEditorCursor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const position = editor.getPosition();
    if (position) {
      cursorPositionRef.current = { lineNumber: position.lineNumber, column: position.column };
    }
  }, []);

  const restoreEditorCursor = useCallback(() => {
    const editor = editorRef.current;
    const saved = cursorPositionRef.current;
    if (!editor || !saved) return;
    requestAnimationFrame(() => {
      editor.setPosition(saved);
      editor.revealLineInCenter(saved.lineNumber);
    });
  }, []);

  const applyReviewPayload = (payload: ReviewResponse, options?: { fromCache?: boolean; localHash?: string }) => {
    lastAnalyzedCodeRef.current = code;
    const mergedScore = payload.overall_score ?? payload.score ?? null;
    setSummary(payload.summary);
    setScore(mergedScore);
    setComplexityAnalysis(payload.complexity_analysis || '');
    setRefactoredCode(payload.refactored_code || '');
    setSeverityBreakdown(normalizedSeverityBreakdown(payload.severity_breakdown));
    setLearningAssistant(payload.learning_assistant || {});
    setAnalysisHash(payload.code_hash || options?.localHash || '');
    setWasCached(Boolean(payload.cached || options?.fromCache));

    const directIssues = (payload.issues || []).map((issue, idx) => asFindingCard(issue as unknown as Record<string, unknown>, issue.type || 'Issue', `issue-${idx}`));

    const groupedSources: Array<[string, Issue[] | undefined]> = [
      ['Bug', payload.bugs],
      ['Security', payload.security_vulnerabilities],
      ['Performance', payload.performance_issues],
      ['Code Smell', payload.code_smells],
      ['Best Practice', payload.best_practice_violations],
    ];

    const groupedFindings = groupedSources.flatMap(([category, list], groupIndex) =>
      (list || []).map((item, itemIndex) => asFindingCard(item as unknown as Record<string, unknown>, category, `group-${groupIndex}-${itemIndex}`))
    );

    const aiExplanationFindings = extractFindingsFromTextList(payload.ai_explanations || [], 'ai-explanation');
    const suggestedFixFindings = extractFindingsFromTextList(payload.suggested_fixes || [], 'ai-fix');

    const mergedByKey = new Map<string, FindingCard>();
    [...directIssues, ...groupedFindings, ...aiExplanationFindings, ...suggestedFixFindings].forEach((finding) => {
      const key = `${finding.category}|${finding.title}|${finding.description}|${finding.lineNumber ?? 0}`.toLowerCase();
      if (!mergedByKey.has(key)) {
        mergedByKey.set(key, finding);
      }
    });

    const mergedFindings = Array.from(mergedByKey.values()).sort((a, b) => {
      const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      const lineA = a.lineNumber ?? Number.MAX_SAFE_INTEGER;
      const lineB = b.lineNumber ?? Number.MAX_SAFE_INTEGER;
      return lineA - lineB;
    });

    setFindings(mergedFindings);
    setActiveLine(null);
    restoreEditorCursor();
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      clearAnalysisStateAndHighlights();
      lastAnalyzedCodeRef.current = '';
      setFileNameHint(file.name);
      setCode(text);
      setError(null);
    } catch {
      setError('Unable to read uploaded file. Please try another file or paste code manually.');
    } finally {
      event.target.value = '';
    }
  };

  const handleManualLanguageChange = (nextLanguage: SupportedLanguage) => {
    const template = templateForLanguage(nextLanguage);
    clearAnalysisStateAndHighlights();
    lastAnalyzedCodeRef.current = '';
    setAutoDetectEnabled(false);
    setLanguage(nextLanguage);
    setFileNameHint(template.fileName);
    setCode(template.sampleCode);
    setDetectedLanguage(template.label);
    setDetectionConfidence('high');
    setDetectionReason(`Manual selection active. Loaded ${template.fileName} template.`);
    setError(null);
  };

  const handleAutoDetectToggle = (enabled: boolean) => {
    setAutoDetectEnabled(enabled);
    if (enabled) {
      const detection = detectLanguage(code, fileNameHint);
      const autoLanguage = supportedLanguages.has(detection.language) ? detection.language : 'plaintext';
      if (isSupportedLanguage(autoLanguage)) {
        setLanguage(autoLanguage);
      }
      setDetectedLanguage(detection.detectedLanguage);
      setDetectionConfidence(detection.confidence);
      setDetectionReason(detection.reason);
      return;
    }

    const template = templateForLanguage(language);
    setDetectedLanguage(template.label);
    setDetectionConfidence('high');
    setDetectionReason(`Manual selection active. Using ${template.label}.`);
  };

  const handleReview = async () => {
    setLoading(true);
    setError(null);
    saveEditorCursor();

    const sourceHash = stableCodeHash(code);
    const cacheKey = `${sourceHash}:${language}:standard-v1`;
    const cachedLocal = localAnalysisCache.current.get(cacheKey);
    if (cachedLocal) {
      applyReviewPayload(cachedLocal, { fromCache: true, localHash: sourceHash });
      lastAnalyzedCodeRef.current = code;
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post<ReviewResponse>(apiUrl('/review/'), {
        code,
        language,
        filename: fileNameHint,
        review_id: activeReviewId,
        analysis_profile: 'standard-v1',
      }, {
        headers: authHeaders(),
      });
      const payload = response.data;
      if (payload.id) {
        setActiveReviewId(payload.id);
      }
      localAnalysisCache.current.set(cacheKey, payload);
      applyReviewPayload(payload, { localHash: sourceHash });
      lastAnalyzedCodeRef.current = code;

      try {
        localStorage.setItem('codesense_saved_editor', JSON.stringify({
          code,
          fileNameHint,
          language,
          activeReviewId: payload.id || activeReviewId,
          payload,
        }));
      } catch {}
    } catch (err: any) {
      console.error('Error running code review:', err);
      const statusCode = Number(err?.response?.status ?? 0);
      const serverDetail = err?.response?.data?.detail;
      const networkDetail = err?.message;
      if (statusCode === 401) {
        setError('Your session is invalid or expired. Please log in again and retry analysis.');
      } else {
        setError(serverDetail || networkDetail || 'Failed to complete review. Please check backend status.');
      }
      setSummary('An error occurred during analysis.');
      setFindings([]);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
      case 'critical':
        return 'border-red-500/20 bg-red-500/10 text-red-300';
      case 'medium':
        return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
      default:
        return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
    }
  };

  const auditSummary = useMemo(
    () => parseAuditSummary(summary, score, complexityAnalysis, findings, code),
    [summary, score, complexityAnalysis, findings, code]
  );

  const codeLines = useMemo(() => code.split('\n'), [code]);

  const realTimeSyntaxErrors = useMemo(() => detectSyntaxErrors(code, language), [code, language]);

  const { level1Errors, improvements } = useMemo(() => {
    const deduped = new Map<string, FindingCard>();
    findings.forEach((finding) => {
      if (!isActionableSuggestion(finding)) return;
      const key = suggestionKey(finding);
      if (!deduped.has(key)) deduped.set(key, finding);
    });
    const items = Array.from(deduped.values());

    const rawErrors = items.filter((f) => isErrorFinding(f));
    const nonErrors = items.filter((f) => !isErrorFinding(f));

    // Convert real-time syntax errors to finding cards
    const realTimeFindingCards: FindingCard[] = realTimeSyntaxErrors.map((rtErr, index) => ({
      id: `realtime-syntax-err-${index}`,
      category: 'Syntax Error',
      severity: 'critical',
      title: rtErr.title,
      lineNumber: rtErr.lineNumber,
      description: rtErr.description,
      whyItMatters: 'Syntax errors break execution or compilation and prevent code from running.',
      suggestedFix: `Fix the syntax error at line ${rtErr.lineNumber}: ${rtErr.title}`,
      isError: true,
      level: 'Level 1',
    }));

    // Combine real-time syntax errors with analysis errors
    const allErrorsToProcess = [...realTimeFindingCards, ...rawErrors];

    const mergedErrorsMap = new Map<string, FindingCard>();
    allErrorsToProcess.forEach((err) => {
      // Use the exact line number where each detected error actually occurs in current source code
      const calculatedLine = (err.lineNumber && err.lineNumber >= 1 && err.lineNumber <= codeLines.length)
        ? err.lineNumber
        : (recalculateFindingLine(err, codeLines, code, language) ?? getValidErrorLineNumber(err.lineNumber, codeLines));
      if (!calculatedLine) return; // Skip stale errors whose target code no longer exists or is empty

      const updatedErr = { ...err, lineNumber: calculatedLine };

      const normText = (updatedErr.description || updatedErr.title)
        .toLowerCase()
        .replace(/^(syntaxerror|typeerror|referenceerror|nameerror|error|compiler error|runtime error|bug)[:\s]*/i, '')
        .replace(/\bline\s+\d+[:\s]*/gi, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const key = `${calculatedLine}|${normText}`;
      if (!mergedErrorsMap.has(key)) {
        mergedErrorsMap.set(key, updatedErr);
      }
    });
    const errors = Array.from(mergedErrorsMap.values());

    const sortFn = (a: FindingCard, b: FindingCard) => {
      const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      return (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER);
    };

    errors.sort(sortFn);
    nonErrors.sort(sortFn);

    return {
      aiSuggestions: [...errors, ...nonErrors],
      level1Errors: errors,
      improvements: nonErrors,
    };
  }, [findings, codeLines, realTimeSyntaxErrors]);

  const optimizedCodeForLevel3 = useMemo(() => {
    const raw =
      learningAssistant?.level_3_optimized_solution?.code?.trim() ||
      refactoredCode.trim();
    return unescapeCode(raw);
  }, [learningAssistant, refactoredCode]);

  const isAlreadyOptimal = useMemo(() => {
    if (learningAssistant?.level_3_optimized_solution?.is_already_optimal) return true;
    if (!optimizedCodeForLevel3) return true;
    return optimizedCodeForLevel3.trim() === code.trim();
  }, [learningAssistant, optimizedCodeForLevel3, code]);

  const modifiedLines = useMemo(
    () => (isAlreadyOptimal ? [] : computeModifiedLines(code, optimizedCodeForLevel3)),
    [code, optimizedCodeForLevel3, isAlreadyOptimal]
  );

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationIdsRef.current = editor.deltaDecorations([], []);
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'codesense-errors', []);
    }
  }, []);

  const scrollToLine = useCallback((lineNumber: number | null) => {
    if (!lineNumber || !editorRef.current || !monacoRef.current) return;
    setActiveLine(lineNumber);
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    editor.revealLineInCenter(lineNumber);
    editor.setSelection(new monaco.Selection(lineNumber, 1, lineNumber, 1));
    editor.focus();
  }, []);

  const handleApplyLevel3Solution = async () => {
    if (!optimizedCodeForLevel3.trim()) return;

    clearAnalysisStateAndHighlights();

    const newCode = optimizedCodeForLevel3;
    setCode(newCode);
    lastAnalyzedCodeRef.current = newCode;

    setLoading(true);
    setError(null);
    saveEditorCursor();

    const sourceHash = stableCodeHash(newCode);
    const cacheKey = `${sourceHash}:${language}:standard-v1`;
    const cachedLocal = localAnalysisCache.current.get(cacheKey);
    if (cachedLocal) {
      applyReviewPayload(cachedLocal, { fromCache: true, localHash: sourceHash });
      lastAnalyzedCodeRef.current = newCode;
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post<ReviewResponse>(apiUrl('/review/'), {
        code: newCode,
        language,
        analysis_profile: 'standard-v1',
      }, {
        headers: authHeaders(),
      });
      const payload = response.data;
      localAnalysisCache.current.set(cacheKey, payload);
      applyReviewPayload(payload, { localHash: sourceHash });
      lastAnalyzedCodeRef.current = newCode;
    } catch (err: any) {
      console.error('Error running code review on optimized solution:', err);
      const statusCode = Number(err?.response?.status ?? 0);
      const serverDetail = err?.response?.data?.detail;
      const networkDetail = err?.message;
      if (statusCode === 401) {
        setError('Your session is invalid or expired. Please log in again and retry analysis.');
      } else {
        setError(serverDetail || networkDetail || 'Failed to complete review on optimized solution.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();

    // Map each confirmed Level 1 error to its exact verified line
    const mappedErrorItems: Array<{ finding: FindingCard; line: number }> = [];
    level1Errors.forEach((finding) => {
      if (isErrorFinding(finding) && finding.lineNumber && finding.lineNumber >= 1 && finding.lineNumber <= codeLines.length) {
        mappedErrorItems.push({ finding, line: finding.lineNumber });
      }
    });

    if (mappedErrorItems.length === 0) {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      if (model) {
        monaco.editor.setModelMarkers(model, 'codesense-errors', []);
      }
      return;
    }

    const errorLineSet = new Set(mappedErrorItems.map((item) => item.line));

    // Red whole-line highlights ONLY for confirmed errors on exact valid code lines
    const errorLineDecorations = Array.from(errorLineSet).map((lineNumber) => {
      const isActive = lineNumber === activeLine;
      return {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: isActive ? 'monaco-error-line-highlight-active' : 'monaco-error-line-highlight',
          overviewRuler: {
            color: '#ef4444',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      };
    });

    // Inline token highlights ONLY for confirmed errors
    const errorTokenDecorations = mappedErrorItems
      .filter(({ finding }) => Boolean(finding.startCol))
      .map(({ finding, line }) => {
        const endLine = finding.endLineNumber && finding.endLineNumber >= line && finding.endLineNumber <= codeLines.length ? finding.endLineNumber : line;
        const maxCol = model ? model.getLineMaxColumn(line) : 100;
        const startColumn = Math.min(maxCol, Math.max(1, finding.startCol as number));
        const endColumn = finding.endCol && finding.endCol > startColumn ? Math.min(maxCol, finding.endCol) : Math.min(maxCol, startColumn + 1);

        return {
          range: new monaco.Range(line, startColumn, endLine, endColumn),
          options: {
            inlineClassName: 'monaco-error-token-highlight',
          },
        };
      });

    // Level 3 optimized code diff markers (blue/cyan)
    const optimizedDecorations = modifiedLines
      .filter((lineNumber) => !errorLineSet.has(lineNumber))
      .map((lineNumber) => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-optimized-highlight',
          overviewRuler: {
            color: '#38bdf8',
            position: monaco.editor.OverviewRulerLane.Center,
          },
        },
      }));

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [
      ...errorLineDecorations,
      ...errorTokenDecorations,
      ...optimizedDecorations,
    ]);

    if (model) {
      const markers = mappedErrorItems.map(({ finding, line }) => {
        const endLine = Math.min(model.getLineCount(), Math.max(line, finding.endLineNumber ?? line));
        const maxCol = model.getLineMaxColumn(line);
        const maxEndCol = model.getLineMaxColumn(endLine);
        const startColumn = Math.min(maxCol, Math.max(1, finding.startCol ?? 1));
        const endColumn = Math.min(maxEndCol, Math.max(startColumn + 1, finding.endCol ?? maxEndCol));
        return {
          startLineNumber: line,
          startColumn,
          endLineNumber: endLine,
          endColumn,
          message: `[Error] ${finding.description || finding.title}\nWhy: ${finding.whyItMatters}\nFix: ${finding.suggestedFix}`,
          severity: monaco.MarkerSeverity.Error,
          source: 'CodeSense AI Error Detector',
        };
      });
      monaco.editor.setModelMarkers(model, 'codesense-errors', markers);
    }
  }, [level1Errors, activeLine, modifiedLines, codeLines]);

  const handleCopyOptimizedCode = async () => {
    try {
      await navigator.clipboard.writeText(optimizedCodeForLevel3);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1200);
    } catch {
      setCopySuccess(false);
    }
  };

  const handleDownloadOptimizedCode = () => {
    const template = templateForLanguage(language);
    const blob = new Blob([optimizedCodeForLevel3], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const suffixIndex = template.fileName.lastIndexOf('.');
    const extension = suffixIndex >= 0 ? template.fileName.slice(suffixIndex) : '.txt';
    anchor.href = objectUrl;
    anchor.download = `optimized${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  useEffect(() => {
    const historyReview = location.state?.review;
    if (historyReview) {
      if (historyReview.id) setActiveReviewId(historyReview.id);
      if (historyReview.code) setCode(historyReview.code);
      if (historyReview.filename || historyReview.name) setFileNameHint(historyReview.filename || historyReview.name);
      if (historyReview.language && isSupportedLanguage(historyReview.language)) {
        setLanguage(historyReview.language as SupportedLanguage);
      }

      if (historyReview.report) {
        applyReviewPayload(historyReview.report, { fromCache: true });
      } else if (historyReview.id) {
        axios.get(apiUrl(`/review/${historyReview.id}`), { headers: authHeaders() })
          .then((res) => {
            if (res.data.code) setCode(res.data.code);
            if (res.data.filename) setFileNameHint(res.data.filename);
            if (res.data.language && isSupportedLanguage(res.data.language)) {
              setLanguage(res.data.language as SupportedLanguage);
            }
            if (res.data.report) {
              applyReviewPayload(res.data.report, { fromCache: true });
            }
          })
          .catch((err) => console.error("Failed to load review details:", err));
      }
      return;
    }

    try {
      const savedStateStr = localStorage.getItem('codesense_saved_editor');
      if (savedStateStr) {
        const savedState = JSON.parse(savedStateStr);
        if (savedState.code) setCode(savedState.code);
        if (savedState.fileNameHint) setFileNameHint(savedState.fileNameHint);
        if (savedState.language && isSupportedLanguage(savedState.language)) {
          setLanguage(savedState.language as SupportedLanguage);
        }
        if (savedState.activeReviewId) setActiveReviewId(savedState.activeReviewId);
        if (savedState.payload) {
          applyReviewPayload(savedState.payload, { fromCache: true });
        }
      }
    } catch {
      // Ignore parse error
    }
  }, [location.state]);

  const handleSaveEditorState = () => {
    try {
      const stateToSave = {
        code,
        fileNameHint,
        language,
        activeReviewId,
        payload: {
          summary,
          issues: findings,
          score,
          overall_score: score,
          bugs: findings.filter((f) => f.category === 'Bug'),
          security_vulnerabilities: findings.filter((f) => f.category === 'Security'),
          performance_issues: findings.filter((f) => f.category === 'Performance'),
          code_smells: findings.filter((f) => f.category === 'Code Smell'),
          complexity_analysis: complexityAnalysis,
          refactored_code: refactoredCode,
          severity_breakdown: severityBreakdown,
          learning_assistant: learningAssistant,
        },
      };
      localStorage.setItem('codesense_saved_editor', JSON.stringify(stateToSave));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (err) {
      console.error('Failed to save editor state:', err);
    }
  };

  const handleExportReport = () => {
    const template = templateForLanguage(language);
    const baseName = fileNameHint.trim() || template.fileName;
    const suffixIdx = baseName.lastIndexOf('.');
    const nameWithoutExt = suffixIdx >= 0 ? baseName.slice(0, suffixIdx) : baseName;
    const exportFileName = `${nameWithoutExt}_review_report.md`;

    const timeString = new Date().toLocaleString();

    let reportText = `# CodeSense AI Review Report\n\n`;
    reportText += `- **Filename:** ${baseName}\n`;
    reportText += `- **Language:** ${detectedLanguage} (${language})\n`;
    reportText += `- **Timestamp:** ${timeString}\n`;
    reportText += `- **Overall Score:** ${score !== null ? `${score}/100` : 'Pending'}\n`;
    reportText += `- **Summary:** ${summary}\n\n`;

    reportText += `## Audit Summary\n`;
    reportText += `- **Correctness:** ${auditSummary.correctness}\n`;
    reportText += `- **Complexity:** ${auditSummary.complexity}\n`;
    reportText += `- **Security:** ${auditSummary.security}\n`;
    reportText += `- **Verdict:** ${auditSummary.verdict}\n\n`;

    reportText += `## Findings & Issues (${findings.length})\n`;
    if (findings.length === 0) {
      reportText += `No issues detected in current code.\n\n`;
    } else {
      findings.forEach((finding, idx) => {
        reportText += `### ${idx + 1}. [${finding.severity.toUpperCase()}] ${finding.title}\n`;
        if (finding.lineNumber) {
          reportText += `- **Location:** Line ${finding.lineNumber}\n`;
        }
        reportText += `- **Category:** ${finding.category}\n`;
        reportText += `- **Description:** ${finding.description}\n`;
        reportText += `- **Why it matters:** ${finding.whyItMatters}\n`;
        reportText += `- **Suggested fix:** ${finding.suggestedFix}\n\n`;
      });
    }

    reportText += `## Source Code\n\`\`\`${language}\n${code}\n\`\`\`\n`;

    const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = exportFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Review Code</p>
          <h1 className="text-3xl font-semibold text-white">Upload code or paste a snippet</h1>
        </div>
        <button
          onClick={handleReview}
          disabled={loading}
          className={`rounded-full bg-cyan-50 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-100 active:scale-95 transition ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Analyzing...' : 'Analyze Code'}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-glow lg:p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Editor</h2>
            <div className="flex items-center gap-2">
              <span className="hidden" aria-hidden="true">{editorWidthPct}%</span>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={autoDetectEnabled}
                  onChange={(event) => handleAutoDetectToggle(event.target.checked)}
                  className="h-3.5 w-3.5 accent-cyan-400"
                />
                Auto Detect
              </label>
              <select
                value={language}
                onChange={(e) => {
                  handleManualLanguageChange(e.target.value as SupportedLanguage);
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <label className="text-xs text-slate-400">
              Optional filename for extension-based detection
              <input
                value={fileNameHint}
                onChange={(e) => setFileNameHint(e.target.value)}
                placeholder="example.py"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
              />
            </label>
            <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              <p>
                Detected: <span className="font-semibold text-white">{detectedLanguage}</span>
                <span className="ml-2 uppercase tracking-wide text-[10px] text-cyan-300">{detectionConfidence}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{detectionReason}</p>
              {detectionConfidence === 'low' && autoDetectEnabled && (
                <p className="mt-1 text-[11px] text-amber-300">Detection confidence is low. Choose a language from the selector if needed.</p>
              )}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500 transition">
                <Upload className="h-4 w-4 text-cyan-300" />
                Upload source file
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".py,.java,.js,.ts,.c,.cpp,.cc,.cxx,.cs,.go,.rs,.txt" />
              </label>
              <button
                type="button"
                onClick={handleSaveEditorState}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500 hover:text-cyan-300 transition"
                title="Save editor content and state"
              >
                <Save className="h-4 w-4 text-cyan-300" />
                {saveSuccess ? 'Saved!' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleExportReport}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500 hover:text-cyan-300 transition"
                title="Export current code & review report"
              >
                <Download className="h-4 w-4 text-cyan-300" />
                Export
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Extension is checked first, then syntax is validated for confidence.</p>
          </div>
          <div className="h-[min(420px,42vh)] min-h-[280px] overflow-hidden rounded-xl border border-slate-800">
            <Editor
              theme="vs-dark"
              language={language === 'plaintext' ? 'plaintext' : language}
              value={code}
              onChange={(value) => handleCodeChange(value ?? '')}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbersMinChars: 3,
                glyphMargin: true,
                renderLineHighlight: 'all',
              }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-glow flex flex-col lg:p-4 max-h-[min(720px,calc(100vh-9rem))]"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 shrink-0">
            <h2 className="text-lg font-semibold text-white">AI Review</h2>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {analysisHash && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">Hash {analysisHash.slice(0, 8)}</span>}
              {wasCached && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">Cached</span>}
            </div>
          </div>

          {/* 1. Findings */}
          <div className="mb-3 shrink-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Findings</p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-200">Critical <span className="float-right font-semibold">{severityBreakdown.critical ?? 0}</span></div>
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-orange-200">High <span className="float-right font-semibold">{severityBreakdown.high ?? 0}</span></div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">Medium <span className="float-right font-semibold">{severityBreakdown.medium ?? 0}</span></div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-blue-200">Low <span className="float-right font-semibold">{severityBreakdown.low ?? 0}</span></div>
            </div>
        </div>

        {/* Vertical Splitter Handle */}
        {isWideLayout && (
          <div
            onMouseDown={() => {
              splitterDraggingRef.current = true;
              setSplitterDragging(true);
            }}
            className={`review-splitter hidden lg:block rounded ${splitterDragging ? 'is-dragging' : ''}`}
            title="Drag to resize code editor"
          />
        )}

        {/* Right Details Sidebar */}
        <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-4 overflow-y-auto max-h-[850px] shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-white">AI Analysis &amp; Findings</h2>
            {wasCached && (
              <span className="rounded bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">
                ⚡ Cached Report
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 italic flex flex-col items-center justify-center gap-2">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              Evaluating code quality with Groq AI...
            </div>
          ) : (
            <>
              {/* Audit Report Summary */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Audit Report Summary</p>
                <p className="text-xs text-slate-200 leading-snug">🏆 Score: <span className="text-white font-medium">{auditSummary.score}</span></p>
                <p className="text-xs text-slate-200 leading-snug">✅ Correctness: <span className="text-white font-medium">{auditSummary.correctness}</span></p>
                <p className="text-xs text-slate-200 leading-snug">⚡ Time &amp; Space Complexity: <span className="text-white font-medium">{auditSummary.complexity}</span></p>
                <p className="text-xs text-slate-200 leading-snug">🛡️ Security: <span className="text-white font-medium">{auditSummary.security}</span></p>
                <p className="text-xs text-slate-200 leading-snug">🚀 Verdict: <span className="text-white font-medium">{oneLineText(auditSummary.verdict, 160)}</span></p>
              </div>

              {/* 3. AI Suggestions */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI Suggestions</p>
                {level1Errors.length === 0 && improvements.length === 0 ? (
                  <p className="text-xs text-emerald-300">✅ No actionable suggestions. Code looks clean.</p>
                ) : (
                  <>
                    {/* Level 1 Errors Section */}
                    {level1Errors.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wide">
                            <span>🔴 Level 1 – Errors</span>
                            <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-semibold">{level1Errors.length}</span>
                          </p>
                        </div>
                        <div className="space-y-2">
                          {level1Errors.map((finding) => (
                            <button
                              key={finding.id}
                              type="button"
                              onClick={() => scrollToLine(finding.lineNumber)}
                              className={`w-full rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-left transition hover:border-red-400 ${
                                finding.lineNumber === activeLine ? 'ring-1 ring-red-400 bg-red-500/20' : ''
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                <span className="rounded border border-red-500/40 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-200">
                                  🔴 Level 1 – Error
                                </span>
                                <span className="text-[11px] font-semibold text-rose-300">
                                  {formatLineRangeLabel(finding.lineNumber, finding.endLineNumber)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-100 font-medium leading-snug">
                                {oneLineText(finding.description || finding.title)}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Improvements Section */}
                    {improvements.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                            <span>💡 Improvements</span>
                            <span className="rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-semibold">{improvements.length}</span>
                          </p>
                        </div>
                        <div className="space-y-2">
                          {improvements.map((finding) => (
                            <button
                              key={finding.id}
                              type="button"
                              onClick={() => scrollToLine(finding.lineNumber)}
                              className={`w-full rounded-lg border p-2.5 text-left transition hover:border-cyan-500/40 ${getSeverityStyles(finding.severity)} ${
                                finding.lineNumber === activeLine ? 'ring-1 ring-cyan-400/60' : ''
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityBadgeClass(finding.severity)}`}>
                                  {severityDisplay(finding.severity)}
                                </span>
                                <span className="text-[10px] text-slate-400">{formatLineLabel(finding.lineNumber)}</span>
                              </div>
                              <p className="text-xs text-slate-100 leading-snug"><span className="text-slate-400">Issue:</span> {oneLineText(finding.description || finding.title)}</p>
                              <p className="text-xs text-slate-300 leading-snug mt-0.5"><span className="text-slate-400">Fix:</span> {oneLineText(finding.suggestedFix)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

                {/* 4. 3-Level Learning Assistant */}
                <div className="rounded-xl border border-cyan-500/25 bg-slate-950/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">3-Level Learning Assistant</p>
                  <div className="flex gap-1 mb-2">
                    {([
                      { level: 1 as const, label: '🔴 Level 1', tone: 'border-red-500/40 text-red-300' },
                      { level: 2 as const, label: '🟡 Level 2', tone: 'border-amber-500/40 text-amber-300' },
                      { level: 3 as const, label: '🔵 Level 3', tone: 'border-cyan-500/40 text-cyan-300' },
                    ]).map(({ level, label, tone }) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setAssistantViewLevel(level)}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
                          assistantViewLevel === level ? `${tone} bg-slate-900` : 'border-slate-700 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {assistantViewLevel === 1 && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-slate-200 leading-relaxed">
                      {learningAssistant?.level_1_hint?.[0] || 'Check collection lookups and boundary checks.'}
                    </div>
                  )}

                  {assistantViewLevel === 2 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-slate-200 leading-relaxed">
                      {learningAssistant?.level_2_guidance?.[0] || 'Single-pass traversal using an auxiliary hash map.'}
                    </div>
                  )}

                  {assistantViewLevel === 3 && (
                    <div className="space-y-2">
                      {isAlreadyOptimal ? (
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-center text-xs font-medium text-emerald-300">
                          ✅ Current solution is already optimal.
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-800 bg-slate-900/90 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Optimized Code</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={handleApplyLevel3Solution}
                                disabled={loading}
                                className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/20 active:scale-95 transition disabled:opacity-50"
                              >
                                <Sparkles className="h-3 w-3" />
                                Apply &amp; Re-analyze
                              </button>
                              <button
                                type="button"
                                onClick={handleCopyOptimizedCode}
                                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:border-cyan-400"
                              >
                                <Copy className="h-3 w-3" />
                                {copySuccess ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadOptimizedCode}
                                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:border-cyan-400"
                              >
                                <Download className="h-3 w-3" />
                                Download
                              </button>
                            </div>
                          </div>
                          <div className="h-[180px]">
                            <Editor
                              theme="vs-dark"
                              language={language === 'plaintext' ? 'plaintext' : language}
                              value={optimizedCodeForLevel3}
                              options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 12,
                                lineNumbers: 'on',
                                wordWrap: 'off',
                                automaticLayout: true,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ReviewPage;

