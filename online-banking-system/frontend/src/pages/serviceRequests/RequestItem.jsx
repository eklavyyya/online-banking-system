import { useLayoutEffect, useRef, useState } from 'react';
import { formatDate, formatDateTime } from '../../utils/format';
import { Card, SecondaryButton } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import { TYPE_LABELS } from './requestUtils';

/** Description clamped to two lines; click it (or the toggle) to read the rest. */
function Description({ text }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef(null);

  useLayoutEffect(() => {
    function measure() {
      const el = ref.current;
      if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, expanded]);

  const expandable = overflowing || expanded;
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expandable ? expanded : undefined}
      disabled={!expandable}
      className={`block w-full text-left text-sm text-gray-700 mt-2 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-navy rounded ${expandable ? 'cursor-pointer' : ''}`}
    >
      <span ref={ref} className={`whitespace-pre-line break-words ${expanded ? 'block' : 'line-clamp-2'}`}>{text}</span>
      {expandable && <span className="block text-xs font-medium text-navy underline underline-offset-2 mt-1">{expanded ? 'Show less' : 'Show more'}</span>}
    </button>
  );
}

export default function RequestItem({ request, accountText, onClose }) {
  const typeLabel = TYPE_LABELS[request.requestType] || request.typeLabel;
  const hasResolution = request.resolutionNotes || request.resolvedAt;
  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-mono font-semibold text-navy">{request.ref}</h3>
          <span className="text-sm font-medium text-gray-800">{typeLabel}</span>
          <StatusBadge status={request.status} />
          <time dateTime={request.createdAt} title={formatDateTime(request.createdAt)} className="text-xs text-gray-500 sm:ml-auto">
            Raised {formatDate(request.createdAt)}
          </time>
        </div>
        {accountText && <p className="text-xs text-gray-500 mt-1">Account {accountText}</p>}

        <Description text={request.description} />

        {hasResolution && (
          <div className="mt-3 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-sm">
            <p className="text-xs font-semibold text-green-800">
              Resolution{request.resolvedAt ? ` · ${formatDate(request.resolvedAt)}` : ''}
            </p>
            {request.resolutionNotes && <p className="text-gray-700 whitespace-pre-line break-words">{request.resolutionNotes}</p>}
          </div>
        )}

        {request.status === 'Resolved' && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <SecondaryButton onClick={() => onClose(request)}>Close request</SecondaryButton>
            <span className="text-xs text-gray-500">Happy with the outcome? Closing it is final.</span>
          </div>
        )}
      </Card>
    </li>
  );
}
