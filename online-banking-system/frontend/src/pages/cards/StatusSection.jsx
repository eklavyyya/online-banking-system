import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cardApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { DangerButton, PrimaryButton, Textarea } from '../../components/ui';
import ConfirmModal from '../_customer/ConfirmModal';
import LabeledField from '../_customer/LabeledField';
import { ErrorNotice, SuccessNotice } from '../_customer/Notice';
import { useBusy } from '../_customer/hooks';
import { notifyNotificationsChanged } from '../_customer/notifyChanged';
import { cardName } from './cardUtils';

const REASON_MAX = 500;

export default function StatusSection({ card, onPatch }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [reason, setReason] = useState('');
  const [requestError, setRequestError] = useState('');
  const [success, setSuccess] = useState('');
  const [blocking, runBlock] = useBusy();
  const [requesting, runRequest] = useBusy();
  const name = cardName(card);
  const noticeId = `card-notice-${card.id}`;
  // The button that opened a dialog may disappear (Block card -> Request unblock), so park focus on the confirmation.
  const focusNotice = () => requestAnimationFrame(() => document.getElementById(noticeId)?.focus());

  function block() {
    setBlockError('');
    return runBlock(async () => {
      try {
        const res = await cardApi.block(card.id);
        onPatch(card.id, res.card);
        setConfirmOpen(false);
        setSuccess(`Your ${name} is now blocked. All transactions on it are declined.`);
        notifyNotificationsChanged();
        focusNotice();
      } catch (err) {
        setBlockError(apiErrorMessage(err));
      }
    });
  }

  function requestUnblock(e) {
    e.preventDefault();
    setRequestError('');
    return runRequest(async () => {
      try {
        const res = await cardApi.requestUnblock(card.id, reason.trim() || undefined);
        onPatch(card.id, res.card);
        const ref = res.serviceRequest?.ref;
        setSuccess(`Your unblock / reissue request${ref ? ` ${ref}` : ''} has been raised for the bank to review.`);
        setReason('');
        notifyNotificationsChanged();
        focusNotice();
      } catch (err) {
        setRequestError(apiErrorMessage(err));
      }
    });
  }

  return (
    <section aria-labelledby={`status-${card.id}`}>
      <h3 id={`status-${card.id}`} className="font-semibold text-gray-800 mb-2">Card status</h3>
      <SuccessNotice id={noticeId} message={success} />

      {card.status === 'Active' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-600 flex-1 min-w-[12rem]">Lost it or see something suspicious? Block the card straight away.</p>
          <DangerButton onClick={() => { setBlockError(''); setConfirmOpen(true); }}>Block card</DangerButton>
        </div>
      )}

      {card.status === 'Blocked' && (
        <form onSubmit={requestUnblock}>
          <p className="text-sm text-gray-600 mb-3">This card is blocked and every transaction on it is declined. Ask the bank to unblock it or send you a replacement.</p>
          <ErrorNotice message={requestError} />
          <LabeledField label="Reason (optional)" hint={`${reason.length} / ${REASON_MAX}`}>
            <Textarea rows={2} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I found the card at home" />
          </LabeledField>
          <PrimaryButton type="submit" disabled={requesting} className="mt-3">{requesting ? 'Sending…' : 'Request unblock / reissue'}</PrimaryButton>
        </form>
      )}

      {card.status === 'Reissue Requested' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Awaiting the bank</p>
          <p>Your unblock / reissue request is with the bank for review. The card stays unusable until it is approved. Follow its progress under{' '}
            <Link to="/service-requests" className="font-medium underline underline-offset-2 text-navy">Service requests</Link>.
          </p>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Block this card?"
        confirmLabel="Block card"
        danger
        loading={blocking}
        error={blockError}
        onConfirm={block}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>Your <strong>{name}</strong> will be blocked immediately and every transaction on it will be declined.</p>
        <p>To use it again you will need to ask the bank to unblock or reissue it, and the bank has to approve that.</p>
      </ConfirmModal>
    </section>
  );
}
