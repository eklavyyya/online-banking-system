import { useCallback, useEffect, useRef, useState } from 'react';

/** Returns `value` after it has stopped changing for `delay` ms (search boxes). */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Page number that falls back to 1 whenever the filters change, without an
 * extra render/request: the page is remembered together with the filter key
 * it was chosen under.
 */
export function usePage(filterKey) {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  const page = state.key === filterKey ? state.page : 1;
  const setPage = useCallback((p) => setState({ key: filterKey, page: p }), [filterKey]);
  return [page, setPage];
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tracks the rendered width of an element, so SVG charts can draw in real pixels. */
export function useElementWidth(fallback = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
