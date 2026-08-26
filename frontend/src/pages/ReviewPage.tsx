import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { motion } from 'framer-motion';
import axios from 'axios';
import { detectLanguage } from '../utils/languageDetection';
import { deriveComplexity } from '../utils/complexityAnalysis';
import { Brain, CheckCircle2, Copy, Download, Lock, Plus, Save, Sparkles, Unlock, Upload, X, XCircle } from 'lucide-react';
import { detectSyntaxErrors, recalculateFindingLine } from '../utils/syntaxChecker';
import { formatCodeSnippet } from '../utils/codeFormatter';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

type SupportedLanguage = 'c' | 'cpp' | 'java' | 'python';

interface LanguageTemplate {
  label: string;
  fileName: string;
  sampleCode: string;
}

const LANGUAGE_TEMPLATES: Record<SupportedLanguage, LanguageTemplate> = {
  python: {
    label: 'Python',
    fileName: 'example.py',
    sampleCode: `import sys

def two_sum(nums: list[int], target: int) -> list[int]:
    """Find indices of two numbers that add up to target."""
    seen = {}
    for index, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], index]
        seen[num] = index
    return []

def main():
    print("=== Two Sum DSA Solver ===")
    try:
        raw_input = input("Enter numbers separated by space (e.g. 2 7 11 15): ").strip()
        if not raw_input:
            nums = [2, 7, 11, 15]
            target = 9
            print(f"Using default sample: nums={nums}, target={target}")
        else:
            nums = list(map(int, raw_input.split()))
            target = int(input("Enter target sum: ").strip())
        
        result = two_sum(nums, target)
        if result:
            print(f"Result Indices: {result} (values: {nums[result[0]]} + {nums[result[1]]} = {target})")
        else:
            print("No two numbers sum up to the target.")
    except Exception as err:
        print(f"Input Error: {err}")

if __name__ == "__main__":
    main()
`,
  },
  java: {
    label: 'Java',
    fileName: 'example.java',
    sampleCode: `import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

public class Example {
    public static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[]{seen.get(complement), i};
            }
            seen.put(nums[i], i);
        }
        return new int[]{};
    }

    public static void main(String[] args) {
        System.out.println("=== Two Sum DSA Solver ===");
        Scanner scanner = new Scanner(System.in);
        System.out.print("Enter size of array: ");
        if (!scanner.hasNextInt()) return;
        int n = scanner.nextInt();
        int[] nums = new int[n];
        System.out.println("Enter " + n + " elements:");
        for (int i = 0; i < n; i++) {
            nums[i] = scanner.nextInt();
        }
        System.out.print("Enter target sum: ");
        int target = scanner.nextInt();

        int[] result = twoSum(nums, target);
        if (result.length == 2) {
            System.out.println("Result Indices: [" + result[0] + ", " + result[1] + "]");
        } else {
            System.out.println("No matching pair found.");
        }
        scanner.close();
    }
}
`,
  },
  c: {
    label: 'C',
    fileName: 'example.c',
    sampleCode: `#include <stdio.h>
#include <stdlib.h>

void findTwoSum(const int *nums, int size, int target) {
    for (int i = 0; i < size; i++) {
        for (int j = i + 1; j < size; j++) {
            if (nums[i] + nums[j] == target) {
                printf("Result Indices: [%d, %d] (values: %d + %d = %d)\\n", i, j, nums[i], nums[j], target);
                return;
            }
        }
    }
    printf("No matching pair found.\\n");
}

int main(void) {
    int n, target;
    printf("=== Two Sum DSA Solver (C) ===\\n");
    printf("Enter array size: ");
    if (scanf("%d", &n) != 1 || n <= 0) {
        printf("Invalid size.\\n");
        return 1;
    }
    int *nums = (int *)malloc(n * sizeof(int));
    printf("Enter %d integers:\\n", n);
    for (int i = 0; i < n; i++) {
        scanf("%d", &nums[i]);
    }
    printf("Enter target sum: ");
    scanf("%d", &target);

    findTwoSum(nums, n, target);
    free(nums);
    return 0;
}
`,
  },
  cpp: {
    label: 'C++',
    fileName: 'example.cpp',
    sampleCode: `#include <iostream>
#include <vector>
#include <unordered_map>

std::vector<int> twoSum(const std::vector<int>& nums, int target) {
    std::unordered_map<int, int> seen;
    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        int complement = target - nums[i];
        if (seen.count(complement)) {
            return {seen[complement], i};
        }
        seen[nums[i]] = i;
    }
    return {};
}

int main() {
    std::cout << "=== Two Sum DSA Solver (C++) ===" << std::endl;
    std::cout << "Enter number of elements: ";
    int n;
    if (!(std::cin >> n) || n <= 0) return 1;

    std::vector<int> nums(n);
    std::cout << "Enter " << n << " elements:" << std::endl;
    for (int i = 0; i < n; ++i) {
        std::cin >> nums[i];
    }

    std::cout << "Enter target sum: ";
    int target;
    std::cin >> target;

    std::vector<int> result = twoSum(nums, target);
    if (result.size() == 2) {
        std::cout << "Result Indices: [" + result[0] + ", " + result[1] + "]" << std::endl;
    } else {
        std::cout << "No matching pair found." << std::endl;
    }

    return 0;
}
`,
  },
};

