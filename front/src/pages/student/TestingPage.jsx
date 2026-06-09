import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, User, Users, ChevronRight } from 'lucide-react';
import { finishAttempt, getAttemptState, getNextQuestion, submitAnswer } from '../../api/attempts';
import { useToast } from '../../components/Toast';
import useAuthStore from '../../store/authStore';

const RESULT_DELAY_MS = 1600;

function useCountdown(startedAt, timeLimitMinutes, serverTime, onExpire) {
  const [remaining, setRemaining] = useState(null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!timeLimitMinutes || !startedAt || !serverTime) { setRemaining(null); return; }
    const expiresMs = new Date(startedAt).getTime() + timeLimitMinutes * 60_000;
    const init = Math.max(0, Math.floor((expiresMs - new Date(serverTime).getTime()) / 1000));
    if (init <= 0) { expireRef.current(); return; }
    setRemaining(init);
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(id); expireRef.current(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, timeLimitMinutes, serverTime]);

  return remaining;
}

function formatTime(secs) {
  if (secs === null) return null;
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Choice components
// ---------------------------------------------------------------------------

function OptionItem({ children, selected, correct, wrong, disabled, onClick, type, pending }) {
  let cls = 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50';
  if (selected && pending) cls = 'border-red-400 bg-red-50';
  else if (selected && !correct && !wrong) cls = 'border-indigo-500 bg-indigo-50';
  if (correct) cls = 'border-emerald-500 bg-emerald-50';
  if (wrong) cls = 'border-red-400 bg-red-50';

  return (
    <label className={`flex items-center gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all ${cls} ${disabled ? 'cursor-default' : ''}`}>
      <div className={`w-5 h-5 shrink-0 border-2 flex items-center justify-center transition-all ${
        type === 'radio' ? 'rounded-full' : 'rounded-md'
      } ${
        selected && pending ? 'border-red-400 bg-red-400' :
        selected && !correct && !wrong ? 'border-indigo-500 bg-indigo-500' :
        correct ? 'border-emerald-500 bg-emerald-500' :
        wrong ? 'border-red-400 bg-red-400' :
        'border-slate-300'
      }`}>
        {selected || correct ? (
          <div className={`${type === 'radio' ? 'w-2 h-2 rounded-full' : 'w-2.5 h-2.5'} bg-white`}
            style={type === 'checkbox' && (selected || correct) ? {
              clipPath: 'polygon(20% 45%, 5% 65%, 40% 95%, 95% 10%, 75% 0%, 40% 65%)'
            } : {}} />
        ) : null}
      </div>
      <input type={type} checked={selected} onChange={onClick} disabled={disabled} className="sr-only" />
      <span className="text-sm text-slate-700 leading-snug">{children}</span>
    </label>
  );
}

function SingleChoiceQ({ question, answer, onChange, result, pending }) {
  const correctId = result?.correct_answer?.option_id;
  return (
    <div className="space-y-2.5">
      {(question.options || []).map(opt => {
        const selected = answer?.option_id === opt.id;
        return (
          <OptionItem key={opt.id} type="radio" selected={selected}
            correct={!!result && correctId === opt.id}
            wrong={!!result && selected && correctId !== opt.id}
            pending={pending && selected}
            disabled={!!result} onClick={() => !result && onChange({ option_id: opt.id })}>
            {opt.text}
          </OptionItem>
        );
      })}
    </div>
  );
}

function MultipleChoiceQ({ question, answer, onChange, result, pending }) {
  const correctIds = new Set(result?.correct_answer?.option_ids || []);
  const selectedIds = new Set(answer?.option_ids || []);
  function toggle(id) {
    if (result) return;
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange({ option_ids: [...next] });
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400 mb-3">Оберіть всі правильні варіанти</p>
      {(question.options || []).map(opt => {
        const selected = selectedIds.has(opt.id);
        const isCorrect = correctIds.has(opt.id);
        return (
          <OptionItem key={opt.id} type="checkbox" selected={selected || (!!result && isCorrect)}
            correct={!!result && isCorrect && selected}
            wrong={!!result && !isCorrect && selected}
            pending={pending && selected}
            disabled={!!result} onClick={() => toggle(opt.id)}>
            {opt.text}
          </OptionItem>
        );
      })}
    </div>
  );
}

function OpenAnswerQ({ answer, onChange, result }) {
  return (
    <div>
      <textarea value={answer?.text || ''} onChange={e => !result && onChange({ text: e.target.value })}
        disabled={!!result} rows={5} placeholder="Введіть вашу відповідь..."
        className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none disabled:bg-slate-50 disabled:text-slate-500 transition-all" />
      {result && (
        <p className="mt-2 text-sm text-indigo-600 font-medium flex items-center gap-1.5">
          <ChevronRight size={14} /> Відповідь прийнято на перевірку викладача
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matching question
// ---------------------------------------------------------------------------

function MatchingQ({ question, answer, onChange, result }) {
  const leftItems = question.options?.left || [];
  const rightItems = question.options?.right || [];
  const pairs = answer?.pairs || [];
  const correctPairs = result?.correct_answer?.pairs || [];

  const [selectedLeft, setSelectedLeft] = useState(null);
  const containerRef = useRef(null);
  const leftRefs = useRef({});
  const rightRefs = useRef({});
  const [lines, setLines] = useState([]);

  function getPairedRight(leftId) { return pairs.find(p => p.left_id === leftId)?.right_id || null; }
  function getPairedLeft(rightId) { return pairs.find(p => p.right_id === rightId)?.left_id || null; }

  function handleLeftClick(id) {
    if (result) return;
    setSelectedLeft(prev => prev === id ? null : id);
  }

  function handleRightClick(rightId) {
    if (result) return;
    if (!selectedLeft) return;
    const newPairs = pairs
      .filter(p => p.left_id !== selectedLeft && p.right_id !== rightId);
    onChange({ pairs: [...newPairs, { left_id: selectedLeft, right_id: rightId }] });
    setSelectedLeft(null);
  }

  function removePair(leftId) {
    if (result) return;
    onChange({ pairs: pairs.filter(p => p.left_id !== leftId) });
    setSelectedLeft(null);
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const allPairs = result ? correctPairs : pairs;
    const newLines = allPairs.map(p => {
      const le = leftRefs.current[p.left_id];
      const re = rightRefs.current[p.right_id];
      if (!le || !re) return null;
      const lr = le.getBoundingClientRect();
      const rr = re.getBoundingClientRect();
      const isCorrect = result
        ? correctPairs.some(cp => cp.left_id === p.left_id && cp.right_id === p.right_id)
        : null;
      const studentHas = result
        ? pairs.some(sp => sp.left_id === p.left_id && sp.right_id === p.right_id)
        : true;
      return {
        key: `${p.left_id}-${p.right_id}`,
        x1: lr.right - containerRect.left,
        y1: lr.top - containerRect.top + lr.height / 2,
        x2: rr.left - containerRect.left,
        y2: rr.top - containerRect.top + rr.height / 2,
        isCorrect,
        studentHas,
      };
    }).filter(Boolean);
    setLines(newLines);
  }, [pairs, correctPairs, result, leftItems, rightItems]);

  return (
    <div>
      {!result && (
        <p className="text-xs text-slate-400 mb-3">
          {selectedLeft ? '→ Тепер натисніть на елемент у правій колонці' : 'Натисніть на елемент зліва, потім на відповідний справа'}
        </p>
      )}
      <div ref={containerRef} className="relative">
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {lines.map(l => {
            const color = l.isCorrect === true ? '#10b981' : l.isCorrect === false ? '#ef4444' : '#4f46e5';
            return (
              <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke={color} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={l.isCorrect === false ? '5 4' : undefined} />
            );
          })}
        </svg>

        <div className="grid grid-cols-2 gap-8 relative" style={{ zIndex: 2 }}>
          {/* Left */}
          <div className="space-y-2">
            {leftItems.map(item => {
              const isPaired = !!getPairedRight(item.id);
              const isSelected = selectedLeft === item.id;
              let cls = 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300';
              if (result) cls = 'border-slate-200 bg-white text-slate-700 cursor-default';
              else if (isSelected) cls = 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200';
              else if (isPaired) cls = 'border-indigo-300 bg-indigo-50 text-indigo-700';
              return (
                <div key={item.id}
                  ref={el => leftRefs.current[item.id] = el}
                  onClick={() => isPaired && !result ? removePair(item.id) : handleLeftClick(item.id)}
                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium cursor-pointer select-none transition-all ${cls}`}>
                  {item.text}
                  {isPaired && !result && <span className="ml-2 text-xs text-indigo-400">(клік — прибрати)</span>}
                </div>
              );
            })}
          </div>
          {/* Right */}
          <div className="space-y-2">
            {rightItems.map(item => {
              const pairedLeftId = getPairedLeft(item.id);
              const isTaken = !!pairedLeftId;
              let cls = 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300';
              if (result) cls = 'border-slate-200 bg-white text-slate-700 cursor-default';
              else if (isTaken) cls = 'border-indigo-300 bg-indigo-50/60 text-slate-600';
              else if (selectedLeft) cls = 'border-indigo-200 bg-white text-slate-700 hover:border-indigo-500 hover:bg-indigo-50';
              return (
                <div key={item.id}
                  ref={el => rightRefs.current[item.id] = el}
                  onClick={() => handleRightClick(item.id)}
                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium cursor-pointer select-none transition-all ${cls}`}>
                  {item.text}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-1.5">
          {correctPairs.map(cp => {
            const leftItem = leftItems.find(i => i.id === cp.left_id);
            const rightItem = rightItems.find(i => i.id === cp.right_id);
            const studentHas = pairs.some(p => p.left_id === cp.left_id && p.right_id === cp.right_id);
            return (
              <div key={`${cp.left_id}-${cp.right_id}`}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${studentHas ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                <span>{studentHas ? '✓' : '✗'}</span>
                <span className="font-medium">{leftItem?.text}</span>
                <span className="opacity-60">→</span>
                <span>{rightItem?.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultBanner({ result, questionType }) {
  if (!result || questionType === 'open_answer' || questionType === 'matching') return null;
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 mt-4 ${
      result.is_correct ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      <span className="text-lg">{result.is_correct ? '✓' : '✗'}</span>
      {result.is_correct ? 'Правильно!' : 'Неправильно'}
      {!result.is_correct && result.score > 0 && (
        <span className="ml-1 font-normal opacity-70">
          (часткова оцінка: {(result.score * 100).toFixed(0)}%)
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function TestingPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();

  const [timerSeed, setTimerSeed] = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState({ position: 0, total: 0 });
  const [answer, setAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [pending, setPending] = useState(false);
  const [answerHistory, setAnswerHistory] = useState([]);
  const finishingRef = useRef(false);

  const doFinish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase('finishing');
    try { await finishAttempt(attemptId); } catch {}
    navigate(`/student/results/${attemptId}`, { replace: true });
  }, [attemptId, navigate]);

  async function load() {
    setPhase('loading');
    setAnswerHistory([]);
    try {
      const state = await getAttemptState(attemptId);
      if (state.status !== 'in_progress') { navigate(`/student/results/${attemptId}`, { replace: true }); return; }
      try {
        const next = await getNextQuestion(attemptId);
        setTimerSeed({ startedAt: next.started_at, timeLimitMinutes: next.time_limit_minutes, serverTime: next.server_time });
        setQuestion(next.question);
        setProgress({ position: next.position, total: next.total });
        setAnswer(null); setResult(null); setPhase('question');
      } catch (err) {
        if (err.response?.data?.detail === 'all_answered') await doFinish();
        else throw err;
      }
    } catch {
      toast('Помилка завантаження тесту');
      navigate('/student/dashboard');
    }
  }

  useEffect(() => { load(); }, [attemptId]);

  const remaining = useCountdown(timerSeed?.startedAt, timerSeed?.timeLimitMinutes, timerSeed?.serverTime, doFinish);

  async function handleSubmit() {
    if (!answer) { toast('Оберіть або введіть відповідь'); return; }
    if (question.type === 'open_answer' && !answer.text?.trim()) { toast('Введіть відповідь'); return; }
    setPending(false);
    setPhase('result');
    try {
      const res = await submitAnswer(attemptId, { question_id: question.id, answer });
      setResult(res);
      setAnswerHistory(h => [...h, {
        isCorrect: question.type === 'open_answer' ? null : res.is_correct,
      }]);
      setTimeout(async () => {
        setPhase('loading');
        try {
          const next = await getNextQuestion(attemptId);
          setQuestion(next.question); setProgress({ position: next.position, total: next.total });
          setAnswer(null); setResult(null); setPending(false); setPhase('question');
        } catch (err) {
          if (err.response?.data?.detail === 'all_answered') await doFinish();
        }
      }, RESULT_DELAY_MS);
    } catch (err) {
      toast(err.response?.data?.detail || 'Помилка відправки відповіді');
      setPhase('question');
    }
  }

  function isAnswerReady() {
    if (!answer) return false;
    if (question?.type === 'single_choice') return !!answer.option_id;
    if (question?.type === 'multiple_choice') return (answer.option_ids?.length ?? 0) > 0;
    if (question?.type === 'open_answer') return !!answer.text?.trim();
    if (question?.type === 'matching') {
      const total = question.options?.left?.length ?? 0;
      return total > 0 && (answer.pairs?.length ?? 0) === total;
    }
    return false;
  }

  const isResultPhase = phase === 'result';
  const isLoading = phase === 'loading' || phase === 'finishing';
  const timerCritical = remaining !== null && remaining <= 60;
  const progressPct = progress.total > 0 ? ((progress.position) / progress.total) * 100 : 0;
  const correctCount = answerHistory.filter(a => a.isCorrect === true).length;
  const wrongCount = answerHistory.filter(a => a.isCorrect === false).length;
  const pendingCount = answerHistory.filter(a => a.isCorrect === null).length;
  const showDots = progress.total > 0 && progress.total <= 30;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* User info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <User size={15} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{user?.full_name}</p>
              {user?.group_name && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Users size={11} /> Н/г: {user.group_name}
                </p>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="text-center shrink-0">
            <p className="text-sm font-semibold text-slate-700">
              {isLoading ? '...' : `${progress.position + 1} / ${progress.total}`}
            </p>
            {!isLoading && answerHistory.length > 0 && (
              <div className="flex items-center gap-2 mt-0.5 text-xs justify-center">
                {correctCount > 0 && <span className="text-emerald-600 font-medium">✓ {correctCount}</span>}
                {wrongCount > 0 && <span className="text-red-500 font-medium">✗ {wrongCount}</span>}
                {pendingCount > 0 && <span className="text-amber-500 font-medium">? {pendingCount}</span>}
              </div>
            )}
          </div>

          {/* Timer */}
          {remaining !== null && (
            <div className={`flex items-center gap-1.5 shrink-0 font-mono font-bold text-base px-3 py-1.5 rounded-xl transition-all ${
              timerCritical
                ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                : 'bg-slate-50 text-slate-700 border border-slate-200'
            }`}>
              <Clock size={14} />
              {formatTime(remaining)}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Dot indicators */}
        {showDots && (
          <div className="max-w-2xl mx-auto px-4 py-2 flex flex-wrap gap-1.5 justify-center">
            {Array.from({ length: progress.total }).map((_, i) => {
              const h = answerHistory[i];
              const isCurrent = i === progress.position && !isLoading;
              let cls = 'bg-slate-200';
              if (h) {
                cls = h.isCorrect === true ? 'bg-emerald-400' : h.isCorrect === false ? 'bg-red-400' : 'bg-amber-300';
              } else if (isCurrent) {
                cls = 'bg-indigo-400 animate-pulse';
              }
              return <span key={i} className={`w-3 h-3 rounded-full transition-all duration-300 ${cls}`} title={`Питання ${i + 1}`} />;
            })}
          </div>
        )}
        {!showDots && progress.total > 0 && (
          <div className="max-w-2xl mx-auto px-4 py-1.5 flex gap-3 text-xs text-slate-400 justify-center">
            <span>Всього: {progress.total} питань</span>
            {answerHistory.length > 0 && <>
              <span className="text-emerald-500">✓ {correctCount}</span>
              <span className="text-red-400">✗ {wrongCount}</span>
              {pendingCount > 0 && <span className="text-amber-400">? {pendingCount}</span>}
            </>}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-10 px-4">
        <div className="w-full max-w-2xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin" style={{borderWidth: 3}} />
              <p className="text-slate-400 text-sm">
                {phase === 'finishing' ? 'Завершення тесту...' : 'Завантаження...'}
              </p>
            </div>
          ) : question ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Question number bar */}
              <div className="px-6 pt-5 pb-3 border-b border-slate-50">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Питання {progress.position + 1} з {progress.total}
                </span>
              </div>

              <div className="p-6 space-y-5">
                {/* Question text */}
                <p className="text-slate-800 font-medium text-base leading-relaxed">{question.text}</p>

                {/* Answer */}
                {question.type === 'single_choice' && (
                  <SingleChoiceQ question={question} answer={answer}
                    onChange={a => { setAnswer(a); setPending(true); }}
                    result={isResultPhase ? result : null} pending={pending && !isResultPhase} />
                )}
                {question.type === 'multiple_choice' && (
                  <MultipleChoiceQ question={question} answer={answer}
                    onChange={a => { setAnswer(a); setPending(true); }}
                    result={isResultPhase ? result : null} pending={pending && !isResultPhase} />
                )}
                {question.type === 'open_answer' && (
                  <OpenAnswerQ answer={answer} onChange={setAnswer} result={isResultPhase ? result : null} />
                )}
                {question.type === 'matching' && (
                  <MatchingQ question={question} answer={answer}
                    onChange={setAnswer} result={isResultPhase ? result : null} />
                )}

                <ResultBanner result={isResultPhase ? result : null} questionType={question.type} />

                {/* Submit */}
                {!isResultPhase && (
                  <button onClick={handleSubmit} disabled={!isAnswerReady()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl text-sm disabled:opacity-30 transition-all shadow-sm shadow-indigo-200 disabled:shadow-none">
                    Прийняти відповідь
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
