import { useEffect, useId, useState } from 'react';
import { profileApi, authApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { formatDate, formatDateTime } from '../utils/format';
import { Card, PageHeader, ErrorBanner, SuccessBanner, Spinner, PrimaryButton } from '../components/ui';

export default function ProfilePage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ addressStreet: '', addressCity: '', addressState: '', addressPincode: '', email: '', phoneNumber: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [mpin, setMpin] = useState('');
  const [mpinMsg, setMpinMsg] = useState('');
  const [mpinErr, setMpinErr] = useState('');

  function load() {
    profileApi.get().then((d) => {
      setData(d);
      setForm({
        addressStreet: d.customer.addressStreet || '',
        addressCity: d.customer.addressCity || '',
        addressState: d.customer.addressState || '',
        addressPincode: d.customer.addressPincode || '',
        email: d.user.email || '',
        phoneNumber: d.user.phoneNumber || '',
      });
    }).catch((err) => setError(apiErrorMessage(err)));
  }
  useEffect(load, []);

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setSaving(true);
    try {
      await profileApi.update(form);
      setSuccess('Profile updated.');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSetMpin(e) {
    e.preventDefault();
    setMpinMsg(''); setMpinErr('');
    try {
      await authApi.setMpin(mpin);
      setMpinMsg('MPIN updated successfully.');
      setMpin('');
    } catch (err) {
      setMpinErr(apiErrorMessage(err));
    }
  }

  if (!data && !error) return <Spinner />;

  return (
    <div>
      <PageHeader title="Profile" subtitle="View your KYC details and manage contact information" />
      <ErrorBanner message={error} />

      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold text-gray-800 mb-4">KYC Details (read-only)</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Full Name" value={data.customer.fullName} />
              <Row label="Date of Birth" value={formatDate(data.customer.dateOfBirth)} />
              <Row label="KYC Reference" value={data.customer.kycRefNumber} />
              <Row label="Username" value={data.user.username} />
              <Row label="Role" value={data.user.role} />
              <Row label="Previous Login" value={data.user.previousLoginAt ? formatDateTime(data.user.previousLoginAt) : 'First sign-in'} />
            </dl>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-800 mb-4">Contact Details (editable)</h3>
            <SuccessBanner message={success} />
            <form onSubmit={handleSave} className="space-y-3">
              <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
              <Field label="Phone Number" value={form.phoneNumber} onChange={(v) => setForm((f) => ({ ...f, phoneNumber: v }))} />
              <Field label="Street" value={form.addressStreet} onChange={(v) => setForm((f) => ({ ...f, addressStreet: v }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" value={form.addressCity} onChange={(v) => setForm((f) => ({ ...f, addressCity: v }))} />
                <Field label="State" value={form.addressState} onChange={(v) => setForm((f) => ({ ...f, addressState: v }))} />
              </div>
              <Field label="Pincode" value={form.addressPincode} onChange={(v) => setForm((f) => ({ ...f, addressPincode: v }))} />
              <PrimaryButton type="submit" disabled={saving} className="w-full mt-2">
                {saving ? 'Saving…' : 'Save Changes'}
              </PrimaryButton>
            </form>
          </Card>

          <Card className="md:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-1">Transaction MPIN</h3>
            <p className="text-xs text-gray-400 mb-4">Required to authorize every transfer, bill payment, and deposit closure.</p>
            <SuccessBanner message={mpinMsg} />
            <ErrorBanner message={mpinErr} />
            <form onSubmit={handleSetMpin} className="flex gap-3 items-end max-w-xs">
              <div className="flex-1">
                <label htmlFor="new-mpin" className="block text-xs font-medium text-gray-500 mb-1">New 4–6 digit MPIN</label>
                <input
                  id="new-mpin"
                  autoComplete="off"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={mpin}
                  onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
              <PrimaryButton type="submit" disabled={mpin.length < 4}>Update</PrimaryButton>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-700">{value || '—'}</dd>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
      />
    </div>
  );
}
