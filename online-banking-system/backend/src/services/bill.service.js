const { sequelize, Account, Biller, Transaction, User, AccountHolder } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { verifyMpin } = require('../utils/mpin.util');
const { logActivity } = require('../utils/activityLogger');
const { round2 } = require('../utils/emi');
const { AppError } = require('../middleware/errorHandler.middleware');
const { simulateCbsPosting } = require('../utils/cbsSimulator');
const { alertAccountHolders, alertAccountHoldersAlways } = require('../utils/notify');
const { maskAccountNumber } = require('../utils/mask');

const PENDING_CONFIRM_WINDOW_MS = 5 * 60 * 1000;

// ============================================================
// Initiate: SRS F30 (pay a saved biller) or F31 (direct recharge,
// no saved biller required). SRS S7 requires MPIN confirmation for
// every fund-movement action, so this follows the same
// initiate -> Pending -> confirm pattern proven in Fund Transfer,
// including the same single-use guard (see transfer.service.js).
// ============================================================
async function initiate(userId, data) {
  const customer = await getCustomerOrThrow(userId);
  const { sourceAccountId, amount, billerId } = data;

  if (!sourceAccountId || !amount) {
    throw new AppError('sourceAccountId and amount are required.', 400);
  }
  const numericAmount = parseFloat(amount);
  if (!(numericAmount > 0)) throw new AppError('amount must be a positive number.', 400);

  const sourceHolding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId: sourceAccountId } });
  if (!sourceHolding) throw new AppError('Source account not found or not linked to your profile.', 404);
  const sourceAccount = await Account.findByPk(sourceAccountId);
  if (sourceAccount.status !== 'Active') throw new AppError('Source account is not active.', 400);
  if (parseFloat(sourceAccount.balance) < numericAmount) {
    throw new AppError('Insufficient balance for this payment.', 400);
  }

  let transactionType = 'Recharge';
  let resolvedBillerId = null;
  if (billerId) {
    // F30: paying a saved biller.
    const biller = await Biller.findOne({ where: { id: billerId, customerId: customer.id } });
    if (!biller) throw new AppError('Biller not found.', 404);
    resolvedBillerId = biller.id;
    transactionType = 'BillPay';
  }
  // else: F31, a direct mobile/DTH recharge with no saved biller - allowed as-is.

  const transaction = await Transaction.create({
    sourceAccountId,
    beneficiaryId: null,
    billerId: resolvedBillerId,
    transactionType,
    amount: numericAmount,
    status: 'Pending',
    initiatedAt: new Date(),
  });

  await logActivity(userId, `${transactionType} validated, awaiting MPIN: transaction ${transaction.id}`, 'Transaction', transaction.id);

  return {
    transactionId: transaction.id,
    message: 'Payment validated. Enter your MPIN to confirm.',
    expiresInSeconds: PENDING_CONFIRM_WINDOW_MS / 1000,
    summary: { sourceAccountId: parseInt(sourceAccountId, 10), billerId: resolvedBillerId, amount: numericAmount, transactionType },
  };
}

async function confirm(userId, transactionId, mpin) {
  if (!transactionId || !mpin) throw new AppError('transactionId and mpin are required.', 400);

  const customer = await getCustomerOrThrow(userId);
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction || !['BillPay', 'Recharge'].includes(transaction.transactionType)) {
    throw new AppError('Payment not found.', 404);
  }

  const sourceHolding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId: transaction.sourceAccountId } });
  if (!sourceHolding) throw new AppError('Payment not found.', 404);

  if (transaction.status !== 'Pending') {
    throw new AppError('This payment has already been processed and cannot be confirmed again.', 400);
  }
  if (Date.now() - new Date(transaction.initiatedAt).getTime() > PENDING_CONFIRM_WINDOW_MS) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Not confirmed within the allowed time window.';
    transaction.completedAt = new Date();
    await transaction.save();
    throw new AppError('This payment request has expired. Please start again.', 400);
  }

  const user = await User.findByPk(userId);
  await verifyMpin(user, mpin);

  const sourceAccount = await Account.findByPk(transaction.sourceAccountId);
  if (!sourceAccount || parseFloat(sourceAccount.balance) < parseFloat(transaction.amount)) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Insufficient balance at confirmation time.';
    transaction.completedAt = new Date();
    await transaction.save();
    throw new AppError('Insufficient balance for this payment.', 400);
  }

  const posted = simulateCbsPosting();
  if (!posted) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Core Banking System declined the posting (simulated).';
    transaction.completedAt = new Date();
    await transaction.save();
    await logActivity(userId, `${transaction.transactionType} failed (CBS declined): transaction ${transaction.id}`, 'Transaction', transaction.id);
    await notify(user, transaction, 'failed');
    throw new AppError('The payment could not be completed by the Core Banking System. No funds were moved. Please try again.', 502);
  }

  const referenceNumber = 'UTR' + Date.now() + Math.floor(Math.random() * 1000);
  await sequelize.transaction(async (t) => {
    const freshSource = await Account.findByPk(transaction.sourceAccountId, { transaction: t, lock: t.LOCK.UPDATE });
    freshSource.balance = round2(parseFloat(freshSource.balance) - parseFloat(transaction.amount));
    await freshSource.save({ transaction: t });

    transaction.status = 'Success';
    transaction.referenceNumber = referenceNumber;
    transaction.completedAt = new Date();
    await transaction.save({ transaction: t });
  });

  await logActivity(userId, `${transaction.transactionType} completed: ${transaction.amount}, ref ${referenceNumber}`, 'Transaction', transaction.id);
  await notify(user, transaction, 'success');

  return { status: 'Success', referenceNumber, transaction };
}

async function notify(user, transaction, outcome) {
  const label = transaction.transactionType === 'BillPay' ? 'bill payment' : 'recharge';
  const amount = parseFloat(transaction.amount);
  if (outcome !== 'success') {
    await alertAccountHoldersAlways(transaction.sourceAccountId, `Your ${label} of \u20b9${amount} could not be completed. No funds were moved.`);
    return;
  }
  const source = await Account.findByPk(transaction.sourceAccountId);
  await alertAccountHolders(source.id, amount, `Debit alert: \u20b9${amount} paid for ${label} from A/c ${maskAccountNumber(source.accountNumber)}. Ref: ${transaction.referenceNumber}.`);
}

// SRS F33: bill payment / recharge history, filterable by date range and biller.
async function history(userId, { from, to, billerId } = {}) {
  const customer = await getCustomerOrThrow(userId);
  const holdings = await AccountHolder.findAll({ where: { customerId: customer.id }, attributes: ['accountId'] });
  const accountIds = holdings.map((h) => h.accountId);
  const { Op } = require('sequelize');
  const where = { sourceAccountId: { [Op.in]: accountIds }, transactionType: { [Op.in]: ['BillPay', 'Recharge'] } };
  if (billerId) where.billerId = billerId;
  if (from || to) {
    where.initiatedAt = {};
    if (from) where.initiatedAt[Op.gte] = new Date(from);
    if (to) where.initiatedAt[Op.lte] = new Date(to);
  }
  return Transaction.findAll({ where, order: [['initiatedAt', 'DESC']] });
}

module.exports = { initiate, confirm, history };
