import { useEffect, useRef, useState } from 'react';
import { PrimaryButton, SecondaryButton } from './ui';
import useDialog from '../hooks/useDialog';

/**
 * Asks for the transaction MPIN before a fund movement (SRS S7).
 *
 * `summary` is an object of already-readable label -> value pairs, e.g.
 *   { 'From account': 'Savings · XXXXXXXXX0001', 'To': 'Rahul', 'Amount': '₹5,000.00' }
 * Labels are shown exactly as given. Never pass database ids here
 * (Phase 1 open issue OI-09): build the summary from names and masked numbers.
 *
 * The typed MPIN is cleared whenever the dialog closes or an attempt fails,
 * so it never lingers in the field.
 */
export default function MpinModal({ open, onCancel, onConfirm, summary, loading, error, title = 'Confirm with MPIN', confirmLabel = 'Confirm' }) {
  const [mpin, setMpin] = useState('');
  const dialogRef = useRef(null);
  useDialog({ open, onClose: onCancel, busy: loading, dialogRef });

  useEffect(() => { if (!open) setMpin(''); }, [open]);
  useEffect(() => { if (error) setMpin(''); }, [error]);

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    if (mpin.length >= 4 && !loading) onConfirm(mpin);
  }

  const rows = summary
    ? Object.entries(summary).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <div className="fixed inset-0 bg-navy/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={dialogRef} className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="text-lg font-bold text-navy mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">Enter your transaction PIN to authorize this action.</p>

        {rows.length > 0 && (
          <dl className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-800 text-right">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}

        <form onSubmit={submit}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            data-autofocus
            value={mpin}
            onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter MPIN"
            aria-label="MPIN"
            className="w-full text-center tracking-[0.5em] text-xl border border-gray-300 rounded-lg py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-navy"
          />
          {error && <p className="text-red-600 text-sm mb-3" role="alert">{error}</p>}
          <div className="flex gap-3">
            <SecondaryButton type="button" onClick={onCancel} className="flex-1">Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={loading || mpin.length < 4} className="flex-1">
              {loading ? 'Confirming…' : confirmLabel}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
