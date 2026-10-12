import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs one async action at a time. `busy` drives disabled buttons; the ref lock also stops a fast double click. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const run = useCallback(async (fn) => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
