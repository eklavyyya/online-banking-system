import { useState } from 'react';
import { adminApi } from '../../api';
import useLoad from '../../hooks/useLoad';
import { formatDateTime } from '../../utils/format';
import { Card, PageHeader, ErrorBanner, Spinner, EmptyState, Input, Select, SecondaryButton, Pagination } from '../../components/ui';
import DataTable from './_parts/DataTable';
import FormField from './_parts/FormField';
import { useDebounced, usePage } from './_parts/hooks';

const ENTITIES = ['User', 'Account', 'Transaction', 'Deposit', 'Loan', 'Card', 'ServiceRequest', 'Notification', 'Customer', 'Beneficiary', 'Biller'];

function RoleChip({ role }) {
  const staff = role === 'admin';
  return (
    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${staff ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  );
}

export default function AdminActivityPage() {
  const [usernameInput, setUsernameInput] = useState('');
  const [qInput, setQInput] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const username = useDebounced(usernameInput.trim());
  const q = useDebounced(qInput.trim());
  const rangeError = from && to && from > to ? 'The From date must not be after the To date.' : '';
  const [page, setPage] = usePage(`${username}|${q}|${entity}|${from}|${to}`);

  const { data, error, loading } = useLoad(
    () => (rangeError ? Promise.resolve(null) : adminApi.activityLog({ username, q, entity, from, to, page, pageSize: 25 })),
    [username, q, entity, from, to, page],
  );
  const items = data?.items || [];
  const filtered = !!(usernameInput || qInput || entity || from || to);

  function reset() { setUsernameInput(''); setQInput(''); setEntity(''); setFrom(''); setTo(''); }

  const columns = [
    { key: 'time', header: 'Time', card: 'title', className: 'whitespace-nowrap', cell: (r) => <span className="text-sm">{formatDateTime(r.timestamp)}</span> },
    {
      key: 'user',
      header: 'User',
      className: 'whitespace-nowrap',
      cell: (r) => (r.username
        ? <><span className="font-medium text-gray-800">{r.username}</span>{r.role && <RoleChip role={r.role} />}</>
        : <span className="text-gray-400">System</span>),
    },
    { key: 'action', header: 'Action', cell: (r) => <span className="break-words">{r.actionDescription}</span> },
    {
      key: 'entity',
      header: 'Entity',
      className: 'whitespace-nowrap',
      cell: (r) => (r.entityAffected
        ? <>{r.entityAffected}{r.entityId !== null && r.entityId !== undefined && <span className="text-gray-400"> #{r.entityId}</span>}</>
        : '—'),
    },
  ];

  return (
    <div>
      <PageHeader title="Activity Log" subtitle="Audit trail of everything customers and staff have done, newest first" />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <FormField label="Username"><Input type="search" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="e.g. priya" /></FormField>
          <FormField label="Search action text"><Input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="e.g. loan, login, flagged" /></FormField>
          <FormField label="Entity">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">All entities</option>
              {ENTITIES.map((en) => <option key={en} value={en}>{en}</option>)}
            </Select>
          </FormField>
          <FormField label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
          <div className="flex items-end">
            <SecondaryButton onClick={reset} disabled={!filtered}>Clear filters</SecondaryButton>
          </div>
        </div>
        {rangeError && <p role="alert" className="text-sm text-red-600 mb-3">{rangeError}</p>}

        <ErrorBanner message={error} />
        {loading && !data && !rangeError && <Spinner />}
        {data && items.length === 0 && <EmptyState>{filtered ? 'No activity matches these filters.' : 'No activity recorded yet.'}</EmptyState>}
        {items.length > 0 && <DataTable caption="Activity log" columns={columns} rows={items} rowKey={(r) => r.id} dim={loading} />}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
