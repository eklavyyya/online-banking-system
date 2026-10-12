import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import { PrimaryButton, SecondaryButton, Input } from '../../../components/ui';
import { toInputDate } from '../../../utils/format';
import AdminModal from './AdminModal';
import FormField from './FormField';
import InlineError from './InlineError';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (v) => v.replace(/\D/g, '');

function eighteenYearsAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return toInputDate(d);
}

// ---------------------------------------------------------------- create
const EMPTY = {
  username: '', password: '', email: '', phoneNumber: '', fullName: '', dateOfBirth: '', kycRefNumber: '',
  addressStreet: '', addressCity: '', addressState: '', addressPincode: '', initialMpin: '', linkAccountNumber: '',
};

function validateCreate(f, maxDob) {
  const e = {};
  if (!USERNAME_RE.test(f.username.trim())) e.username = '3-30 characters: letters, digits, dot, dash or underscore.';
  if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'At least 8 characters, with a letter and a digit.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!/^\d{10}$/.test(f.phoneNumber)) e.phoneNumber = 'Enter a 10-digit phone number.';
  if (!f.fullName.trim()) e.fullName = 'Full name is required.';
  if (!f.dateOfBirth) e.dateOfBirth = 'Date of birth is required.';
  else if (f.dateOfBirth > maxDob) e.dateOfBirth = 'The customer must be at least 18 years old.';
  if (!f.kycRefNumber.trim()) e.kycRefNumber = 'KYC reference is required.';
  if (f.initialMpin && !/^\d{4,6}$/.test(f.initialMpin)) e.initialMpin = 'The MPIN must be 4-6 digits.';
  return e;
}

