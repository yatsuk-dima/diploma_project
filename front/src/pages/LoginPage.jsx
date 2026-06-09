import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, User } from 'lucide-react';
import { login as apiLogin, me as apiMe } from '../api/auth';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [form, setForm] = useState({ login: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiLogin(form.login, form.password);
      localStorage.setItem('refresh_token', data.refresh_token);
      setAuth(null, data.access_token);
      const user = await apiMe();
      setAuth(user, data.access_token);
      if (user.role === 'admin') navigate('/admin/disciplines');
      else if (user.role === 'instructor') navigate('/instructor/tests');
      else navigate('/student/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Невірний логін або пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-10"
          style={{backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)', backgroundSize: '40px 40px'}}
        />
        <div className="relative z-10 text-center space-y-6 max-w-sm">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-indigo-900">
            <Shield size={40} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Адаптивна система тестування
            </h1>
            <p className="text-indigo-300 mt-3 text-sm leading-relaxed">
              Система оцінювання знань курсантів на базі Item Response Theory
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[
              { label: 'Адаптивність', desc: 'IRT-алгоритм' },
              { label: 'Аналітика', desc: 'θ-параметр' },
              { label: 'Безпека', desc: 'JWT + refresh' },
            ].map((f) => (
              <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white text-xs font-semibold">{f.label}</p>
                <p className="text-indigo-400 text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">АТС</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">Вхід до системи</h2>
            <p className="text-slate-400 text-sm mt-1">Введіть ваші облікові дані</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Логін</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  required
                  autoFocus
                  placeholder="your_login"
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Пароль</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/50 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Вхід...
                </span>
              ) : (
                'Увійти'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
