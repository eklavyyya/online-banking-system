// SRS S8: full account and card numbers are masked in every display and log,
// leaving only the last four digits visible.
function maskAccountNumber(value) {
  const s = String(value || '');
  if (s.length <= 4) return s;
  return `${'X'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

module.exports = { maskAccountNumber };
