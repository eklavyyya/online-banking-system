import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api';
import useLoad from '../../hooks/useLoad';
import { formatCurrency, formatDate, formatPercent, maskAccount } from '../../utils/format';
import {
  Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, EmptyState, Input, PrimaryButton, DangerButton, Pagination,
} from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import Chips from './_parts/Chips';
import DataTable from './_parts/DataTable';
import FormField from './_parts/FormField';
import { ApproveModal, RejectModal } from './_parts/LoanDecisionModals';
import { useDebounced, useMediaQuery, usePage } from './_parts/hooks';

const STATUSES = ['Applied', 'Active', 'Rejected', 'Closed', 'All'];
const CHIPS = [{ value: 'All', label: 'All' }, ...STATUSES.filter((s) => s !== 'All').map((s) => ({ value: s, label: s }))];

export default function AdminLoansPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  const status = STATUSES.includes(requested) ? requested : 'Applied';
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput.trim());
  const [page, setPage] = usePage(`${status}|${q}`);
  const [decision, setDecision] = useState(null); // { kind: 'approve' | 'reject', loan }
  const [success, setSuccess] = useState('');

  const { data, error, loading, reload } = useLoad(
    () => adminApi.loans({ status: status === 'All' ? '' : status, q, page, pageSize: 10 }),
    [status, q, page],
  );
  const items = data?.items || [];

  function finished(message) { setSuccess(message); setDecision(null); reload(); }

  const narrow = useMediaQuery('(max-width: 767px)');
  const statusCell = (l) => (
    <span className="block">
      <StatusBadge status={l.status} />
      {l.status === 'Rejected' && <span className="block text-xs text-red-700 mt-1 max-w-[14rem]">Reason: {l.rejectionReason || 'Not recorded'}</span>}
    </span>
  );
  const actionsCell = (l) => (l.status === 'Applied' ? (
    <span className="flex flex-wrap gap-2">
      <PrimaryButton className="px-3 py-1.5" aria-label={`Approve loan for ${l.applicantName}`} onClick={() => { setSuccess(''); setDecision({ kind: 'approve', loan: l }); }}>Approve</PrimaryButton>
      <DangerButton className="px-3 py-1.5" aria-label={`Reject loan for ${l.applicantName}`} onClick={() => { setSuccess(''); setDecision({ kind: 'reject', loan: l }); }}>Reject</DangerButton>
    </span>
  ) : null);
  const accountCell = (l) => <span className="font-mono text-xs whitespace-nowrap">{maskAccount(l.accountNumberMasked)}</span>;

  // Phones get one row per fact; the table groups related facts so the actions stay on screen.
  const cardColumns = [
    { key: 'applicant', header: 'Applicant', card: 'title', cell: (l) => <span className="font-medium text-gray-800">{l.applicantName || '—'}</span> },
    { key: 'type', header: 'Loan type', cell: (l) => l.loanType },
    { key: 'amount', header: 'Amount', cell: (l) => formatCurrency(l.principalAmount) },
    { key: 'rate', header: 'Rate', cell: (l) => `${formatPercent(l.interestRate)} p.a.` },
    { key: 'tenure', header: 'Tenure', cell: (l) => `${l.tenureMonths} months` },
    { key: 'emi', header: 'EMI', cell: (l) => formatCurrency(l.emiAmount) },
    { key: 'purpose', header: 'Purpose', cell: (l) => l.purpose || '—' },
    { key: 'account', header: 'Disbursal account', cell: accountCell },
    { key: 'applied', header: 'Applied', cell: (l) => formatDate(l.createdAt) },
    { key: 'status', header: 'Status', card: 'badge', cell: statusCell },
    { key: 'actions', header: 'Actions', card: 'actions', cell: actionsCell },
  ];
  const tableColumns = [
    {
      key: 'applicant',
      header: 'Applicant',
      className: 'min-w-[7rem]',
      cell: (l) => (
        <>
          <span className="block font-medium text-gray-800">{l.applicantName || '—'}</span>
          <span className="block text-xs text-gray-500 max-w-[10rem]">{l.purpose || 'No purpose given'}</span>
        </>
      ),
    },
    {
      key: 'loan',
      header: 'Loan type / terms',
      className: 'whitespace-nowrap',
      cell: (l) => (
        <>
          <span className="block">{l.loanType}</span>
          <span className="block text-xs text-gray-500">{formatPercent(l.interestRate)} p.a. · {l.tenureMonths} months</span>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount / EMI',
      className: 'whitespace-nowrap',
      cell: (l) => (
        <>
          <span className="block font-medium text-gray-800">{formatCurrency(l.principalAmount)}</span>
          <span className="block text-xs text-gray-500">EMI {formatCurrency(l.emiAmount)}</span>
        </>
      ),
    },
    { key: 'account', header: 'Disbursal account', cell: accountCell },
    { key: 'status', header: 'Status', cell: statusCell },
    { key: 'applied', header: 'Applied', className: 'whitespace-nowrap', cell: (l) => formatDate(l.createdAt) },
    { key: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell },
  ];
  const columns = narrow ? cardColumns : tableColumns;

  return (
    <div>
      <PageHeader title="Loan Applications" subtitle="Review, approve or reject customer loan applications" />
      <SuccessBanner message={success} />

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
            <Chips label="Filter by status" options={CHIPS} value={status} onChange={(v) => setParams({ status: v })} />
          </div>
          <FormField label="Applicant name" className="lg:w-72">
            <Input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search by name" />
          </FormField>
        </div>

        <ErrorBanner message={error} />
        {loading && !data && <Spinner />}
        {data && items.length === 0 && (
          <EmptyState>
            {q ? 'No applications match this search.' : status === 'Applied' ? 'No applications are waiting for review.' : 'No loans in this view.'}
          </EmptyState>
        )}
        {items.length > 0 && <DataTable caption="Loan applications" columns={columns} rows={items} rowKey={(l) => l.id} dim={loading} />}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      {decision?.kind === 'approve' && <ApproveModal loan={decision.loan} onClose={() => setDecision(null)} onDone={finished} />}
      {decision?.kind === 'reject' && <RejectModal loan={decision.loan} onClose={() => setDecision(null)} onDone={finished} />}
    </div>
  );
}
