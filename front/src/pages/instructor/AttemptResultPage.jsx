import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { getAttemptResult } from '../../api/attempts';
import AttemptResultView from '../../components/AttemptResultView';
import { useToast } from '../../components/Toast';
import useAuthStore from '../../store/authStore';

export default function AttemptResultPage() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { user } = useAuthStore();
  const base = user?.role === 'admin' ? '/admin' : '/instructor';

  useEffect(() => {
    getAttemptResult(attemptId)
      .then(setData)
      .catch(() => toast('Помилка завантаження результатів'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-400">
      <span className="w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      Завантаження...
    </div>
  );

  if (!data) return (
    <div className="p-8">
      <p className="text-red-500 mb-3">Не вдалося завантажити результати.</p>
      <Link to={`${base}/dashboard`} className="text-indigo-600 hover:underline text-sm">← До аналітики</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-2xl">
      <Link
        to={`${base}/dashboard`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600 transition-colors mb-6"
      >
        <ChevronLeft size={15} /> Аналітика
      </Link>

      <AttemptResultView data={data} />
    </div>
  );
}
