import { formatDateTime, formatRelative } from '../../utils/format';
import { SecondaryButton } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';

const short = (text, n = 50) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export default function NotificationItem({ notification: n, pending, onRead }) {
  const unread = !n.isRead;
  const channels = String(n.channels || '').split(',').map((c) => c.trim()).filter(Boolean);
  return (
    <li
      onClick={unread ? () => onRead(n.id) : undefined}
      className={`flex items-start gap-3 border-l-4 px-3 py-3 ${unread ? 'border-gold bg-amber-50/70 cursor-pointer' : 'border-transparent'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          <StatusBadge status={n.category} />
          <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)} className="text-xs text-gray-500">{formatRelative(n.createdAt)}</time>
          {unread && <span className="text-xs font-semibold text-amber-800">Unread</span>}
        </div>
        <p className={`text-sm break-words ${unread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.message}</p>
        {channels.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Sent via">
            {channels.map((c) => <li key={c} className="text-[11px] leading-5 px-2 rounded bg-gray-100 text-gray-600">{c}</li>)}
          </ul>
        )}
      </div>
      {unread && (
        <SecondaryButton
          className="shrink-0 px-3 py-1.5 text-xs"
          disabled={pending}
          aria-label={`Mark read: ${short(n.message)}`}
          onClick={(e) => { e.stopPropagation(); onRead(n.id); }}
        >
          Mark read
        </SecondaryButton>
      )}
    </li>
  );
}
