import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, RotateCcw, Play, RefreshCw, BookOpen, CheckCircle } from 'lucide-react';
import { listDisciplines } from '../../api/disciplines';
import { listTests } from '../../api/tests';
import { myAttempts, startAttempt } from '../../api/attempts';
import StudentLayout from '../../components/StudentLayout';
import { CardSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

function formatTime(minutes) {
  if (!minutes) return 'без обмежень';
  if (minutes < 60) return `${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}

const DISC_GRADIENTS = [
  'from-indigo-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

export default function StudentDashboardPage() {
  const [disciplines, setDisciplines] = useState([]);
  const [allTests, setAllTests] = useState([]);
  const [inProgressByTest, setInProgressByTest] = useState({});
  const [attemptCountByTest, setAttemptCountByTest] = useState({});
  const [lastDoneByTest, setLastDoneByTest] = useState({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const [selectedDisc, setSelectedDisc] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [discs, testsRes, attemptsRes] = await Promise.all([
          listDisciplines(),
          listTests({ page: 1, per_page: 200 }),
          myAttempts({ page: 1, per_page: 200 }),
        ]);
        setDisciplines(discs);
        setAllTests(testsRes.items);
        const inProg = {}, counts = {}, lastDone = {};
        for (const a of attemptsRes.items) {
          counts[a.test_id] = (counts[a.test_id] || 0) + 1;
          if (a.status === 'in_progress') inProg[a.test_id] = a.id;
          if ((a.status === 'completed' || a.status === 'timeout') && !lastDone[a.test_id]) {
            lastDone[a.test_id] = { id: a.id, score: a.score, attempt_number: a.attempt_number };
          }
        }
        setInProgressByTest(inProg);
        setAttemptCountByTest(counts);
        setLastDoneByTest(lastDone);
      } catch {
        toast('Помилка завантаження');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleStart(testId) {
    setStarting(testId);
    try {
      const res = await startAttempt(testId);
      navigate(`/student/tests/${res.attempt_id}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast(typeof detail === 'string' ? detail : 'Помилка запуску тесту', 'error');
    } finally {
      setStarting(null);
    }
  }

  const discTests = selectedDisc ? allTests.filter(t => t.discipline_id === selectedDisc.id) : [];
  const discIdx = selectedDisc ? disciplines.findIndex(d => d.id === selectedDisc.id) : 0;
  const gradient = DISC_GRADIENTS[discIdx % DISC_GRADIENTS.length];

  return (
    <StudentLayout>
      {selectedDisc === null ? (
        <>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Мої дисципліни</h1>
          <p className="text-slate-500 text-sm mb-6">Оберіть дисципліну, щоб переглянути доступні тести</p>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : disciplines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <BookOpen size={32} className="text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">Вам ще не призначено жодної дисципліни</p>
              <p className="text-slate-300 text-sm mt-1">Зверніться до викладача або адміністратора</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {disciplines.map((disc, idx) => {
                const tests = allTests.filter(t => t.discipline_id === disc.id);
                const activeCount = tests.filter(t => inProgressByTest[t.id]).length;
                const doneCount = tests.filter(t => (attemptCountByTest[t.id] || 0) >= t.max_attempts).length;
                const grad = DISC_GRADIENTS[idx % DISC_GRADIENTS.length];
                return (
                  <button key={disc.id} onClick={() => setSelectedDisc(disc)}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-left hover:shadow-md hover:border-indigo-200 transition-all group">
                    <div className={`h-1.5 bg-gradient-to-r ${grad}`} />
                    <div className="p-5">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-xl shrink-0 group-hover:scale-105 transition-transform`}>
                          {disc.name[0]}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <h2 className="font-semibold text-slate-800 leading-snug line-clamp-2">
                            {disc.short_name && (
                              <span className="inline-block mr-2 text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 align-middle tracking-wide">{disc.short_name}</span>
                            )}
                            {disc.name}
                          </h2>
                          {disc.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{disc.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="flex items-center gap-1 text-slate-500">
                          <BookOpen size={12} /> {tests.length} тест{tests.length !== 1 ? 'ів' : ''}
                        </span>
                        {activeCount > 0 && (
                          <span className="flex items-center gap-1 text-amber-600 font-medium">
                            <RefreshCw size={12} /> {activeCount} активних
                          </span>
                        )}
                        {doneCount > 0 && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle size={12} /> {doneCount} завершено
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setSelectedDisc(null)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 text-sm transition-colors">
              <ChevronLeft size={16} /> Дисципліни
            </button>
            <span className="text-slate-300">/</span>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold`}>
                {selectedDisc.name[0]}
              </div>
              <h1 className="font-semibold text-slate-800">{selectedDisc.name}</h1>
            </div>
          </div>

          {discTests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <BookOpen size={32} className="text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">Відкритих тестів ще немає</p>
            </div>
          ) : (
            <div className="space-y-3">
              {discTests.map(t => {
                const used = attemptCountByTest[t.id] || 0;
                const remaining = t.max_attempts - used;
                const maxReached = used >= t.max_attempts;
                const inProgressId = inProgressByTest[t.id];
                const lastDone = lastDoneByTest[t.id];
                const displayName = t.lesson_code || t.title;
                const pct = t.max_attempts > 0 ? Math.round((used / t.max_attempts) * 100) : 0;

                return (
                  <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h2 className="font-semibold text-slate-800">{displayName}</h2>
                          {t.lesson_code && t.title !== t.lesson_code && (
                            <span className="text-xs text-slate-400">— {t.title}</span>
                          )}
                          {!maxReached && !inProgressId && remaining > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                              залишилось: {remaining}
                            </span>
                          )}
                        </div>
                        {t.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{t.description}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><BookOpen size={12} className="text-slate-400" />{t.question_count ?? '?'} питань</span>
                          <span className="flex items-center gap-1"><Clock size={12} className="text-slate-400" />{formatTime(t.time_limit_minutes)}</span>
                          <span className="flex items-center gap-1"><RotateCcw size={12} className="text-slate-400" />{used} / {t.max_attempts} спроб</span>
                          {lastDone && (
                            <Link
                              to={`/student/results/${lastDone.id}`}
                              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                            >
                              <CheckCircle size={12} />
                              Результати спроби №{lastDone.attempt_number}
                              {lastDone.score !== null && ` · ${Math.round(lastDone.score * 100)}%`}
                            </Link>
                          )}
                        </div>
                        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden w-48">
                          <div className={`h-full rounded-full transition-all ${maxReached ? 'bg-slate-300' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="shrink-0">
                        {inProgressId ? (
                          <button onClick={() => navigate(`/student/tests/${inProgressId}`)}
                            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                            <RefreshCw size={14} /> Продовжити
                          </button>
                        ) : maxReached ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5 text-sm text-slate-400 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
                              <CheckCircle size={14} /> Вичерпано
                            </div>
                            {lastDone && (
                              <Link to={`/student/results/${lastDone.id}`}
                                className="text-xs text-indigo-500 hover:underline">
                                переглянути результат →
                              </Link>
                            )}
                          </div>
                        ) : (
                          <button onClick={() => handleStart(t.id)} disabled={starting === t.id}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-60 transition-colors shadow-sm shadow-indigo-200">
                            {starting === t.id ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={14} />}
                            {starting === t.id ? 'Запуск...' : 'Почати'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </StudentLayout>
  );
}
