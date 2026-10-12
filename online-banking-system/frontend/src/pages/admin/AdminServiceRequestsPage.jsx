import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api';
import useLoad from '../../hooks/useLoad';
import { formatDate } from '../../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, EmptyState, Input, Select, Pagination } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import Chips from './_parts/Chips';
import DataTable from './_parts/DataTable';
import FormField from './_parts/FormField';
import RequestDetailModal from './_parts/RequestDetailModal';
import { useDebounced, usePage } from './_parts/hooks';

const STATUSES = ['All', 'Open', 'In Progress', 'Resolved', 'Closed'];
const CHIPS = STATUSES.map((s) => ({ value: s, label: s }));
const TYPES = [
  ['ChequeBook', 'Cheque book'], ['Statement', 'Statement'], ['CardIssue', 'Card request'], ['Complaint', 'Complaint'], ['Other', 'Other'],
];

export default function AdminServiceRequestsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  const status = STATUSES.includes(requested) ? requested : 'All';
  const [type, setType] = useState('');
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput.trim());
  const [page, setPage] = usePage(`${status}|${type}|${q}`);
  const [selected, setSelected] = useState(null);
  const [success, setSuccess] = useState('');

  const { data, error, loading, reload } = useLoad(
    () => adminApi.serviceRequests({ status: status === 'All' ? '' : status, type, q, page, pageSize: 10 }),
    [status, type, q, page],
  );
  const items = data?.items || [];

  const columns = [
    {
      key: 'ref',
      header: 'Ref',
      card: 'title',
      // Clicking the button bubbles up to the row handler, so Enter/Space work too.
      cell: (r) => <button type="button" aria-label={`Open ${r.ref}`} className="font-mono text-sm font-semibold text-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded">{r.ref}</button>,
    },
    { key: 'type', header: 'Type', className: 'whitespace-nowrap', cell: (r) => r.typeLabel },
    { key: 'customer', header: 'Customer', cell: (r) => r.customerName || '—' },
    { key: 'status', header: 'Status', card: 'badge', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'created', header: 'Created', className: 'whitespace-nowrap', cell: (r) => formatDate(r.createdAt) },
    { key: 'description', header: 'Description', className: 'max-w-xs', cell: (r) => <span className="line-clamp-2 break-words">{r.description}</span> },
  ];

  return (
    <div>
      <PageHeader title="Service Requests" subtitle="Cheque books, statements, card requests and complaints raised by customers" />
      <SuccessBanner message={success} />

      <Card>
        <div className="space-y-4 mb-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
            <Chips label="Filter by status" options={CHIPS} value={status} onChange={(v) => setParams({ status: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="Search" className="sm:col-span-2">
              <Input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Reference (SR000012), customer name or text" />
            </FormField>
          </div>
        </div>

        <ErrorBanner message={error} />
        {loading && !data && <Spinner />}
        {data && items.length === 0 && <EmptyState>No service requests match these filters.</EmptyState>}
        {items.length > 0 && (
          <DataTable caption="Service requests" columns={columns} rows={items} rowKey={(r) => r.id} dim={loading} onRowClick={(r) => { setSuccess(''); setSelected(r); }} />
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      {selected && (
        <RequestDetailModal
          key={selected.id}
          request={selected}
          onClose={() => setSelected(null)}
          onUpdated={(message) => { setSelected(null); setSuccess(message); reload(); }}
        />
      )}
    </div>
  );
}
