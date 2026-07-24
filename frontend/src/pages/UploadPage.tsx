import { motion } from 'framer-motion';

const UploadPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Upload Files</p>
        <h1 className="text-3xl font-semibold text-white">Upload source code or archives</h1>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-glow">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </div>
        <h2 className="mt-6 text-xl font-semibold text-white">Drop files here</h2>
        <p className="mt-2 text-slate-400">Supports .py, .js, .ts, .java, .go, .rs, .cpp, .c, .cs, and .zip archives.</p>
        <button className="mt-6 rounded-full bg-cyan-500 px-5 py-3 font-semibold text-slate-950">Choose files</button>
      </motion.div>
    </div>
  );
};

export default UploadPage;
