/**
 * Accessible toggle switch: a button with role="switch" and aria-checked.
 * The visible label is a real <label> so clicking the text toggles it too.
 */
export default function Switch({ id, checked, onChange, label, description, disabled = false, busy = false }) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={descId}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
          checked ? 'bg-navy' : 'bg-gray-300'
        } ${disabled || busy ? 'opacity-50' : ''}`}
      >
        <span aria-hidden="true" className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className={`text-sm font-medium ${disabled ? 'text-gray-500' : 'text-gray-800'}`}>{label}</label>
        {description && <p id={descId} className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}
