import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import { PrimaryButton, SecondaryButton, Select, Textarea } from '../../../components/ui';
import { formatDateTime } from '../../../utils/format';
import StatusBadge from '../../../components/StatusBadge';
import AdminModal from './AdminModal';
import FormField from './FormField';
import { useAccountIndex } from './lookups';
import InlineError from './InlineError';

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

function statusNote(req, status) {
  const card = req.requestType === 'CardIssue' && req.relatedCardId;
  if (status === 'Resolved') {
    return card
      ? 'Resolving a card unblock/reissue request issues a replacement card number and re-activates the card.'
      : 'The customer is notified and can close the request from their side.';
  }
  if (status === 'Closed') {
    return card
      ? 'Closing a card unblock/reissue request leaves the card blocked. A closed request is final and cannot be edited again.'
      : 'A closed request is final and cannot be edited again.';
  }
  return 'The customer is notified whenever the status changes.';
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 break-words">{children}</dd>
    </div>
  );
}

export default function RequestDetailModal({ request, onClose, onUpdated }) {
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.resolutionNotes || '');
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const accounts = useAccountIndex(!!request.relatedAccountId);

  const isClosed = request.status === 'Closed';
  const needsNotes = status === 'Resolved' || status === 'Closed';
  const cardLast4 = request.relatedCardId ? (/ending (\d{4})/.exec(request.description || '') || [])[1] : null;
  const account = request.relatedAccountId ? accounts[request.relatedAccountId] : null;
  const needsConfirm = status === 'Closed' || (status === 'Resolved' && request.requestType === 'CardIssue' && !!request.relatedCardId);

  function submit(e) {
    e.preventDefault();
    if (saving || isClosed) return;
    if (needsNotes && !notes.trim()) { setFieldError('Resolution notes are required to resolve or close a request.'); return; }
    setFieldError(''); setApiError('');
    if (needsConfirm) setConfirming(true); else save();
  }

  async function save() {
    if (saving) return;
    setSaving(true); setApiError('');
    try {
      const updated = await adminApi.updateServiceRequest(request.id, { status, ...(notes.trim() ? { resolutionNotes: notes.trim() } : {}) });
      onUpdated(`${updated.ref} is now ${updated.status}. The customer has been notified.`);
    } catch (err) {
      setApiError(apiErrorMessage(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title={`Service request ${request.ref}`} onClose={onClose} busy={saving} wide>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StatusBadge status={request.status} />
        <span className="text-sm text-gray-500">{request.typeLabel}</span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        <Detail label="Customer">{request.customerName || '—'}</Detail>
        <Detail label="Raised">{formatDateTime(request.createdAt)}</Detail>
        <Detail label="Resolved">{request.resolvedAt ? formatDateTime(request.resolvedAt) : '—'}</Detail>
        {request.relatedCardId && (
          <Detail label="Related card">{cardLast4 ? `Card ending ${cardLast4}` : 'A card is linked to this request'}</Detail>
        )}
        {request.relatedAccountId && (
          <Detail label="Related account">
            {account ? <><span className="font-mono text-xs">{account.masked}</span> <span className="text-gray-500">({account.type})</span></> : 'An account is linked to this request'}
          </Detail>
        )}
      </dl>

      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1">Description</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words rounded-lg bg-gray-50 border border-gray-200 p-3">{request.description}</p>
      </div>

      {confirming ? (
        <div>
          <InlineError message={apiError} />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-4">
            <p className="font-semibold mb-1">{status === 'Closed' ? `Close ${request.ref}?` : `Resolve ${request.ref}?`}</p>
            <p>{statusNote(request, status)}</p>
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirming(false)} disabled={saving} data-autofocus>Back</SecondaryButton>
            <PrimaryButton onClick={save} disabled={saving}>{saving ? 'Saving…' : status === 'Closed' ? 'Close request' : 'Resolve request'}</PrimaryButton>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <InlineError message={apiError} />
          {isClosed && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 px-3 py-2 mb-3">
              This request is closed and can no longer be changed.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Status" className="sm:col-span-1">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setFieldError(''); }} disabled={isClosed || saving}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField
              label="Resolution notes"
              required={needsNotes}
              error={fieldError}
              hint={needsNotes ? 'Required when resolving or closing. The customer sees these notes.' : 'Optional while the request is open or in progress.'}
              className="sm:col-span-2"
            >
              <Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); setFieldError(''); }} disabled={isClosed || saving} />
            </FormField>
          </div>
          {!isClosed && <p className="text-xs text-gray-500 mt-3">{statusNote(request, status)}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <SecondaryButton type="button" onClick={onClose} disabled={saving}>{isClosed ? 'Close window' : 'Cancel'}</SecondaryButton>
            {!isClosed && <PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update request'}</PrimaryButton>}
          </div>
        </form>
      )}
    </AdminModal>
  );
}
