import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, CheckSquare, Shield, Users, GraduationCap, LogOut, ChevronRight, LayoutDashboard } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { logout as apiLogout } from '../api/auth';

const NAV_ADMIN = [
  { to: '/admin/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/admin/disciplines', label: 'Дисципліни', icon: BookOpen },
  { to: '/admin/users', label: 'Користувачі', icon: Users },
  { to: '/admin/groups', label: 'Групи', icon: GraduationCap },
  { to: '/admin/tests', label: 'Тести', icon: BookOpen },
  { to: '/admin/review', label: 'Перевірка', icon: CheckSquare },
];

const NAV_INSTRUCTOR = [
  { to: '/instructor/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/instructor/tests', label: 'Тести', icon: BookOpen },
  { to: '/instructor/review', label: 'Перевірка', icon: CheckSquare },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const nav = user?.role === 'admin' ? NAV_ADMIN : NAV_INSTRUCTOR;
  const isAdmin = user?.role === 'admin';

  async function handleLogout() {
    const rt = localStorage.getItem('refresh_token');
    try { if (rt) await apiLogout(rt); } catch {}
    logout();
    navigate('/login');
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 flex flex-col shrink-0 shadow-2xl">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">АТС</p>
              <p className="text-slate-400 text-xs">
                {isAdmin ? 'Адміністратор' : 'Викладач'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} className="opacity-60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-indigo-300">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 text-xs font-medium truncate">{user?.full_name}</p>
              {user?.discipline_name && (
                <p className="text-indigo-400 text-xs truncate">{user.discipline_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={15} />
            <span>Вийти</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
