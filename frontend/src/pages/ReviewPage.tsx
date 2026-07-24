import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { detectLanguage } from '../utils/languageDetection';
import { AlertTriangle, Bug, Gauge, Lightbulb, ShieldAlert, Sparkles, Wrench } from 'lucide-react';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const initialCode = `def fetch_user(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return query
`;

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

const ReviewPage = () => {
  const [code, setCode] = useState(initialCode);
  const [fileNameHint, setFileNameHint] = useState('');
  const [language, setLanguage] = useState('python');
  const [detectedLanguage, setDetectedLanguage] = useState('Python');
  const [detectionConfidence, setDetectionConfidence] = useState<'high' | 'medium' | 'low'>('high');
  const [detectionReason, setDetectionReason] = useState('Detected from syntax with score 0.');
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [summary, setSummary] = useState('Review ready to run.');
  const [findings, setFindings] = useState<FindingCard[]>([]);
  const [optimizationTips, setOptimizationTips] = useState<OptimizationTip[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [complexityAnalysis, setComplexityAnalysis] = useState('');
  const [refactoredCode, setRefactoredCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const languageOptions = useMemo(
    () => [
      { value: 'plaintext', label: 'Plain Text' },
      { value: 'python', label: 'Python' },
      { value: 'javascript', label: 'JavaScript' },
      { value: 'typescript', label: 'TypeScript' },
      { value: 'java', label: 'Java' },
      { value: 'c', label: 'C' },
      { value: 'cpp', label: 'C++' },
      { value: 'go', label: 'Go' },
      { value: 'rust', label: 'Rust' },
      { value: 'csharp', label: 'C#' },
      { value: 'sql', label: 'SQL' },
      { value: 'html', label: 'HTML' },
      { value: 'css', label: 'CSS' },
      { value: 'json', label: 'JSON' },
      { value: 'shell', label: 'Shell' },
    ],
    []
  );

  useEffect(() => {
    const detection = detectLanguage(code, fileNameHint);
    setDetectedLanguage(detection.detectedLanguage);
    setDetectionConfidence(detection.confidence);
    setDetectionReason(detection.reason);

    if (!isManualOverride) {
      setLanguage(detection.language);
    }
  }, [code, fileNameHint, isManualOverride]);

  const handleReview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post<ReviewResponse>(apiUrl('/review/'), {
        code,
        language,
      });
      const payload = response.data;
      setSummary(payload.summary);
      setScore(payload.overall_score ?? payload.score ?? null);
      setComplexityAnalysis(payload.complexity_analysis || '');
      setRefactoredCode(payload.refactored_code || '');

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
    } catch (err: any) {
      console.error('Error running code review:', err);
      const serverDetail = err?.response?.data?.detail;
      const networkDetail = err?.message;
      setError(serverDetail || networkDetail || 'Failed to complete review. Please check backend status.');
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
          {loading ? 'Analyzing...' : 'Analyze code'}
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
              {isManualOverride && (
                <button
                  type="button"
                  onClick={() => setIsManualOverride(false)}
                  className="rounded-xl border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-500"
                >
                  Use auto
                </button>
              )}
              <select
                value={language}
                onChange={(e) => {
                  setIsManualOverride(true);
                  setLanguage(e.target.value);
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
              {detectionConfidence === 'low' && !isManualOverride && (
                <p className="mt-1 text-[11px] text-amber-300">Detection confidence is low. Choose a language from the selector if needed.</p>
              )}
            </div>
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
                Score: {score}/100
              </span>
            )}
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

            {complexityAnalysis && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold mb-2">Complexity Analysis</p>
                <p className="text-sm text-slate-300 whitespace-pre-line">{complexityAnalysis}</p>
              </div>
            )}

            {refactoredCode && (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Refactored Code</p>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto">{refactoredCode}</pre>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ReviewPage;

