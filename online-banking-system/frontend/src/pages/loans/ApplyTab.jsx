import { useEffect, useMemo, useRef, useState } from 'react';
import { accountsApi, loanApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { formatCurrency, formatPercent, accountLabel } from '../../utils/format';
import useLoad from '../../hooks/useLoad';
import { Card, Input, Select, Spinner, PrimaryButton } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';
import { ErrorNotice, LoadError } from '../_customer/Notice';
import { useBusy } from '../_customer/hooks';
import useEmiPreview from './useEmiPreview';
import { loanName } from './loanUtils';

const PURPOSE_MAX = 150;

function validate(form, product) {
  const errors = {};
  if (!form.accountId) errors.accountId = 'Choose the account the loan will be paid into.';
  if (!product) {
    errors.loanType = 'Choose a loan type.';
    return errors;
  }
  const amount = Number(form.amount);
  if (form.amount === '') errors.amount = 'Enter the loan amount.';
  else if (!(amount > 0)) errors.amount = 'Amount must be greater than zero.';
  else if (amount < product.minAmount) errors.amount = `The minimum ${loanName(product.loanType).toLowerCase()} is ${formatCurrency(product.minAmount)}.`;
  else if (amount > product.preApprovedLimit) errors.amount = `Your pre-approved limit for a ${loanName(product.loanType).toLowerCase()} is ${formatCurrency(product.preApprovedLimit)}.`;

  const tenure = Number(form.tenure);
  if (form.tenure === '') errors.tenure = 'Enter the tenure in months.';
  else if (!Number.isInteger(tenure)) errors.tenure = 'Tenure must be a whole number of months.';
  else if (tenure < product.minTenureMonths || tenure > product.maxTenureMonths) {
    errors.tenure = `${loanName(product.loanType)}s need a tenure of ${product.minTenureMonths} to ${product.maxTenureMonths} months.`;
  }
  if (form.purpose.length > PURPOSE_MAX) errors.purpose = `Purpose can be at most ${PURPOSE_MAX} characters.`;
  return errors;
}

function ProductCard({ product, selected, onSelect }) {
  const name = loanName(product.loanType);
  return (
    <Card className={`p-4 flex flex-col ${selected ? 'ring-2 ring-navy' : ''} ${product.eligible ? '' : 'bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-navy">{name}</h3>
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{formatPercent(product.interestRate)} p.a.</span>
      </div>
      <dl className="text-sm space-y-1 mb-3">
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Minimum amount</dt><dd className="font-medium text-gray-800">{formatCurrency(product.minAmount)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Pre-approved limit</dt><dd className="font-medium text-gray-800">{product.eligible ? formatCurrency(product.preApprovedLimit) : '—'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-gray-500">Tenure</dt><dd className="font-medium text-gray-800">{product.minTenureMonths} to {product.maxTenureMonths} months</dd></div>
      </dl>
      <div className="mt-auto">
        {product.eligible ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Eligible</span>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(product.loanType)}
              className="text-sm font-medium text-navy underline underline-offset-2 hover:text-navy-light"
            >
              {selected ? 'Selected' : `Choose ${name.toLowerCase()}`}
            </button>
          </div>
        ) : (
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Not eligible: balance too low</span>
        )}
      </div>
    </Card>
  );
}

function Preview({ preview }) {
  const { status, result, error } = preview;
  return (
    <Card className="bg-ice/30 border-ice" >
      <h3 className="font-semibold text-navy mb-3">Your estimate</h3>
      <div aria-live="polite">
        {status === 'idle' && <p className="text-sm text-gray-600">Enter a valid amount and tenure to see your EMI.</p>}
        {status === 'error' && <p className="text-sm text-red-700">{error}</p>}
        {(status === 'loading' || status === 'ok') && !result && <p className="text-sm text-gray-600">Calculating…</p>}
        {result && status !== 'error' && (
          <dl className={`space-y-2 text-sm transition-opacity ${status === 'loading' ? 'opacity-50' : ''}`}>
            <div className="flex justify-between gap-2"><dt className="text-gray-600">Monthly EMI</dt><dd className="font-bold text-navy text-lg">{formatCurrency(result.emi)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-gray-600">Total interest</dt><dd className="font-medium text-gray-800">{formatCurrency(result.totalInterest)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-gray-600">Total payable</dt><dd className="font-medium text-gray-800">{formatCurrency(result.totalPayable)}</dd></div>
          </dl>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-3">Indicative figures at the product rate. The bank confirms the final terms when it reviews your application.</p>
    </Card>
  );
}

export default function ApplyTab({ onSubmitted }) {
  const offersLoad = useLoad(() => loanApi.offers(), []);
  const accountsLoad = useLoad(() => accountsApi.list(), []);
  const [form, setForm] = useState({ accountId: '', loanType: '', amount: '', tenure: '', purpose: '' });
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, run] = useBusy();
  const formRef = useRef(null);

  const offers = offersLoad.data;
  const accounts = useMemo(() => (accountsLoad.data || []).filter((a) => a.status === 'Active'), [accountsLoad.data]);
  const eligible = useMemo(() => (offers?.products || []).filter((p) => p.eligible), [offers]);
  const product = eligible.find((p) => p.loanType === form.loanType);
  const chosenAccount = accounts.find((a) => String(a.id) === form.accountId);

  // Sensible defaults once the data is in: first account, first eligible product.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      accountId: f.accountId || (accounts[0] ? String(accounts[0].id) : ''),
      loanType: f.loanType || eligible[0]?.loanType || '',
    }));
  }, [accounts, eligible]);

  const errors = useMemo(() => validate(form, product), [form, product]);
  const amountOk = !errors.amount && !errors.tenure && !!product && form.amount !== '' && form.tenure !== '';
  const preview = useEmiPreview({ principal: form.amount, rate: product?.interestRate, tenure: form.tenure }, amountOk);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => (showErrors || (form[key] !== '' && key !== 'accountId' && key !== 'loanType') ? errors[key] : undefined);

  function submit(e) {
    e.preventDefault();
    setSubmitError('');
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return undefined;
    }
    return run(async () => {
      try {
        const res = await loanApi.apply({
          accountId: Number(form.accountId),
          loanType: form.loanType,
          amount: Number(form.amount),
          tenureMonths: Number(form.tenure),
          purpose: form.purpose.trim() || undefined,
        });
        onSubmitted(res.loan);
      } catch (error) {
        setSubmitError(apiErrorMessage(error));
      }
    });
  }

  if ((offersLoad.error && !offers) || (accountsLoad.error && !accountsLoad.data)) {
    return <LoadError message={offersLoad.error || accountsLoad.error} onRetry={() => { offersLoad.reload(); accountsLoad.reload(); }} />;
  }
  if (!offers || !accountsLoad.data) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-ice/40 border border-ice px-4 py-3 text-sm text-navy">
        <p>Your total balance across active accounts: <strong>{formatCurrency(offers.totalBalance)}</strong></p>
        <p className="text-gray-700 mt-0.5">{offers.rule}</p>
      </div>

      <section aria-label="Loan products">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {offers.products.map((p) => (
            <ProductCard key={p.loanType} product={p} selected={form.loanType === p.loanType} onSelect={(loanType) => setForm((f) => ({ ...f, loanType }))} />
          ))}
        </div>
      </section>

      {eligible.length === 0 ? (
        <Card><p className="text-sm text-gray-600 text-center py-4">You are not pre-approved for any loan right now. Your limit grows with your balance.</p></Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <Card className="lg:col-span-2">
            <h2 className="font-semibold text-gray-800 mb-3">Apply for a loan</h2>
            <ErrorNotice message={submitError} />
            <form ref={formRef} onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-3">
              <LabeledField label="Disbursal account" error={err('accountId')} hint={chosenAccount ? `Balance ${formatCurrency(chosenAccount.balance)}` : undefined}>
                <Select value={form.accountId} onChange={set('accountId')}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </Select>
              </LabeledField>
              <LabeledField label="Loan type" error={err('loanType')}>
                <Select value={form.loanType} onChange={set('loanType')}>
                  {eligible.map((p) => <option key={p.loanType} value={p.loanType}>{loanName(p.loanType)} · {formatPercent(p.interestRate)} p.a.</option>)}
                </Select>
              </LabeledField>
              <LabeledField
                label="Amount (₹)"
                error={err('amount')}
                hint={product ? `${formatCurrency(product.minAmount)} to ${formatCurrency(product.preApprovedLimit)} (your pre-approved limit)` : undefined}
              >
                <Input type="number" inputMode="decimal" min="1" step="any" value={form.amount} onChange={set('amount')} />
              </LabeledField>
              <LabeledField
                label="Tenure (months)"
                error={err('tenure')}
                hint={product ? `${product.minTenureMonths} to ${product.maxTenureMonths} months` : undefined}
              >
                <Input type="number" inputMode="numeric" min="1" step="1" value={form.tenure} onChange={set('tenure')} />
              </LabeledField>
              <LabeledField label="Purpose (optional)" error={err('purpose')} hint={`${form.purpose.length} / ${PURPOSE_MAX}`} className="sm:col-span-2">
                <Input type="text" value={form.purpose} onChange={set('purpose')} placeholder="e.g. Home renovation" />
              </LabeledField>
              <div className="sm:col-span-2">
                <PrimaryButton type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? 'Submitting…' : 'Submit application'}</PrimaryButton>
              </div>
            </form>
          </Card>
          <Preview preview={preview} />
        </div>
      )}
    </div>
  );
}
