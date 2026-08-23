import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, Bot, Flame, History, LayoutDashboard, MessageSquare, Settings, LogOut } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/review', label: 'Review Code', icon: Activity },
  { to: '/history', label: 'Review History', icon: History },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface StreakData {
  current_streak: number;
  best_streak: number;
  today_completed: boolean;
}

const Layout = () => {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const [streak, setStreak] = useState<StreakData>({
    current_streak: 0,
    best_streak: 0,
    today_completed: false,
  });

  const fetchStreak = async () => {
    const jwtToken = token || localStorage.getItem('token');
    if (!jwtToken) return;

    try {
      const res = await axios.get<StreakData>(apiUrl('/reports/dashboard'), {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (res.data) {
        setStreak({
          current_streak: res.data.current_streak || 0,
          best_streak: res.data.best_streak || 0,
          today_completed: Boolean(res.data.today_completed),
        });
      }
    } catch (err) {
      console.error('Failed to fetch streak data:', err);
    }
  };

  useEffect(() => {
    fetchStreak();
  }, [location.pathname, token]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-800 bg-slate-900/80 p-6 backdrop-blur xl:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/20 p-3 text-cyan-400">
            <Bot size={24} />
          </div>
          <div>
            <p className="text-lg font-semibold">CodeSense AI</p>
            <p className="text-sm text-slate-400">AI-powered review assistant</p>
          </div>
        </div>

        <nav className="space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  isActive ? 'bg-cyan-500/20 text-cyan-300 shadow-glow' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Flame className="text-orange-400" size={18} />
              <span>Streak Tracker</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Streak:</span>
                <span className="font-semibold text-orange-400">{streak.current_streak} Days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Best Streak:</span>
                <span className="font-semibold text-slate-200">{streak.best_streak} Days</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                <span className="text-slate-400">Today:</span>
                {streak.today_completed ? (
                  <span className="font-semibold text-emerald-400">✅ Completed</span>
                ) : (
                  <span className="font-semibold text-amber-400">⏳ Pending</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-sm">
              {user?.fullName ? getInitials(user.fullName) : 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate text-white">{user?.fullName}</p>
              <p className="text-xs truncate text-slate-400">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <main className="ml-0 flex-1 px-4 py-6 sm:px-6 xl:ml-72">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
