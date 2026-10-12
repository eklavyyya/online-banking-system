const { Account, AccountHolder, User } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const statements = require('./statement.service');

// F9: every account this customer holds, any role (Primary or Joint).
async function listAccounts(userId) {
  const customer = await getCustomerOrThrow(userId);
  const holdings = await AccountHolder.findAll({
    where: { customerId: customer.id },
    include: [{ model: Account }],
  });
  return holdings.map((h) => ({ ...h.Account.toJSON(), holderRole: h.holderRole }));
}

async function assertOwnership(userId, accountId) {
  const customer = await getCustomerOrThrow(userId);
  const holding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId } });
  if (!holding) throw new AppError('Account not found or not linked to your profile.', 404);
  return customer;
}

async function getAccount(userId, accountId) {
  await assertOwnership(userId, accountId);
  const account = await Account.findByPk(accountId);
  if (!account) throw new AppError('Account not found.', 404);
  return account;
}

// F12: search/filter transaction history by date range, type, status and direction.
// Phase 2 includes incoming money (credits) as well as debits, with a
// human-readable description per line (fixes Phase 1 open issue OI-07).
async function getTransactions(userId, accountId, opts = {}) {
  await assertOwnership(userId, accountId);
  return statements.transactionsFor(accountId, opts);
}

// F13/F57: downloadable e-statement, CSV or PDF, for a date range.
async function getStatement(userId, accountId, { from, to, format = 'csv' } = {}) {
  await assertOwnership(userId, accountId);
  if (!['csv', 'pdf'].includes(format)) throw new AppError('format must be csv or pdf.', 400);
  if (from && Number.isNaN(new Date(from).getTime())) throw new AppError('from is not a valid date.', 400);
  if (to && Number.isNaN(new Date(to).getTime())) throw new AppError('to is not a valid date.', 400);
  if (from && to && new Date(from) > new Date(to)) throw new AppError('from must not be after to.', 400);
  const data = await statements.build(accountId, { from, to });
  await logActivity(userId, `Statement generated (${format.toUpperCase()}) for account ${accountId}`, 'Account', Number(accountId));
  if (format === 'pdf') return { format, body: await statements.toPdf(data), contentType: 'application/pdf' };
  return { format, body: statements.toCsv(data), contentType: 'text/csv' };
}

// F10 (read-only profile) + F14 (last login timestamp).
async function getProfile(userId) {
  const customer = await getCustomerOrThrow(userId);
  const user = await User.findByPk(userId, {
    attributes: ['id', 'username', 'email', 'phoneNumber', 'lastLoginAt', 'previousLoginAt', 'role'],
  });
  return { user, customer };
}

// F11: only contact details are editable — everything else stays read-only.
async function updateProfile(userId, updates) {
  const customer = await getCustomerOrThrow(userId);
  const user = await User.findByPk(userId);

  const allowedCustomerFields = ['addressStreet', 'addressCity', 'addressState', 'addressPincode'];
  const allowedUserFields = ['email', 'phoneNumber'];

  if (updates.email !== undefined) {
    const existing = await User.findOne({ where: { email: updates.email } });
    if (existing && existing.id !== user.id) throw new AppError('That email is already in use.', 400);
  }
  if (updates.phoneNumber !== undefined) {
    const existing = await User.findOne({ where: { phoneNumber: updates.phoneNumber } });
    if (existing && existing.id !== user.id) throw new AppError('That phone number is already in use.', 400);
  }

  for (const f of allowedCustomerFields) if (updates[f] !== undefined) customer[f] = updates[f];
  for (const f of allowedUserFields) if (updates[f] !== undefined) user[f] = updates[f];

  await customer.save();
  await user.save();
  await logActivity(userId, 'Profile contact details updated', 'Customer', customer.id);

  return {
    message: 'Profile updated.',
    customer,
    user: { id: user.id, email: user.email, phoneNumber: user.phoneNumber },
  };
}

module.exports = { listAccounts, getAccount, getTransactions, getStatement, getProfile, updateProfile, assertOwnership };
