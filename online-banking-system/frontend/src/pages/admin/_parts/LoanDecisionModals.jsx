import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import { PrimaryButton, SecondaryButton, Textarea } from '../../../components/ui';
import { formatCurrency, formatDate, formatPercent, maskAccount } from '../../../utils/format';
import AdminModal from './AdminModal';
import FormField from './FormField';
import InlineError from './InlineError';

/** Roughly when the first EMI falls due: the backend sets it to one month after approval. */
function firstEmiDate() {
  const d = new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

export function ApproveModal({ loan, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  async function approve() {
    if (saving) return;
    setSaving(true); setApiError('');
    try {
      await adminApi.approveLoan(loan.id);
      onDone(`Loan approved: ${formatCurrency(loan.principalAmount)} has been credited to ${maskAccount(loan.accountNumberMasked)} for ${loan.applicantName}.`);
    } catch (err) {
      setApiError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title="Approve loan application?" onClose={onClose} busy={saving}>
      <InlineError message={apiError} />
      <p className="text-sm text-gray-600 mb-3">
        <strong>{loan.applicantName}</strong> applied for a {loan.loanType} loan
        {loan.purpose ? ` (${loan.purpose})` : ''}.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm rounded-lg bg-gray-50 border border-gray-200 p-3 mb-3">
        <dt className="text-gray-500">Amount</dt><dd className="font-semibold text-navy">{formatCurrency(loan.principalAmount)}</dd>
        <dt className="text-gray-500">Rate</dt><dd>{formatPercent(loan.interestRate)} p.a.</dd>
        <dt className="text-gray-500">Tenure</dt><dd>{loan.tenureMonths} months</dd>
        <dt className="text-gray-500">EMI</dt><dd>{formatCurrency(loan.emiAmount)} per month</dd>
        <dt className="text-gray-500">Credited to</dt><dd className="font-mono text-xs pt-0.5">{maskAccount(loan.accountNumberMasked)}</dd>
      </dl>
      <p className="text-sm text-gray-600 mb-5">
        Approving credits <strong>{formatCurrency(loan.principalAmount)}</strong> to this account <strong>immediately</strong> and starts the EMI schedule:
        {' '}{loan.tenureMonths} monthly instalments, the first around {formatDate(firstEmiDate())}. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onClose} disabled={saving} data-autofocus>Cancel</SecondaryButton>
        <PrimaryButton onClick={approve} disabled={saving}>{saving ? 'Approving…' : `Approve and credit ${formatCurrency(loan.principalAmount)}`}</PrimaryButton>
      </div>
    </AdminModal>
  );
}

export function RejectModal({ loan, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (reason.trim().length < 5) { setFieldError('Give a reason of at least 5 characters.'); return; }
    setSaving(true); setApiError('');
    try {
      await adminApi.rejectLoan(loan.id, reason.trim());
      onDone(`Application from ${loan.applicantName} rejected. They have been notified with your reason.`);
    } catch (err) {
      setApiError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title="Reject loan application" onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        <InlineError message={apiError} />
        <p className="text-sm text-gray-600 mb-3">
          Reject the {loan.loanType} loan of <strong>{formatCurrency(loan.principalAmount)}</strong> requested by <strong>{loan.applicantName}</strong>?
          The customer is notified and sees your reason.
        </p>
        <FormField label="Reason" required error={fieldError} hint={`At least 5 characters · ${reason.length}/255`}>
          <Textarea maxLength={255} value={reason} onChange={(e) => { setReason(e.target.value); setFieldError(''); }} />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <button type="submit" disabled={saving} className="px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium text-sm hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Rejecting…' : 'Reject application'}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
