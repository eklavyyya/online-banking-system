import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { accountsApi, blobErrorMessage } from '../api';
import { apiErrorMessage } from '../api/client';
import { formatCurrency, formatDateTime, maskAccount } from '../utils/format';
import { Card, PageHeader, ErrorBanner, Spinner, SecondaryButton, Select, Input, EmptyState } from '../components/ui';
import StatusBadge from '../components/StatusBadge';

const TYPES = [
  ['', 'All types'], ['Own-Transfer', 'Own-account transfer'], ['NEFT', 'NEFT'], ['RTGS', 'RTGS'], ['IMPS', 'IMPS'],
  ['BillPay', 'Bill payment'], ['Recharge', 'Recharge'], ['DepositOpen', 'Deposit opened'], ['RDInstallment', 'RD instalment'],
  ['DepositPayout', 'Deposit proceeds'], ['LoanDisbursal', 'Loan disbursal'], ['LoanEMI', 'Loan EMI'],
];

export default function AccountDetailPage() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [txns, setTxns] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '', type: '', direction: '' });
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    setAccount(null); setReveal(false);
    accountsApi.get(id).then(setAccount).catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  // Full number is only shown on request, and hides itself again (SRS S5).
  useEffect(() => {
    if (!reveal) return undefined;
    const t = setTimeout(() => setReveal(false), 15000);
    return () => clearTimeout(t);
  }, [reveal]);

  useEffect(() => {
    const params = {};
    ['from', 'to', 'type', 'direction'].forEach((k) => { if (filters[k]) params[k] = filters[k]; });
    setTxns(null);
    accountsApi.transactions(id, params).then(setTxns).catch((err) => setError(apiErrorMessage(err)));
  }, [id, filters]);

  async function download(format) {
    setError(''); setDownloading(format);
    try {
      // a statement covers a period, not a filter: it uses the date range only
      await accountsApi.downloadStatement(id, { from: filters.from, to: filters.to, format });
    } catch (err) {
      setError(await blobErrorMessage(err));
    } finally {
      setDownloading('');
    }
  }

  const rangeInvalid = filters.from && filters.to && filters.from > filters.to;

  return (
    <div>
      <Link to="/" className="text-sm text-navy hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
      <ErrorBanner message={error} />

      {!account && !error && <Spinner />}

      {account && (
        <>
          <PageHeader
            title={reveal ? account.accountNumber : maskAccount(account.accountNumber)}
            subtitle={`${account.accountType} Account · ${account.branchIfsc}`}
            action={
              <div className="flex flex-wrap gap-2 justify-end">
                <SecondaryButton onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>{reveal ? 'Hide number' : 'Show full number'}</SecondaryButton>
                <SecondaryButton onClick={() => download('csv')} disabled={!!downloading || rangeInvalid}>{downloading === 'csv' ? 'Preparing…' : 'Statement (CSV)'}</SecondaryButton>
                <SecondaryButton onClick={() => download('pdf')} disabled={!!downloading || rangeInvalid}>{downloading === 'pdf' ? 'Preparing…' : 'Statement (PDF)'}</SecondaryButton>
              </div>
            }
          />

          <Card className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Current Balance</p>
                <p className="text-3xl font-bold text-navy font-serif">{formatCurrency(account.balance)}</p>
              </div>
              <StatusBadge status={account.status} />
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-800 mb-1">Transaction History</h3>
            <p className="text-xs text-gray-400 mb-4">Money in and money out. The statement downloads cover the selected From / To dates.</p>
            <div className="flex flex-wrap gap-3 mb-4">
              <Input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="w-auto" />
              <Input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="w-auto" />
              <Select aria-label="Transaction type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="w-auto">
                {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select aria-label="Direction" value={filters.direction} onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value }))} className="w-auto">
                <option value="">Money in &amp; out</option>
                <option value="credit">Money in (credits)</option>
                <option value="debit">Money out (debits)</option>
              </Select>
            </div>
            {rangeInvalid && <p className="text-xs text-red-600 mb-3">The From date is after the To date.</p>}

            {!txns && <Spinner />}
            {txns && txns.length === 0 && <EmptyState>No transactions found.</EmptyState>}
            {txns && txns.length > 0 && (
              // `relative` keeps the sr-only labels inside the scroller instead of widening the page
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th scope="col" className="pb-2 font-medium">Date</th>
                      <th scope="col" className="pb-2 font-medium">Details</th>
                      <th scope="col" className="pb-2 font-medium">Reference</th>
                      <th scope="col" className="pb-2 font-medium text-right">Amount</th>
                      <th scope="col" className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => (
                      <tr key={`${t.id}-${t.direction}`} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 text-gray-600 whitespace-nowrap">{formatDateTime(t.initiatedAt)}</td>
                        <td className="py-2.5 text-gray-700">{t.description}</td>
                        <td className="py-2.5 font-mono text-xs text-gray-400">{t.referenceNumber || '—'}</td>
                        <td className={`py-2.5 text-right font-medium whitespace-nowrap ${t.direction === 'credit' ? 'text-green-700' : 'text-gray-800'}`}>
                          <span className="sr-only">{t.direction === 'credit' ? 'Credit ' : 'Debit '}</span>
                          {t.direction === 'credit' ? '+' : '−'}{formatCurrency(t.amount)}
                        </td>
                        <td className="py-2.5 text-right"><StatusBadge status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
