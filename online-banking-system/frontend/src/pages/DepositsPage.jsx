import { useEffect, useState } from 'react';
import { accountsApi, depositApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { accountLabel, formatCurrency, formatDate } from '../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, PrimaryButton, DangerButton, Field, Input, Select, EmptyState } from '../components/ui';
import StatusBadge from '../components/StatusBadge';
import MpinModal from '../components/MpinModal';

const EMPTY_FORM = { accountId: '', depositType: 'FD', principalAmount: '', tenureMonths: '12' };

export default function DepositsPage() {
  const [deposits, setDeposits] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // The MPIN dialog serves two actions: opening a deposit and closing one early (SRS S7).
  const [mpinFor, setMpinFor] = useState(null); // { kind: 'open' | 'close', summary, deposit? }
  const [mpinError, setMpinError] = useState('');
  const [working, setWorking] = useState(false);

  function load() {
    depositApi.list().then(setDeposits).catch((err) => setError(apiErrorMessage(err)));
    accountsApi.list().then(setAccounts).catch((err) => setError(apiErrorMessage(err)));
  }
  useEffect(load, []);

  const isRd = form.depositType === 'RD';
  const tenure = Number(form.tenureMonths);
  const amount = Number(form.principalAmount);

  function startOpen(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    const account = accounts.find((a) => String(a.id) === form.accountId);
    if (isRd && tenure < 6) { setError('A recurring deposit needs a tenure of at least 6 months.'); return; }
    if (tenure > 120) { setError('The tenure cannot exceed 120 months.'); return; }
    if (account && amount > Number(account.balance)) { setError('The selected account does not have enough balance for this amount.'); return; }
    setMpinError('');
    setMpinFor({
      kind: 'open',
      summary: {
        'From account': accountLabel(account),
        'Deposit': isRd ? 'Recurring deposit (RD)' : 'Fixed deposit (FD)',
        [isRd ? 'Monthly instalment' : 'Principal']: formatCurrency(amount),
        'Tenure': `${tenure} months`,
        ...(isRd ? { 'Total commitment': formatCurrency(amount * tenure) } : {}),
      },
    });
  }

  function startClose(d) {
    setError(''); setSuccess(''); setMpinError('');
    setMpinFor({
      kind: 'close',
      deposit: d,
      summary: {
        'Deposit': `${d.depositType} · ${d.interestRate}% p.a.`,
        'Account': d.accountNumberMasked,
        'Matures on': formatDate(d.maturityDate),
        'Note': 'Premature closure: interest is paid at 1 percentage point below the deposit rate, for the elapsed months only.',
      },
    });
  }

  async function handleMpin(mpin) {
    setWorking(true); setMpinError('');
    try {
      if (mpinFor.kind === 'open') {
        await depositApi.open({
          accountId: Number(form.accountId),
          depositType: form.depositType,
          principalAmount: amount,
          tenureMonths: tenure,
          mpin,
        });
        setSuccess(`${form.depositType} opened successfully.`);
        setForm(EMPTY_FORM);
        setShowForm(false);
      } else {
        const res = await depositApi.closePrematurely(mpinFor.deposit.id, mpin);
        setSuccess(`Closed. Proceeds of ${formatCurrency(res.proceeds)} credited (penalized rate ${res.penalizedRate}%).`);
      }
      setMpinFor(null);
      load();
    } catch (err) {
      setMpinError(apiErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  if (!deposits || !accounts) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Fixed & Recurring Deposits"
        subtitle="Open a new deposit or manage existing ones"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Open Deposit'}</PrimaryButton>}
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {showForm && (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={startOpen} className="space-y-3">
            <Field label="Source / Linked Account">
              <Select required value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                <option value="">Select account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} — {formatCurrency(a.balance)}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-medium text-gray-500 mb-1" id="deposit-type-label">Type</span>
                <div className="flex gap-2" role="group" aria-labelledby="deposit-type-label">
                  {['FD', 'RD'].map((t) => (
                    <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, depositType: t }))} aria-pressed={form.depositType === t}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.depositType === t ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Tenure (months)" hint={isRd ? '6 to 120 months' : 'Up to 120 months'}>
                <Input type="number" min={isRd ? 6 : 1} max="120" required value={form.tenureMonths}
                  onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))} />
              </Field>
            </div>
            <Field
              label={isRd ? 'Monthly Installment (₹)' : 'Principal Amount (₹)'}
              hint={isRd
                ? `The first instalment is debited now; the rest are debited monthly${amount > 0 && tenure > 0 ? ` (total commitment ${formatCurrency(amount * tenure)})` : ''}.`
                : 'The interest rate is set automatically based on deposit type and tenure.'}
            >
              <Input type="number" min="1" step="0.01" required value={form.principalAmount}
                onChange={(e) => setForm((f) => ({ ...f, principalAmount: e.target.value }))} />
            </Field>
            <PrimaryButton type="submit" className="w-full">Continue</PrimaryButton>
          </form>
        </Card>
      )}

      {deposits.length === 0 && <Card><EmptyState>No deposits yet.</EmptyState></Card>}

      {deposits.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {deposits.map((d) => {
            const rd = d.depositType === 'RD';
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{d.depositType} · {d.interestRate}% p.a.</p>
                    <p className="text-xs text-gray-400">{d.tenureMonths} months · matures {formatDate(d.maturityDate)}</p>
                    <p className="text-xs text-gray-400">Account {d.accountNumberMasked}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-400">{rd ? 'Monthly instalment' : 'Principal'}</p>
                    <p className="font-medium text-gray-700">{formatCurrency(rd ? d.installmentAmount : d.principalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{d.status === 'Matured' ? 'Paid out' : 'Maturity Amount'}</p>
                    <p className="font-medium text-navy">{formatCurrency(d.maturityAmount)}</p>
                  </div>
                </div>
                {rd && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{d.installmentsPaid} of {d.tenureMonths} instalments paid</span>
                      {d.status === 'Active' && d.nextInstallmentDate && <span>Next: {formatDate(d.nextInstallmentDate)}</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={d.tenureMonths} aria-valuenow={d.installmentsPaid} aria-label="Instalments paid">
                      <div className="h-full bg-navy" style={{ width: `${Math.min(100, (d.installmentsPaid / d.tenureMonths) * 100)}%` }} />
                    </div>
                    {d.installmentOverdue && (
                      <p className="text-xs text-amber-700 mt-2">An instalment is overdue. It is collected automatically once the linked account has enough balance.</p>
                    )}
                  </div>
                )}
                {d.status === 'Active' && (
                  <DangerButton onClick={() => startClose(d)} className="w-full">Close Prematurely</DangerButton>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <MpinModal
        open={!!mpinFor}
        title={mpinFor?.kind === 'close' ? 'Close deposit early?' : 'Confirm with MPIN'}
        confirmLabel={mpinFor?.kind === 'close' ? 'Close deposit' : 'Open deposit'}
        summary={mpinFor?.summary}
        loading={working}
        error={mpinError}
        onCancel={() => { setMpinFor(null); setMpinError(''); }}
        onConfirm={handleMpin}
      />
    </div>
  );
}
