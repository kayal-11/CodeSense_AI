import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bot, FileUp, History, LayoutDashboard, MessageSquare, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/review', label: 'Review Code', icon: Activity },
  { to: '/upload', label: 'Upload Files', icon: FileUp },
  { to: '/history', label: 'Review History', icon: History },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Layout = () => {
  const { user, logout } = useAuth();

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
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-medium">Free AI review</p>
            <p className="mt-1 text-sm text-slate-400">Semgrep, Bandit, and local LLM analysis combined to deliver actionable review insights.</p>
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
