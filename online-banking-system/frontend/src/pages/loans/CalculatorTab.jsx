import { useMemo, useState } from 'react';
import { formatCurrency, formatPercent } from '../../utils/format';
import { Card, Input, PrimaryButton, SecondaryButton, StatCard, Spinner } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';
import { ErrorNotice } from '../_customer/Notice';
import ScheduleTable from './ScheduleTable';
import useEmiPreview from './useEmiPreview';
import { validateCalc, CALC_LIMITS } from './loanUtils';

const PREVIEW_ROWS = 12;

function ShareBar({ principal, interest }) {
  const total = principal + interest;
  const interestPct = total > 0 ? (interest / total) * 100 : 0;
  const principalPct = 100 - interestPct;
  return (
    <div>
      <div
        role="img"
        aria-label={`Principal is ${formatPercent(principalPct, 1)} and interest is ${formatPercent(interestPct, 1)} of the total payable`}
        className="flex h-4 rounded-full overflow-hidden bg-gray-100"
      >
        <div className="bg-navy" style={{ width: `${principalPct}%` }} />
        <div className="bg-gold" style={{ width: `${interestPct}%` }} />
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-gray-600">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm bg-navy" />Principal {formatCurrency(principal)} ({formatPercent(principalPct, 1)})</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm bg-gold" />Interest {formatCurrency(interest)} ({formatPercent(interestPct, 1)})</li>
      </ul>
    </div>
  );
}

export default function CalculatorTab() {
  const [form, setForm] = useState({ principal: '500000', rate: '10', tenure: '60' });
  const [showAll, setShowAll] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateCalc(form, formatCurrency), [form]);
  const valid = Object.keys(errors).length === 0;
  const preview = useEmiPreview(form, valid);
  const { result } = preview;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => (showErrors || form[key] !== '' ? errors[key] : undefined);

  function submit(e) {
    e.preventDefault();
    setShowErrors(true);
    if (valid) preview.runNow();
  }

  const rows = result ? (showAll ? result.schedule : result.schedule.slice(0, PREVIEW_ROWS)) : [];

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={submit} noValidate className="grid sm:grid-cols-3 gap-3 items-start" aria-label="EMI calculator">
          <LabeledField label="Loan amount (₹)" error={err('principal')} hint={`Up to ${formatCurrency(CALC_LIMITS.maxPrincipal)}`}>
            <Input type="number" inputMode="decimal" min="1" step="any" value={form.principal} onChange={set('principal')} />
          </LabeledField>
          <LabeledField label="Annual interest rate (%)" error={err('rate')} hint={`0 to ${CALC_LIMITS.maxRate}%`}>
            <Input type="number" inputMode="decimal" min="0" max={CALC_LIMITS.maxRate} step="any" value={form.rate} onChange={set('rate')} />
          </LabeledField>
          <LabeledField label="Tenure (months)" error={err('tenure')} hint={`${CALC_LIMITS.minTenure} to ${CALC_LIMITS.maxTenure} months`}>
            <Input type="number" inputMode="numeric" min="1" max={CALC_LIMITS.maxTenure} step="1" value={form.tenure} onChange={set('tenure')} />
          </LabeledField>
          <div className="sm:col-span-3 flex gap-3">
            <PrimaryButton type="submit" disabled={preview.status === 'loading'}>Calculate</PrimaryButton>
            <SecondaryButton type="button" onClick={() => { setForm({ principal: '', rate: '', tenure: '' }); setShowErrors(false); }}>Clear</SecondaryButton>
          </div>
        </form>
      </Card>

      <ErrorNotice message={preview.error} />

      <div aria-live="polite">
        {preview.status === 'loading' && !result && <Spinner />}
        {!result && preview.status === 'idle' && (
          <p className="text-sm text-gray-500 text-center py-6">Enter a valid amount, rate and tenure to see the EMI.</p>
        )}
      </div>

      {result && (
        <div className={preview.status === 'loading' ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Monthly EMI" value={formatCurrency(result.emi)} hint={`${result.tenureMonths} instalments at ${formatPercent(result.annualRatePercent)} p.a.`} />
            <StatCard label="Total interest" value={formatCurrency(result.totalInterest)} />
            <StatCard label="Total payable" value={formatCurrency(result.totalPayable)} />
          </div>

          <Card className="mb-4">
            <h2 className="font-semibold text-gray-800 mb-3">Principal vs interest</h2>
            <ShareBar principal={result.principal} interest={result.totalInterest} />
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-gray-800">Amortisation schedule</h2>
              {result.schedule.length > PREVIEW_ROWS && (
                <SecondaryButton className="py-1.5" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? `Show first ${PREVIEW_ROWS}` : `Show all ${result.schedule.length}`}
                </SecondaryButton>
              )}
            </div>
            <ScheduleTable rows={rows} label="Amortisation schedule" tall={showAll} />
            {!showAll && result.schedule.length > PREVIEW_ROWS && (
              <p className="text-xs text-gray-500 mt-2">Showing the first {PREVIEW_ROWS} of {result.schedule.length} instalments.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
