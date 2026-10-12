import { useEffect, useRef, useState } from 'react';
import { cardApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import Switch from '../_customer/Switch';
import { ErrorNotice } from '../_customer/Notice';
import { CHANNEL_FIELDS, frozenReason, pickChannels } from './cardUtils';

/** Each switch saves on its own. The UI flips first and rolls that one switch back if the save fails. */
export default function ChannelsSection({ card, onPatch }) {
  const editable = card.status === 'Active';
  const [channels, setChannels] = useState(() => pickChannels(card));
  const [pending, setPending] = useState({});
  const [error, setError] = useState('');
  const pendingRef = useRef({});

  const serverKey = CHANNEL_FIELDS.map((f) => card[f.key]).join('|');
  useEffect(() => {
    setChannels((current) => {
      const fromServer = pickChannels(card);
      for (const key of Object.keys(pendingRef.current)) if (pendingRef.current[key]) fromServer[key] = current[key];
      return fromServer;
    });
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(key, next) {
    if (pendingRef.current[key]) return;
    const previous = channels[key];
    setError('');
    pendingRef.current[key] = true;
    setPending((p) => ({ ...p, [key]: true }));
    setChannels((c) => ({ ...c, [key]: next }));
    try {
      await cardApi.updateChannels(card.id, { [key]: next });
      onPatch(card.id, { [key]: next });
    } catch (err) {
      setChannels((c) => ({ ...c, [key]: previous }));
      setError(apiErrorMessage(err));
    } finally {
      pendingRef.current[key] = false;
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <section aria-labelledby={`channels-${card.id}`}>
      <h3 id={`channels-${card.id}`} className="font-semibold text-gray-800 mb-2">Where the card works</h3>
      {!editable && (
        <p className="text-sm text-gray-600 mb-3">Channel settings are frozen while {frozenReason(card)}. You can change them again once the card is active.</p>
      )}
      <ErrorNotice message={error} />
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
        {CHANNEL_FIELDS.map(({ key, label, description }) => (
          <Switch
            key={key}
            id={`ch-${card.id}-${key}`}
            label={label}
            description={description}
            checked={channels[key]}
            disabled={!editable}
            busy={!!pending[key]}
            onChange={(next) => toggle(key, next)}
          />
        ))}
      </div>
    </section>
  );
}
