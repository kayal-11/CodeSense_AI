import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Flame, Target, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface DashboardData {
  problems_solved: number;
  problems_needing_improvement: number;
  dsa_accuracy: number;
  current_streak: number;
  best_streak: number;
  difficulty: { easy: number; medium: number; hard: number };
  level_progression: { level_1: number; level_2: number; level_3: number };
  progress_trend: Array<{ name: string; score: number; level: string; solved: number }>;
  weekly_activity: Array<{ name: string; score: number; level: string; solved: number }>;
  topic_mastery: Array<{ name: string; mastery: number; solved: number; color: string }>;
  weak_topics: string[];
  recommendations: string[];
  languages_supported: string[];
}

const defaultDashboard: DashboardData = {
  problems_solved: 0,
  problems_needing_improvement: 0,
  dsa_accuracy: 0,
  current_streak: 0,
  best_streak: 0,
  difficulty: { easy: 0, medium: 0, hard: 0 },
  level_progression: { level_1: 0, level_2: 0, level_3: 0 },
  progress_trend: [
    { name: 'Mon', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Tue', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Wed', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Thu', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Fri', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Sat', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Sun', score: 0, level: 'Level 1: Brute Force', solved: 0 },
  ],
  weekly_activity: [
    { name: 'Mon', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Tue', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Wed', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Thu', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Fri', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Sat', score: 0, level: 'Level 1: Brute Force', solved: 0 },
    { name: 'Sun', score: 0, level: 'Level 1: Brute Force', solved: 0 },
  ],
  topic_mastery: [
    { name: 'Arrays & Strings', mastery: 0, solved: 0, color: 'bg-cyan-400' },
    { name: 'Stack, Queue & Linked List', mastery: 0, solved: 0, color: 'bg-emerald-400' },
    { name: 'Trees & Graphs', mastery: 0, solved: 0, color: 'bg-violet-400' },
    { name: 'Dynamic Programming', mastery: 0, solved: 0, color: 'bg-amber-400' },
  ],
  weak_topics: [],
  recommendations: [
    'Submit source code in C, C++, Java, or Python in the Review workspace to start tracking your real-time DSA progress.'
  ],
  languages_supported: ['c', 'cpp', 'java', 'python'],
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(defaultDashboard);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const res = await axios.get<DashboardData>(apiUrl('/reports/dashboard'), {
          headers: authHeaders(),
        });
        if (res.data) {
          setData(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch real-time dashboard data:', err);
      }
    };

    fetchDashboardStats();
  }, []);

  const totalLevelSolved = (data.level_progression.level_1 + data.level_progression.level_2 + data.level_progression.level_3) || 1;
  const lvl1Pct = Math.round((data.level_progression.level_1 / totalLevelSolved) * 100);
  const lvl2Pct = Math.round((data.level_progression.level_2 / totalLevelSolved) * 100);
  const lvl3Pct = Math.round((data.level_progression.level_3 / totalLevelSolved) * 100);

  const maxWeeklySolved = Math.max(...data.weekly_activity.map((d) => d.solved), 1);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">DSA Progress Tracker</p>
            <span className="rounded-full bg-cyan-950 px-2.5 py-0.5 text-xs font-medium text-cyan-400 border border-cyan-800/60">
              C, C++, Java, Python
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-white">DSA Learning & Practice Dashboard</h1>
        </div>
        <button
          onClick={() => navigate('/review')}
          className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 shadow-glow"
        >
          Practice DSA Problem
        </button>
      </div>

      {/* Top Metrics Row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Current Streak</p>
            <Flame className="text-orange-400" size={20} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-white">{data.current_streak} <span className="text-lg font-normal text-orange-400">Days 🔥</span></p>
            <span className="text-xs text-slate-400">Best: {data.best_streak} Days</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Problems Solved</p>
            <CheckCircle2 className="text-cyan-400" size={20} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-white">{data.problems_solved}</p>
            <span className="text-xs text-slate-400">E: {data.difficulty.easy} | M: {data.difficulty.medium} | H: {data.difficulty.hard}</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">DSA Accuracy</p>
            <Target className="text-emerald-400" size={20} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-white">{data.dsa_accuracy}%</p>
            <span className="text-xs text-emerald-400 font-medium">Real-Time Avg</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Problems Needing Work</p>
            <AlertTriangle className="text-amber-400" size={20} />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-white">{data.problems_needing_improvement}</p>
            <span className="text-xs text-amber-400 font-medium">Needs Attention</span>
          </div>
        </motion.div>
      </div>

      {/* Level Progression Overview */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">3-Level Solution Progression</h2>
            <p className="text-xs text-slate-400">Real-time breakdown of solution maturity</p>
          </div>
          <span className="text-xs font-semibold text-cyan-400 bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-800/40">
            Optimal Target: Level 3
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-300">Level 1: Brute Force</span>
              <span className="text-cyan-400 font-semibold">{data.level_progression.level_1} Solved ({lvl1Pct}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${lvl1Pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Basic working logic & linear/nested loops</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-300">Level 2: Better Approach</span>
              <span className="text-amber-400 font-semibold">{data.level_progression.level_2} Solved ({lvl2Pct}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${lvl2Pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Two-pointer, sorting, or hashing optimization</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-300">Level 3: Optimal Solution</span>
              <span className="text-emerald-400 font-semibold">{data.level_progression.level_3} Solved ({lvl3Pct}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${lvl3Pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Optimal Time & Space complexity (O(N), O(1))</p>
          </div>
        </div>
      </div>

      {/* Charts & Details Grid */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        {/* Left: Progress Chart & Weekly Activity */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">DSA Accuracy & Performance Trend</h2>
                <p className="text-xs text-slate-400">Weekly accuracy score trajectory</p>
              </div>
              <span className="text-sm text-cyan-400 font-medium">Daily Breakdown</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.progress_trend}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="5 5" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#f8fafc' }}
                    formatter={(value: any, _name: any, item: any) => [
                      `${value}% (${item.payload.level}) - ${item.payload.solved} solved`,
                      'Accuracy'
                    ]}
                  />
                  <Line type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4, fill: '#38bdf8' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weekly Practice Activity Bar */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <h2 className="text-xl font-semibold text-white mb-1">Weekly Activity Heat</h2>
            <p className="text-xs text-slate-400 mb-4">Daily DSA submissions across C, C++, Java, and Python</p>
            <div className="grid grid-cols-7 gap-2 text-center">
              {data.weekly_activity.map((d) => (
                <div key={d.name} className="flex flex-col items-center gap-2">
                  <div className="w-full bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex flex-col items-center justify-end h-24">
                    <div
                      className="w-full bg-cyan-500/80 rounded-lg transition-all"
                      style={{ height: `${Math.min(100, (d.solved / maxWeeklySolved) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">{d.name}</span>
                  <span className="text-[10px] text-cyan-400">{d.solved} solved</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Topic Mastery & Continue Learning */}
        <div className="space-y-6">
          {/* Topic Mastery */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Topic Mastery</h2>
              <span className="text-xs text-slate-400">Dynamic Mastery</span>
            </div>
            <div className="space-y-4">
              {data.topic_mastery.map((t) => (
                <div key={t.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{t.name}</span>
                    <span className="text-slate-400">{t.mastery}% ({t.solved} solved)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${t.color} rounded-full`} style={{ width: `${t.mastery}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Continue Learning / Weak Areas */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Continue Learning</h2>
              {data.weak_topics.length > 0 && (
                <span className="text-xs font-medium text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-800/40">
                  Weak: {data.weak_topics[0]}
                </span>
              )}
            </div>
            <ul className="space-y-3 text-sm text-slate-300">
              {data.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2.5 rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
                  <TrendingUp className="text-cyan-400 shrink-0 mt-0.5" size={16} />
                  <span className="text-xs text-slate-300 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
