import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Editor from '@monaco-editor/react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { detectLanguage } from '../utils/languageDetection';
import { deriveComplexity } from '../utils/complexityAnalysis';
import { AlertTriangle, Bug, Copy, Download, Gauge, Lightbulb, ShieldAlert, Sparkles, Upload, Wrench } from 'lucide-react';

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
      explanations?: string[];
      complexity_improvements?: string[];
      best_practices?: string[];
    };
  };
  code_hash?: string;
  cached?: boolean;
}

type BenefitType = 'Performance' | 'Security' | 'Maintainability' | 'Readability' | 'Best Practice';

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

interface OptimizationTip {
  id: string;
  title: string;
  benefit: BenefitType;
  description: string;
  expectedBenefit: string;
  severity: 'high' | 'medium' | 'low';
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

const categoryIcon = (category: string) => {
  const categoryText = category.toLowerCase();
  if (categoryText.includes('security')) return ShieldAlert;
  if (categoryText.includes('performance') || categoryText.includes('complexity')) return Gauge;
  if (categoryText.includes('bug')) return Bug;
  if (categoryText.includes('practice') || categoryText.includes('smell')) return Wrench;
  return AlertTriangle;
};

const getBenefitStyle = (benefit: BenefitType): string => {
  if (benefit === 'Security') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (benefit === 'Performance') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  if (benefit === 'Maintainability') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (benefit === 'Readability') return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
};

const generateOptimizationTips = (sourceCode: string, lang: string, findings: FindingCard[]): OptimizationTip[] => {
  const code = sourceCode.toLowerCase();
  const tips: OptimizationTip[] = [];

  const hasSecurityFinding = findings.some((f) => f.category.toLowerCase().includes('security'));
  const hasPerformanceFinding = findings.some((f) => f.category.toLowerCase().includes('performance') || f.description.toLowerCase().includes('o(n'));
  const hasBroadException = /except\s*:\s*|except\s+exception\s*:/i.test(sourceCode);
  const hasNestedLoop = /for\s+.+:\s*\n[\s\S]{0,120}for\s+.+:/i.test(sourceCode) || /for\s*\(.+\)\s*\{[\s\S]{0,120}for\s*\(/i.test(sourceCode);
  const hasStringConcatLoop = /(for\s+.+:\s*[\s\S]{0,160}\+=\s*['\"])/i.test(sourceCode);
  const hasSqlInterpolation = /(select|insert|update|delete)[\s\S]{0,120}(\{|%s|\+\s*\w+)/i.test(code);
  const hasArrayMembershipLoop = lang === 'python' && /for\s+.+:\s*[\s\S]{0,120}\sin\s+\w+/i.test(sourceCode) && /\blist\b|\[.*\]/i.test(sourceCode);

  if (hasSqlInterpolation || hasSecurityFinding) {
    tips.push({
      id: 'tip-sec-queries',
      title: 'Use parameterized queries for all database access',
      benefit: 'Security',
      description: 'String interpolation in SQL-like statements can allow injection vulnerabilities and unsafe query execution.',
      expectedBenefit: 'Prevents SQL injection risk and improves query safety across user inputs.',
      severity: 'high',
    });
  }

  if (hasNestedLoop || hasPerformanceFinding) {
    tips.push({
      id: 'tip-perf-lookup',
      title: 'Replace nested lookups with hash-based structures',
      benefit: 'Performance',
      description: 'Detected looping patterns that can grow quadratically for larger inputs.',
      expectedBenefit: 'Can reduce time complexity from O(n^2) to O(n) for membership and join-like operations.',
      severity: 'medium',
    });
  }

  if (hasArrayMembershipLoop) {
    tips.push({
      id: 'tip-perf-set',
      title: 'Use set for frequent membership checks in Python',
      benefit: 'Performance',
      description: 'Membership checks against list structures are linear and can become expensive inside loops.',
      expectedBenefit: 'Using set enables near-constant-time lookup and faster execution on large datasets.',
      severity: 'medium',
    });
  }

  if (hasStringConcatLoop) {
    tips.push({
      id: 'tip-readability-string-builder',
      title: 'Avoid repeated string concatenation inside loops',
      benefit: 'Readability',
      description: 'Repeated concatenation can increase allocation overhead and makes intent less explicit.',
      expectedBenefit: 'Use list join (Python) or builder-style patterns for cleaner and more efficient output assembly.',
      severity: 'low',
    });
  }

  if (hasBroadException) {
    tips.push({
      id: 'tip-maintainability-exceptions',
      title: 'Handle specific exception types',
      benefit: 'Maintainability',
      description: 'Broad exception handling can hide real failures and makes debugging harder.',
      expectedBenefit: 'Improves reliability and observability by preserving meaningful failure paths.',
      severity: 'medium',
    });
  }

  if (lang === 'javascript' || lang === 'typescript') {
    if (/\bvar\s+/.test(sourceCode)) {
      tips.push({
        id: 'tip-bestpractice-js-var',
        title: 'Prefer const/let over var',
        benefit: 'Best Practice',
        description: 'Function-scoped var can lead to hoisting confusion and accidental reassignments.',
        expectedBenefit: 'Improves scope clarity and reduces side effects in modern JavaScript/TypeScript.',
        severity: 'low',
      });
    }
  }

  if (lang === 'python') {
    if (!/def\s+\w+\(.*\)\s*->/.test(sourceCode)) {
      tips.push({
        id: 'tip-bestpractice-py-types',
        title: 'Add type hints for public functions',
        benefit: 'Best Practice',
        description: 'Function signatures without type hints reduce static tooling effectiveness.',
        expectedBenefit: 'Improves readability, editor assistance, and early error detection.',
        severity: 'low',
      });
    }
  }

  return tips.slice(0, 6);
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
  const [optimizationTips, setOptimizationTips] = useState<OptimizationTip[]>([]);
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
  const localAnalysisCache = useRef<Map<string, ReviewResponse>>(new Map());

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
    setOptimizationTips(generateOptimizationTips(code, language, mergedFindings));
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
      setOptimizationTips([]);
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

  const optimizedCodeForLevel3 =
    learningAssistant?.level_3_optimized_solution?.code?.trim() ||
    refactoredCode.trim() ||
    code;

  const level3Explanation = learningAssistant?.level_3_optimized_solution?.explanations || [];
  const level3Complexity = learningAssistant?.level_3_optimized_solution?.complexity_improvements || [];
  const level3BestPractices = learningAssistant?.level_3_optimized_solution?.best_practices || [];
  const originalComplexity = useMemo(() => deriveComplexity(code, language), [code, language]);
  const optimizedComplexity = useMemo(() => deriveComplexity(optimizedCodeForLevel3, language), [optimizedCodeForLevel3, language]);

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

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow"
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
          <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800">
            <Editor
              theme="vs-dark"
              language={language}
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={{ minimap: { enabled: false } }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow flex flex-col h-full"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <h2 className="text-xl font-semibold text-white">Findings</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {score !== null && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    score >= 90
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : score >= 70
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  Overall Score: {score}/100
                </span>
              )}
              {analysisHash && <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-300">Hash {analysisHash.slice(0, 8)}</span>}
              {wasCached && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-wider text-emerald-300">Cached Result</span>}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200">Critical: <span className="font-semibold">{severityBreakdown.critical ?? 0}</span></div>
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-orange-200">High: <span className="font-semibold">{severityBreakdown.high ?? 0}</span></div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">Medium: <span className="font-semibold">{severityBreakdown.medium ?? 0}</span></div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-blue-200">Low: <span className="font-semibold">{severityBreakdown.low ?? 0}</span></div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[380px] pr-1">
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Summary</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{summary}</p>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400 italic flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"></div>
                Analyzing code structures...
              </div>
            ) : findings.length > 0 ? (
              findings.map((finding) => {
                const Icon = categoryIcon(finding.category);
                return (
                  <div key={finding.id} className={`rounded-2xl border p-4 transition duration-200 hover:scale-[1.01] ${getSeverityStyles(finding.severity)}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-xs uppercase tracking-wider font-bold">{finding.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                          {severityDisplay(finding.severity)}
                        </span>
                        <span className="text-xs text-slate-400">{finding.lineNumber ? `Line ${finding.lineNumber}` : 'Line N/A'}</span>
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-white">{finding.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">{finding.description}</p>

                    <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Why it matters</p>
                      <p className="mt-1 text-xs text-slate-200 leading-relaxed">{finding.whyItMatters}</p>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Suggested Fix</p>
                      <p className="mt-1 text-xs text-slate-200 leading-relaxed">{finding.suggestedFix}</p>
                    </div>

                    {finding.improvedCode && (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">Improved Code</p>
                        <pre className="mt-1 text-xs text-slate-200 whitespace-pre-wrap overflow-x-auto">{finding.improvedCode}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              !loading &&
              score !== null && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
                  <p className="text-sm font-semibold text-emerald-300">No issues found!</p>
                  <p className="mt-1 text-xs text-slate-400">Your code follows security and code-quality heuristics.</p>
                </div>
              )
            )}

            {optimizationTips.length > 0 && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-300" />
                    <p className="text-xs uppercase tracking-wider text-violet-300 font-semibold">AI Optimization Tips</p>
                  </div>
                  <span className="text-[10px] text-violet-200/80">Context-aware recommendations</span>
                </div>

                <div className="space-y-3">
                  {optimizationTips.map((tip) => (
                    <div key={tip.id} className="rounded-xl border border-violet-300/20 bg-slate-950/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-violet-300" />
                          {tip.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getBenefitStyle(tip.benefit)}`}>
                            {tip.benefit}
                          </span>
                          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                            {severityDisplay(tip.severity)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-300 leading-relaxed">{tip.description}</p>
                      <div className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/60 p-2">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400">Expected benefit</p>
                        <p className="text-xs text-slate-200 leading-relaxed">{tip.expectedBenefit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-cyan-300 font-semibold">3-Level Learning Assistant</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((level) => (
                    <button
                      key={`assistant-level-${level}`}
                      type="button"
                      onClick={() => setAssistantViewLevel(level as 1 | 2 | 3)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                        assistantViewLevel === level
                          ? 'border-cyan-300 bg-cyan-100 text-slate-900'
                          : 'border-cyan-500/30 bg-transparent text-cyan-200 hover:border-cyan-300'
                      }`}
                    >
                      Level {level}
                    </button>
                  ))}
                </div>
              </div>

              {assistantViewLevel === 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-cyan-100">Hint: small nudges without revealing the full solution.</p>
                  {(learningAssistant?.level_1_hint || ['Run analysis to generate learning hints.']).map((item, idx) => (
                    <div key={`hint-${idx}`} className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3 text-xs text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              )}

              {assistantViewLevel === 2 && (
                <div className="space-y-2">
                  <p className="text-sm text-cyan-100">Guidance: issue explanation and optimization suggestions.</p>
                  {(learningAssistant?.level_2_guidance || ['Run analysis to generate guidance.']).map((item, idx) => (
                    <div key={`guidance-${idx}`} className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3 text-xs text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              )}

              {assistantViewLevel === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-cyan-100">Optimized solution: refactor, complexity improvements, and best practices.</p>
                  {level3Explanation.length > 0 && (
                    <div className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Explanation</p>
                      <div className="mt-1 space-y-1 text-xs text-slate-200">
                        {level3Explanation.map((item, idx) => (
                          <p key={`lvl3-exp-${idx}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {level3Complexity.length > 0 && (
                    <div className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Complexity Improvements</p>
                      <div className="mt-1 space-y-1 text-xs text-slate-200">
                        {level3Complexity.map((item, idx) => (
                          <p key={`lvl3-cx-${idx}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {level3BestPractices.length > 0 && (
                    <div className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Best Practices</p>
                      <div className="mt-1 space-y-1 text-xs text-slate-200">
                        {level3BestPractices.map((item, idx) => (
                          <p key={`lvl3-bp-${idx}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {complexityAnalysis && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold mb-2">Complexity Analysis</p>
                <p className="text-sm text-slate-300 whitespace-pre-line">{complexityAnalysis}</p>
              </div>
            )}

            {assistantViewLevel === 3 && (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Optimized Code</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyOptimizedCode}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copySuccess ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadOptimizedCode}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                </div>
                <div className="h-[320px] overflow-hidden rounded-lg border border-slate-800">
                  <Editor
                    theme="vs-dark"
                    language={language}
                    value={optimizedCodeForLevel3}
                    options={{
                      readOnly: true,
                      lineNumbers: 'on',
                      folding: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'off',
                      automaticLayout: true,
                      scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                        useShadows: false,
                      },
                    }}
                  />
                </div>

                <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Complexity Comparison</p>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-2 text-slate-200">
                      Original Time Complexity {'->'} Optimized Time Complexity
                      <p className="mt-1 font-semibold text-cyan-300">{originalComplexity.time} {'->'} {optimizedComplexity.time}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 p-2 text-slate-200">
                      Original Space Complexity {'->'} Optimized Space Complexity
                      <p className="mt-1 font-semibold text-cyan-300">{originalComplexity.space} {'->'} {optimizedComplexity.space}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ReviewPage;

