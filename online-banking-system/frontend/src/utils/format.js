export function formatCurrency(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return '₹–';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

export function formatNumber(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '–';
  return new Intl.NumberFormat('en-IN').format(v);
}

export function formatPercent(n, digits = 2) {
  const v = Number(n);
  if (Number.isNaN(v)) return '–';
  return `${v.toFixed(digits).replace(/\.?0+$/, '')}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "5 minutes ago", "yesterday", or a date for anything older than a week. */
export function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  if (secs < 7 * 86400) return `${Math.round(secs / 86400)} d ago`;
  return formatDate(dateStr);
}

/** YYYY-MM-DD in local time, for <input type="date"> values and API range params. */
export function toInputDate(date = new Date()) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function daysAgoInput(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toInputDate(d);
}

/**
 * Masks an account number for display, keeping the last four digits
 * (SRS S5 / Phase 1 open issue OI-04). Already-masked values pass through.
 */
export function maskAccount(accountNumber) {
  if (!accountNumber) return '—';
  const s = String(accountNumber);
  if (/^X+\d{4}$/i.test(s)) return s;
  if (s.length <= 4) return s;
  return `${'X'.repeat(s.length - 4)}${s.slice(-4)}`;
}

/** "Savings · XXXXXXXXX0001" - the standard way to label an account in a dropdown. */
export function accountLabel(account) {
  if (!account) return '';
  return `${account.accountType || 'Account'} · ${maskAccount(account.accountNumber || account.accountNumberMasked)}`;
}
