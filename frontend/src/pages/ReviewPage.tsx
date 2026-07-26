import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { motion } from 'framer-motion';
import axios from 'axios';
import { detectLanguage } from '../utils/languageDetection';
import { deriveComplexity } from '../utils/complexityAnalysis';
import { Copy, Download, Upload } from 'lucide-react';

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
  title?: string;
  description?: string;
  why_it_matters?: string;
  suggested_fix?: string;
  improved_code?: string;
}

interface ReviewResponse {
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
  description: string;
  whyItMatters: string;
  suggestedFix: string;
  improvedCode?: string;
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
  const whyItMatters = textFromAny(input.why_it_matters || input.why) || inferWhyItMatters(category, severity);
  const suggestedFix = textFromAny(input.suggested_fix || input.fix) || 'Refactor the affected line and add a focused test to verify the improvement.';
  const improvedCode = textFromAny(input.improved_code) || undefined;

  return {
    id,
    category: titleCase(category),
    severity,
    title,
    lineNumber,
    description,
    whyItMatters,
    suggestedFix,
    improvedCode,
  };
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

const suggestionKey = (finding: FindingCard): string =>
  `${finding.severity}|${finding.lineNumber ?? 0}|${finding.title}|${finding.description}`.toLowerCase();

const DEFAULT_SUGGESTED_FIX = 'Refactor the affected line and add a focused test to verify the improvement.';
const SEVERITY_GROUP_ORDER = ['critical', 'high', 'medium', 'low'] as const;

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

const suggestionBulletText = (finding: FindingCard): string => {
  const fix = oneLineText(finding.suggestedFix, 110);
  const issue = oneLineText(finding.description || finding.title, 110);
  if (fix && fix !== DEFAULT_SUGGESTED_FIX && fix !== issue) return fix;
  return issue;
};

const severityEmoji = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    default:
      return '🟢';
  }
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

const EDITOR_LINE_HEIGHT_PX = 20;
const EDITOR_VISIBLE_LINES = 22;
const EDITOR_BODY_HEIGHT = EDITOR_LINE_HEIGHT_PX * EDITOR_VISIBLE_LINES;

