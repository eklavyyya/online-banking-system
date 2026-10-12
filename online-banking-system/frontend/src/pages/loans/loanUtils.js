export const loanName = (loanType) => `${loanType} loan`;

// Loans needing attention first: active, then pending, then finished.
const ORDER = { Active: 0, Applied: 1, Rejected: 2, Closed: 3 };

export function sortLoans(loans) {
  return [...loans].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || b.id - a.id);
}

// Limits enforced by POST /loans/calculate (loan.service.js `calculate`).
export const CALC_LIMITS = { maxPrincipal: 100000000, maxRate: 40, minTenure: 1, maxTenure: 360 };

/** Returns { field: message } for the three calculator inputs; an empty object means valid. */
export function validateCalc({ principal, rate, tenure }, fmt) {
  const errors = {};
  const p = Number(principal);
  const r = Number(rate);
  const n = Number(tenure);
  if (principal === '') errors.principal = 'Enter the loan amount.';
  else if (!(p > 0)) errors.principal = 'Amount must be greater than zero.';
  else if (p > CALC_LIMITS.maxPrincipal) errors.principal = `Amount cannot exceed ${fmt(CALC_LIMITS.maxPrincipal)} (10 crore).`;

  if (rate === '') errors.rate = 'Enter the annual interest rate.';
  else if (!(r >= 0) || r > CALC_LIMITS.maxRate) errors.rate = `Rate must be between 0 and ${CALC_LIMITS.maxRate}%.`;

  if (tenure === '') errors.tenure = 'Enter the tenure in months.';
  else if (!Number.isInteger(n)) errors.tenure = 'Tenure must be a whole number of months.';
  else if (n < CALC_LIMITS.minTenure || n > CALC_LIMITS.maxTenure) errors.tenure = `Tenure must be between ${CALC_LIMITS.minTenure} and ${CALC_LIMITS.maxTenure} months.`;
  return errors;
}
