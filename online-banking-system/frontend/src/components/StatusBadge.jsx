const GREEN = 'bg-green-100 text-green-800';
const AMBER = 'bg-amber-100 text-amber-800';
const RED = 'bg-red-100 text-red-800';
const GRAY = 'bg-gray-100 text-gray-700';
const BLUE = 'bg-blue-100 text-blue-800';

const STYLES = {
  // accounts, transactions, deposits
  Active: GREEN, Success: GREEN, Matured: GREEN,
  Pending: AMBER, 'Pending Activation': AMBER,
  Failed: RED,
  'Closed Prematurely': GRAY, Closed: GRAY, Dormant: GRAY, Deleted: GRAY, Inactive: GRAY, Deactivated: GRAY,
  // loans
  Applied: BLUE, Rejected: RED, Paid: GREEN, Due: GRAY, Indicative: GRAY,
  // cards
  Blocked: RED, 'Reissue Requested': AMBER,
  // service requests
  Open: BLUE, 'In Progress': AMBER, Resolved: GREEN,
  // admin flags
  Cleared: GREEN, Flagged: RED, Locked: RED,
  // notification categories
  Transactional: BLUE, Promotional: AMBER, Security: RED,
};

export default function StatusBadge({ status }) {
  const cls = STYLES[status] || GRAY;
  return (
    <span className={`inline-block whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
