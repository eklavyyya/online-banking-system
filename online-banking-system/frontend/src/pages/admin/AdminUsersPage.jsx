import { useState } from 'react';
import { adminApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import useLoad from '../../hooks/useLoad';
import { formatDateTime } from '../../utils/format';
import {
  Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, EmptyState, Input, Select,
  PrimaryButton, SecondaryButton, DangerButton, Pagination,
} from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import AdminModal from './_parts/AdminModal';
import DataTable from './_parts/DataTable';
import FormField from './_parts/FormField';
import { CreateUserModal, EditUserModal } from './_parts/UserForms';
import { useDebounced, usePage } from './_parts/hooks';
import InlineError from './_parts/InlineError';

const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput.trim());
  const [status, setStatus] = useState('all');
  const [page, setPage] = usePage(`${q}|${status}`);
  const [modal, setModal] = useState(null); // { kind: 'create' | 'edit' | 'toggle', user? }
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState('');

  const { data, error, loading, reload } = useLoad(
    () => adminApi.users({ q, status: status === 'all' ? '' : status, role: 'customer', page, pageSize: PAGE_SIZE }),
    [q, status, page],
  );

  function closeModal() { setModal(null); setModalError(''); }
  function done(message) { setSuccess(message); setActionError(''); closeModal(); reload(); }

  async function toggleActive() {
    const { user } = modal;
    if (working) return;
    setWorking(true); setModalError('');
    try {
      if (user.isActive) await adminApi.deactivateUser(user.id); else await adminApi.activateUser(user.id);
      done(user.isActive ? `${user.username} has been deactivated and signed out.` : `${user.username} has been activated and can sign in again.`);
    } catch (err) {
      setModalError(apiErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function unlock(user) {
    if (working) return;
    setWorking(true); setSuccess(''); setActionError('');
    try {
      await adminApi.unlockUser(user.id);
      setSuccess(`Login and MPIN locks cleared for ${user.username}.`);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  const columns = [
    { key: 'username', header: 'Username', card: 'title', cell: (u) => <span className="font-medium text-gray-800">{u.username}</span> },
    { key: 'fullName', header: 'Full name', cell: (u) => u.fullName || '—' },
    {
      key: 'email',
      header: 'Email',
      className: 'min-w-[8rem] break-words',
      cell: (u) => {
        const [local, domain] = String(u.email || '').split('@');
        return domain === undefined ? u.email : <>{local}<wbr />@{domain}</>;
      },
    },
    { key: 'phone', header: 'Phone', className: 'whitespace-nowrap', cell: (u) => u.phoneNumber },
    {
      key: 'accounts',
      header: 'Accounts',
      cell: (u) => (u.accounts.length === 0 ? <span className="text-gray-400">None</span> : (
        <ul className="space-y-0.5">
          {u.accounts.map((a) => (
            <li key={a.id} className="text-xs whitespace-nowrap">
              <span className="font-mono text-gray-700">{a.accountNumberMasked}</span>{' '}
              <span className="text-gray-400">{a.accountType} · {a.holderRole}{a.status !== 'Active' ? ` · ${a.status}` : ''}</span>
            </li>
          ))}
        </ul>
      )),
    },
    {
      key: 'status',
      header: 'Status',
      card: 'badge',
      cell: (u) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={u.isActive ? 'Active' : 'Deactivated'} />
          {u.locked && <StatusBadge status="Locked" />}
        </span>
      ),
    },
    { key: 'lastLogin', header: 'Last login', className: 'whitespace-nowrap', cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never') },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      card: 'actions',
      cell: (u) => (
        <span className="flex flex-wrap gap-2">
          <SecondaryButton className="px-3 py-1.5" aria-label={`Edit ${u.username}`} onClick={() => { setSuccess(''); setModal({ kind: 'edit', user: u }); }}>Edit</SecondaryButton>
          {u.isActive
            ? <DangerButton className="px-3 py-1.5" aria-label={`Deactivate ${u.username}`} onClick={() => { setSuccess(''); setModal({ kind: 'toggle', user: u }); }}>Deactivate</DangerButton>
            : <SecondaryButton className="px-3 py-1.5" aria-label={`Activate ${u.username}`} onClick={() => { setSuccess(''); setModal({ kind: 'toggle', user: u }); }}>Activate</SecondaryButton>}
          {u.locked && <SecondaryButton className="px-3 py-1.5" aria-label={`Unlock ${u.username}`} disabled={working} onClick={() => unlock(u)}>Unlock</SecondaryButton>}
        </span>
      ),
    },
  ];

  const items = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Customer login accounts"
        action={<PrimaryButton onClick={() => { setSuccess(''); setModal({ kind: 'create' }); }} className="shrink-0 ml-3">+ Create customer</PrimaryButton>}
      />
      <SuccessBanner message={success} />
      <ErrorBanner message={actionError} />

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <FormField label="Search" className="flex-1">
            <Input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Username, name, email or phone" />
          </FormField>
          <FormField label="Status" className="sm:w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </FormField>
        </div>

        <ErrorBanner message={error} />
        {loading && !data && <Spinner />}
        {data && items.length === 0 && <EmptyState>{q || status !== 'all' ? 'No customers match these filters.' : 'No customers yet.'}</EmptyState>}
        {items.length > 0 && (
          <DataTable caption="Customers" columns={columns} rows={items} rowKey={(u) => u.id} dim={loading} />
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <CreateUserModal
        open={modal?.kind === 'create'}
        onClose={closeModal}
        onCreated={(u) => done(`Customer ${u.username} created. They can sign in now${u.mpinSet ? '' : ' and should set their MPIN from Profile'}.`)}
      />
      {modal?.kind === 'edit' && <EditUserModal key={modal.user.id} user={modal.user} onClose={closeModal} onSaved={done} />}

      <AdminModal open={modal?.kind === 'toggle'} title={modal?.user?.isActive ? 'Deactivate customer?' : 'Activate customer?'} onClose={closeModal} busy={working}>
        {modal?.kind === 'toggle' && (
          <>
            <InlineError message={modalError} />
            {modal.user.isActive ? (
              <p className="text-sm text-gray-600 mb-5">
                Deactivate <strong>{modal.user.username}</strong>{modal.user.fullName ? ` (${modal.user.fullName})` : ''}? Their current session ends immediately
                and they cannot sign in until you activate the account again. Accounts and balances are not affected.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-5">
                Activate <strong>{modal.user.username}</strong>{modal.user.fullName ? ` (${modal.user.fullName})` : ''}? They will be able to sign in again.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={closeModal} disabled={working} data-autofocus>Cancel</SecondaryButton>
              {modal.user.isActive
                ? <button onClick={toggleActive} disabled={working} className="px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium text-sm hover:bg-red-700 disabled:opacity-50">{working ? 'Deactivating…' : 'Deactivate'}</button>
                : <PrimaryButton onClick={toggleActive} disabled={working}>{working ? 'Activating…' : 'Activate'}</PrimaryButton>}
            </div>
          </>
        )}
      </AdminModal>
    </div>
  );
}
