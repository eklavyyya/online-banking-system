import { useId, useState } from 'react';
import { serviceRequestApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { accountLabel } from '../../utils/format';
import { Card, Select, Textarea, PrimaryButton } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';
import { ErrorNotice } from '../_customer/Notice';
import { useBusy } from '../_customer/hooks';
import { TYPE_OPTIONS, DESC_MIN, DESC_MAX, descriptionError } from './requestUtils';

const EMPTY = { requestType: 'ChequeBook', description: '', relatedAccountId: '' };

export default function NewRequestCard({ accounts, open, onToggle, onCreated }) {
  const panelId = useId();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, run] = useBusy();

  const length = form.description.trim().length;
  const problem = descriptionError(form.description);
  const showProblem = touched && problem;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    setError('');
    if (problem) return undefined;
    return run(async () => {
      try {
        const created = await serviceRequestApi.create({
          requestType: form.requestType,
          description: form.description.trim(),
          relatedAccountId: form.relatedAccountId ? Number(form.relatedAccountId) : undefined,
        });
        setForm(EMPTY);
        setTouched(false);
        onCreated(created);
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    });
  }

  return (
    <Card className="p-0 mb-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
      >
        <span>
          <span className="block font-semibold text-gray-800">New request</span>
          <span className="block text-xs text-gray-500">Cheque book, statement copy, card issue, complaint or anything else</span>
        </span>
        <span aria-hidden="true" className={`text-navy text-lg transition-transform ${open ? 'rotate-180' : ''}`}>&#9662;</span>
      </button>

      {open && (
        <div id={panelId} className="px-4 sm:px-6 pb-5 border-t border-gray-100 pt-4">
          <ErrorNotice message={error} />
          <form onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-3">
            <LabeledField label="Request type">
              <Select value={form.requestType} onChange={set('requestType')}>
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </LabeledField>
            <LabeledField label="Related account (optional)">
              <Select value={form.relatedAccountId} onChange={set('relatedAccountId')}>
                <option value="">Not about a specific account</option>
                {(accounts || []).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
              </Select>
            </LabeledField>
            <div className="sm:col-span-2">
              <LabeledField label="Description" error={showProblem ? problem : undefined}>
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={set('description')}
                  onBlur={() => setTouched(true)}
                  placeholder="Tell us what you need"
                />
              </LabeledField>
              <p className={`text-xs mt-1 text-right ${length > DESC_MAX || (touched && length < DESC_MIN) ? 'text-red-600' : 'text-gray-500'}`} aria-live="polite">
                {length} / {DESC_MAX} characters (minimum {DESC_MIN})
              </p>
            </div>
            <div className="sm:col-span-2">
              <PrimaryButton type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? 'Submitting…' : 'Submit request'}</PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
