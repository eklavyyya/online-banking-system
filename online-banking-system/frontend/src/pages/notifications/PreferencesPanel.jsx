import { useEffect, useState } from 'react';
import { notificationApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import useLoad from '../../hooks/useLoad';
import { formatCurrency } from '../../utils/format';
import { Card, Input, PrimaryButton, Spinner } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';
import Switch from '../_customer/Switch';
import { ErrorNotice, SuccessNotice, LoadError } from '../_customer/Notice';
import { useBusy } from '../_customer/hooks';

const MAX_THRESHOLD = 10000000;

function thresholdError(raw) {
  if (raw.trim() === '') return 'Enter an amount (0 or more).';
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return 'Amount must be 0 or more.';
  if (n > MAX_THRESHOLD) return `Amount cannot be more than ${formatCurrency(MAX_THRESHOLD)}.`;
  return '';
}

const toForm = (p) => ({ promotionalEnabled: !!p.promotionalEnabled, smsEnabled: !!p.smsEnabled, emailEnabled: !!p.emailEnabled, alertThreshold: String(p.alertThreshold ?? 0) });

export default function PreferencesPanel() {
  const { data: saved, error: loadError, loading, reload, setData } = useLoad(() => notificationApi.getPreferences(), []);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, run] = useBusy();

  useEffect(() => { if (saved) setForm(toForm(saved)); }, [saved]);

  const problem = form ? thresholdError(form.alertThreshold) : '';
  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(toForm(saved));

  function change(patch) {
    setSuccess('');
    setForm((f) => ({ ...f, ...patch }));
  }

  function save(e) {
    e.preventDefault();
    if (problem || !dirty) return undefined;
    setError(''); setSuccess('');
    return run(async () => {
      try {
        const next = await notificationApi.updatePreferences({
          promotionalEnabled: form.promotionalEnabled,
          smsEnabled: form.smsEnabled,
          emailEnabled: form.emailEnabled,
          alertThreshold: Number(form.alertThreshold),
        });
        setData(next);
        setSuccess('Alert preferences saved.');
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    });
  }

  return (
    <section id="alert-preferences" aria-labelledby="prefs-heading" className="scroll-mt-4">
      <Card className="p-4 sm:p-6">
        <h2 id="prefs-heading" className="font-semibold text-gray-800 text-lg mb-1">Alert preferences</h2>
        <p className="text-sm text-gray-500 mb-4">Choose which alerts reach you and how.</p>

        {loadError && !saved && <LoadError message={loadError} onRetry={reload} />}
        {loading && !form && !loadError && <Spinner />}

        {form && (
          <form onSubmit={save} noValidate className="space-y-4">
            <SuccessNotice message={success} />
            <ErrorNotice message={error} />

            <Switch id="pref-transactional" label="Transactional alerts" checked disabled onChange={() => {}}
              description="Debits, credits, loan and request updates. Always on: these cannot be turned off." />
            <Switch id="pref-security" label="Security alerts" checked disabled onChange={() => {}}
              description="Card blocks, sign-in and account safety. Always on: these cannot be turned off." />

            <hr className="border-gray-100" />

            <Switch id="pref-promotional" label="Promotional alerts" checked={form.promotionalEnabled} onChange={(v) => change({ promotionalEnabled: v })}
              description="Offers and news from the bank." />
            <Switch id="pref-sms" label="SMS" checked={form.smsEnabled} onChange={(v) => change({ smsEnabled: v })}
              description="Also send alerts to your registered mobile number." />
            <Switch id="pref-email" label="Email" checked={form.emailEnabled} onChange={(v) => change({ emailEnabled: v })}
              description="Also send alerts to your registered email address." />

            <LabeledField
              label="Minimum amount for debit/credit alerts (₹)"
              hint="You are alerted for debits and credits of this amount or more. Use 0 to be alerted for every one."
              error={dirty ? problem : undefined}
            >
              <Input type="number" inputMode="decimal" min="0" step="any" value={form.alertThreshold} onChange={(e) => change({ alertThreshold: e.target.value })} />
            </LabeledField>

            <PrimaryButton type="submit" disabled={saving || !dirty || !!problem} className="w-full sm:w-auto">
              {saving ? 'Saving…' : 'Save preferences'}
            </PrimaryButton>
          </form>
        )}
      </Card>
    </section>
  );
}
