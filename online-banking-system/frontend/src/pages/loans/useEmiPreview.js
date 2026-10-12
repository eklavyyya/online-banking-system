import { useCallback, useEffect, useRef, useState } from 'react';
import { loanApi } from '../../api';
import { apiErrorMessage } from '../../api/client';

const IDLE = { status: 'idle', result: null, error: '' };

/**
 * Debounced EMI preview through POST /loans/calculate.
 * Every parameter change invalidates earlier requests, so a slow reply for old
 * values can never overwrite a newer one. `runNow` skips the debounce.
 */
export default function useEmiPreview({ principal, rate, tenure }, valid, delay = 400) {
  const [state, setState] = useState(IDLE);
  const seq = useRef(0);
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { principal, rate, tenure };

  const fetchNow = useCallback(() => {
    clearTimeout(timer.current);
    const id = ++seq.current;
    const p = latest.current;
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    return loanApi
      .calculate({ principal: Number(p.principal), annualRatePercent: Number(p.rate), tenureMonths: Number(p.tenure) })
      .then((result) => { if (id === seq.current) setState({ status: 'ok', result, error: '' }); })
      .catch((err) => { if (id === seq.current) setState({ status: 'error', result: null, error: apiErrorMessage(err) }); });
  }, []);

  useEffect(() => {
    seq.current += 1; // anything still in flight is now stale
    clearTimeout(timer.current);
    if (!valid) { setState(IDLE); return undefined; }
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    timer.current = setTimeout(fetchNow, delay);
    return () => clearTimeout(timer.current);
  }, [principal, rate, tenure, valid, delay, fetchNow]);

  return { ...state, runNow: fetchNow };
}
