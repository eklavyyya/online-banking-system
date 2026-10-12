import { useEffect, useState } from 'react';
import { accountsApi, beneficiaryApi, transferApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { formatCurrency, accountLabel, maskAccount } from '../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, PrimaryButton } from '../components/ui';
import MpinModal from '../components/MpinModal';

const MODES = ['Own-Transfer', 'IMPS', 'NEFT', 'RTGS'];

export default function TransferPage() {
  const [accounts, setAccounts] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({ sourceAccountId: '', mode: 'IMPS', beneficiaryId: '', destinationAccountId: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(null); // { transactionId, summary }
  const [mpinError, setMpinError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    accountsApi.list().then(setAccounts).catch((err) => setError(apiErrorMessage(err)));
    beneficiaryApi.list().then(setBeneficiaries).catch((err) => setError(apiErrorMessage(err)));
  }, []);

  const activeBeneficiaries = (beneficiaries || []).filter((b) => b.status === 'Active');

  // What the MPIN dialog shows: names and masked numbers, never database ids (OI-09).
  function readableSummary(payload) {
    const from = accounts.find((a) => a.id === payload.sourceAccountId);
    let to = '';
    if (payload.mode === 'Own-Transfer') {
      to = accountLabel(accounts.find((a) => a.id === payload.destinationAccountId));
    } else {
      const b = beneficiaries.find((x) => x.id === payload.beneficiaryId);
      to = b ? `${b.nickname || b.beneficiaryName} (${maskAccount(b.accountNumber)})` : '';
    }
    return { 'From account': accountLabel(from), 'To': to, 'Mode': payload.mode, 'Amount': formatCurrency(payload.amount) };
  }

  async function handleInitiate(e) {
    e.preventDefault();
    setError(''); setResult(null); setSubmitting(true);
    try {
      const payload = {
        sourceAccountId: Number(form.sourceAccountId),
        amount: Number(form.amount),
        mode: form.mode,
      };
      if (form.mode === 'Own-Transfer') {
        payload.destinationAccountId = Number(form.destinationAccountId);
      } else {
        payload.beneficiaryId = Number(form.beneficiaryId);
      }
      const res = await transferApi.initiate(payload);
      setPending({ transactionId: res.transactionId, summary: readableSummary(payload) });
      setMpinError('');
      setModalOpen(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(mpin) {
    setConfirming(true);
    setMpinError('');
    try {
      const res = await transferApi.confirm(pending.transactionId, mpin);
      setModalOpen(false);
      setResult(res);
      setForm({ sourceAccountId: '', mode: 'IMPS', beneficiaryId: '', destinationAccountId: '', amount: '' });
      accountsApi.list().then(setAccounts);
    } catch (err) {
      setMpinError(apiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  if (!accounts || !beneficiaries) return <Spinner />;

  return (
    <div>
      <PageHeader title="Transfer Funds" subtitle="Own-account or third-party transfer (NEFT / RTGS / IMPS)" />
      <ErrorBanner message={error} />
      {result && (
        <SuccessBanner
          message={`Transfer ${result.status}. Reference: ${result.referenceNumber || '—'}`}
        />
      )}

      <Card className="max-w-lg">
        <form onSubmit={handleInitiate} className="space-y-4">
          <div>
            <label htmlFor="transfer-from" className="block text-sm font-medium text-gray-700 mb-1">From Account</label>
            <select
              id="transfer-from"
              required
              value={form.sourceAccountId}
              onChange={(e) => setForm((f) => ({ ...f, sourceAccountId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{accountLabel(a)} — {formatCurrency(a.balance)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Mode</label>
            <div className="grid grid-cols-4 gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: m }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.mode === m ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {form.mode === 'RTGS' && (
              <p className="text-xs text-amber-600 mt-1">RTGS requires a minimum amount (configured server-side, default ₹2,00,000).</p>
            )}
          </div>

          {form.mode === 'Own-Transfer' ? (
            <div>
              <label htmlFor="transfer-to" className="block text-sm font-medium text-gray-700 mb-1">To Account (yours)</label>
              <select
                id="transfer-to"
                required
                value={form.destinationAccountId}
                onChange={(e) => setForm((f) => ({ ...f, destinationAccountId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">Select account…</option>
                {accounts.filter((a) => String(a.id) !== form.sourceAccountId).map((a) => (
                  <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="transfer-bene" className="block text-sm font-medium text-gray-700 mb-1">Beneficiary</label>
              <select
                id="transfer-bene"
                required
                value={form.beneficiaryId}
                onChange={(e) => setForm((f) => ({ ...f, beneficiaryId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">Select beneficiary…</option>
                {activeBeneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>{b.nickname || b.beneficiaryName} — {maskAccount(b.accountNumber)}</option>
                ))}
              </select>
              {activeBeneficiaries.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No active beneficiaries yet — add one first, or wait for its cooling-off period to elapse.</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="transfer-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
            <input
              id="transfer-amount"
              type="number"
              min="1"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>

          <PrimaryButton type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Validating…' : 'Continue'}
          </PrimaryButton>
        </form>
      </Card>

      <MpinModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        loading={confirming}
        error={mpinError}
        summary={pending?.summary}
      />
    </div>
  );
}
