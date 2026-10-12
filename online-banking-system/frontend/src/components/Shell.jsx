import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import IdleWarning from './IdleWarning';
import useIdleLogout from '../hooks/useIdleLogout';

// Shared chrome for the customer and admin areas: sidebar (a slide-over on
// small screens), sign-out and the inactivity timeout (SRS S4).
// Inactivity limit in seconds (SRS S4). Overridable at build time, which the
// end-to-end tests use to exercise the timeout without waiting five minutes.
const IDLE_SECONDS = Number(import.meta.env.VITE_IDLE_SECONDS) || 300;
const IDLE_WARN_SECONDS = Number(import.meta.env.VITE_IDLE_WARN_SECONDS) || 30;

export default function Shell({ title, subtitle, items, badges = {}, user, onLogout, idleSeconds = IDLE_SECONDS }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { warning, secondsLeft, stay } = useIdleLogout({ onTimeout: onLogout, idleSeconds, warnSeconds: Math.min(IDLE_WARN_SECONDS, Math.max(1, idleSeconds - 1)) });

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const sidebar = (
    <aside className="w-64 bg-navy text-white flex flex-col h-full">
      <div className="px-6 py-6 border-b border-white/10">
        <h1 className="font-serif text-xl font-bold leading-tight whitespace-pre-line">{title}</h1>
        {subtitle && <p className="text-xs text-ice/70 mt-1">{subtitle}</p>}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gold text-navy' : 'text-ice hover:bg-white/10'
              }`
            }
          >
            <span>{item.label}</span>
            {badges[item.to] > 0 && (
              <span className="ml-2 min-w-[1.25rem] text-center rounded-full bg-red-500 text-white text-[11px] font-bold px-1.5 py-0.5" aria-label={`${badges[item.to]} unread`}>
                {badges[item.to] > 99 ? '99+' : badges[item.to]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-ice/70 mb-1">Signed in as</p>
        <p className="text-sm font-semibold truncate mb-3">{user?.username}</p>
        <button onClick={onLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-ice hover:bg-white/10">
          Log Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* desktop sidebar */}
      <div className="hidden md:block shrink-0 sticky top-0 h-screen">{sidebar}</div>

      {/* mobile top bar + slide-over */}
      <div className="md:hidden flex items-center justify-between bg-navy text-white px-4 py-3 sticky top-0 z-30">
        <span className="font-serif font-bold">{title.replace('\n', ' ')}</span>
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-1 text-2xl leading-none">&#9776;</button>
      </div>
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="h-full">{sidebar}</div>
          <button className="flex-1 bg-black/50" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      {warning && <IdleWarning secondsLeft={secondsLeft} onStay={stay} onLogout={onLogout} />}
    </div>
  );
}
