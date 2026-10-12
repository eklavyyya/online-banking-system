import { useCallback } from 'react';
import { cardApi } from '../api';
import useLoad from '../hooks/useLoad';
import { PageHeader, Spinner, Card, EmptyState } from '../components/ui';
import { LoadError } from './_customer/Notice';
import CardPanel from './cards/CardPanel';

export default function CardsPage() {
  const { data: cards, error, loading, reload, setData } = useLoad(() => cardApi.list(), []);

  // Apply a server response (or a single changed field) to one card without refetching the list.
  const patch = useCallback(
    (id, partial) => setData((list) => (list || []).map((c) => (c.id === id ? { ...c, ...partial } : c))),
    [setData],
  );

  return (
    <div>
      <PageHeader title="Cards" subtitle="Block a lost card, set spending limits and choose where each card can be used" />
      {error && !cards && <LoadError message={error} onRetry={reload} />}
      {!cards && loading && <Spinner />}
      {cards && cards.length === 0 && <Card><EmptyState>No cards are linked to your accounts yet.</EmptyState></Card>}
      {cards && cards.length > 0 && (
        <div className="space-y-5">
          {cards.map((card) => <CardPanel key={card.id} card={card} onPatch={patch} />)}
        </div>
      )}
    </div>
  );
}
