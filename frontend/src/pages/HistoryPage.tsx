import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { FileCode, AlertCircle, Clock } from 'lucide-react';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface ReviewHistoryItem {
  id: number;
  filename: string;
  name?: string;
  language: string;
  score: number;
  risk: string;
  findings_count: number;
  summary?: string;
  code?: string;
  report?: any;
  created_at: string | null;
}

const riskBadgeStyle = (risk: string) => {
  switch (risk.toLowerCase()) {
    case 'critical':
      return 'border-red-500/40 bg-red-500/15 text-red-200';
    case 'high':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-200';
    case 'medium':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-200';
    default:
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200';
  }
};

const formatTimestamp = (isoString: string | null): string => {
  if (!isoString) return 'Recently';
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

const HistoryPage = () => {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<ReviewHistoryItem[]>(apiUrl('/review/history'), {
          headers: authHeaders(),
        });
        setReviews(response.data);
      } catch (err: any) {
        console.error('Failed to load review history:', err);
        setError('Unable to load review history. Please check connection and retry.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const handleSelectReview = (review: ReviewHistoryItem) => {
    navigate('/review', { state: { review } });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Review History</p>
        <h1 className="text-3xl font-semibold text-white">Recent review artifacts</h1>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm">Loading review history...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-200">
          <AlertCircle className="mx-auto h-8 w-8 mb-2 text-rose-400" />
          <p>{error}</p>
        </div>
      ) : reviews.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-800 bg-slate-900/80 p-12 text-center shadow-glow space-y-4"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
            <FileCode className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-white">No Review Artifacts Yet</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You haven't completed any code reviews yet. Submit your source code in the Review Code tab to see completed reports and historical artifacts saved here automatically.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleSelectReview(review)}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4 shadow-glow hover:border-cyan-500/50 hover:bg-slate-900/90 cursor-pointer transition"
              title="Click to load code and AI review into editor"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-white text-base">{review.filename || review.name || 'Untitled File'}</p>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${riskBadgeStyle(review.risk)}`}>
                    Risk: {review.risk}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="capitalize text-cyan-400">{review.language}</span>
                  <span>•</span>
                  <span>{review.findings_count} {review.findings_count === 1 ? 'finding' : 'findings'}</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-500" />
                    {formatTimestamp(review.created_at)}
                  </span>
                </div>
              </div>
              <div className="text-right sm:self-center shrink-0">
                <p className="text-xl font-bold text-cyan-300">{review.score}/100</p>
                <p className="text-xs text-slate-400">Quality Score</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
