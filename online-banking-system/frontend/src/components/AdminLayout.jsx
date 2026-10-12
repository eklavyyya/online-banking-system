import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Shell from './Shell';

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/transactions', label: 'Transactions' },
  { to: '/admin/loans', label: 'Loan Applications' },
  { to: '/admin/service-requests', label: 'Service Requests' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/activity', label: 'Activity Log' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  return <Shell title={'OBS\nAdmin Console'} subtitle="Bank staff only" items={NAV_ITEMS} user={user} onLogout={handleLogout} />;
}
