const { Op } = require('sequelize');
const { Card, Account, AccountHolder, ServiceRequest } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const { maskAccountNumber } = require('../utils/mask');
const { notifyCustomer, alertAccountHoldersAlways } = require('../utils/notify');

// Hard ceilings a customer may set for themselves (SRS F48). Credit cards
// allow bigger POS/online spends but a smaller ATM cash-advance ceiling.
const CEILINGS = {
  Debit: { dailyLimit: 200000, atmLimit: 100000, posLimit: 200000, onlineLimit: 200000 },
  Credit: { dailyLimit: 500000, atmLimit: 50000, posLimit: 500000, onlineLimit: 500000 },
};
const LIMIT_FIELDS = ['dailyLimit', 'atmLimit', 'posLimit', 'onlineLimit'];
const CHANNEL_FIELDS = ['atmEnabled', 'posEnabled', 'onlineEnabled', 'internationalEnabled'];

const INCLUDE = [{ model: Account, attributes: ['id', 'accountNumber', 'accountType'] }];

function serialize(card) {
  const json = card.toJSON();
  const account = card.Account;
  delete json.Account;
  return {
    ...json,
    last4: String(card.cardNumberMasked).slice(-4),
    accountNumberMasked: account ? maskAccountNumber(account.accountNumber) : null,
    ceilings: CEILINGS[card.cardType],
  };
}

async function holderAccountIds(customerId) {
  const holdings = await AccountHolder.findAll({ where: { customerId }, attributes: ['accountId'] });
  return holdings.map((h) => h.accountId);
}

async function getOwned(userId, cardId) {
  const customer = await getCustomerOrThrow(userId);
  const ids = await holderAccountIds(customer.id);
  const card = await Card.findOne({ where: { id: cardId, accountId: { [Op.in]: ids } }, include: INCLUDE });
  if (!card) throw new AppError('Card not found.', 404);
  return { customer, card };
}

// SRS F45: all cards on the customer's accounts, number masked.
async function list(userId) {
  const customer = await getCustomerOrThrow(userId);
  const ids = await holderAccountIds(customer.id);
  const cards = await Card.findAll({ where: { accountId: { [Op.in]: ids } }, include: INCLUDE, order: [['id', 'ASC']] });
  return cards.map(serialize);
}

async function getOne(userId, cardId) {
  const { card } = await getOwned(userId, cardId);
  return serialize(card);
}

// SRS F46: emergency block, immediate effect.
async function block(userId, cardId) {
  const { card } = await getOwned(userId, cardId);
  if (card.status === 'Blocked') throw new AppError('This card is already blocked.', 400);
  if (card.status === 'Reissue Requested') throw new AppError('A reissue is already being processed for this card.', 400);
  card.status = 'Blocked';
  card.blockedAt = new Date();
  await card.save();
  await logActivity(userId, `Card ending ${String(card.cardNumberMasked).slice(-4)} blocked by customer`, 'Card', card.id);
  await alertAccountHoldersAlways(card.accountId, `Security alert: your ${card.cardType} card ending ${String(card.cardNumberMasked).slice(-4)} has been blocked. All transactions on it are now declined.`, 'Security');
  return { message: 'Card blocked.', card: serialize(card) };
}

// SRS F47: unblock/reissue routes to a service request for Admin approval.
async function requestUnblock(userId, cardId, { reason } = {}) {
  const { customer, card } = await getOwned(userId, cardId);
  if (card.status === 'Active') throw new AppError('This card is active; there is nothing to unblock.', 400);
  if (card.status === 'Reissue Requested') throw new AppError('A reissue request for this card is already open.', 400);

  const last4 = String(card.cardNumberMasked).slice(-4);
  const note = reason && String(reason).trim() ? ` Customer note: ${String(reason).trim().slice(0, 500)}` : '';
  const request = await ServiceRequest.create({
    customerId: customer.id,
    requestType: 'CardIssue',
    description: `Unblock / reissue request for ${card.cardType} card ending ${last4}.${note}`,
    status: 'Open',
    relatedCardId: card.id,
    relatedAccountId: card.accountId,
  });
  card.status = 'Reissue Requested';
  await card.save();

  await logActivity(userId, `Unblock/reissue requested for card ending ${last4} (request ${request.ref})`, 'Card', card.id);
  await notifyCustomer(customer.id, `Your request ${request.ref} to unblock/reissue the card ending ${last4} has been raised. We will update you once it is reviewed.`, 'Transactional');
  return { message: 'Unblock/reissue request raised for admin approval.', card: serialize(card), serviceRequest: request };
}

function toAmount(field, value) {
  const n = Number(value);
  if (value === '' || value === null || Number.isNaN(n) || n < 0) {
    throw new AppError(`${field} must be a number that is zero or more.`, 400);
  }
  return n;
}

// SRS F48: daily limits per card and per channel, within the product ceilings.
async function updateLimits(userId, cardId, data = {}) {
  const { card } = await getOwned(userId, cardId);
  if (card.status !== 'Active') throw new AppError('Limits can only be changed on an active card.', 400);

  const incoming = LIMIT_FIELDS.filter((f) => data[f] !== undefined);
  if (incoming.length === 0) throw new AppError(`Provide at least one of: ${LIMIT_FIELDS.join(', ')}.`, 400);

  const ceiling = CEILINGS[card.cardType];
  const next = {};
  for (const f of LIMIT_FIELDS) next[f] = f in data && data[f] !== undefined ? toAmount(f, data[f]) : parseFloat(card[f]);
  for (const f of LIMIT_FIELDS) {
    if (next[f] > ceiling[f]) throw new AppError(`${f} cannot exceed ₹${ceiling[f]} for a ${card.cardType} card.`, 400);
  }
  for (const f of ['atmLimit', 'posLimit', 'onlineLimit']) {
    if (next[f] > next.dailyLimit) throw new AppError(`${f} cannot be higher than the overall daily limit (₹${next.dailyLimit}).`, 400);
  }

  for (const f of incoming) card[f] = next[f];
  await card.save();
  await logActivity(userId, `Card limits updated for card ending ${String(card.cardNumberMasked).slice(-4)}`, 'Card', card.id);
  return { message: 'Limits updated.', card: serialize(card) };
}

// SRS F49: switch individual channels on or off.
async function updateChannels(userId, cardId, data = {}) {
  const { card } = await getOwned(userId, cardId);
  if (card.status !== 'Active') throw new AppError('Channels can only be changed on an active card.', 400);

  const incoming = CHANNEL_FIELDS.filter((f) => data[f] !== undefined);
  if (incoming.length === 0) throw new AppError(`Provide at least one of: ${CHANNEL_FIELDS.join(', ')}.`, 400);
  for (const f of incoming) {
    if (typeof data[f] !== 'boolean') throw new AppError(`${f} must be true or false.`, 400);
    card[f] = data[f];
  }
  await card.save();
  await logActivity(userId, `Card channels updated for card ending ${String(card.cardNumberMasked).slice(-4)}`, 'Card', card.id);
  return { message: 'Channels updated.', card: serialize(card) };
}

// Used by the service-request flow when an admin resolves an unblock/reissue.
function issueReplacementNumber() {
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  return `XXXX XXXX XXXX ${last4}`;
}

module.exports = { CEILINGS, list, getOne, block, requestUnblock, updateLimits, updateChannels, issueReplacementNumber, serialize };
