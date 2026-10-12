import { Link } from 'react-router-dom';
import { adminApi } from '../../api';
import useLoad from '../../hooks/useLoad';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';
import { Card, PageHeader, ErrorBanner, Spinner, StatCard, EmptyState } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import BroadcastCard from './_parts/BroadcastCard';

function ActionStat({ to, label, value, caption, tone }) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}. Review`}
      className="block rounded-xl transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
    >
      <StatCard
        label={label}
        value={value}
        tone={value > 0 ? tone : 'default'}
        hint={<><span>{caption}</span> <span className="font-semibold text-navy whitespace-nowrap">Review &rarr;</span></>}
      />
    </Link>
  );
}

function AttentionList({ title, viewAllTo, viewAllLabel, state, empty, children }) {
  const { data, error, loading } = state;
  const items = data?.items || [];
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif text-lg font-bold text-navy">{title}</h2>
        <Link to={viewAllTo} aria-label={viewAllLabel} className="text-sm font-medium text-navy hover:underline whitespace-nowrap">View all &rarr;</Link>
      </div>
      <ErrorBanner message={error} />
      {loading && !data && <Spinner />}
      {data && items.length === 0 && <EmptyState>{empty}</EmptyState>}
      {items.length > 0 && <ul className="divide-y divide-gray-100">{items.map(children)}</ul>}
      {data && data.total > items.length && (
        <p className="text-xs text-gray-400 mt-3">Showing {items.length} of {data.total}</p>
      )}
    </Card>
  );
}

export default function AdminDashboardPage() {
  const overview = useLoad(() => adminApi.overview(), []);
  const loans = useLoad(() => adminApi.loans({ status: 'Applied', pageSize: 5 }), []);
  const requests = useLoad(() => adminApi.serviceRequests({ status: 'Open', pageSize: 5 }), []);
  const o = overview.data;

  return (
    <div>
      <PageHeader title="Admin Overview" subtitle="What needs your attention today" />
      <ErrorBanner message={overview.error} />
      {overview.loading && !o && <Spinner />}

      {o && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <StatCard label="Customers" value={formatNumber(o.customers)} hint={`${o.activeCustomers} active · ${o.inactiveCustomers} inactive`} />
          <ActionStat to="/admin/loans?status=Applied" label="Pending loan applications" value={o.pendingLoanApplications} caption="Awaiting a decision." tone="warn" />
          <ActionStat to="/admin/service-requests?status=Open" label="Open service requests" value={o.openServiceRequests} caption="Open or in progress." tone="warn" />
          <ActionStat to="/admin/transactions?tab=flags" label="Open review flags" value={o.openFlags} caption="Flagged for review." tone="bad" />
          <StatCard label="Transactions today" value={formatNumber(o.transactionsToday)} />
          <StatCard label="Failed today" value={formatNumber(o.failedToday)} tone={o.failedToday > 0 ? 'bad' : 'default'} />
          <div className="col-span-2 min-w-0">
            <StatCard label="Value today" value={formatCurrency(o.transactionValueToday)} hint="Successful transactions" />
          </div>
        </div>
      )}

      <h2 className="sr-only">Needs attention</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <AttentionList
          title="Loan applications to review"
          viewAllTo="/admin/loans?status=Applied"
          viewAllLabel="View all pending loan applications"
          state={loans}
          empty="No applications are waiting. All caught up."
        >
          {(l) => (
            <li key={l.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{l.applicantName || 'Unknown applicant'}</p>
                <p className="text-xs text-gray-500">{l.loanType} loan · {formatCurrency(l.principalAmount)} · {l.tenureMonths} months</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(l.createdAt)}</span>
            </li>
          )}
        </AttentionList>

        <AttentionList
          title="Service requests to handle"
          viewAllTo="/admin/service-requests?status=Open"
          viewAllLabel="View all open service requests"
          state={requests}
          empty="No open requests. All caught up."
        >
          {(r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-gray-800 min-w-0 truncate">
                  <span className="font-mono text-xs text-gray-500 mr-2">{r.ref}</span>{r.typeLabel} · {r.customerName}
                </p>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{r.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">Raised {formatDate(r.createdAt)}</p>
            </li>
          )}
        </AttentionList>
      </div>

      <BroadcastCard />
    </div>
  );
}
