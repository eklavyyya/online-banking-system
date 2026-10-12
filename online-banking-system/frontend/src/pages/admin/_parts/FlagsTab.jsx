import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import useLoad from '../../../hooks/useLoad';
import { formatDateTime } from '../../../utils/format';
import {
  Card, ErrorBanner, Spinner, EmptyState, Select, Textarea, PrimaryButton, SecondaryButton, Pagination,
} from '../../../components/ui';
import StatusBadge from '../../../components/StatusBadge';
import AdminModal from './AdminModal';
import FormField from './FormField';
import { useAdminNames } from './lookups';
import { usePage } from './hooks';
import InlineError from './InlineError';

function ClearModal({ flag, onClose, onCleared, onFailed }) {
  const [note, setNote] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setApiError('');
    try {
      await adminApi.clearFlag(flag.id, note.trim());
      onCleared('Flag cleared.');
    } catch (err) {
      setApiError(apiErrorMessage(err));
      onFailed();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title="Clear flag" onClose={onClose} busy={saving}>
      <form onSubmit={submit}>
        <InlineError message={apiError} />
        <p className="text-sm text-gray-600 mb-1"><strong>{flag.entitySummary}</strong></p>
        <p className="text-sm text-gray-500 mb-3">Flagged because: {flag.reason}</p>
        <FormField label="Clearance note (optional)" hint={`${note.length}/255 characters`}>
          <Textarea maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified with the customer by phone." />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Clearing…' : 'Clear flag'}</PrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}

export default function FlagsTab({ version, onChanged, onNotice }) {
  const [status, setStatus] = useState('Open');
  const [entityType, setEntityType] = useState('');
  const [clearing, setClearing] = useState(null);
  const [page, setPage] = usePage(`${status}|${entityType}`);
  const names = useAdminNames();

  const { data, error, loading, reload } = useLoad(
    () => adminApi.flags({ status: status === 'All' ? '' : status, entityType, page, pageSize: 10 }),
    [status, entityType, page, version],
  );
  const items = data?.items || [];

  return (
    <div>
      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:max-w-lg">
          <FormField label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Open">Open</option>
              <option value="Cleared">Cleared</option>
              <option value="All">All</option>
            </Select>
          </FormField>
          <FormField label="Item type">
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">All</option>
              <option value="Transaction">Transaction</option>
              <option value="Account">Account</option>
            </Select>
          </FormField>
        </div>
      </Card>

      <ErrorBanner message={error} />
      {loading && !data && <Spinner />}
      {data && items.length === 0 && <Card><EmptyState>{status === 'Open' ? 'Nothing is flagged for review.' : 'No flags match these filters.'}</EmptyState></Card>}

      {items.length > 0 && (
        <ul className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-label="Flagged items">
          {items.map((f) => (
            <li key={f.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-medium text-gray-800 break-words">{f.entitySummary}</p>
                      <StatusBadge status={f.status} />
                      <span className="text-xs text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">{f.entityType}</span>
                    </div>
                    <p className="text-sm text-gray-700">{f.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">Flagged by {f.flaggedByUsername || 'an administrator'} on {formatDateTime(f.createdAt)}</p>
                    {f.status === 'Cleared' && (
                      <div className="mt-2 text-xs text-gray-500 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                        <p>Cleared by {names[f.clearedByUserId] || 'an administrator'} on {formatDateTime(f.clearedAt)}</p>
                        <p className="mt-0.5">{f.clearanceNote ? `Note: ${f.clearanceNote}` : 'No note was added.'}</p>
                      </div>
                    )}
                  </div>
                  {f.status === 'Open' && (
                    <SecondaryButton className="px-3 py-1.5 shrink-0" aria-label={`Clear flag: ${f.entitySummary}`} onClick={() => setClearing(f)}>Clear</SecondaryButton>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      {clearing && (
        <ClearModal
          flag={clearing}
          onClose={() => setClearing(null)}
          onFailed={reload}
          onCleared={(msg) => { setClearing(null); onNotice(msg); onChanged(); }}
        />
      )}
    </div>
  );
}
