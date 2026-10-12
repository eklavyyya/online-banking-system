import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountsApi, cardApi, depositApi, loanApi, notificationApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, formatDateTime, maskAccount } from '../utils/format';
import { Card, PageHeader, ErrorBanner, Spinner, StatCard } from '../components/ui';
import StatusBadge from '../components/StatusBadge';

// Each side-panel tile is optional: if its call fails the tile is simply left out,
// so a problem in one module never blocks the account overview.
const settle = (promise) => promise.then((value) => ({ ok: true, value })).catch(() => ({ ok: false }));

export default function DashboardPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [extras, setExtras] = useState({});
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    accountsApi.list()
      .then(async (list) => {
        if (cancelled) return;
        setAccounts(list);
        const [deposits, loans, cards, unread, ...histories] = await Promise.all([
          settle(depositApi.list()),
          settle(loanApi.list()),
          settle(cardApi.list()),
          settle(notificationApi.unreadCount()),
          ...list.map((a) => settle(accountsApi.transactions(a.id))),
        ]);
        if (cancelled) return;
        setExtras({ deposits, loans, cards, unread });
        const seen = new Map();
        histories.forEach((h) => (h.ok ? h.value : []).forEach((t) => seen.set(`${t.id}-${t.direction}`, t)));
        const all = [...seen.values()].filter((t) => t.status === 'Success')
          .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));
        setRecent(all.slice(0, 5));
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err)));
    return () => { cancelled = true; };
  }, []);

  const totalBalance = accounts?.reduce((sum, a) => sum + Number(a.balance), 0) ?? 0;

  const loanTile = useMemo(() => {
    if (!extras.loans?.ok) return null;
    const active = (extras.loans.value.loans || []).filter((l) => l.status === 'Active');
    if (active.length === 0) return { value: 'None', hint: 'No active loans' };
    const next = active.filter((l) => l.nextEmiDate).sort((a, b) => new Date(a.nextEmiDate) - new Date(b.nextEmiDate))[0];
    return {
      value: `${active.length} active`,
      hint: next ? `Next EMI ${formatCurrency(next.nextEmiAmount)} on ${formatDate(next.nextEmiDate)}` : undefined,
    };
  }, [extras.loans]);

  const depositTile = extras.deposits?.ok
    ? (() => {
        const active = extras.deposits.value.filter((d) => d.status === 'Active');
        const overdue = active.some((d) => d.installmentOverdue);
        return { value: `${active.length} active`, hint: overdue ? 'An RD instalment is overdue' : 'FD / RD', tone: overdue ? 'warn' : 'default' };
      })()
    : null;

  const cardTile = extras.cards?.ok
    ? (() => {
        const cards = extras.cards.value;
        const blocked = cards.filter((c) => c.status !== 'Active').length;
        return { value: `${cards.length - blocked} active`, hint: blocked ? `${blocked} blocked or awaiting reissue` : 'All cards active', tone: blocked ? 'warn' : 'default' };
      })()
    : null;

  return (
    <div>
      <PageHeader title="Account Dashboard" subtitle="All accounts linked to your profile" />
      <ErrorBanner message={error} />

      {!accounts && !error && <Spinner />}

      {accounts && (
        <>
          <p className="text-xs text-gray-500 mb-4" data-testid="last-login">
            {user?.previousLoginAt
              ? <>Last sign-in: <span className="font-medium text-gray-700">{formatDateTime(user.previousLoginAt)}</span></>
              : 'Welcome! This is your first sign-in.'}
          </p>

          <Card className="mb-6 bg-navy text-white border-none">
            <p className="text-ice text-sm mb-1">Total balance across {accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
            <p className="text-3xl font-bold font-serif">{formatCurrency(totalBalance)}</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((acc) => (
              <Link key={acc.id} to={`/accounts/${acc.id}`} aria-label={`${acc.accountType} account ${maskAccount(acc.accountNumber)}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{acc.accountType} Account</p>
                      <p className="font-mono text-sm text-gray-600 mt-0.5">{maskAccount(acc.accountNumber)}</p>
                    </div>
                    <StatusBadge status={acc.status} />
                  </div>
                  <p className="text-2xl font-bold text-navy">{formatCurrency(acc.balance)}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Holder role: <span className="font-medium text-gray-600">{acc.holderRole}</span>
                    {acc.holderRole === 'Joint' && ' — shared account'}
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          {accounts.length === 0 && (
            <Card>
              <p className="text-gray-500 text-sm">No accounts are linked to your profile yet.</p>
            </Card>
          )}

          {(depositTile || loanTile || cardTile || extras.unread?.ok) && (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mt-6">
              {depositTile && <Link to="/deposits"><StatCard label="Deposits" value={depositTile.value} hint={depositTile.hint} tone={depositTile.tone} /></Link>}
              {loanTile && <Link to="/loans"><StatCard label="Loans" value={loanTile.value} hint={loanTile.hint} /></Link>}
              {cardTile && <Link to="/cards"><StatCard label="Cards" value={cardTile.value} hint={cardTile.hint} tone={cardTile.tone} /></Link>}
              {extras.unread?.ok && (
                <Link to="/notifications">
                  <StatCard label="Notifications" value={extras.unread.value} hint={extras.unread.value === 1 ? 'unread alert' : 'unread alerts'} tone={extras.unread.value > 0 ? 'warn' : 'default'} />
                </Link>
              )}
            </div>
          )}

          {recent && recent.length > 0 && (
            <Card className="mt-6">
              <h3 className="font-semibold text-gray-800 mb-3">Recent activity</h3>
              <ul className="divide-y divide-gray-100">
                {recent.map((t) => (
                  <li key={`${t.id}-${t.direction}`} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="text-gray-800 truncate">{t.description}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(t.initiatedAt)}</p>
                    </div>
                    <span className={`font-semibold whitespace-nowrap ${t.direction === 'credit' ? 'text-green-700' : 'text-gray-800'}`}>
                      {t.direction === 'credit' ? '+' : '−'}{formatCurrency(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
