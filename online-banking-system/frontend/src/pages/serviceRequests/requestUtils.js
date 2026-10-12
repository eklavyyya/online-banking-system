export const TYPE_OPTIONS = [
  { value: 'ChequeBook', label: 'Cheque book' },
  { value: 'Statement', label: 'Statement copy' },
  { value: 'CardIssue', label: 'Card issue' },
  { value: 'Complaint', label: 'Complaint' },
  { value: 'Other', label: 'Other' },
];
export const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label]));

export const STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Closed'];

export const DESC_MIN = 5;
export const DESC_MAX = 2000;

/** The server trims the description before checking its length, so the client does too. */
export function descriptionError(text) {
  const n = text.trim().length;
  if (n < DESC_MIN) return `Please describe your request in at least ${DESC_MIN} characters.`;
  if (n > DESC_MAX) return `The description is too long (${DESC_MAX} characters maximum).`;
  return '';
}

export const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id;
