import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, Users, User, Calendar, Send } from 'lucide-react';
import { assignTest } from '../../api/tests';
import { listGroups } from '../../api/groups';
import { listUsers } from '../../api/users';
import { useToast } from '../../components/Toast';
import useAuthStore from '../../store/authStore';
import SearchableSelect from '../../components/SearchableSelect';

function toLocalInput(dt) {
  if (!dt) return '';
  return dt.slice(0, 16);
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-slate-400 font-normal ml-1.5 text-xs">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function AssignPage() {
  const { id: testId } = useParams();
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [mode, setMode] = useState('group');
  const [form, setForm] = useState({
    group_id: '',
    student_id: '',
    available_from: toLocalInput(new Date().toISOString()),
    available_until: '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const base = user?.role === 'admin' ? '/admin' : '/instructor';

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
    listUsers({ role: 'student', per_page: 200 })
      .then((r) => setStudents(r.items))
      .catch(() => {});
  }, []);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'group' && !form.group_id) { toast('Оберіть групу'); return; }
    if (mode === 'student' && !form.student_id) { toast('Оберіть здобувача'); return; }
    if (!form.available_from) { toast('Вкажіть дату початку'); return; }

    const payload = {
      test_id: testId,
      available_from: new Date(form.available_from).toISOString(),
      available_until: form.available_until ? new Date(form.available_until).toISOString() : null,
    };
    if (mode === 'group') payload.group_id = form.group_id;
    else payload.student_id = form.student_id;

    setSaving(true);
    try {
      await assignTest(testId, payload);
      toast('Тест призначено', 'success');
      navigate(`${base}/tests`);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка призначення');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <Link to={`${base}/tests`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600 transition-colors mb-4">
        <ChevronLeft size={15} /> Тести
      </Link>

      <h1 className="text-2xl font-bold text-slate-800 mb-1">Призначити тест</h1>
      <p className="text-slate-500 text-sm mb-6">Визначте, хто матиме доступ до цього тесту</p>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        {/* Mode selector */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Призначити для</p>
          <div className="flex gap-2">
            {[
              { value: 'group', label: 'Групи', icon: Users },
              { value: 'student', label: 'Здобувача', icon: User },
            ].map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" onClick={() => setMode(value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  mode === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Group / Student selector */}
        {mode === 'group' ? (
          <Field label="Група" required>
            <select value={form.group_id} onChange={e => set('group_id', e.target.value)} required
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">— Оберіть групу —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Здобувач" required>
            {(() => {
              const groupedStudents = (() => {
                const map = new Map();
                for (const s of students) {
                  const key = s.group_name || '— Без групи —';
                  if (!map.has(key)) map.set(key, []);
                  map.get(key).push({ id: s.id, label: s.full_name, sub: s.group_name || undefined });
                }
                return [...map.entries()]
                  .sort(([a], [b]) => a.localeCompare(b, 'uk'))
                  .map(([key, items]) => ({ key, label: key, items }));
              })();
              return (
                <SearchableSelect
                  value={form.student_id}
                  onChange={id => set('student_id', id)}
                  placeholder="— Оберіть здобувача —"
                  groups={groupedStudents}
                />
              );
            })()}
          </Field>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Доступний з" required>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="datetime-local" value={form.available_from}
                onChange={e => set('available_from', e.target.value)} required
                className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </Field>
          <Field label="Доступний до" hint="необов'язково">
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="datetime-local" value={form.available_until}
                onChange={e => set('available_until', e.target.value)}
                className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </Field>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
            <Send size={14} />
            {saving ? 'Призначення...' : 'Призначити'}
          </button>
          <button type="button" onClick={() => navigate(`${base}/tests`)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
