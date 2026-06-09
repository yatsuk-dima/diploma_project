import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, BookOpen } from 'lucide-react';
import { createTest, getTest, updateTest } from '../../api/tests';
import { listDisciplines } from '../../api/disciplines';
import { useToast } from '../../components/Toast';
import useAuthStore from '../../store/authStore';

const EMPTY = { title: '', description: '', discipline_id: '', lesson_code: '', time_limit_minutes: '', max_attempts: 3, no_time_limit: false };

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all";

export default function TestEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [disciplines, setDisciplines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const base = isAdmin ? '/admin' : '/instructor';

  useEffect(() => {
    if (isAdmin) {
      listDisciplines().then(setDisciplines).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getTest(id)
      .then((t) =>
        setForm({
          title: t.title,
          description: t.description ?? '',
          discipline_id: t.discipline_id ?? '',
          lesson_code: t.lesson_code ?? '',
          time_limit_minutes: t.time_limit_minutes ?? '',
          max_attempts: t.max_attempts,
          no_time_limit: !t.time_limit_minutes,
        })
      )
      .catch(() => toast('Помилка завантаження тесту'))
      .finally(() => setLoading(false));
  }, [id]);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description || null,
      discipline_id: form.discipline_id || null,
      lesson_code: form.lesson_code || null,
      time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null,
      max_attempts: Number(form.max_attempts),
    };
    try {
      if (isEdit) {
        await updateTest(id, payload);
        toast('Тест збережено', 'success');
        navigate(`${base}/tests`);
      } else {
        const t = await createTest(payload);
        toast('Тест створено', 'success');
        navigate(`${base}/tests/${t.id}/questions`);
      }
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <span className="w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      Завантаження...
    </div>
  );

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Link to={`${base}/tests`} className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 text-sm transition-colors">
          <ArrowLeft size={15} />
          Тести
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-600">{isEdit ? 'Редагувати' : 'Новий тест'}</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-800 mb-6">
        {isEdit ? 'Редагувати тест' : 'Новий тест'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
        <Field label="Назва" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
            autoFocus
            placeholder="Наприклад: Основи мережевих технологій"
            className={inputCls}
          />
        </Field>

        <Field label="Опис">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            placeholder="Короткий опис теми..."
            className={inputCls + ' resize-none'}
          />
        </Field>

        {isAdmin ? (
          <Field label="Дисципліна">
            <select value={form.discipline_id} onChange={(e) => set('discipline_id', e.target.value)} className={inputCls}>
              <option value="">— не вказано —</option>
              {disciplines.map(d => <option key={d.id} value={d.id}>{d.short_name ? `${d.short_name} — ${d.name}` : d.name}</option>)}
            </select>
          </Field>
        ) : (
          user?.discipline_name && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
              <BookOpen size={16} className="text-indigo-500 shrink-0" />
              <span className="text-sm text-indigo-700">Дисципліна: <span className="font-semibold">{user.discipline_name}</span></span>
            </div>
          )
        )}

        <Field label="Код заняття" hint="Відображається здобувачам як назва заняття">
          <input
            type="text"
            value={form.lesson_code}
            onChange={(e) => set('lesson_code', e.target.value)}
            placeholder="Напр. Л-1.1 або Г/з-2.3"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ліміт часу (хв)">
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.no_time_limit}
                onChange={e => {
                  set('no_time_limit', e.target.checked);
                  if (e.target.checked) set('time_limit_minutes', '');
                }}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-xs text-slate-500">Без обмеження часу</span>
            </label>
            <input
              type="number" min={1}
              value={form.no_time_limit ? '' : form.time_limit_minutes}
              onChange={(e) => set('time_limit_minutes', e.target.value)}
              disabled={form.no_time_limit}
              placeholder={form.no_time_limit ? 'не обмежено' : 'хвилини...'}
              className={inputCls + (form.no_time_limit ? ' opacity-40 cursor-not-allowed bg-slate-50' : '')}
            />
          </Field>
          <Field label="Макс. спроб" required>
            <input type="number" min={1} max={10} value={form.max_attempts}
              onChange={(e) => set('max_attempts', e.target.value)}
              required className={inputCls} />
          </Field>
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-60 transition-colors">
            <Save size={15} />
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
          <button type="button" onClick={() => navigate(`${base}/tests`)}
            className="px-4 py-2.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
