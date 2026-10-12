import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api';
import useLoad from '../../hooks/useLoad';
import { PageHeader, SuccessBanner, Tabs } from '../../components/ui';
import TransactionsTab from './_parts/TransactionsTab';
import FlagsTab from './_parts/FlagsTab';

export default function AdminTransactionsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'flags' ? 'flags' : 'transactions';
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');

  // The count on the tab is the number of open flags; it refreshes whenever a flag changes.
  const openFlags = useLoad(() => adminApi.flags({ status: 'Open', pageSize: 1 }), [version]);
  const changed = () => setVersion((v) => v + 1);

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Monitor activity across all accounts and flag anything that needs a second look" />
      <SuccessBanner message={notice} />
      <Tabs
        tabs={[
          { key: 'transactions', label: 'Transactions' },
          { key: 'flags', label: 'Flagged items', count: openFlags.data ? openFlags.data.total : null },
        ]}
        active={tab}
        onChange={(key) => { setNotice(''); setParams({ tab: key }); }}
      />
      {/* Both panels stay mounted so each keeps its filters while you switch. */}
      <div role="tabpanel" hidden={tab !== 'transactions'}>
        <TransactionsTab version={version} onChanged={changed} onNotice={setNotice} />
      </div>
      <div role="tabpanel" hidden={tab !== 'flags'}>
        <FlagsTab version={version} onChanged={changed} onNotice={setNotice} />
      </div>
    </div>
  );
}
