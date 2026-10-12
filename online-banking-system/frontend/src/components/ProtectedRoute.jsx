import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Redirects anonymous visitors to /login, and sends a user with the wrong role to their own home. */
export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to={user?.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}
