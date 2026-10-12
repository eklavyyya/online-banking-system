import { useState } from 'react';
import { loanApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { formatCurrency, formatDate, formatPercent } from '../../utils/format';
import { Card, Spinner, PrimaryButton, SecondaryButton } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import MpinModal from '../../components/MpinModal';
import { useBusy } from '../_customer/hooks';
import { ErrorNotice, SuccessNotice } from '../_customer/Notice';
import { notifyNotificationsChanged } from '../_customer/notifyChanged';
import ScheduleTable from './ScheduleTable';
import { loanName } from './loanUtils';

function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-800 break-words">{children}</dd>
    </div>
  );
}

function Progress({ paid, total, closed }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{paid} of {total} EMIs paid</span>
        <span>{pct}%</span>
      </div>
      <div role="progressbar" aria-label="EMIs paid" aria-valuemin={0} aria-valuemax={total} aria-valuenow={paid} className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${closed ? 'bg-green-600' : 'bg-navy'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LoanCard({ loan, onChanged }) {
  const active = loan.status === 'Active';
  const tracked = active || loan.status === 'Closed';
  const name = loanName(loan.loanType);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState({ rows: null, loading: false, error: '' });
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState('');
  const [success, setSuccess] = useState('');
  const [paying, runPay] = useBusy();


  function closePay() { setPayOpen(false); setPayError(''); }

  async function loadSchedule() {
    setSchedule((s) => ({ ...s, loading: true, error: '' }));
    try {
      const { schedule: rows } = await loanApi.get(loan.id);
      setSchedule({ rows, loading: false, error: '' });
    } catch (err) {
      setSchedule({ rows: null, loading: false, error: apiErrorMessage(err) });
    }
  }

  function toggleSchedule() {
    const next = !scheduleOpen;
    setScheduleOpen(next);
    if (next && !schedule.rows) loadSchedule();
  }

  function pay(mpin) {
    setPayError('');
    return runPay(async () => {
      try {
        const res = await loanApi.payEmi(loan.id, mpin);
        setPayOpen(false);
        const closed = res.loan?.status === 'Closed';
        setSuccess(
          `Instalment ${res.payment.installment} of ${loan.tenureMonths} paid (${formatCurrency(res.payment.emi)}). Reference number: ${res.referenceNumber}.`
          + (closed ? ' Your loan is now fully repaid and closed.' : ''),
        );
        notifyNotificationsChanged();
        onChanged(res.loan);
        if (scheduleOpen) loadSchedule(); else setSchedule((s) => ({ ...s, rows: null }));
      } catch (err) {
        setPayError(apiErrorMessage(err));
      }
    });
  }

  const summary = {
    Loan: name,
    Instalment: `${loan.emisPaid + 1} of ${loan.tenureMonths}`,
    'Due date': formatDate(loan.nextEmiDate),
    Amount: formatCurrency(loan.nextEmiAmount ?? loan.emiAmount),
    'Debited from': loan.accountNumberMasked,
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold font-serif text-navy">{name}</h2>
          <p className="text-xs text-gray-500">Applied on {formatDate(loan.createdAt)}</p>
        </div>
        <StatusBadge status={loan.status} />
      </div>

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 mb-4">
        <Item label="Principal">{formatCurrency(loan.principalAmount)}</Item>
        <Item label="Interest rate">{formatPercent(loan.interestRate)} p.a.</Item>
        <Item label="Tenure">{loan.tenureMonths} months</Item>
        <Item label="EMI">{formatCurrency(loan.emiAmount)}</Item>
        {tracked && <Item label="Outstanding balance">{formatCurrency(loan.outstandingBalance ?? 0)}</Item>}
        {active && <Item label="Next EMI date">{formatDate(loan.nextEmiDate)}</Item>}
        <Item label="Disbursal account">{loan.accountNumberMasked || '—'}</Item>
        <Item label="Purpose">{loan.purpose || '—'}</Item>
      </dl>

      {tracked && <div className="mb-4"><Progress paid={loan.emisPaid} total={loan.tenureMonths} closed={!active} /></div>}

      {loan.status === 'Applied' && (
        <p className="text-sm rounded-lg bg-blue-50 text-blue-800 px-3 py-2">Awaiting bank review</p>
      )}
      {loan.status === 'Rejected' && (
        <div className="text-sm rounded-lg bg-red-50 text-red-800 px-3 py-2">
          <p className="font-medium">Application not approved</p>
          <p>Reason: {loan.rejectionReason || 'No reason was recorded.'}</p>
        </div>
      )}
      {loan.status === 'Closed' && (
        <p className="text-sm rounded-lg bg-green-50 text-green-800 px-3 py-2">Fully repaid</p>
      )}

      <SuccessNotice message={success} className="mt-1" />

      {active && (
        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={toggleSchedule} aria-expanded={scheduleOpen} aria-controls={`schedule-${loan.id}`}>
            {scheduleOpen ? 'Hide schedule' : 'View schedule'}
          </SecondaryButton>
          <PrimaryButton onClick={() => { setSuccess(''); setPayOpen(true); }}>Pay EMI</PrimaryButton>
        </div>
      )}

      {active && scheduleOpen && (
        <div id={`schedule-${loan.id}`} className="mt-4">
          {schedule.loading && !schedule.rows && <Spinner />}
          <ErrorNotice message={schedule.error} />
          {schedule.rows && <ScheduleTable rows={schedule.rows} withDates label={`${name} repayment schedule`} />}
        </div>
      )}

      <MpinModal
        open={payOpen}
        title="Pay EMI"
        confirmLabel="Pay EMI"
        summary={summary}
        loading={paying}
        error={payError}
        onCancel={closePay}
        onConfirm={pay}
      />
    </Card>
  );
}
