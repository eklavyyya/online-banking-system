import { useEffect, useRef, useState } from 'react';

// Keyboard and focus behaviour every dialog needs, in one place:
//  - focus moves into the dialog when it opens ([data-autofocus] first, then the first field)
//  - Tab / Shift+Tab stay inside it
//  - Escape closes it (only the topmost dialog, and never while `busy`)
//  - focus returns to whatever opened it
const stack = [];
let counter = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function useDialog({ open, onClose, busy = false, dialogRef }) {
  const [id] = useState(() => { counter += 1; return counter; });
  const live = useRef({ onClose, busy });
  live.current = { onClose, busy };

  useEffect(() => {
    if (!open) return undefined;
    stack.push(id);
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.setAttribute('tabindex', '-1');
      dialog.classList.add('focus:outline-none');
      const first = dialog.querySelector('[data-autofocus],[autofocus],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
      (first || dialog).focus();
    }

    function onKey(e) {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        if (!live.current.busy) { e.preventDefault(); live.current.onClose?.(); }
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) { e.preventDefault(); firstEl.focus(); }
      else if (e.shiftKey && (active === firstEl || active === dialog)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, id, dialogRef]);
}
