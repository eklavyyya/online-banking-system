import { useEffect, useState } from 'react';
import { accountsApi, billerApi, billPayApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { accountLabel, formatCurrency, formatDateTime } from '../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, PrimaryButton, SecondaryButton } from '../components/ui';
import StatusBadge from '../components/StatusBadge';
import MpinModal from '../components/MpinModal';
import ConfirmModal from '../components/ConfirmModal';

export default function BillsPage() {
  const [accounts, setAccounts] = useState(null);
  const [billers, setBillers] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showBillerForm, setShowBillerForm] = useState(false);
  const [billerForm, setBillerForm] = useState({ billerName: '', billerCategory: '', consumerNumber: '' });

  const [payForm, setPayForm] = useState({ sourceAccountId: '', billerId: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [mpinError, setMpinError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const [removeFor, setRemoveFor] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  function loadAll() {
    accountsApi.list().then(setAccounts).catch((err) => setError(apiErrorMessage(err)));
    billerApi.list().then(setBillers).catch((err) => setError(apiErrorMessage(err)));
    billPayApi.history().then(setHistory).catch((err) => setError(apiErrorMessage(err)));
  }
  useEffect(loadAll, []);

  async function handleAddBiller(e) {
    e.preventDefault();
    setError('');
    try {
      await billerApi.add(billerForm);
      setBillerForm({ billerName: '', billerCategory: '', consumerNumber: '' });
      setShowBillerForm(false);
      loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function confirmRemoveBiller() {
    setRemoving(true); setRemoveError('');
    try {
      await billerApi.remove(removeFor.id);
      setRemoveFor(null);
      loadAll();
    } catch (err) {
      setRemoveError(apiErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  async function handlePay(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setSubmitting(true);
    try {
      const payload = { sourceAccountId: Number(payForm.sourceAccountId), amount: Number(payForm.amount) };
      if (payForm.billerId) payload.billerId = Number(payForm.billerId);
      const res = await billPayApi.initiate(payload);
      const from = accounts.find((a) => a.id === payload.sourceAccountId);
      const biller = billers.find((b) => b.id === payload.billerId);
      setPending({
        transactionId: res.transactionId,
        // names and masked numbers only, never database ids (OI-09)
        summary: {
          'From account': accountLabel(from),
          'Paying': biller ? `${biller.billerName} (${biller.billerCategory})` : 'Direct recharge',
          'Amount': formatCurrency(payload.amount),
        },
      });
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
      const res = await billPayApi.confirm(pending.transactionId, mpin);
      setModalOpen(false);
      setSuccess(`Payment ${res.status}. Reference: ${res.referenceNumber || '—'}`);
      setPayForm({ sourceAccountId: '', billerId: '', amount: '' });
      loadAll();
    } catch (err) {
      setMpinError(apiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  if (!accounts || !billers || !history) return <Spinner />;

  return (
    <div>
      <PageHeader title="Bill Payments & Recharge" subtitle="Pay a saved biller, or recharge directly with no saved biller" />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Pay a Bill / Recharge</h3>
          <form onSubmit={handlePay} className="space-y-3">
            <div>
              <label htmlFor="pay-from" className="block text-xs font-medium text-gray-500 mb-1">From Account</label>
              <select id="pay-from" required value={payForm.sourceAccountId} onChange={(e) => setPayForm((f) => ({ ...f, sourceAccountId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
                <option value="">Select account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} — {formatCurrency(a.balance)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pay-biller" className="block text-xs font-medium text-gray-500 mb-1">Biller (leave blank for a direct recharge)</label>
              <select id="pay-biller" value={payForm.billerId} onChange={(e) => setPayForm((f) => ({ ...f, billerId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy">
                <option value="">— Direct recharge, no saved biller —</option>
                {billers.map((b) => <option key={b.id} value={b.id}>{b.billerName} ({b.billerCategory})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pay-amount" className="block text-xs font-medium text-gray-500 mb-1">Amount (₹)</label>
              <input id="pay-amount" type="number" min="1" step="0.01" required value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy" />
            </div>
            <PrimaryButton type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Validating…' : 'Continue'}
            </PrimaryButton>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Saved Billers</h3>
            <SecondaryButton onClick={() => setShowBillerForm((v) => !v)}>{showBillerForm ? 'Cancel' : '+ Add'}</SecondaryButton>
          </div>

          {showBillerForm && (
            <form onSubmit={handleAddBiller} className="space-y-2 mb-4 bg-gray-50 rounded-lg p-3">
              <input required placeholder="Biller name" value={billerForm.billerName}
                onChange={(e) => setBillerForm((f) => ({ ...f, billerName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <input required placeholder="Category (e.g. Electricity)" value={billerForm.billerCategory}
                onChange={(e) => setBillerForm((f) => ({ ...f, billerCategory: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <input required placeholder="Consumer number" value={billerForm.consumerNumber}
                onChange={(e) => setBillerForm((f) => ({ ...f, consumerNumber: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <PrimaryButton type="submit" className="w-full">Save Biller</PrimaryButton>
            </form>
          )}

          {billers.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No saved billers yet.</p>}
          <div className="space-y-2">
            {billers.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 border-b border-gray-50 last:border-0 pb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{b.billerName}</p>
                  <p className="text-xs text-gray-400 truncate">{b.billerCategory} · {b.consumerNumber}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${b.billerName}`}
                  onClick={() => { setRemoveFor(b); setRemoveError(''); }}
                  className="text-xs text-red-500 hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-gray-800 mb-4">Payment History</h3>
        {history.length === 0 && <p className="text-gray-400 text-sm text-center py-6">No payments yet.</p>}
        {history.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 text-gray-600">{formatDateTime(t.initiatedAt)}</td>
                  <td className="py-2.5 text-gray-600">{t.transactionType}</td>
                  <td className="py-2.5 text-right font-medium text-gray-800">{formatCurrency(t.amount)}</td>
                  <td className="py-2.5 text-right"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <MpinModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        loading={confirming}
        error={mpinError}
        summary={pending?.summary}
      />

      <ConfirmModal
        open={!!removeFor}
        title="Remove biller?"
        confirmLabel="Remove"
        danger
        loading={removing}
        error={removeError}
        onConfirm={confirmRemoveBiller}
        onCancel={() => setRemoveFor(null)}
      >
        <p>
          <span className="font-medium text-gray-800">{removeFor?.billerName}</span> ({removeFor?.consumerNumber}) will be removed from your saved billers.
          Past payments stay in your history.
        </p>
      </ConfirmModal>
    </div>
  );
}
