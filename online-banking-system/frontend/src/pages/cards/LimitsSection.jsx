import { useEffect, useMemo, useState } from 'react';
import { cardApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { Input, PrimaryButton } from '../../components/ui';
import LabeledField from '../_customer/LabeledField';
import { ErrorNotice, SuccessNotice } from '../_customer/Notice';
import { useBusy } from '../_customer/hooks';
import { LIMIT_FIELDS, frozenReason, limitsToStrings, validateLimits } from './cardUtils';

export default function LimitsSection({ card, onPatch }) {
  const editable = card.status === 'Active';
  const [values, setValues] = useState(() => limitsToStrings(card));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, run] = useBusy();

  // Follow the server when the card changes underneath us (e.g. after a save).
  const serverKey = LIMIT_FIELDS.map((f) => card[f.key]).join('|');
  useEffect(() => { setValues(limitsToStrings(card)); }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = useMemo(() => validateLimits(values, card.ceilings, formatCurrency), [values, card.ceilings]);
  const hasErrors = Object.keys(errors).length > 0;
  const saved = limitsToStrings(card);
  const dirty = LIMIT_FIELDS.some(({ key }) => Number(values[key]) !== Number(saved[key]) || values[key] === '');

  function save(e) {
    e.preventDefault();
    if (hasErrors || !dirty) return undefined;
    setError(''); setSuccess('');
    return run(async () => {
      try {
        const payload = Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, Number(values[key])]));
        const res = await cardApi.updateLimits(card.id, payload);
        onPatch(card.id, res.card);
        setSuccess('Limits updated.');
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    });
  }

  return (
    <section aria-labelledby={`limits-${card.id}`}>
      <h3 id={`limits-${card.id}`} className="font-semibold text-gray-800 mb-2">Spending limits</h3>

      {!editable ? (
        <>
          <p className="text-sm text-gray-600 mb-3">Limits are frozen while {frozenReason(card)}. You can change them again once the card is active.</p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {LIMIT_FIELDS.map(({ key, short }) => (
              <div key={key}>
                <dt className="text-xs text-gray-500">{short}</dt>
                <dd className="text-sm font-medium text-gray-800">{formatCurrency(card[key])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <form onSubmit={save} noValidate>
          <SuccessNotice message={success} />
          <ErrorNotice message={error} />
          <div className="grid grid-cols-2 gap-3">
            {LIMIT_FIELDS.map(({ key, label }) => (
              <LabeledField key={key} label={label} hint={`Ceiling ${formatCurrency(card.ceilings?.[key])}`} error={errors[key]}>
                <Input type="number" inputMode="decimal" min="0" max={card.ceilings?.[key]} step="any" value={values[key]} onChange={(e) => { setSuccess(''); setValues((v) => ({ ...v, [key]: e.target.value })); }} />
              </LabeledField>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <PrimaryButton type="submit" disabled={saving || hasErrors || !dirty}>{saving ? 'Saving…' : 'Save limits'}</PrimaryButton>
            <p className="text-xs text-gray-500">ATM, POS and online limits cannot be higher than the daily limit.</p>
          </div>
        </form>
      )}
    </section>
  );
}
