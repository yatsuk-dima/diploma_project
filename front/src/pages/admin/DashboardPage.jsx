import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Users, BookOpen, GraduationCap, BarChart2, TrendingUp, Award,
  RotateCcw, CheckCircle, Layers, Info,
} from 'lucide-react';
import {
  getOverview, getStudentAnalytics, getGroupAnalytics,
  getTestAnalytics, getTestQuestionStats,
} from '../../api/analytics';
import { listUsers } from '../../api/users';
import { listGroups } from '../../api/groups';
import { listTests } from '../../api/tests';
import { useToast } from '../../components/Toast';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, icon: Icon, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colors[color]}`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

const selectCls = "border border-slate-200 rounded-xl px-3 py-2.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white";

function fmtScore(v) {
  if (v === null || v === undefined) return '—';
  return parseFloat(v).toFixed(2);
}

function scoreColor(v) {
  if (v === null || v === undefined) return 'text-slate-400';
  return v >= 0.8 ? 'text-emerald-600' : v >= 0.6 ? 'text-amber-600' : 'text-red-500';
}

function PassRateBar({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-400 text-sm">—</span>;
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

const CustomAreaTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-md text-xs">
      <p className="text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-indigo-600">{payload[0].value} спроб</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview section
// ---------------------------------------------------------------------------

function OverviewSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch(() => toast('Помилка завантаження'))
      .finally(() => setLoading(false));
  }, []);

  const dayChartData = (data?.attempts_by_day || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }),
    count: d.count,
  }));

  const topTestsChart = (data?.top_tests || []).map(t => ({
    name: t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title,
    score: t.avg_score ?? 0,
    passRate: t.pass_rate,
    attempts: t.total_attempts,
  }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
        <span className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        Завантаження...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Дисципліни" value={data?.total_disciplines} icon={Layers} color="violet" />
        <StatCard label="Тести" value={data?.total_tests} icon={BookOpen} color="indigo" />
        <StatCard label="Здобувачі" value={data?.active_students} icon={Users} color="cyan" />
        <StatCard label="Групи" value={data?.total_groups} icon={GraduationCap} color="emerald" />
        <StatCard label="Всього спроб" value={data?.total_attempts} icon={RotateCcw} color="amber" />
        <StatCard
          label="% успішних"
          value={data?.pass_rate != null ? `${data.pass_rate}%` : '—'}
          icon={CheckCircle}
          color="emerald"
          sub={data?.avg_score != null ? `Сер. бал: ${data.avg_score.toFixed(2)}` : undefined}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Спроби за останні 30 днів</h2>
            <TrendingUp size={15} className="text-slate-300" />
          </div>
          {dayChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dayChartData}>
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomAreaTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} fill="url(#attGrad)" dot={false} activeDot={{ r: 5, fill: '#4f46e5' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">Даних немає</div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Топ-5 тестів (за балом)</h2>
            <Award size={15} className="text-slate-300" />
          </div>
          {topTestsChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topTestsChart} layout="vertical" barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="score" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">Даних немає</div>
          )}
        </div>
      </div>

      {/* Top tests table + system info */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-2">
            <BarChart2 size={15} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Активні тести</h2>
          </div>
          {data?.top_tests?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Тест</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Спроб</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">% успішних</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.top_tests.map(t => (
                  <tr key={t.test_id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-700 font-medium max-w-[220px] truncate">{t.title}</td>
                    <td className="px-4 py-3 text-slate-500 text-center">{t.total_attempts}</td>
                    <td className="px-4 py-3 pr-5"><PassRateBar value={t.pass_rate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-10 text-center text-slate-400 text-sm">Ще немає спроб</div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-indigo-600 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-3">
              <Info size={16} className="opacity-80" />
              <h2 className="text-sm font-semibold">Про систему</h2>
            </div>
            <p className="text-indigo-100 text-xs leading-relaxed">
              Платформа адаптивного тестування на базі Теорії відповіді на завдання (IRT / Rasch model).
              Складність питань автоматично підлаштовується під рівень здобувача за параметром θ.
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-2.5">Позначення</h2>
            <div className="space-y-2 text-xs text-slate-500">
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-indigo-600 shrink-0">θ</span>
                <span>Здатність здобувача — чим вище, тим кращий рівень підготовки</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-slate-600 shrink-0">IRT</span>
                <span>Складність питання, оновлюється автоматично після 30+ відповідей</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-slate-600 shrink-0">%</span>
                <span>Відсоток здобувачів із балом ≥ 0.60 (із спроб з оцінкою)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics tabs (same as instructor)
// ---------------------------------------------------------------------------

function StudentTab() {
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    listUsers({ role: 'student', per_page: 200 }).then(r => setStudents(r.items)).catch(() => {});
  }, []);

  async function load(id) {
    if (!id) return;
    setLoading(true);
    try { setData(await getStudentAnalytics(id)); }
    catch { toast('Помилка завантаження аналітики'); }
    finally { setLoading(false); }
  }

  const thetaData = data?.attempts.slice().reverse().map(a => ({
    attempt: `#${a.attempt_number}`, theta: parseFloat(a.theta.toFixed(3)),
  }));

  return (
    <div className="space-y-6">
      <select value={selectedId} onChange={e => { setSelectedId(e.target.value); load(e.target.value); }} className={selectCls}>
        <option value="">— Оберіть здобувача —</option>
        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />Завантаження...</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Всього спроб" value={data.total_attempts} icon={RotateCcw} />
            <StatCard label="Завершено" value={data.completed_attempts} icon={Award} color="emerald" />
            <StatCard label="Середній бал" value={fmtScore(data.avg_score)} icon={TrendingUp} color="amber" />
            <StatCard label="Найкращий бал" value={fmtScore(data.best_score)} icon={Award} color="rose" />
          </div>

          {thetaData?.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Прогрес θ (здатність)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={thetaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="attempt" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="theta" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Спроби</h3>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Тест</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Бал</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">θ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Дата</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.attempts.map(a => (
                  <tr key={a.attempt_id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-700 max-w-[200px] truncate font-medium">{a.test_title}</td>
                    <td className="px-4 py-3 text-slate-500">{a.attempt_number}</td>
                    <td className="px-4 py-3"><span className={`font-semibold ${scoreColor(a.score)}`}>{fmtScore(a.score)}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.theta.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : a.status === 'timeout' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {a.status === 'completed' ? 'Завершено' : a.status === 'timeout' ? 'Таймаут' : 'В процесі'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(a.started_at).toLocaleString('uk-UA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GroupTab() {
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => { listGroups().then(setGroups).catch(() => {}); }, []);

  async function load(id) {
    if (!id) return;
    setLoading(true);
    try { setData(await getGroupAnalytics(id)); }
    catch { toast('Помилка'); }
    finally { setLoading(false); }
  }

  const barData = data?.students.map(s => ({
    name: s.full_name.split(' ')[1]?.[0]
      ? `${s.full_name.split(' ')[0]} ${s.full_name.split(' ')[1][0]}.`
      : s.full_name.split(' ')[0],
    score: s.avg_score ?? 0,
  }));

  return (
    <div className="space-y-6">
      <select value={selectedId} onChange={e => { setSelectedId(e.target.value); load(e.target.value); }} className={selectCls}>
        <option value="">— Оберіть групу —</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />Завантаження...</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Здобувачів" value={data.student_count} icon={Users} />
            <StatCard label="Сер. бал групи" value={fmtScore(data.group_avg_score)} icon={TrendingUp} color="emerald" />
          </div>

          {barData?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Середній бал по здобувачах</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="score" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Здобувачі</h3>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">ПІБ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Спроб</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Сер. бал</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">θ</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.students.map(s => (
                  <tr key={s.student_id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-800">{s.full_name}</td>
                    <td className="px-4 py-3 text-slate-500">{s.total_attempts}</td>
                    <td className="px-4 py-3"><span className={`font-semibold ${scoreColor(s.avg_score)}`}>{fmtScore(s.avg_score)}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.last_theta.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TestTab() {
  const [tests, setTests] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [qStats, setQStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => { listTests({ per_page: 100 }).then(r => setTests(r.items)).catch(() => {}); }, []);

  async function load(id) {
    if (!id) return;
    setLoading(true);
    try {
      const [analytics, questions] = await Promise.all([getTestAnalytics(id), getTestQuestionStats(id)]);
      setData(analytics); setQStats(questions);
    } catch { toast('Помилка'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <select value={selectedId} onChange={e => { setSelectedId(e.target.value); load(e.target.value); }} className={selectCls}>
        <option value="">— Оберіть тест —</option>
        {tests.map(t => <option key={t.id} value={t.id}>{t.lesson_code ? `${t.lesson_code} — ` : ''}{t.title}</option>)}
      </select>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />Завантаження...</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Всього спроб" value={data.total_attempts} icon={RotateCcw} />
            <StatCard label="Здобувачів" value={data.unique_students} icon={Users} />
            <StatCard label="Середній бал" value={fmtScore(data.avg_score)} icon={TrendingUp} color="emerald" />
            <StatCard label="% успішних (≥0.60)" value={data.pass_rate !== null ? `${data.pass_rate}%` : '—'} icon={Award} color="amber" />
            <StatCard label="Завершено" value={data.completed_count} icon={BookOpen} />
            <StatCard label="Таймаутів" value={data.timeout_count} icon={BarChart2} color="rose" />
          </div>

          {qStats?.items?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">Статистика питань</h3>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Питання</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Тип</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Відповідей</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">% правильних</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">IRT</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {qStats.items.map(q => (
                    <tr key={q.question_id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-700 max-w-[300px] truncate">{q.question_text}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{q.question_type === 'single_choice' ? 'Один' : q.question_type === 'multiple_choice' ? 'Кілька' : 'Відкрита'}</td>
                      <td className="px-4 py-3 text-slate-600">{q.response_count}</td>
                      <td className="px-4 py-3">
                        {q.correct_rate !== null ? (
                          <span className={`font-semibold ${q.correct_rate >= 70 ? 'text-emerald-600' : q.correct_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{q.correct_rate}%</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg">
                          {q.effective_difficulty.toFixed(2)}
                          {q.irt_difficulty_override !== null && ' ✎'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'overview', label: 'Огляд', icon: Layers },
  { key: 'test', label: 'По тесту', icon: BarChart2 },
  { key: 'group', label: 'Група', icon: GraduationCap },
  { key: 'student', label: 'Здобувач', icon: Users },
];

export default function DashboardPage() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Дашборд</h1>
        <p className="text-slate-500 text-sm mt-0.5">Загальна статистика та аналітика системи</p>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewSection />}
      {tab === 'test' && <TestTab />}
      {tab === 'group' && <GroupTab />}
      {tab === 'student' && <StudentTab />}
    </div>
  );
}
