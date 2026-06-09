import { CheckCircle, XCircle, Clock, RotateCcw, Loader, User } from 'lucide-react';

export function formatSeconds(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m} хв ${sec} с` : `${sec} с`;
}

function optionText(options, id) {
  if (!options) return id;
  const opt = options.find(o => String(o.id) === String(id));
  return opt ? opt.text : id;
}

function ScoreRing({ pct }) {
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const r = 40, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="relative text-2xl font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function MatchingAnswerDetail({ a }) {
  const opts = a.question_options || {};
  const leftItems = opts.left || [];
  const rightItems = opts.right || [];
  const correctPairs = a.correct_answer?.pairs || [];
  const studentPairs = a.student_answer?.pairs || [];
  const isCorrect = a.is_correct;

  return (
    <div className={`bg-white rounded-2xl border p-5 ${isCorrect ? 'border-emerald-200' : 'border-red-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCorrect ? 'bg-emerald-100' : 'bg-red-100'}`}>
          {isCorrect ? <CheckCircle size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-red-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug mb-3">{a.question_text}</p>
          <div className="space-y-1.5">
            {correctPairs.map(cp => {
              const left = leftItems.find(i => i.id === cp.left_id);
              const right = rightItems.find(i => i.id === cp.right_id);
              const studentMatch = studentPairs.some(p => p.left_id === cp.left_id && p.right_id === cp.right_id);
              return (
                <div key={`${cp.left_id}-${cp.right_id}`}
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${studentMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  <span className="font-bold">{studentMatch ? '✓' : '✗'}</span>
                  <span className="font-medium">{left?.text ?? '?'}</span>
                  <span className="opacity-50">→</span>
                  <span>{right?.text ?? '?'}</span>
                </div>
              );
            })}
          </div>
          {a.score > 0 && a.score < 1 && (
            <p className="text-xs text-indigo-600 font-medium mt-2">
              Часткова оцінка: {(a.score * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AnswerRow({ a }) {
  if (a.question_type === 'matching') return <MatchingAnswerDetail a={a} />;

  const opts = a.question_options;
  const isCorrect = a.is_correct;
  const isPending = isCorrect === null;

  const studentText = a.question_type === 'open_answer'
    ? a.student_answer?.text ?? '—'
    : a.question_type === 'single_choice'
    ? optionText(opts, a.student_answer?.option_id) ?? '—'
    : (a.student_answer?.option_ids ?? []).map(id => optionText(opts, id)).join(', ') || '—';

  const correctText = a.question_type === 'open_answer'
    ? (a.correct_answer?.keywords ?? []).join(', ') || '—'
    : a.question_type === 'single_choice'
    ? optionText(opts, a.correct_answer?.option_id) ?? '—'
    : (a.correct_answer?.option_ids ?? []).map(id => optionText(opts, id)).join(', ') || '—';

  return (
    <div className={`bg-white rounded-2xl border p-5 transition-colors ${
      isPending ? 'border-amber-200' : isCorrect ? 'border-emerald-200' : 'border-red-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isPending ? 'bg-amber-100' : isCorrect ? 'bg-emerald-100' : 'bg-red-100'
        }`}>
          {isPending ? <Loader size={14} className="text-amber-500 animate-spin" /> :
           isCorrect ? <CheckCircle size={14} className="text-emerald-600" /> :
           <XCircle size={14} className="text-red-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">{a.question_text}</p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Відповідь здобувача</p>
              <p className="text-sm text-slate-700 break-words">{studentText}</p>
            </div>
            {!isPending && !isCorrect && (
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-emerald-600 mb-1">
                  {a.question_type === 'open_answer' ? 'Ключові слова' : 'Правильна відповідь'}
                </p>
                <p className="text-sm text-emerald-700 break-words">{correctText}</p>
              </div>
            )}
            {isPending && (
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-600 mb-1">Ключові слова</p>
                <p className="text-sm text-amber-700 break-words">{correctText}</p>
              </div>
            )}
          </div>
          {a.score > 0 && a.score < 1 && (
            <p className="text-xs text-indigo-600 font-medium mt-2">
              Часткова оцінка: {(a.score * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttemptResultView({ data }) {
  const pct = data.max_score ? Math.round((data.score / data.max_score) * 100) : 0;
  const statusLabel = data.status === 'completed' ? 'Завершено' : data.status === 'timeout' ? 'Час вичерпано' : data.status;
  const correctCount = data.answers.filter(a => a.is_correct === true).length;
  const wrongCount = data.answers.filter(a => a.is_correct === false).length;
  const pendingCount = data.answers.filter(a => a.is_correct === null).length;

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        {/* Instructor meta: student name + test title */}
        {(data.student_name || data.test_title) && (
          <div className="mb-4 pb-4 border-b border-slate-100 flex flex-wrap gap-4 text-sm text-slate-600">
            {data.student_name && (
              <span className="flex items-center gap-1.5">
                <User size={14} className="text-slate-400" />
                <span className="font-semibold text-slate-800">{data.student_name}</span>
              </span>
            )}
            {data.test_title && (
              <span className="text-slate-500">{data.test_title}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-6">
          <ScoreRing pct={pct} />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800">Результати тесту</h2>
            <p className={`text-sm font-medium mt-0.5 ${
              data.status === 'timeout' ? 'text-amber-500' : 'text-emerald-600'
            }`}>{statusLabel}</p>

            <div className="flex gap-5 mt-3 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <RotateCcw size={13} /> Спроба №{data.attempt_number}
              </span>
              {data.time_spent_seconds && (
                <span className="flex items-center gap-1.5">
                  <Clock size={13} /> {formatSeconds(data.time_spent_seconds)}
                </span>
              )}
            </div>

            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600">{correctCount} правильних</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-slate-600">{wrongCount} неправильних</span>
              </div>
              {pendingCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-slate-600">{pendingCount} на перевірці</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {data.pending_review_count > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
            <Loader size={14} className="animate-spin shrink-0" />
            {data.pending_review_count} відповід{data.pending_review_count === 1 ? 'ь' : 'і'} ще на перевірці. Бал буде оновлено після перевірки.
          </div>
        )}
      </div>

      {/* Answers */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Відповіді</h3>
        <div className="space-y-3">
          {data.answers.map(a => <AnswerRow key={a.question_id} a={a} />)}
        </div>
      </div>
    </div>
  );
}
