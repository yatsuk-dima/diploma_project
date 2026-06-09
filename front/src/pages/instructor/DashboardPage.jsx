import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTests } from '../../api/tests';
import { listPending } from '../../api/review';
import { listUsers } from '../../api/users';

function StatCard({ label, value, to }) {
  const inner = (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">
        {value ?? <span className="text-gray-300 text-xl">...</span>}
      </p>
    </div>
  );
  return to ? <Link to={to} className="hover:shadow-md transition-shadow">{inner}</Link> : inner;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ tests: null, students: null, pending: null });

  useEffect(() => {
    Promise.all([
      listTests({ page: 1, per_page: 1 }),
      listUsers({ role: 'student', page: 1, per_page: 1 }),
      listPending({ page: 1, per_page: 1 }),
    ]).then(([t, u, r]) => {
      setStats({ tests: t.total, students: u.total, pending: r.total });
    }).catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Дашборд</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <StatCard label="Тести" value={stats.tests} to="/instructor/tests" />
        <StatCard label="Студенти" value={stats.students} to="/instructor/analytics" />
        <StatCard label="На перевірці" value={stats.pending} to="/instructor/review" />
      </div>

      <div className="flex gap-4">
        <Link
          to="/instructor/tests/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Створити тест
        </Link>
        <Link
          to="/instructor/review"
          className="bg-white border hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Перевірити відповіді
        </Link>
      </div>
    </div>
  );
}
