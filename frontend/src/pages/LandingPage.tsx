import { motion } from 'framer-motion';
import { ArrowRight, Bot, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/20 p-3 text-cyan-400">
            <Bot size={24} />
          </div>
          <div>
            <p className="text-lg font-semibold">CodeSense AI</p>
            <p className="text-sm text-slate-400">AI-powered code review</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to="/login" className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200">Login</Link>
          <Link to="/register" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Get Started</Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-6 pb-16 lg:flex-row lg:items-center lg:gap-16 lg:px-8">
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
            <Sparkles size={16} />
            Free local AI + static analysis
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            AI - Powered Coding Assistant.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            Upload source files, paste snippets, or connect repositories to receive bug reports, security findings, performance insights, and AI-generated improvements.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">
              Start Free Review <ArrowRight size={18} />
            </Link>
            <Link to="/dashboard" className="rounded-full border border-slate-700 px-5 py-3 font-semibold text-slate-200 transition hover:bg-slate-900">
              Explore Dashboard
            </Link>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-glow">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Live review snapshot</h2>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-300">94/100</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-900 p-4">
                <ShieldCheck className="text-emerald-400" size={20} />
                <p className="mt-3 text-2xl font-semibold">8</p>
                <p className="text-sm text-slate-400">Security checks</p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <Zap className="text-cyan-400" size={20} />
                <p className="mt-3 text-2xl font-semibold">3</p>
                <p className="text-sm text-slate-400">Performance issues</p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <Sparkles className="text-violet-400" size={20} />
                <p className="mt-3 text-2xl font-semibold">12</p>
                <p className="text-sm text-slate-400">Refactor suggestions</p>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
};

export default LandingPage;
