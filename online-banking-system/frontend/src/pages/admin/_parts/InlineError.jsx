import { useEffect, useRef } from 'react';

/** Error banner for inside a dialog: announced to screen readers and scrolled into view (dialogs can be taller than the screen). */
export default function InlineError({ message }) {
  const ref = useRef(null);
  useEffect(() => {
    if (message && ref.current) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
      {message}
    </div>
  );
}
