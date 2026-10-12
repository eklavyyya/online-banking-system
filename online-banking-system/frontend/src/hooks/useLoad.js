import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../api/client';

/**
 * Runs an async loader on mount and whenever `deps` change.
 * Returns { data, error, loading, reload, setData }.
 * A stale response (from an earlier dependency value) is ignored.
 */
export default function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const counter = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const id = ++counter.current;
    setLoading(true);
    return loaderRef.current()
      .then((result) => { if (id === counter.current) { setData(result); setError(''); } })
      .catch((err) => { if (id === counter.current) setError(apiErrorMessage(err)); })
      .finally(() => { if (id === counter.current) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);

  return { data, error, loading, reload: run, setData };
}
