import { useState } from 'react';
import { loanApi } from '../api';
import useLoad from '../hooks/useLoad';
import { PageHeader, Tabs } from '../components/ui';
import { SuccessNotice } from './_customer/Notice';
import { notifyNotificationsChanged } from './_customer/notifyChanged';
import MyLoansTab from './loans/MyLoansTab';
import ApplyTab from './loans/ApplyTab';
import CalculatorTab from './loans/CalculatorTab';
import { loanName } from './loans/loanUtils';
import { formatCurrency } from '../utils/format';

export default function LoansPage() {
  const [tab, setTab] = useState('mine');
  const [success, setSuccess] = useState('');
  const { data, error, loading, reload, setData } = useLoad(() => loanApi.list(), []);
  const loans = data?.loans || null;

  // A paid EMI returns the fresh loan: show it at once, then confirm with a reload.
  function loanChanged(updated) {
    if (updated) setData((d) => ({ ...d, loans: (d?.loans || []).map((l) => (l.id === updated.id ? updated : l)) }));
    reload();
  }

  function applied(loan) {
    setSuccess(`Your ${loanName(loan.loanType).toLowerCase()} application for ${formatCurrency(loan.principalAmount)} over ${loan.tenureMonths} months has been submitted for review. You will be notified once the bank decides.`);
    notifyNotificationsChanged();
    reload();
    setTab('mine');
  }

  function changeTab(key) {
    setTab(key);
    if (key !== 'mine') setSuccess('');
  }

  const tabs = [
    { key: 'mine', label: 'My loans', count: loans ? loans.length : undefined },
    { key: 'apply', label: 'Apply' },
    { key: 'calc', label: 'EMI calculator' },
  ];

  return (
    <div>
      <PageHeader title="Loans" subtitle="Track your loans, pay EMIs, apply for a new loan or plan one" />
      <Tabs tabs={tabs} active={tab} onChange={changeTab} />
      <div role="tabpanel" aria-label={tabs.find((t) => t.key === tab).label}>
        {tab === 'mine' && (
          <>
            <SuccessNotice message={success} />
            <MyLoansTab loans={loans} loading={loading} error={error} reload={reload} onLoanChanged={loanChanged} onApply={() => changeTab('apply')} />
          </>
        )}
        {tab === 'apply' && <ApplyTab onSubmitted={applied} />}
        {tab === 'calc' && <CalculatorTab />}
      </div>
    </div>
  );
}
