/** Why a card's settings are read-only, worded for the sentence "... are frozen while <reason>." */
export const frozenReason = (card) => (card.status === 'Reissue Requested' ? 'a reissue request is with the bank' : `the card is ${card.status.toLowerCase()}`);

export const cardName = (card) => `${card.cardType} card ending ${card.last4}`;

/** "2029-08-01" -> "08/29" (read from the string so time zones cannot shift the month). */
export function formatExpiry(expiryDate) {
  const m = /^(\d{4})-(\d{2})/.exec(String(expiryDate || ''));
  return m ? `${m[2]}/${m[1].slice(2)}` : '--/--';
}

export const LIMIT_FIELDS = [
  { key: 'dailyLimit', label: 'Daily limit (₹)', short: 'Daily limit' },
  { key: 'atmLimit', label: 'ATM limit (₹)', short: 'ATM limit' },
  { key: 'posLimit', label: 'POS limit (₹)', short: 'POS limit' },
  { key: 'onlineLimit', label: 'Online limit (₹)', short: 'Online limit' },
];

export const CHANNEL_FIELDS = [
  { key: 'atmEnabled', label: 'ATM', description: 'Cash withdrawals at ATMs' },
  { key: 'posEnabled', label: 'POS', description: 'Tap or swipe payments in shops' },
  { key: 'onlineEnabled', label: 'Online', description: 'Website and app payments' },
  { key: 'internationalEnabled', label: 'International', description: 'Payments and withdrawals outside India' },
];

export const limitsToStrings = (card) => Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, String(Number(card[key]))]));
export const pickChannels = (card) => Object.fromEntries(CHANNEL_FIELDS.map(({ key }) => [key, !!card[key]]));

/** Client-side mirror of the server rules: >= 0, within the product ceiling, channel limits within the daily limit. */
export function validateLimits(values, ceilings, fmt) {
  const errors = {};
  const num = {};
  for (const { key } of LIMIT_FIELDS) {
    const raw = values[key];
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) errors[key] = 'Enter an amount.';
    else if (n < 0) errors[key] = 'Must be zero or more.';
    else if (ceilings && n > ceilings[key]) errors[key] = `Cannot exceed the ceiling of ${fmt(ceilings[key])}.`;
    else num[key] = n;
  }
  for (const key of ['atmLimit', 'posLimit', 'onlineLimit']) {
    if (!errors[key] && num.dailyLimit !== undefined && num[key] > num.dailyLimit) {
      errors[key] = `Cannot be higher than the daily limit (${fmt(num.dailyLimit)}).`;
    }
  }
  return errors;
}
