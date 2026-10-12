import { useRef } from 'react';
import { Spinner, EmptyState, Card, PrimaryButton } from '../../components/ui';
import { LoadError } from '../_customer/Notice';
import LoanCard from './LoanCard';
import { sortLoans } from './loanUtils';

export default function MyLoansTab({ loans, loading, error, reload, onLoanChanged, onApply }) {
  // Order is decided once per visit (active first), then kept, so a card does not jump when its status changes after a payment.
  const order = useRef(null);
  if (loans && loans.length > 0 && !order.current) order.current = sortLoans(loans).map((l) => l.id);
  const rank = (id) => (order.current ? order.current.indexOf(id) : -1);

  if (error && !loans) return <LoadError message={error} onRetry={reload} />;
  if (!loans) return loading ? <Spinner /> : null;
  if (loans.length === 0) {
    return (
      <Card>
        <EmptyState>You have no loans yet. See what you are pre-approved for and apply in a few steps.</EmptyState>
        <div className="text-center"><PrimaryButton onClick={onApply}>Apply for a loan</PrimaryButton></div>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {error && <LoadError message={error} onRetry={reload} />}
      {[...loans].sort((a, b) => rank(a.id) - rank(b.id) || b.id - a.id).map((loan) => <LoanCard key={loan.id} loan={loan} onChanged={onLoanChanged} />)}
    </div>
  );
}