const ReviewPage = () => {
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
  const [copyCodeSuccess, setCopyCodeSuccess] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [editorWidthPct, setEditorWidthPct] = useState(68);
  const [splitterDragging, setSplitterDragging] = useState(false);
  const [isWideLayout, setIsWideLayout] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const localAnalysisCache = useRef<Map<string, ReviewResponse>>(new Map());
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const cursorPositionRef = useRef<{ lineNumber: number; column: number } | null>(null);
  const splitterDraggingRef = useRef(false);

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
    if (!autoDetectEnabled) {
      const manualTemplate = templateForLanguage(language);
      setDetectedLanguage(manualTemplate.label);
      setDetectionConfidence('high');
      setDetectionReason(`Manual selection active. Using ${manualTemplate.label} for editor, filename, and analysis.`);
      return;
    }

    const detection = detectLanguage(code, fileNameHint);
    setDetectedLanguage(detection.detectedLanguage);
    setDetectionConfidence(detection.confidence);
    setDetectionReason(detection.reason);

    const autoLanguage = supportedLanguages.has(detection.language) ? detection.language : 'plaintext';
    if (isSupportedLanguage(autoLanguage)) {
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
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post<ReviewResponse>(apiUrl('/review/'), {
        code,
        language,
        analysis_profile: 'standard-v1',
      }, {
        headers: authHeaders(),
      });
      const payload = response.data;
      localAnalysisCache.current.set(cacheKey, payload);
      applyReviewPayload(payload, { localHash: sourceHash });
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

  const aiSuggestions = useMemo(() => {
    const deduped = new Map<string, FindingCard>();
    findings.forEach((finding) => {
      if (!isActionableSuggestion(finding)) return;
      const key = suggestionKey(finding);
      if (!deduped.has(key)) deduped.set(key, finding);
    });
    return Array.from(deduped.values()).sort((a, b) => {
      const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      return (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER);
    });
  }, [findings]);

  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, FindingCard[]>();
    aiSuggestions.forEach((finding) => {
      const severity = finding.severity.toLowerCase();
      const bucket = groups.get(severity) ?? [];
      bucket.push(finding);
      groups.set(severity, bucket);
    });
    return SEVERITY_GROUP_ORDER.filter((severity) => groups.has(severity)).map((severity) => ({
      severity,
      items: groups.get(severity) ?? [],
    }));
  }, [aiSuggestions]);

  const affectedLines = useMemo(
    () => [...new Set(aiSuggestions.map((finding) => finding.lineNumber).filter((line): line is number => Boolean(line)))],
    [aiSuggestions]
  );

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

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const suggestionDecorations = affectedLines.map((lineNumber) => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: lineNumber === activeLine ? 'monaco-finding-highlight-active' : 'monaco-finding-highlight',
        overviewRuler: {
          color: lineNumber === activeLine ? '#f87171' : '#fb7185',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    }));

    const optimizedDecorations = modifiedLines
      .filter((lineNumber) => !affectedLines.includes(lineNumber))
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
      ...suggestionDecorations,
      ...optimizedDecorations,
    ]);
  }, [affectedLines, activeLine, modifiedLines, code]);

  const handleCopyOptimizedCode = async () => {
    try {
      await navigator.clipboard.writeText(optimizedCodeForLevel3);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1200);
    } catch {
      setCopySuccess(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyCodeSuccess(true);
      window.setTimeout(() => setCopyCodeSuccess(false), 1200);
    } catch {
      setCopyCodeSuccess(false);
    }
  };

  const handleDownloadCode = () => {
    const template = templateForLanguage(language);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileNameHint || template.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
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

  return (
    <div className="space-y-6">
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
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500">
              <Upload className="h-4 w-4 text-cyan-300" />
              Upload source file
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".py,.java,.js,.ts,.c,.cpp,.cc,.cxx,.cs,.go,.rs,.txt" />
            </label>
            <p className="text-[11px] text-slate-400">Extension is checked first, then syntax is validated for confidence.</p>
          </div>
          <div className="h-[min(420px,42vh)] min-h-[280px] overflow-hidden rounded-xl border border-slate-800">
            <Editor
              theme="vs-dark"
              language={language === 'plaintext' ? 'plaintext' : language}
              value={code}
              onChange={(value) => setCode(value ?? '')}
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

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 min-h-0">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400 italic flex flex-col items-center justify-center gap-2">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                Evaluating code quality with Groq AI...
              </div>
            ) : (
              <>
                {/* 2. Audit Report Summary */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Audit Report Summary</p>
                  <p className="text-xs text-slate-200 leading-snug">🏆 Score: <span className="text-white font-medium">{auditSummary.score}</span></p>
                  <p className="text-xs text-slate-200 leading-snug">✅ Correctness: <span className="text-white font-medium">{auditSummary.correctness}</span></p>
                  <p className="text-xs text-slate-200 leading-snug">⚡ Time &amp; Space Complexity: <span className="text-white font-medium">{auditSummary.complexity}</span></p>
                  <p className="text-xs text-slate-200 leading-snug">🛡️ Security: <span className="text-white font-medium">{auditSummary.security}</span></p>
                  <p className="text-xs text-slate-200 leading-snug">🚀 Verdict: <span className="text-white font-medium">{oneLineText(auditSummary.verdict, 160)}</span></p>
                </div>

                {/* 3. AI Suggestions */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">AI Suggestions</p>
                  {aiSuggestions.length === 0 ? (
                    <p className="text-xs text-emerald-300">✅ No actionable suggestions. Code looks clean.</p>
                  ) : (
                    <div className="space-y-2">
                      {aiSuggestions.map((finding) => (
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
                  )}
                </div>

                {/* 4. 3-Level Learning Assistant */}
                <div className="rounded-xl border border-cyan-500/25 bg-slate-950/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">3-Level Learning Assistant</p>
                  <div className="flex gap-1 mb-2">
                    {([
                      { level: 1 as const, label: '🟢 Level 1', tone: 'border-emerald-500/40 text-emerald-300' },
                      { level: 2 as const, label: '🟡 Level 2', tone: 'border-amber-500/40 text-amber-300' },
                      { level: 3 as const, label: '🔴 Level 3', tone: 'border-rose-500/40 text-rose-300' },
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
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-slate-200 leading-relaxed">
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

