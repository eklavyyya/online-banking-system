import { Children, cloneElement, isValidElement, useId, useRef } from 'react';
import { twMerge } from 'tailwind-merge';
import useDialog from '../hooks/useDialog';

export function Card({ children, className = '' }) {
  return <div className={twMerge('bg-white rounded-xl border border-gray-200 shadow-sm p-6', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-navy">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
      {message}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
    </div>
  );
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={twMerge('px-4 py-2.5 rounded-lg bg-navy text-white font-medium text-sm hover:bg-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={twMerge('px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors', className)}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared form and layout pieces (Phase 2). Keep new pages on these so the
// customer and admin screens look and behave the same.
// ---------------------------------------------------------------------------
const INPUT_CLASS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-400';

/**
 * Label + control + optional hint/error. The label is bound to the control
 * (htmlFor/id) and hint/error are announced with it, so every input has an
 * accessible name. Pass exactly one control as the child; `trailing` is an
 * optional element (e.g. a button) shown beside it.
 */
export function Field({ label, hint, error, required, trailing, children, className = '' }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const control = Children.only(children);
  const controlId = isValidElement(control) ? control.props.id || id : undefined;
  const bound = isValidElement(control)
    ? cloneElement(control, {
        id: controlId,
        'aria-describedby': described,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })
    : control;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={controlId} className="block text-xs font-medium text-gray-500 mb-1">
          {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
        </label>
      )}
      {trailing ? <div className="flex gap-2">{bound}{trailing}</div> : bound}
      {hint && !error && <p id={hintId} className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={twMerge(INPUT_CLASS, className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={twMerge(INPUT_CLASS, className)} {...props}>{children}</select>;
}

export function Textarea({ className = '', ...props }) {
  return <textarea rows={3} className={twMerge(INPUT_CLASS, className)} {...props} />;
}

export function DangerButton({ children, className = '', ...props }) {
  return (
    <button
      className={twMerge('px-4 py-2.5 rounded-lg border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }) {
  return <p className="text-gray-400 text-sm text-center py-8">{children}</p>;
}

/** A small number-with-caption tile, used on the dashboards. */
export function StatCard({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-navy', warn: 'text-amber-600', bad: 'text-red-600', good: 'text-green-700',
  };
  return (
    <Card className="p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold font-serif mt-1 ${tones[tone] || tones.default}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </Card>
  );
}

/**
 * Dialog. Escape closes it, Tab stays inside, focus moves in on open and back
 * on close. While `busy` (a request is in flight) it cannot be dismissed.
 */
export function Modal({ open, title, onClose, children, wide = false, busy = false }) {
  const dialogRef = useRef(null);
  useDialog({ open, onClose, busy, dialogRef });
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-navy/60 flex items-center justify-center z-40 p-4"
      onClick={() => { if (!busy) onClose?.(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold text-navy">{title}</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-40">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Page controls for the { items, total, page, pageSize, totalPages } shape every list endpoint returns. */
export function Pagination({ page, totalPages, total, onPage }) {
  if (!totalPages || totalPages <= 1) {
    return total !== undefined ? <p className="text-xs text-gray-400 mt-3">{total} result{total === 1 ? '' : 's'}</p> : null;
  }
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-gray-400 text-xs">{total} results · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <SecondaryButton disabled={page <= 1} onClick={() => onPage(page - 1)} className="py-1.5">Previous</SecondaryButton>
        <SecondaryButton disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="py-1.5">Next</SecondaryButton>
      </div>
    </div>
  );
}

/** Simple pill tabs. tabs = [{ key, label, count? }] */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            active === t.key ? 'border-navy text-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}{t.count !== undefined && t.count !== null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}
