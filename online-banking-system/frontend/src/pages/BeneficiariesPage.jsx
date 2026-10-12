import { useEffect, useId, useState } from 'react';
import { beneficiaryApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { formatDateTime, maskAccount } from '../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, PrimaryButton, SecondaryButton, Modal, Field as LabelledField, Input } from '../components/ui';
import ConfirmModal from '../components/ConfirmModal';
import StatusBadge from '../components/StatusBadge';

const EMPTY_FORM = { beneficiaryName: '', accountNumber: '', ifscCode: '', nickname: '', transferLimit: '' };

export default function BeneficiariesPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  function load() {
    beneficiaryApi.list().then(setList).catch((err) => setError(apiErrorMessage(err)));
  }
  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setSaving(true);
    try {
      await beneficiaryApi.add({
        ...form,
        transferLimit: form.transferLimit ? Number(form.transferLimit) : null,
      });
      setSuccess('Beneficiary added. It will activate automatically after the cooling-off period.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const [limitFor, setLimitFor] = useState(null); // beneficiary whose limit is being edited
  const [limitValue, setLimitValue] = useState('');
  const [removeFor, setRemoveFor] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  function openLimit(b) {
    setLimitFor(b); setLimitValue(b.transferLimit ?? ''); setDialogError('');
  }

  async function saveLimit(e) {
    e.preventDefault();
    if (limitValue !== '' && !(Number(limitValue) > 0)) { setDialogError('Enter an amount above zero, or leave it blank for no limit.'); return; }
    setDialogBusy(true); setDialogError('');
    try {
      await beneficiaryApi.update(limitFor.id, { transferLimit: limitValue === '' ? null : Number(limitValue) });
      setLimitFor(null);
      setSuccess('Per-transfer limit updated.');
      load();
    } catch (err) {
      setDialogError(apiErrorMessage(err));
    } finally {
      setDialogBusy(false);
    }
  }

  async function confirmRemove() {
    setDialogBusy(true); setDialogError('');
    try {
      await beneficiaryApi.remove(removeFor.id);
      setRemoveFor(null);
      setSuccess('Beneficiary removed.');
      load();
    } catch (err) {
      setDialogError(apiErrorMessage(err));
    } finally {
      setDialogBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Beneficiaries"
        subtitle="Payees you've added for fund transfer"
        action={<PrimaryButton onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Add Beneficiary'}</PrimaryButton>}
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleAdd} className="grid sm:grid-cols-2 gap-3">
            <Field label="Beneficiary Name" required value={form.beneficiaryName} onChange={(v) => setForm((f) => ({ ...f, beneficiaryName: v }))} />
            <Field label="Nickname (optional)" value={form.nickname} onChange={(v) => setForm((f) => ({ ...f, nickname: v }))} />
            <Field label="Account Number" required value={form.accountNumber} onChange={(v) => setForm((f) => ({ ...f, accountNumber: v }))} />
            <Field label="IFSC Code" required value={form.ifscCode} onChange={(v) => setForm((f) => ({ ...f, ifscCode: v.toUpperCase() }))} />
            <Field label="Per-Transfer Limit (optional)" type="number" value={form.transferLimit} onChange={(v) => setForm((f) => ({ ...f, transferLimit: v }))} />
            <div className="sm:col-span-2">
              <PrimaryButton type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Beneficiary'}</PrimaryButton>
            </div>
          </form>
        </Card>
      )}

      {!list && !error && <Spinner />}

      {list && list.length === 0 && (
        <Card><p className="text-gray-400 text-sm text-center py-6">No beneficiaries added yet.</p></Card>
      )}

      {list && list.length > 0 && (
        <div className="space-y-3">
          {list.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-800">{b.beneficiaryName}</p>
                  {b.nickname && <span className="text-xs text-gray-400">"{b.nickname}"</span>}
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-xs text-gray-400 font-mono">{maskAccount(b.accountNumber)} · {b.ifscCode}</p>
                {b.status === 'Pending Activation' && (
                  <p className="text-xs text-amber-600 mt-1">Active from {formatDateTime(b.activeFrom)}</p>
                )}
                {b.transferLimit && (
                  <p className="text-xs text-gray-400 mt-1">Per-transfer limit: ₹{Number(b.transferLimit).toLocaleString('en-IN')}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <SecondaryButton onClick={() => openLimit(b)} aria-label={`Edit limit for ${b.beneficiaryName}`}>Edit Limit</SecondaryButton>
                <SecondaryButton onClick={() => { setRemoveFor(b); setDialogError(''); }} aria-label={`Remove ${b.beneficiaryName}`} className="text-red-600 border-red-200 hover:bg-red-50">Remove</SecondaryButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!limitFor} title="Per-transfer limit" onClose={() => setLimitFor(null)} busy={dialogBusy}>
        <form onSubmit={saveLimit} className="space-y-3">
          <p className="text-sm text-gray-600">Largest single transfer allowed to {limitFor?.beneficiaryName}. Leave blank for no limit.</p>
          <LabelledField label="Limit (₹)" error={dialogError}>
            <Input type="number" min="1" step="0.01" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} />
          </LabelledField>
          <div className="flex gap-3">
            <SecondaryButton type="button" className="flex-1" onClick={() => setLimitFor(null)} disabled={dialogBusy}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" className="flex-1" disabled={dialogBusy}>{dialogBusy ? 'Saving…' : 'Save limit'}</PrimaryButton>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!removeFor}
        title="Remove beneficiary?"
        confirmLabel="Remove"
        danger
        loading={dialogBusy}
        error={dialogError}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveFor(null)}
      >
        <p>{removeFor?.beneficiaryName} will no longer be available for transfers. You can add them again later, but a new cooling-off period applies.</p>
      </ConfirmModal>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
      />
    </div>
  );
}