export function CreateUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const maxDob = eighteenYearsAgo();

  const set = (key, transform = (v) => v) => (e) => {
    setForm((f) => ({ ...f, [key]: transform(e.target.value) }));
    setErrors((er) => (er[key] ? { ...er, [key]: undefined } : er));
  };

  function close() {
    setForm(EMPTY); setErrors({}); setApiError(''); setShowPw(false);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const found = validateCreate(form, maxDob);
    setErrors(found);
    if (Object.keys(found).length) { setApiError(''); return; }
    const payload = {
      username: form.username.trim(), password: form.password, email: form.email.trim(), phoneNumber: form.phoneNumber,
      fullName: form.fullName.trim(), dateOfBirth: form.dateOfBirth, kycRefNumber: form.kycRefNumber.trim(),
    };
    ['addressStreet', 'addressCity', 'addressState', 'addressPincode', 'initialMpin', 'linkAccountNumber'].forEach((k) => {
      if (form[k].trim()) payload[k] = form[k].trim();
    });
    setSaving(true); setApiError('');
    try {
      const user = await adminApi.createUser(payload);
      setForm(EMPTY); setErrors({}); setShowPw(false);
      onCreated(user);
    } catch (err) {
      setApiError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open={open} title="Create customer" onClose={close} busy={saving} wide>
      <form onSubmit={submit} noValidate>
        <InlineError message={apiError} />
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <legend className="text-sm font-semibold text-navy mb-2">Login</legend>
          <FormField label="Username" required error={errors.username}>
            <Input value={form.username} onChange={set('username')} autoComplete="off" />
          </FormField>
          <FormField
            label="Password"
            required
            error={errors.password}
            hint="At least 8 characters, with a letter and a digit."
            trailing={<SecondaryButton type="button" aria-pressed={showPw} aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="py-2 shrink-0">{showPw ? 'Hide' : 'Show'}</SecondaryButton>}
          >
            <Input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete="new-password" />
          </FormField>
        </fieldset>

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <legend className="text-sm font-semibold text-navy mb-2">Customer details</legend>
          <FormField label="Full name" required error={errors.fullName}>
            <Input value={form.fullName} onChange={set('fullName')} autoComplete="off" />
          </FormField>
          <FormField label="Date of birth" required error={errors.dateOfBirth} hint="The customer must be 18 or older.">
            <Input type="date" max={maxDob} value={form.dateOfBirth} onChange={set('dateOfBirth')} />
          </FormField>
          <FormField label="Email" required error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} autoComplete="off" />
          </FormField>
          <FormField label="Phone (10 digits)" required error={errors.phoneNumber}>
            <Input inputMode="numeric" maxLength={10} value={form.phoneNumber} onChange={set('phoneNumber', digits)} autoComplete="off" />
          </FormField>
          <FormField label="KYC reference" required error={errors.kycRefNumber} className="sm:col-span-2">
            <Input value={form.kycRefNumber} onChange={set('kycRefNumber')} autoComplete="off" />
          </FormField>
        </fieldset>

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <legend className="text-sm font-semibold text-navy mb-2">Address (optional)</legend>
          <FormField label="Street" className="sm:col-span-2"><Input value={form.addressStreet} onChange={set('addressStreet')} autoComplete="off" /></FormField>
          <FormField label="City"><Input value={form.addressCity} onChange={set('addressCity')} autoComplete="off" /></FormField>
          <FormField label="State"><Input value={form.addressState} onChange={set('addressState')} autoComplete="off" /></FormField>
          <FormField label="Pincode"><Input inputMode="numeric" maxLength={6} value={form.addressPincode} onChange={set('addressPincode', digits)} autoComplete="off" /></FormField>
        </fieldset>

        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <legend className="text-sm font-semibold text-navy mb-2">Optional setup</legend>
          <FormField label="Initial MPIN (4-6 digits)" error={errors.initialMpin} hint="Leave empty and the customer sets it from their Profile.">
            <Input type="password" inputMode="numeric" maxLength={6} value={form.initialMpin} onChange={set('initialMpin', digits)} autoComplete="off" />
          </FormField>
          <FormField label="Link to existing account number" hint="Adds the customer as a holder of that account (joint if it already has one).">
            <Input value={form.linkAccountNumber} onChange={set('linkAccountNumber')} autoComplete="off" />
          </FormField>
        </fieldset>

        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={close} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create customer'}</PrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}

// ---------------------------------------------------------------- edit
const HINT_UNKNOWN = 'The current value is not shown here. Leave blank to keep it.';

export function EditUserModal({ user, onClose, onSaved }) {
  const initial = {
    fullName: user.fullName || '', email: user.email || '', phoneNumber: user.phoneNumber || '',
    kycRefNumber: user.kycRefNumber || '', addressCity: user.addressCity || '',
  };
  const [form, setForm] = useState({ ...initial, addressStreet: '', addressState: '', addressPincode: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key, transform = (v) => v) => (e) => {
    setForm((f) => ({ ...f, [key]: transform(e.target.value) }));
    setErrors((er) => (er[key] ? { ...er, [key]: undefined } : er));
  };

  function changes() {
    const out = {};
    Object.keys(form).forEach((k) => {
      const v = form[k].trim();
      const known = k in initial;
      if (known ? v !== initial[k] : v !== '') out[k] = v;
    });
    return out;
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const diff = changes();
    const found = {};
    if ('fullName' in diff && !diff.fullName) found.fullName = 'Full name cannot be empty.';
    if ('kycRefNumber' in diff && !diff.kycRefNumber) found.kycRefNumber = 'KYC reference cannot be empty.';
    if ('email' in diff && !EMAIL_RE.test(diff.email)) found.email = 'Enter a valid email address.';
    if ('phoneNumber' in diff && !/^\d{10}$/.test(diff.phoneNumber)) found.phoneNumber = 'Enter a 10-digit phone number.';
    setErrors(found);
    if (Object.keys(found).length) return;
    if (Object.keys(diff).length === 0) { setApiError('Nothing has changed yet.'); return; }
    setSaving(true); setApiError('');
    try {
      await adminApi.updateUser(user.id, diff);
      onSaved(`Details updated for ${user.username}.`);
    } catch (err) {
      setApiError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open title={`Edit ${user.username}`} onClose={onClose} busy={saving} wide>
      <form onSubmit={submit} noValidate>
        <InlineError message={apiError} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <FormField label="Full name" required error={errors.fullName}><Input value={form.fullName} onChange={set('fullName')} /></FormField>
          <FormField label="KYC reference" required error={errors.kycRefNumber}><Input value={form.kycRefNumber} onChange={set('kycRefNumber')} /></FormField>
          <FormField label="Email" required error={errors.email}><Input type="email" value={form.email} onChange={set('email')} /></FormField>
          <FormField label="Phone (10 digits)" required error={errors.phoneNumber}>
            <Input inputMode="numeric" maxLength={10} value={form.phoneNumber} onChange={set('phoneNumber', digits)} />
          </FormField>
          <FormField label="Street" hint={HINT_UNKNOWN} className="sm:col-span-2"><Input value={form.addressStreet} onChange={set('addressStreet')} /></FormField>
          <FormField label="City"><Input value={form.addressCity} onChange={set('addressCity')} /></FormField>
          <FormField label="State" hint={HINT_UNKNOWN}><Input value={form.addressState} onChange={set('addressState')} /></FormField>
          <FormField label="Pincode" hint={HINT_UNKNOWN}><Input inputMode="numeric" maxLength={6} value={form.addressPincode} onChange={set('addressPincode', digits)} /></FormField>
        </div>
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</PrimaryButton>
        </div>
      </form>
    </AdminModal>
  );
}
