import { motion } from 'framer-motion';

const reviews = [
  { id: 1, name: 'auth_service.py', risk: 'High', score: '72/100' },
  { id: 2, name: 'utils.ts', risk: 'Medium', score: '86/100' },
  { id: 3, name: 'payment.go', risk: 'Critical', score: '64/100' },
];

const HistoryPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Review History</p>
        <h1 className="text-3xl font-semibold text-white">Recent review artifacts</h1>
      </div>

      <div className="space-y-4">
        {reviews.map((review) => (
          <motion.div key={review.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4 shadow-glow">
            <div>
              <p className="font-medium text-white">{review.name}</p>
              <p className="text-sm text-slate-400">Risk: {review.risk}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-cyan-300">{review.score}</p>
              <p className="text-sm text-slate-400">Reviewed 2h ago</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPage;
