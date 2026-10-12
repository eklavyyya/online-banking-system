import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import useLoad from '../../../hooks/useLoad';
import { formatCurrency, formatDate, formatNumber } from '../../../utils/format';
import {
  Card, ErrorBanner, Spinner, EmptyState, Input, Select, Textarea, PrimaryButton, SecondaryButton, Pagination,
} from '../../../components/ui';
import StatusBadge from '../../../components/StatusBadge';
import AdminModal from './AdminModal';
import DataTable from './DataTable';
import FormField from './FormField';
import { usePage } from './hooks';
import InlineError from './InlineError';

export const TYPE_LABEL = {
  'Own-Transfer': 'Own transfer', NEFT: 'NEFT', RTGS: 'RTGS', IMPS: 'IMPS', BillPay: 'Bill pay', Recharge: 'Recharge',
  DepositOpen: 'Deposit opened', RDInstallment: 'RD installment', DepositPayout: 'Deposit payout', LoanDisbursal: 'Loan disbursal', LoanEMI: 'Loan EMI',
};
const TYPES = Object.keys(TYPE_LABEL);
const PAYEE = { NEFT: 'Beneficiary', RTGS: 'Beneficiary', IMPS: 'Beneficiary', BillPay: 'Biller', Recharge: 'Biller', LoanEMI: 'Loan', DepositOpen: 'Deposit', RDInstallment: 'Deposit' };
const EMPTY = { q: '', type: '', status: '', from: '', to: '', minAmount: '', maxAmount: '', flagged: '' };
const PAGE_SIZE = 15;

function validate(f) {
  if (f.from && f.to && f.from > f.to) return 'The From date must not be after the To date.';
  if ((f.minAmount !== '' && Number(f.minAmount) < 0) || (f.maxAmount !== '' && Number(f.maxAmount) < 0)) return 'Amounts cannot be negative.';
  if (f.minAmount !== '' && f.maxAmount !== '' && Number(f.minAmount) > Number(f.maxAmount)) return 'The minimum amount must not exceed the maximum amount.';
  return '';
}

