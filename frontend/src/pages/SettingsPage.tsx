import { motion } from 'framer-motion';

const SettingsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Project Settings</p>
        <h1 className="text-3xl font-semibold text-white">Configure analysis preferences</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-glow">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="font-semibold text-white">AI model selection</p>
          <p className="mt-2 text-sm text-slate-400">Use Ollama with free local models such as DeepSeek Coder, CodeLlama, Qwen2.5-Coder, or StarCoder2.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="font-semibold text-white">Static analysis gates</p>
          <p className="mt-2 text-sm text-slate-400">Enable Semgrep, Bandit, Radon, Flake8, Pylint, Checkstyle, PMD, and SpotBugs.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="font-semibold text-white">Security</p>
          <p className="mt-2 text-sm text-slate-400">JWT authentication, password hashing, rate limiting, and CORS policies are enabled by default.</p>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
