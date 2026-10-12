import { useMemo, useRef, useState } from 'react';
import { notificationApi } from '../api';
import { apiErrorMessage } from '../api/client';
import useLoad from '../hooks/useLoad';
import { Card, EmptyState, Pagination, PageHeader, PrimaryButton, Spinner } from '../components/ui';
import { ErrorNotice, SuccessNotice, LoadError } from './_customer/Notice';
import { useBusy, useDebounced } from './_customer/hooks';
import { notifyNotificationsChanged } from './_customer/notifyChanged';
import FeedFilters, { EMPTY_FILTERS } from './notifications/FeedFilters';
import NotificationItem from './notifications/NotificationItem';
import PreferencesPanel from './notifications/PreferencesPanel';

const PAGE_SIZE = 15;

export default function NotificationsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState({});
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [markingAll, runMarkAll] = useBusy();
  const pendingRef = useRef({});

  const q = useDebounced(filters.q.trim(), 350);
  const rangeError = filters.from && filters.to && filters.from > filters.to ? 'The "to" date must be on or after the "from" date.' : '';
  const lastData = useRef(null);

  const feed = useLoad(
    () => (rangeError
      ? Promise.resolve(lastData.current)
      : notificationApi.list({ page, pageSize: PAGE_SIZE, category: filters.category, isRead: filters.isRead, from: filters.from, to: filters.to, q })),
    [page, filters.category, filters.isRead, filters.from, filters.to, q, !!rangeError],
  );
  const { data, setData } = feed;
  lastData.current = data;

  const unreadCount = data?.unreadCount ?? null;
  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  function changeFilters(next) {
    setFilters(next);
    setPage(1);
    setSuccess('');
  }

  const patchItems = (fn, unread) => setData((d) => (d ? { ...d, items: d.items.map(fn), unreadCount: unread(d.unreadCount) } : d));

  async function markRead(id) {
    if (pendingRef.current[id]) return;
    pendingRef.current[id] = true;
    setPending((p) => ({ ...p, [id]: true }));
    setActionError(''); setSuccess('');
    try {
      await notificationApi.markRead(id);
      patchItems((n) => (n.id === id ? { ...n, isRead: true } : n), (c) => Math.max(0, c - 1));
      notifyNotificationsChanged();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      pendingRef.current[id] = false;
      setPending((p) => ({ ...p, [id]: false }));
    }
  }

  function markAllRead() {
    setActionError(''); setSuccess('');
    return runMarkAll(async () => {
      try {
        const res = await notificationApi.markAllRead();
        patchItems((n) => ({ ...n, isRead: true }), () => 0);
        setSuccess(res.updated ? `${res.updated} notification${res.updated === 1 ? '' : 's'} marked as read.` : 'Everything was already read.');
        notifyNotificationsChanged();
      } catch (err) {
        setActionError(apiErrorMessage(err));
      }
    });
  }

  const subtitle = unreadCount === null ? 'Alerts about your accounts and the bank' : unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up';

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={subtitle}
        action={<PrimaryButton onClick={markAllRead} disabled={markingAll || !unreadCount} className="shrink-0 ml-3">{markingAll ? 'Marking…' : 'Mark all as read'}</PrimaryButton>}
      />
      <a href="#alert-preferences" className="lg:hidden inline-block -mt-3 mb-4 text-sm font-medium text-navy underline underline-offset-2">Jump to alert preferences</a>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <section aria-labelledby="feed-heading" className="lg:col-span-2 min-w-0">
          <Card className="p-4 sm:p-6">
            <h2 id="feed-heading" className="font-semibold text-gray-800 text-lg mb-3">Your notifications</h2>
            <FeedFilters filters={filters} onChange={changeFilters} rangeError={rangeError} />

            <SuccessNotice message={success} />
            <ErrorNotice message={actionError} />
            {feed.error && !data && <LoadError message={feed.error} onRetry={feed.reload} />}
            {feed.error && data && <ErrorNotice message={feed.error} />}
            {!data && feed.loading && !rangeError && <Spinner />}

            {rangeError && <EmptyState>Fix the date range to see results.</EmptyState>}

            {data && !rangeError && (
              <>
                {data.items.length === 0 ? (
                  <EmptyState>{hasFilters ? 'No notifications match your filters.' : 'You have no notifications yet.'}</EmptyState>
                ) : (
                  <ul aria-busy={feed.loading} className={`divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden transition-opacity ${feed.loading ? 'opacity-60' : ''}`}>
                    {data.items.map((n) => (
                      <NotificationItem key={n.id} notification={n} pending={!!pending[n.id]} onRead={markRead} />
                    ))}
                  </ul>
                )}
                <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
              </>
            )}
          </Card>
        </section>

        <div className="lg:sticky lg:top-6">
          <PreferencesPanel />
        </div>
      </div>
    </div>
  );
}
