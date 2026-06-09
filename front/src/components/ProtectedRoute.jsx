import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children, roles, role }) {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/login" replace />;

  const allowed = roles ?? (role ? [role] : null);
  if (allowed && !allowed.includes(user.role)) return <Navigate to="/login" replace />;

  return children;
}
