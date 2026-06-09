import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, HelpCircle, Eye, EyeOff, Clock, RotateCcw, BookOpen, Globe } from 'lucide-react';
import { listTests, deleteTest, publishTest } from '../../api/tests';
import Pagination from '../../components/Pagination';
import ConfirmModal from '../../components/ConfirmModal';
import { TableSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import useAuthStore from '../../store/authStore';

const PER_PAGE = 15;

function getLessonType(code) {
  if (!code) return null;
  const prefix = code.split('-')[0].trim();
  return prefix || null;
}

function StatusBadge({ published }) {
  return published ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Відкритий
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Чернетка
    </span>
  );
}

export default function TestsPage() {
  const [allTests, setAllTests] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(null);
  const [lessonTypeFilter, setLessonTypeFilter] = useState('all');
  const toast = useToast();
  const { user } = useAuthStore();
  const base = user?.role === 'admin' ? '/admin' : '/instructor';

  async function load() {
    setLoading(true);
    try {
      const res = await listTests({ page: 1, per_page: 200 });
      setAllTests(res.items);
    } catch {
      toast('Помилка завантаження тестів');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const lessonTypes = [...new Set(
    allTests.map(t => getLessonType(t.lesson_code)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'uk'));

  const filtered = lessonTypeFilter === 'all'
    ? allTests
    : lessonTypeFilter === '__none__'
    ? allTests.filter(t => !t.lesson_code)
    : allTests.filter(t => getLessonType(t.lesson_code) === lessonTypeFilter);

  const totalFiltered = filtered.length;
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function handleFilterChange(f) {
    setLessonTypeFilter(f);
    setPage(1);
  }

  async function handleDelete(t) {
    try {
      await deleteTest(t.id);
      toast('Тест видалено', 'success');
      setConfirmDel(null);
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка видалення');
    }
  }

  async function handlePublish(t) {
    try {
      const res = await publishTest(t.id);
      toast(res.is_published ? 'Тест відкрито для здобувачів' : 'Тест закрито', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка');
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Тести</h1>
          <p className="text-slate-500 text-sm mt-0.5">Керування тестами вашої дисципліни</p>
        </div>
        <Link
          to={`${base}/tests/new`}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-indigo-200"
        >
          <Plus size={16} />
          Новий тест
        </Link>
      </div>

      {/* Lesson-type filter */}
      {(lessonTypes.length > 0 || allTests.some(t => !t.lesson_code)) && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${lessonTypeFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            Всі ({allTests.length})
          </button>
          {lessonTypes.map(type => (
            <button key={type} onClick={() => handleFilterChange(type)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${lessonTypeFilter === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {type} ({allTests.filter(t => getLessonType(t.lesson_code) === type).length})
            </button>
          ))}
          {allTests.some(t => !t.lesson_code) && (
            <button onClick={() => handleFilterChange('__none__')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${lessonTypeFilter === '__none__' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              Без коду ({allTests.filter(t => !t.lesson_code).length})
            </button>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={PER_PAGE} />
        ) : allTests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <BookOpen size={28} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-medium">Тестів ще немає</p>
            <Link to={`${base}/tests/new`} className="text-indigo-600 text-sm mt-2 hover:underline">
              Створити перший тест →
            </Link>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-slate-400 font-medium">Немає тестів для цього фільтру</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Тест</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Питань</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Спроб</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Час</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pageItems.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 group transition-colors">
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-semibold text-slate-800">{t.title}</p>
                      {t.lesson_code && (
                        <p className="text-xs text-indigo-600 mt-0.5">{t.lesson_code}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge published={t.is_published} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <HelpCircle size={13} className="text-slate-400" />
                      {t.question_count ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <RotateCcw size={13} className="text-slate-400" />
                      {t.max_attempts}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Clock size={13} className="text-slate-400" />
                      {t.time_limit_minutes ? `${t.time_limit_minutes} хв` : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Link
                        to={`${base}/tests/${t.id}/questions`}
                        title="Питання"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <HelpCircle size={15} />
                      </Link>
                      <Link
                        to={`${base}/tests/${t.id}/edit`}
                        title="Редагувати"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        onClick={() => handlePublish(t)}
                        title={t.is_published ? 'Закрити' : 'Відкрити'}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          t.is_published
                            ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {t.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        onClick={() => setConfirmDel(t)}
                        title="Видалити"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} perPage={PER_PAGE} total={totalFiltered} onPage={(p) => setPage(p)} />

      {confirmDel && (
        <ConfirmModal
          title="Видалити тест?"
          message={`«${confirmDel.title}» буде видалено разом з усіма питаннями та відповідями.`}
          onConfirm={() => handleDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
          confirmLabel="Видалити"
          requireCheck
          checkLabel="Так, я дійсно хочу видалити цей тест"
        />
      )}
    </div>
  );
}
