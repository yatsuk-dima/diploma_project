import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, MessageSquare, User, Clock } from 'lucide-react';
import { listPending, submitReview } from '../../api/review';
import Pagination from '../../components/Pagination';
import { TableSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const PER_PAGE = 10;

function ReviewCard({ item, onReviewed }) {
  const [score, setScore] = useState(String(item.auto_score.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit(isCorrect) {
    const s = parseFloat(score);
    if (isNaN(s) || s < 0 || s > 1) { toast('Оцінка має бути від 0 до 1'); return; }
    setSaving(true);
    try {
      await submitReview(item.answer_id, { is_correct: isCorrect, score: s });
      toast(isCorrect ? 'Відповідь прийнято' : 'Відповідь відхилено', 'success');
      onReviewed(item.answer_id);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  const answerText = typeof item.student_answer === 'object'
    ? item.student_answer.text ?? JSON.stringify(item.student_answer)
    : item.student_answer;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 hover:border-slate-200 transition-colors">
      {/* Meta */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
            <User size={14} className="text-indigo-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{item.student_name}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={11} />
              {new Date(item.answered_at).toLocaleString('uk-UA')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            авто: {item.auto_score.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Question */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Питання</p>
        <p className="text-sm font-medium text-slate-700 leading-snug">{item.question_text}</p>
      </div>

      {/* Answer */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Відповідь здобувача</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {answerText}
        </div>
      </div>

      {/* Score + actions */}
      <div className="flex items-center gap-3 pt-1">
        <label className="text-sm text-slate-500 shrink-0">Оцінка (0–1):</label>
        <input
          type="number" min={0} max={1} step={0.05} value={score}
          onChange={e => setScore(e.target.value)}
          className="w-24 border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
        />
        <button onClick={() => submit(true)} disabled={saving}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-60 transition-colors">
          <CheckCircle size={14} /> Правильно
        </button>
        <button onClick={() => submit(false)} disabled={saving}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-60 transition-colors">
          <XCircle size={14} /> Неправильно
        </button>
      </div>
    </div>
  );
}

export default function OpenAnswerReviewPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load(p = page) {
    setLoading(true);
    try { setData(await listPending({ page: p, per_page: PER_PAGE })); }
    catch { toast('Помилка завантаження'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(page); }, [page]);

  function handleReviewed(id) {
    setData(d => ({ ...d, items: d.items.filter(i => i.answer_id !== id), total: d.total - 1 }));
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Перевірка відповідей</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {data.total > 0
              ? `Очікує перевірки: ${data.total}`
              : 'Всі відповіді перевірено'}
          </p>
        </div>
        <button onClick={() => load(page)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors">
          <RefreshCw size={14} /> Оновити
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5">
              <TableSkeleton rows={3} />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle size={28} className="text-emerald-400" />
          </div>
          <p className="text-slate-500 font-medium">Немає відповідей на перевірці</p>
          <p className="text-slate-300 text-sm mt-1">Усі відповіді вже перевірено</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {data.items.map(item => (
              <ReviewCard key={item.answer_id} item={item} onReviewed={handleReviewed} />
            ))}
          </div>
          <Pagination page={page} perPage={PER_PAGE} total={data.total} onPage={p => { setPage(p); load(p); }} />
        </>
      )}
    </div>
  );
}
