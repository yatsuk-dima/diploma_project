import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, ChevronLeft } from 'lucide-react';
import { getAttemptResult } from '../../api/attempts';
import StudentLayout from '../../components/StudentLayout';
import AttemptResultView from '../../components/AttemptResultView';
import { useToast } from '../../components/Toast';

export default function ResultsPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    getAttemptResult(attemptId)
      .then(setData)
      .catch(() => toast('Помилка завантаження результатів'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) return (
    <StudentLayout>
      <div className="flex items-center gap-3 text-slate-400 py-20 justify-center">
        <span className="w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
        Завантаження результатів...
      </div>
    </StudentLayout>
  );

  if (!data) return (
    <StudentLayout>
      <div className="text-center py-20">
        <p className="text-red-500 mb-3">Не вдалося завантажити результати.</p>
        <Link to="/student/dashboard" className="text-indigo-600 hover:underline text-sm">← На головну</Link>
      </div>
    </StudentLayout>
  );

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/student/dashboard" className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 text-sm transition-colors">
            <ChevronLeft size={15} /> Дисципліни
          </Link>
        </div>

        <AttemptResultView data={data} />

        <Link to="/student/dashboard"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
          <Award size={15} /> До дисциплін
        </Link>
      </div>
    </StudentLayout>
  );
}
