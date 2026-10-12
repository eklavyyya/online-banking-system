import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../api';
import Shell from './Shell';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/beneficiaries', label: 'Beneficiaries' },
  { to: '/transfer', label: 'Transfer Funds' },
  { to: '/bills', label: 'Bill Payments' },
  { to: '/deposits', label: 'Deposits' },
  { to: '/loans', label: 'Loans' },
  { to: '/cards', label: 'Cards' },
  { to: '/service-requests', label: 'Service Requests' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/profile', label: 'Profile' },
];

// Pages that change the unread count call
//   window.dispatchEvent(new Event('obs:notifications-changed'))
// so the badge here refreshes straight away.
export const NOTIFICATIONS_CHANGED = 'obs:notifications-changed';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const refreshUnread = useCallback(() => {
    notificationApi.unreadCount().then(setUnread).catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshUnread);
    return () => { clearInterval(timer); window.removeEventListener(NOTIFICATIONS_CHANGED, refreshUnread); };
  }, [refreshUnread]);

  return (
    <Shell
      title={'Online Banking\nSystem'}
      items={NAV_ITEMS}
      badges={{ '/notifications': unread }}
      user={user}
      onLogout={handleLogout}
    />
  );
}
