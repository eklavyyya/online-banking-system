import { useMemo, useState } from 'react';
import { accountsApi, serviceRequestApi } from '../api';
import { apiErrorMessage } from '../api/client';
import useLoad from '../hooks/useLoad';
import { maskAccount } from '../utils/format';
import { PageHeader, Spinner, Card, EmptyState, Select, SecondaryButton } from '../components/ui';
import ConfirmModal from './_customer/ConfirmModal';
import LabeledField from './_customer/LabeledField';
import { ErrorNotice, SuccessNotice, LoadError } from './_customer/Notice';
import { useBusy } from './_customer/hooks';
import { notifyNotificationsChanged } from './_customer/notifyChanged';
import NewRequestCard from './serviceRequests/NewRequestCard';
import RequestItem from './serviceRequests/RequestItem';
import { TYPE_OPTIONS, STATUS_OPTIONS, newestFirst } from './serviceRequests/requestUtils';

export default function ServiceRequestsPage() {
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [success, setSuccess] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeError, setCloseError] = useState('');
  const [closing, runClose] = useBusy();

  const list = useLoad(() => serviceRequestApi.list({ status: filters.status, type: filters.type }), [filters.status, filters.type]);
  const accounts = useLoad(() => accountsApi.list(), []).data; // only used for labels; a failure just hides them

  const accountText = useMemo(
    () => Object.fromEntries((accounts || []).map((a) => [a.id, maskAccount(a.accountNumber)])),
    [accounts],
  );
  const requests = useMemo(() => (list.data ? [...list.data].sort(newestFirst) : null), [list.data]);
  const filtered = !!(filters.status || filters.type);

  function created(request) {
    setSuccess(`Your request has been raised. Reference: ${request.ref}. You can follow its status below.`);
    setFormOpen(false);
    notifyNotificationsChanged();
    requestAnimationFrame(() => document.getElementById('sr-notice')?.focus());
    list.reload();
  }

  function confirmClose() {
    setCloseError('');
    return runClose(async () => {
      try {
        await serviceRequestApi.close(closeTarget.id);
        setSuccess(`Request ${closeTarget.ref} is now closed.`);
        setCloseTarget(null);
        requestAnimationFrame(() => document.getElementById('sr-notice')?.focus());
        list.reload();
      } catch (err) {
        setCloseError(apiErrorMessage(err));
      }
    });
  }

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <PageHeader title="Service Requests" subtitle="Raise a request and follow it until it is resolved" />
      <SuccessNotice id="sr-notice" message={success} />

      <NewRequestCard accounts={accounts} open={formOpen} onToggle={() => setFormOpen((v) => !v)} onCreated={created} />

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <LabeledField label="Status">
            <Select value={filters.status} onChange={setFilter('status')}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </LabeledField>
          <LabeledField label="Type">
            <Select value={filters.type} onChange={setFilter('type')}>
              <option value="">All</option>
              {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </LabeledField>
          <SecondaryButton className="col-span-2 sm:col-span-1" disabled={!filtered} onClick={() => setFilters({ status: '', type: '' })}>Clear filters</SecondaryButton>
        </div>
      </Card>

      {list.error && !requests && <LoadError message={list.error} onRetry={list.reload} />}
      {list.error && requests && <ErrorNotice message={list.error} />}
      {!requests && list.loading && <Spinner />}

      {requests && requests.length === 0 && (
        <Card><EmptyState>{filtered ? 'No requests match these filters.' : 'You have not raised any requests yet. Use "New request" above to start one.'}</EmptyState></Card>
      )}

      {requests && requests.length > 0 && (
        <ul className={`space-y-3 transition-opacity ${list.loading ? 'opacity-60' : ''}`} aria-busy={list.loading} aria-label="Your service requests">
          {requests.map((r) => (
            <RequestItem
              key={r.id}
              request={r}
              accountText={r.relatedAccountId ? accountText[r.relatedAccountId] : ''}
              onClose={(req) => { setCloseError(''); setCloseTarget(req); }}
            />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!closeTarget}
        title={`Close ${closeTarget?.ref || 'request'}?`}
        confirmLabel="Close request"
        loading={closing}
        error={closeError}
        onConfirm={confirmClose}
        onCancel={() => setCloseTarget(null)}
      >
        <p>Closing tells the bank you are satisfied with the resolution. A closed request cannot be reopened, but you can always raise a new one.</p>
      </ConfirmModal>
    </div>
  );
}
