import { useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

/**
 * Signs the user out after a period of inactivity (SRS S4, Phase 1 open
 * issue OI-03). A warning is shown for the last `warnSeconds`; any activity
 * during the warning keeps the session alive via `stay()`.
 *
 * Returns { warning, secondsLeft, stay }.
 */
export default function useIdleLogout({ onTimeout, idleSeconds = 300, warnSeconds = 30, enabled = true }) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastActivity = useRef(Date.now());
  const warningRef = useRef(false);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) return undefined;
    lastActivity.current = Date.now();

    const onActivity = () => {
      // once the warning is showing, only the "Stay signed in" button counts
      if (!warningRef.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = setInterval(() => {
      const idleFor = (Date.now() - lastActivity.current) / 1000;
      const left = Math.ceil(idleSeconds - idleFor);
      if (left <= 0) {
        clearInterval(timer);
        timeoutRef.current();
      } else if (left <= warnSeconds) {
        warningRef.current = true;
        setSecondsLeft(left);
      } else if (warningRef.current) {
        warningRef.current = false;
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled, idleSeconds, warnSeconds]);

  const stay = () => {
    lastActivity.current = Date.now();
    warningRef.current = false;
    setSecondsLeft(null);
  };

  return { warning: secondsLeft !== null, secondsLeft, stay };
}
