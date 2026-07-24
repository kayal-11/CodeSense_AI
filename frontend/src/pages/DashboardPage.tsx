import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const data = [
  { name: 'Mon', score: 84 },
  { name: 'Tue', score: 88 },
  { name: 'Wed', score: 91 },
  { name: 'Thu', score: 90 },
  { name: 'Fri', score: 95 },
  { name: 'Sat', score: 93 },
];

const DashboardPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Dashboard</p>
          <h1 className="text-3xl font-semibold text-white">Review intelligence overview</h1>
        </div>
        <button className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Run new review</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Reviews', value: '128', icon: Activity, color: 'text-cyan-400' },
          { label: 'Bug Count', value: '24', icon: AlertTriangle, color: 'text-amber-400' },
          { label: 'Security Issues', value: '7', icon: ShieldCheck, color: 'text-emerald-400' },
          { label: 'Performance Score', value: '91%', icon: Sparkles, color: 'text-violet-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{label}</p>
              <Icon className={color} size={18} />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Quality trend</h2>
            <span className="text-sm text-slate-400">Last 6 reviews</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="5 5" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <h2 className="text-xl font-semibold text-white">Language distribution</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li className="flex items-center justify-between"><span>Python</span><span>42%</span></li>
              <li className="flex items-center justify-between"><span>TypeScript</span><span>28%</span></li>
              <li className="flex items-center justify-between"><span>Java</span><span>18%</span></li>
              <li className="flex items-center justify-between"><span>Go</span><span>12%</span></li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
            <h2 className="text-xl font-semibold text-white">Recommended next actions</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>Enable GitHub repository sync.</li>
              <li>Run Semgrep across the backend modules.</li>
              <li>Generate unit tests for the authentication service.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
