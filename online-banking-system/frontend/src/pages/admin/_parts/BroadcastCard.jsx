import { useState } from 'react';
import { adminApi } from '../../../api';
import { apiErrorMessage } from '../../../api/client';
import { Card, SuccessBanner, PrimaryButton, SecondaryButton, Select, Textarea } from '../../../components/ui';
import StatusBadge from '../../../components/StatusBadge';
import AdminModal from './AdminModal';
import FormField from './FormField';
import InlineError from './InlineError';

const MAX = 255; // the backend clips notifications at 255 characters
const CATEGORY_HELP = {
  Promotional: 'Offers and announcements. Customers who opted out of promotions are skipped.',
  Security: 'Important notices. Reaches every active customer, whatever their preferences.',
};

export default function BroadcastCard() {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Promotional');
  const [fieldError, setFieldError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState('');

  function review(e) {
    e.preventDefault();
    setResult('');
    if (message.trim().length < 5) {
      setFieldError('Write a message of at least 5 characters.');
      return;
    }
    setFieldError('');
    setSendError('');
    setConfirming(true);
  }

  async function send() {
    if (sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await adminApi.broadcast({ message: message.trim(), category });
      setResult(`Delivered to ${res.delivered}, ${res.skippedOptedOut} opted out of promotions.`);
      setMessage('');
      setConfirming(false);
    } catch (err) {
      setSendError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-serif text-lg font-bold text-navy">Broadcast a notification</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">Send a message to the in-app inbox of every active customer.</p>
      <SuccessBanner message={result} />
      <form onSubmit={review} noValidate className="space-y-4 max-w-2xl">
        <FormField label="Message" required error={fieldError} hint={`${message.length}/${MAX} characters`}>
          <Textarea rows={3} maxLength={MAX} value={message} onChange={(e) => { setMessage(e.target.value); setFieldError(''); }} placeholder="e.g. Our branch will be closed on Saturday for maintenance." />
        </FormField>
        <FormField label="Category" hint={CATEGORY_HELP[category]} className="sm:max-w-xs">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="Promotional">Promotional</option>
            <option value="Security">Security</option>
          </Select>
        </FormField>
        <PrimaryButton type="submit" disabled={sending}>Review and send</PrimaryButton>
      </form>

      <AdminModal open={confirming} title="Send this broadcast?" onClose={() => setConfirming(false)} busy={sending}>
        <InlineError message={sendError} />
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 whitespace-pre-wrap break-words mb-3">{message.trim()}</div>
        <p className="text-sm text-gray-600 mb-1 flex items-center gap-2">Category: <StatusBadge status={category} /></p>
        <p className="text-sm text-gray-500 mb-5">{CATEGORY_HELP[category]} A sent notification cannot be recalled.</p>
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={() => setConfirming(false)} disabled={sending} data-autofocus>Cancel</SecondaryButton>
          <PrimaryButton onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send to customers'}</PrimaryButton>
        </div>
      </AdminModal>
    </Card>
  );
}