const DEFAULT_LANGUAGE: SupportedLanguage = 'python';

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  Object.prototype.hasOwnProperty.call(LANGUAGE_TEMPLATES, value);

const templateForLanguage = (language: string): LanguageTemplate => {
  if (isSupportedLanguage(language)) {
    return LANGUAGE_TEMPLATES[language];
  }
  return LANGUAGE_TEMPLATES.python;
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

interface Level1BruteForce {
  explanation?: string;
  algorithm?: string | string[];
  code?: string;
  time_space_complexity?: string;
  why_inefficient?: string;
}

interface Level2BetterApproach {
  explanation?: string;
  algorithm?: string | string[];
  code?: string;
  time_space_complexity?: string;
  improvement_over_level_1?: string;
}

interface DSAPuzzle {
  question: string;
  options: [string, string, string, string] | string[];
  correctAnswerIndex?: number;
  correct_index?: number;
  explanation: string;
}

interface ReviewTab {
  id: string;
  title: string;
  code: string;
  fileNameHint: string;
  language: SupportedLanguage;
  problemUrl: string;
  activeReviewId: number | null;
  summary: string;
  findings: FindingCard[];
  score: number | null;
  severityBreakdown: Record<string, number>;
  analysisHash: string;
  wasCached: boolean;
  learningAssistant: ReviewResponse['learning_assistant'];
  complexityAnalysis: string;
  refactoredCode: string;
  isPuzzleSolved: boolean;
}

const createNewTabObject = (
  id?: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
  initialCode: string = ''
): ReviewTab => {
  const template = templateForLanguage(lang);
  const tabId = id || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  return {
    id: tabId,
    title: template.fileName,
    code: initialCode,
    fileNameHint: template.fileName,
    language: lang,
    problemUrl: '',
    activeReviewId: null,
    summary: 'Review ready to run.',
    findings: [],
    score: null,
    severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 },
    analysisHash: '',
    wasCached: false,
    learningAssistant: {},
    complexityAnalysis: '',
    refactoredCode: '',
    isPuzzleSolved: false,
  };
};

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
    dsa_puzzle?: DSAPuzzle;
    level_1_hint?: string[];
    level_2_guidance?: string[];
    level_1_brute_force?: Level1BruteForce;
    level_2_better_approach?: Level2BetterApproach;
    level_3_optimized_solution?: {
      code?: string;
      is_already_optimal?: boolean;
      summary?: string;
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

const isActionableSuggestion = (finding: FindingCard, isProblemUrlActive = false): boolean => {
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

  if (isProblemUrlActive) {
    const platformNoiseKeywords = [
      'used without importing',
      'missing import java.util',
      'missing main method',
      'missing driver',
      'missing package declaration',
    ];
    if (platformNoiseKeywords.some((kw) => lower.includes(kw))) return false;
  }

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
  const [problemUrl, setProblemUrl] = useState(() => {
    try {
      return sessionStorage.getItem('codesense_problem_url') || '';
    } catch {
      return '';
    }
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [code, setCode] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].sampleCode);
  const [fileNameHint, setFileNameHint] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].fileName);
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [detectedLanguage, setDetectedLanguage] = useState(LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].label);
  const [detectionConfidence, setDetectionConfidence] = useState<'high' | 'medium' | 'low'>('high');
  const [detectionReason, setDetectionReason] = useState('Initialized with language template.');
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);

  // Multi-tab State System
  const [tabs, setTabs] = useState<ReviewTab[]>(() => [
    createNewTabObject('tab_1', DEFAULT_LANGUAGE, LANGUAGE_TEMPLATES[DEFAULT_LANGUAGE].sampleCode)
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab_1');
  const [summary, setSummary] = useState('Review ready to run.');
  const [findings, setFindings] = useState<FindingCard[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [severityBreakdown, setSeverityBreakdown] = useState<Record<string, number>>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [analysisHash, setAnalysisHash] = useState('');
  const [wasCached, setWasCached] = useState(false);
  //const [assistantViewLevel, setAssistantViewLevel] = useState<1 | 2 | 3>(1);
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

  const [isPuzzleSolved, setIsPuzzleSolved] = useState(false);
  const [isPuzzleModalOpen, setIsPuzzleModalOpen] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [puzzleSubmitted, setPuzzleSubmitted] = useState(false);
  const [activePuzzle, setActivePuzzle] = useState<DSAPuzzle | null>(null);
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
    setIsPuzzleSolved(false);
    setIsPuzzleModalOpen(false);
    setSelectedOptionIndex(null);
    setPuzzleSubmitted(false);
    setActivePuzzle(null);

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

  const getOrCreateDsaPuzzle = useCallback((
    assistant?: ReviewResponse['learning_assistant'],
    codeSnippet: string = ''
  ): DSAPuzzle => {
    const p = assistant?.dsa_puzzle;
    if (p && p.question && Array.isArray(p.options) && p.options.length === 4) {
      const rawIdx = p.correctAnswerIndex ?? p.correct_index ?? 0;
      return {
        question: p.question,
        options: p.options,
        correctAnswerIndex: Math.max(0, Math.min(3, rawIdx)),
        explanation: p.explanation || 'Review algorithmic complexity to evaluate optimal approaches.'
      };
    }

    const lvl1Complexity = assistant?.level_1_brute_force?.time_space_complexity || 'O(N²)';
    const hasHashMap = codeSnippet.includes('Map') || codeSnippet.includes('dict') || codeSnippet.includes('HashMap') || codeSnippet.includes('unordered_map') || codeSnippet.includes('seen');
    const hasSorting = codeSnippet.includes('sort') || codeSnippet.includes('Sort') || codeSnippet.includes('qsort');

    if (hasHashMap) {
      return {
        question: "What is the average time complexity of looking up an element in a Hash Table?",
        options: [
          "O(N²)",
          "O(N log N)",
          "O(1)",
          "O(N)"
        ],
        correctAnswerIndex: 2,
        explanation: "Hash Tables provide O(1) average time complexity for lookups using direct key-to-bucket hashing."
      };
    }

    if (hasSorting) {
      return {
        question: "What is the average time complexity of comparison-based sorting algorithms like QuickSort or MergeSort?",
        options: [
          "O(N)",
          "O(N log N)",
          "O(N²)",
          "O(1)"
        ],
        correctAnswerIndex: 1,
        explanation: "Comparison-based sorting algorithms have a lower-bound average time complexity of O(N log N)."
      };
    }

    return {
      question: `In the Level 1 Brute Force approach (${lvl1Complexity}), what primary factor causes performance inefficiency?`,
      options: [
        "Call stack overflow from recursive calls",
        "Nested iterations repeatedly re-checking candidate elements",
        "Garbage collection memory overhead",
        "Buffer overflow in hardware cache"
      ],
      correctAnswerIndex: 1,
      explanation: "Nested loops cause N × N iterations, leading to quadratic time complexity O(N²)."
    };
  }, []);

  const handleOpenPuzzleModal = useCallback(() => {
    const puzzle = getOrCreateDsaPuzzle(learningAssistant, code);
    setActivePuzzle(puzzle);
    setSelectedOptionIndex(null);
    setPuzzleSubmitted(false);
    setIsPuzzleModalOpen(true);
  }, [getOrCreateDsaPuzzle, learningAssistant, code]);

  const handleSubmitPuzzleAnswer = useCallback(() => {
    if (selectedOptionIndex === null) return;
    setPuzzleSubmitted(true);
    setIsPuzzleSolved(true);
  }, [selectedOptionIndex]);

  const handleClosePuzzleModal = useCallback(() => {
    setIsPuzzleModalOpen(false);
  }, []);

  const handleProblemUrlChange = useCallback((newUrl: string) => {
    setProblemUrl(newUrl);
    try {
      sessionStorage.setItem('codesense_problem_url', newUrl);
    } catch {}
  }, []);

  const handleNewSession = useCallback(() => {
    // Open a new tab immediately beside the current active tab
    const ext = templateForLanguage(language).fileName;
    const newTabId = `tab_${Date.now()}`;
    const newTab = createNewTabObject(newTabId, language, ''); // Starts completely empty

    setTabs((prevTabs) => {
      const activeIdx = prevTabs.findIndex((t) => t.id === activeTabId);
      const nextTabs = [...prevTabs];
      if (activeIdx !== -1) {
        nextTabs.splice(activeIdx + 1, 0, newTab);
      } else {
        nextTabs.push(newTab);
      }
      return nextTabs;
    });

    setActiveTabId(newTabId);
    setCode('');
    setFileNameHint(ext);
    setProblemUrl('');
    setActiveReviewId(null);
    clearAnalysisStateAndHighlights();
    lastAnalyzedCodeRef.current = '';
    setError(null);
    setSaveSuccess(false);

    try {
      sessionStorage.removeItem('codesense_problem_url');
    } catch {}
  }, [activeTabId, language, clearAnalysisStateAndHighlights]);

  const handleSwitchTab = useCallback(
    (targetTabId: string) => {
      if (targetTabId === activeTabId) return;

      // Save active tab state
      setTabs((prevTabs) =>
        prevTabs.map((t) => {
          if (t.id === activeTabId) {
            return {
              ...t,
              code,
              fileNameHint,
              language,
              problemUrl,
              activeReviewId,
              summary,
              findings,
              score,
              severityBreakdown,
              analysisHash,
              wasCached,
              learningAssistant,
              complexityAnalysis,
              refactoredCode,
              isPuzzleSolved,
            };
          }
          return t;
        })
      );

      // Restore target tab state
      const targetTab = tabs.find((t) => t.id === targetTabId);
      if (targetTab) {
        setActiveTabId(targetTabId);
        setCode(targetTab.code);
        setFileNameHint(targetTab.fileNameHint);
        setLanguage(targetTab.language);
        setProblemUrl(targetTab.problemUrl);
        setActiveReviewId(targetTab.activeReviewId);
        setSummary(targetTab.summary);
        setFindings(targetTab.findings);
        setScore(targetTab.score);
        setSeverityBreakdown(targetTab.severityBreakdown);
        setAnalysisHash(targetTab.analysisHash);
        setWasCached(targetTab.wasCached);
        setLearningAssistant(targetTab.learningAssistant);
        setComplexityAnalysis(targetTab.complexityAnalysis);
        setRefactoredCode(targetTab.refactoredCode);
        setIsPuzzleSolved(targetTab.isPuzzleSolved);
      }
    },
    [
      activeTabId, code, fileNameHint, language, problemUrl, activeReviewId,
      summary, findings, score, severityBreakdown, analysisHash, wasCached,
      learningAssistant, complexityAnalysis, refactoredCode, isPuzzleSolved, tabs
    ]
  );

  const handleCloseTab = useCallback(
    (tabIdToClose: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (tabs.length === 1) {
        setCode('');
        setProblemUrl('');
        clearAnalysisStateAndHighlights();
        setTabs([createNewTabObject(tabs[0].id, language, '')]);
        return;
      }

      const closeIdx = tabs.findIndex((t) => t.id === tabIdToClose);
      const nextTabs = tabs.filter((t) => t.id !== tabIdToClose);
      setTabs(nextTabs);

      if (activeTabId === tabIdToClose) {
        const fallbackIdx = Math.max(0, closeIdx - 1);
        const nextTab = nextTabs[fallbackIdx];
        if (nextTab) {
          setActiveTabId(nextTab.id);
          setCode(nextTab.code);
          setFileNameHint(nextTab.fileNameHint);
          setLanguage(nextTab.language);
          setProblemUrl(nextTab.problemUrl);
          setActiveReviewId(nextTab.activeReviewId);
          setSummary(nextTab.summary);
          setFindings(nextTab.findings);
          setScore(nextTab.score);
          setSeverityBreakdown(nextTab.severityBreakdown);
          setAnalysisHash(nextTab.analysisHash);
          setWasCached(nextTab.wasCached);
          setLearningAssistant(nextTab.learningAssistant);
          setComplexityAnalysis(nextTab.complexityAnalysis);
          setRefactoredCode(nextTab.refactoredCode);
          setIsPuzzleSolved(nextTab.isPuzzleSolved);
        }
      }
    },
    [tabs, activeTabId, language, clearAnalysisStateAndHighlights]
  );

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
      { value: 'c', label: LANGUAGE_TEMPLATES.c.label },
      { value: 'cpp', label: LANGUAGE_TEMPLATES.cpp.label },
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

    const autoLanguage = supportedLanguages.has(detection.language) ? (detection.language as SupportedLanguage) : 'python';
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
      if (autoDetectEnabled) {
        const detection = detectLanguage(text, file.name);
        const autoLang = supportedLanguages.has(detection.language) ? (detection.language as SupportedLanguage) : 'python';
        if (isSupportedLanguage(autoLang)) {
          setLanguage(autoLang);
        }
      }
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
      const autoLanguage = supportedLanguages.has(detection.language) ? (detection.language as SupportedLanguage) : 'python';
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

    const cleanProbUrl = problemUrl.trim();
    const sourceHash = stableCodeHash(code);
    const cacheKey = `${sourceHash}:${language}:${cleanProbUrl}:standard-v1`;
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
        problem_url: cleanProbUrl || null,
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
          problemUrl: cleanProbUrl,
          activeReviewId: payload.id || activeReviewId,
          payload,
        }));
        window.dispatchEvent(new CustomEvent('codesense_review_completed'));
        localStorage.setItem('codesense_last_review_time', String(Date.now()));
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

  const isProblemUrlActive = Boolean(problemUrl.trim());

  const optimizedCodeForLevel3 = useMemo(() => {
    const raw =
      learningAssistant?.level_3_optimized_solution?.code?.trim() ||
      refactoredCode.trim();
    return unescapeCode(raw);
  }, [learningAssistant, refactoredCode]);

  const level1FormattedCode = useMemo(() => {
    const raw = learningAssistant?.level_1_brute_force?.code;
    return formatCodeSnippet(raw, language);
  }, [learningAssistant, language]);

  const level2FormattedCode = useMemo(() => {
    const raw = learningAssistant?.level_2_better_approach?.code;
    return formatCodeSnippet(raw, language);
  }, [learningAssistant, language]);

  const isAlreadyOptimal = useMemo(() => {
    if (learningAssistant?.level_3_optimized_solution?.is_already_optimal) return true;
    if (!optimizedCodeForLevel3) return true;
    return optimizedCodeForLevel3.trim() === code.trim();
  }, [learningAssistant, optimizedCodeForLevel3, code]);

  const auditSummary = useMemo(() => {
    const parsed = parseAuditSummary(summary, score, complexityAnalysis, findings, code);
    if (isAlreadyOptimal) {
      return {
        ...parsed,
        verdict: 'Current solution is optimal.',
      };
    }
    return parsed;
  }, [summary, score, complexityAnalysis, findings, code, isAlreadyOptimal]);

  const codeLines = useMemo(() => code.split('\n'), [code]);

  const realTimeSyntaxErrors = useMemo(() => detectSyntaxErrors(code, language), [code, language]);

  const { level1Errors, improvements } = useMemo(() => {
    if (isAlreadyOptimal) {
      return {
        aiSuggestions: [],
        level1Errors: [],
        improvements: [],
      };
    }

    const deduped = new Map<string, FindingCard>();
    findings.forEach((finding) => {
      if (!isActionableSuggestion(finding, isProblemUrlActive)) return;
      const key = suggestionKey(finding);
      if (!deduped.has(key)) deduped.set(key, finding);
    });
    const items = Array.from(deduped.values());

    const rawErrors = items.filter((f) => isErrorFinding(f));
    const nonErrors = items.filter((f) => !isErrorFinding(f));

    // Convert real-time syntax errors to finding cards ONLY when not in Problem Link Mode
    const realTimeFindingCards: FindingCard[] = isProblemUrlActive
      ? []
      : realTimeSyntaxErrors.map((rtErr, index) => ({
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
  }, [findings, codeLines, realTimeSyntaxErrors, isProblemUrlActive, isAlreadyOptimal]);

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

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-stretch">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-glow flex flex-col lg:p-4 h-full xl:max-h-[min(720px,calc(100vh-9rem))] xl:min-h-[580px]"
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
          {/* Problem URL (Optional) Field */}
          <div className="mb-3">
            <label className="block text-xs text-slate-400">
              Problem URL (Optional) — Supports LeetCode and GeeksforGeeks
              <input
                type="url"
                value={problemUrl}
                onChange={(e) => handleProblemUrlChange(e.target.value)}
                placeholder="e.g. https://leetcode.com/problems/two-sum or https://www.geeksforgeeks.org/problems/two-sum/1"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500 placeholder:text-slate-600 transition"
              />
            </label>
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
              <button
                type="button"
                onClick={handleNewSession}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500 hover:text-cyan-300 transition"
                title="Start a new code review session"
              >
                <Plus className="h-4 w-4 text-cyan-300" />
                New
              </button>
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
          </div>

          {/* VS Code Style Multi-Tab System — Positioned directly below action buttons and above code editor */}
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1.5 border-b border-slate-800 scrollbar-thin shrink-0 min-w-0">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const titleText = tab.id === activeTabId ? (fileNameHint || tab.title) : (tab.fileNameHint || tab.title);
              return (
                <div
                  key={tab.id}
                  onClick={() => handleSwitchTab(tab.id)}
                  className={`group flex items-center gap-2.5 rounded-xl px-3.5 py-1.5 text-xs cursor-pointer border transition-all duration-150 select-none shrink-0 ${
                    isActive
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40 shadow-md font-semibold font-mono'
                      : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-700 hover:text-slate-200 font-mono'
                  }`}
                >
                  <span className="truncate max-w-[150px] font-mono text-xs tracking-tight">
                    {titleText || 'example.py'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                    title="Close tab"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={handleNewSession}
              className="inline-flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 hover:bg-cyan-500/15 transition shrink-0"
              title="Open new empty tab (+)"
            >
              <Plus className="h-4 w-4 text-cyan-400" />
            </button>
          </div>
          <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-slate-800">
            <Editor
              theme="vs-dark"
              language={language}
              //language={language === 'plaintext' ? 'plaintext' : language}
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
                automaticLayout: true,
              }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-glow flex flex-col lg:p-4 h-full xl:max-h-[min(720px,calc(100vh-9rem))] xl:min-h-[580px]"
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
        <div className="flex-1 min-h-0 rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-4 overflow-y-auto shadow-2xl">
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
                {isAlreadyOptimal ? (
                  <p className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
                    <span>Current solution is optimal.</span>
                  </p>
                ) : level1Errors.length === 0 && improvements.length === 0 ? (
                  <p className="text-xs text-emerald-300">Current solution is optimal.</p>
                ) : (
                  <>
                    {/* Errors Section */}
                    {level1Errors.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wide">
                            <span>🔴 Errors</span>
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
                                  🔴 Error — {formatLineRangeLabel(finding.lineNumber, finding.endLineNumber)}
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

                {/* Solve Puzzle Button — Placed immediately after Improvements */}
                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">🧩 Unlock Solution Levels</span>
                    {isPuzzleSolved ? (
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                        Unlocked 🎉
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                        Locked 🔒
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenPuzzleModal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/20 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/30 active:scale-95 transition shadow-sm"
                  >
                    <Brain className="h-4 w-4 text-purple-400" />
                    Solve Puzzle
                  </button>
                </div>
              </div>

              {!isPuzzleSolved ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 text-center space-y-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Solution Levels Locked</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Click <span className="text-purple-300 font-semibold">Solve Puzzle</span> in AI Suggestions above to unlock Level 1, Level 2, and Level 3.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenPuzzleModal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/20 px-3.5 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/30 transition shadow-sm"
                  >
                    <Brain className="h-3.5 w-3.5 text-purple-400" />
                    Solve Puzzle
                  </button>
                </div>
              ) : (
                <>

                {/* LEVEL 1 — BRUTE FORCE */}
                <div className="rounded-xl border border-rose-500/30 bg-slate-950/90 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-2">
                      <span>🔴 LEVEL 1 — BRUTE FORCE</span>
                    </h3>
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                      {learningAssistant?.level_1_brute_force?.time_space_complexity || 'Time: O(N²) | Space: O(1)'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-200">
                    <p><span className="font-semibold text-rose-300">Explanation:</span> {learningAssistant?.level_1_brute_force?.explanation || 'Naive brute force approach checking all combinations or pairs.'}</p>
                    <div>
                      <span className="font-semibold text-rose-300">Algorithm:</span>
                      <div className="mt-1 pl-2 border-l-2 border-rose-500/40 text-slate-300 space-y-0.5 text-[11px] whitespace-pre-line">
                        {Array.isArray(learningAssistant?.level_1_brute_force?.algorithm)
                          ? learningAssistant.level_1_brute_force.algorithm.join('\n')
                          : learningAssistant?.level_1_brute_force?.algorithm || '1. Iterate through elements with nested loops.\n2. Compare combinations step-by-step.\n3. Return result when condition is met.'}
                      </div>
                    </div>
                    {level1FormattedCode && (
                      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900 p-2 font-mono text-[11px] text-slate-200 overflow-x-auto">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5 text-[10px] text-slate-400">
                          <span>Code ({language.toUpperCase()})</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (level1FormattedCode) {
                                navigator.clipboard.writeText(level1FormattedCode);
                              }
                            }}
                            className="hover:text-cyan-300 transition"
                          >
                            Copy Code
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{level1FormattedCode}</pre>
                      </div>
                    )}
                    <p><span className="font-semibold text-rose-300">Why It Is Inefficient:</span> {learningAssistant?.level_1_brute_force?.why_inefficient || 'Repeated nested loops create quadratic execution overhead.'}</p>
                  </div>
                </div>

                {/* LEVEL 2 — BETTER APPROACH */}
                <div className="rounded-xl border border-amber-500/30 bg-slate-950/90 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                      <span>🟡 LEVEL 2 — BETTER APPROACH</span>
                    </h3>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                      {learningAssistant?.level_2_better_approach?.time_space_complexity || 'Time: O(N log N) | Space: O(N)'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-200">
                    <p><span className="font-semibold text-amber-300">Explanation:</span> {learningAssistant?.level_2_better_approach?.explanation || 'Improved approach using sorting, binary search, or auxiliary maps.'}</p>
                    <div>
                      <span className="font-semibold text-amber-300">Algorithm:</span>
                      <div className="mt-1 pl-2 border-l-2 border-amber-500/40 text-slate-300 space-y-0.5 text-[11px] whitespace-pre-line">
                        {Array.isArray(learningAssistant?.level_2_better_approach?.algorithm)
                          ? learningAssistant.level_2_better_approach.algorithm.join('\n')
                          : learningAssistant?.level_2_better_approach?.algorithm || '1. Sort input array or initialize index structure.\n2. Traverse data in single pass or with binary search.\n3. Return result.'}
                      </div>
                    </div>
                    {level2FormattedCode && (
                      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900 p-2 font-mono text-[11px] text-slate-200 overflow-x-auto">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5 text-[10px] text-slate-400">
                          <span>Code ({language.toUpperCase()})</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (level2FormattedCode) {
                                navigator.clipboard.writeText(level2FormattedCode);
                              }
                            }}
                            className="hover:text-cyan-300 transition"
                          >
                            Copy Code
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{level2FormattedCode}</pre>
                      </div>
                    )}
                    <p><span className="font-semibold text-amber-300">Improvement Over Level 1:</span> {learningAssistant?.level_2_better_approach?.improvement_over_level_1 || 'Significantly reduces iterations compared to the brute force method.'}</p>
                  </div>
                </div>

                {/* LEVEL 3 — EXISTING CONTENT */}
                <div className="rounded-xl border border-cyan-500/30 bg-slate-950/90 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                      <span>🔵 LEVEL 3 — OPTIMAL SOLUTION</span>
                    </h3>
                  </div>

                  {isAlreadyOptimal ? (
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-center text-xs font-medium text-emerald-300">
                      Current solution is optimal.
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
                          language={language}
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
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  </div>

      {/* Solve Puzzle DSA MCQ Modal */}
      {isPuzzleModalOpen && activePuzzle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-purple-500/30 bg-slate-900 p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Brain className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">DSA Challenge Puzzle</h3>
                  <p className="text-[11px] text-slate-400">Answer to unlock Level 1, Level 2 &amp; Level 3</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClosePuzzleModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Question */}
            <div className="space-y-1.5">
              <span className="inline-block rounded bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30 uppercase tracking-wide">
                Question
              </span>
              <p className="text-sm font-medium text-slate-100 leading-relaxed">
                {activePuzzle.question}
              </p>
            </div>

            {/* 4 MCQ Options */}
            <div className="space-y-2 pt-1">
              {activePuzzle.options.map((optionText, idx) => {
                const optionLetter = String.fromCharCode(65 + idx);
                const isSelected = selectedOptionIndex === idx;
                const correctIdx = activePuzzle.correctAnswerIndex ?? activePuzzle.correct_index ?? 0;
                const isCorrect = idx === correctIdx;

                let optionStyle = "border-slate-800 bg-slate-950/60 hover:border-purple-500/50 hover:bg-purple-500/5 text-slate-200";
                if (puzzleSubmitted) {
                  if (isCorrect) {
                    optionStyle = "border-emerald-500/60 bg-emerald-500/15 text-emerald-200 font-medium";
                  } else if (isSelected && !isCorrect) {
                    optionStyle = "border-rose-500/60 bg-rose-500/15 text-rose-200";
                  } else {
                    optionStyle = "border-slate-800/50 bg-slate-950/30 text-slate-500 opacity-60";
                  }
                } else if (isSelected) {
                  optionStyle = "border-purple-500 bg-purple-500/20 text-purple-100 ring-1 ring-purple-400";
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={puzzleSubmitted}
                    onClick={() => setSelectedOptionIndex(idx)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition text-xs ${optionStyle}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      isSelected
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {optionLetter}
                    </span>
                    <span className="flex-1 leading-snug">{optionText}</span>
                    {puzzleSubmitted && isCorrect && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    {puzzleSubmitted && isSelected && !isCorrect && (
                      <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Answer Feedback / Result */}
            {puzzleSubmitted && (
              <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                {selectedOptionIndex === (activePuzzle.correctAnswerIndex ?? activePuzzle.correct_index ?? 0) ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3 text-emerald-200">
                    <p className="text-sm font-bold flex items-center gap-2">
                      <span>Well done! 🎉</span>
                    </p>
                    <p className="text-xs text-emerald-300/90 mt-1 leading-snug">
                      {activePuzzle.explanation}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 p-3 text-rose-200 space-y-1">
                    <p className="text-xs font-semibold text-rose-300">
                      Incorrect. Correct Answer: <span className="font-bold text-emerald-300">Option {String.fromCharCode(65 + (activePuzzle.correctAnswerIndex ?? activePuzzle.correct_index ?? 0))}: {activePuzzle.options[activePuzzle.correctAnswerIndex ?? activePuzzle.correct_index ?? 0]}</span>
                    </p>
                    <p className="text-xs text-rose-200/90 leading-snug">
                      {activePuzzle.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              {!puzzleSubmitted ? (
                <button
                  type="button"
                  disabled={selectedOptionIndex === null}
                  onClick={handleSubmitPuzzleAnswer}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/50 bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-purple-950/50"
                >
                  Submit Answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClosePuzzleModal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 transition shadow-md shadow-emerald-950/50"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  Unlock Level 1, 2 &amp; 3
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewPage;

