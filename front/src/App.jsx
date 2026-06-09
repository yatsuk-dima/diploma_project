import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { refresh as apiRefresh, me as apiMe } from './api/auth';
import { onApiError } from './api/events';
import useAuthStore from './store/authStore';
import { ToastProvider, useToast } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';

// Admin
import AdminDashboardPage from './pages/admin/DashboardPage';
import DisciplinesPage from './pages/admin/DisciplinesPage';
import UsersPage from './pages/admin/UsersPage';
import GroupsPage from './pages/admin/GroupsPage';

// Instructor / shared test management components
import TestsPage from './pages/instructor/TestsPage';
import TestEditorPage from './pages/instructor/TestEditorPage';
import QuestionEditorPage from './pages/instructor/QuestionEditorPage';
import AssignPage from './pages/instructor/AssignPage';
import AnalyticsPage from './pages/instructor/AnalyticsPage';
import OpenAnswerReviewPage from './pages/instructor/OpenAnswerReviewPage';
import AttemptResultPage from './pages/instructor/AttemptResultPage';

// Student
import StudentDashboardPage from './pages/student/DashboardPage';
import TestingPage from './pages/student/TestingPage';
import ResultsPage from './pages/student/ResultsPage';

function ErrorBridge() {
  const toast = useToast();
  useEffect(() => onApiError((msg) => toast(msg, 'error')), []);
  return null;
}

function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'instructor') return <Navigate to="/instructor/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  const { setAuth } = useAuthStore();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      const rt = localStorage.getItem('refresh_token');
      if (!rt) { setInitializing(false); return; }
      try {
        const data = await apiRefresh(rt);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        setAuth(null, data.access_token);
        const user = await apiMe();
        setAuth(user, data.access_token);
      } catch {
        localStorage.removeItem('refresh_token');
      } finally {
        setInitializing(false);
      }
    }
    init();
  }, []);

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <ErrorBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="disciplines" element={<DisciplinesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="tests/new" element={<TestEditorPage />} />
          <Route path="tests/:id/edit" element={<TestEditorPage />} />
          <Route path="tests/:id/questions" element={<QuestionEditorPage />} />
          <Route path="tests/:id/assign" element={<AssignPage />} />
          <Route path="review" element={<OpenAnswerReviewPage />} />
          <Route path="attempts/:attemptId" element={<AttemptResultPage />} />
        </Route>

        {/* Instructor routes */}
        <Route
          path="/instructor"
          element={
            <ProtectedRoute roles={['instructor', 'admin']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AnalyticsPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="tests/new" element={<TestEditorPage />} />
          <Route path="tests/:id/edit" element={<TestEditorPage />} />
          <Route path="tests/:id/questions" element={<QuestionEditorPage />} />
          <Route path="tests/:id/assign" element={<AssignPage />} />
          <Route path="review" element={<OpenAnswerReviewPage />} />
          <Route path="attempts/:attemptId" element={<AttemptResultPage />} />
        </Route>

        {/* Student routes */}
        <Route
          path="/student/dashboard"
          element={
            <ProtectedRoute roles={['student']}>
              <StudentDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/tests/:attemptId"
          element={
            <ProtectedRoute roles={['student']}>
              <TestingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/results/:attemptId"
          element={
            <ProtectedRoute roles={['student']}>
              <ResultsPage />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<RoleRedirect />} />
        <Route path="*" element={<RoleRedirect />} />
      </Routes>
    </ToastProvider>
  );
}