function FlagModal({ txn, onClose, onFlagged, onFailed }) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!reason.trim()) { setFieldError('Give a reason for flagging this transaction.'); return; }
    setSaving(true); setApiError('');
    try {
      await adminApi.createFlag({ entityType: 'Transaction', entityId: txn.id, reason: reason.trim() });
      onFlagged(txn.referenceNumber ? `Transaction ${txn.referenceNumber} flagged for review.` : 'Transaction flagged for review.');
    } catch (err) {
      setApiError(apiErrorMessage(err));
      onFailed(); // the list may be out of date (e.g. someone else flagged it first)
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title="Flag for review" onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        <InlineError message={apiError} />
        <p className="text-sm text-gray-600 mb-3">
          {TYPE_LABEL[txn.transactionType] || txn.transactionType} of <strong>{formatCurrency(txn.amount)}</strong>
          {txn.referenceNumber && <> · <span className="font-mono text-xs">{txn.referenceNumber}</span></>}. A flag only marks the item for follow-up; it does not block anything.
        </p>
        <FormField label="Reason" required error={fieldError} hint={`${reason.length}/255 characters`}>
          <Textarea maxLength={255} value={reason} onChange={(e) => { setReason(e.target.value); setFieldError(''); }} />
        </FormField>
        <div className="flex justify-end gap-2 mt-5">
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Flagging…' : 'Flag transaction'}</PrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}

export default function TransactionsTab({ version, onChanged, onNotice }) {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [filterError, setFilterError] = useState('');
  const [flagging, setFlagging] = useState(null);
  const key = JSON.stringify(applied);
  const [page, setPage] = usePage(key);

  const { data, error, loading, reload } = useLoad(
    () => adminApi.transactions({ ...applied, page, pageSize: PAGE_SIZE }),
    [key, page, version],
  );

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  function apply(e) {
    e.preventDefault();
    const problem = validate(draft);
    setFilterError(problem);
    if (!problem) setApplied({ ...draft, q: draft.q.trim() });
  }
  function reset() { setDraft(EMPTY); setApplied(EMPTY); setFilterError(''); }

  const items = data?.items || [];
  const s = data?.summary;

  const columns = [
    {
      key: 'when',
      header: 'Date / time',
      className: 'whitespace-nowrap',
      cell: (t) => {
        const d = new Date(t.initiatedAt);
        return (
          <>
            <span className="block">{formatDate(t.initiatedAt)}</span>
            <span className="block text-xs text-gray-400">{Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </>
        );
      },
    },
    {
      key: 'ref',
      header: 'Type / reference',
      card: 'title',
      cell: (t) => (
        <>
          <span className="block font-medium text-gray-800">{TYPE_LABEL[t.transactionType] || t.transactionType}</span>
          <span className="block font-mono text-xs text-gray-500 break-all">{t.referenceNumber || 'No reference'}</span>
        </>
      ),
    },
    {
      key: 'route',
      header: 'From → To',
      cell: (t) => (
        <span className="block font-mono text-xs whitespace-nowrap">
          <span className="block">{t.sourceAccountMasked}</span>
          <span className="block text-gray-400"><span aria-label="to">→</span>{' '}
            {t.destinationAccountMasked || <span className="font-sans italic">{PAYEE[t.transactionType] || '—'}</span>}
          </span>
        </span>
      ),
    },
    { key: 'who', header: 'Customer', className: 'min-w-[6rem]', cell: (t) => (t.customerNames.length ? t.customerNames.join(', ') : '—') },
    { key: 'amount', header: 'Amount', className: 'whitespace-nowrap font-medium text-gray-800 text-right', cell: (t) => formatCurrency(t.amount) },
    {
      key: 'status',
      header: 'Status',
      card: 'badge',
      className: 'min-w-[7rem]',
      cell: (t) => (
        <span className="block">
          <StatusBadge status={t.status} />
          {t.status === 'Failed' && t.failureReason && <span className="block text-xs text-red-600 mt-1 max-w-[12rem]">{t.failureReason}</span>}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'Review',
      card: 'actions',
      cell: (t) => (t.flagged ? (
        <span className="block max-w-[13rem]">
          <StatusBadge status="Flagged" />
          <span className="block text-xs text-red-700 mt-1">{t.flagReason}</span>
        </span>
      ) : (
        <SecondaryButton className="px-3 py-1.5" aria-label={`Flag transaction ${t.referenceNumber || ''}`.trim()} onClick={() => setFlagging(t)}>Flag</SecondaryButton>
      )),
    },
  ];

  return (
    <div>
      <Card className="mb-4">
        <form onSubmit={apply} noValidate>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <FormField label="Search" className="col-span-2">
              <Input type="search" value={draft.q} onChange={set('q')} placeholder="Reference, account number or customer name" />
            </FormField>
            <FormField label="Type">
              <Select value={draft.type} onChange={set('type')}>
                <option value="">All types</option>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={draft.status} onChange={set('status')}>
                <option value="">Any status</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
                <option value="Pending">Pending</option>
              </Select>
            </FormField>
            <FormField label="From date"><Input type="date" value={draft.from} onChange={set('from')} /></FormField>
            <FormField label="To date"><Input type="date" value={draft.to} onChange={set('to')} /></FormField>
            <FormField label="Min amount (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.minAmount} onChange={set('minAmount')} /></FormField>
            <FormField label="Max amount (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={draft.maxAmount} onChange={set('maxAmount')} /></FormField>
            <FormField label="Flagged">
              <Select value={draft.flagged} onChange={set('flagged')}>
                <option value="">Any</option>
                <option value="true">Flagged</option>
                <option value="false">Not flagged</option>
              </Select>
            </FormField>
          </div>
          {filterError && <p role="alert" className="text-sm text-red-600 mt-3">{filterError}</p>}
          <div className="flex gap-2 mt-4">
            <PrimaryButton type="submit">Apply filters</PrimaryButton>
            <SecondaryButton type="button" onClick={reset}>Reset</SecondaryButton>
          </div>
        </form>
      </Card>

      <ErrorBanner message={error} />
      {loading && !data && <Spinner />}

      {s && (
        <Card className="mb-4 p-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Matching transactions', formatNumber(s.count), 'text-navy'],
              ['Successful', formatNumber(s.successCount), 'text-green-700'],
              ['Failed', formatNumber(s.failedCount), s.failedCount > 0 ? 'text-red-600' : 'text-navy'],
              ['Value of successful', formatCurrency(s.successValue), 'text-navy'],
            ].map(([label, value, tone]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className={`text-xl font-bold font-serif mt-0.5 break-words ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-gray-400 mt-3">Totals cover every page of the current filter, not just the rows shown below.</p>
        </Card>
      )}

      {data && (
        <Card className="p-4 sm:p-6">
          {items.length === 0 ? <EmptyState>No transactions match these filters.</EmptyState> : (
            <DataTable caption="Transactions" columns={columns} rows={items} rowKey={(t) => t.id} dim={loading} rowClass={(t) => (t.flagged ? 'bg-red-50' : 'bg-white')} />
          )}
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </Card>
      )}

      {flagging && (
        <FlagModal
          txn={flagging}
          onClose={() => setFlagging(null)}
          onFailed={reload}
          onFlagged={(msg) => { setFlagging(null); onNotice(msg); onChanged(); }}
        />
      )}
    </div>
  );
}
