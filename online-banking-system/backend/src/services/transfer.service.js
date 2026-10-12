const { sequelize, Account, Beneficiary, Transaction, User, AccountHolder } = require('../models');
const { Op } = require('sequelize');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { verifyMpin } = require('../utils/mpin.util');
const { logActivity } = require('../utils/activityLogger');
const { round2 } = require('../utils/emi');
const { AppError } = require('../middleware/errorHandler.middleware');
const { simulateCbsPosting } = require('../utils/cbsSimulator');
const beneficiaryService = require('./beneficiary.service');
const { alertAccountHolders, alertAccountHoldersAlways } = require('../utils/notify');
const { maskAccountNumber } = require('../utils/mask');

const RTGS_MIN_AMOUNT = parseFloat(process.env.RTGS_MIN_AMOUNT || '200000');
// Resolves SRS TBD-5 (mode-specific caps): IMPS is limited per transaction as
// on the real network, NEFT has a high ceiling, own-account transfers are uncapped.
const IMPS_MAX_AMOUNT = parseFloat(process.env.IMPS_MAX_AMOUNT || '500000');
const NEFT_MAX_AMOUNT = parseFloat(process.env.NEFT_MAX_AMOUNT || '2500000');
const PENDING_CONFIRM_WINDOW_MS = 5 * 60 * 1000; // 5 minutes to confirm before it's treated as abandoned

// ============================================================
// Phase 4.1 + 4.2 (Exp-3 Level-2 DFD): Select Beneficiary & Enter
// Amount, then Validate Balance & Transfer Rules.
// State machine (Exp-5): Initiated -> Validating -> Authenticating.
//
// The validated intent is persisted immediately as a Transaction row with
// status='Pending', rather than handed back as a bearer token. This is a
// deliberate change from the original design sketch: a stateless signed
// token could be replayed to re-execute the same transfer multiple times
// within its validity window (caught during testing). Using the row's own
// status as the single-use guard closes that gap - confirm() below can
// only ever act on a transaction that is still Pending.
// ============================================================
async function initiate(userId, data) {
  const customer = await getCustomerOrThrow(userId);
  const { sourceAccountId, amount, mode, beneficiaryId, destinationAccountId } = data;

  if (!sourceAccountId || !amount || !mode) {
    throw new AppError('sourceAccountId, amount, and mode are required.', 400);
  }
  if (!['Own-Transfer', 'NEFT', 'RTGS', 'IMPS'].includes(mode)) {
    throw new AppError('mode must be one of Own-Transfer, NEFT, RTGS, IMPS.', 400);
  }
  const numericAmount = parseFloat(amount);
  if (!(numericAmount > 0)) {
    throw new AppError('amount must be a positive number.', 400);
  }

  const sourceHolding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId: sourceAccountId } });
  if (!sourceHolding) throw new AppError('Source account not found or not linked to your profile.', 404);
  const sourceAccount = await Account.findByPk(sourceAccountId);
  if (sourceAccount.status !== 'Active') throw new AppError('Source account is not active.', 400);

  let resolvedBeneficiaryId = null;
  let resolvedDestinationId = null;

  if (mode === 'Own-Transfer') {
    if (!destinationAccountId) throw new AppError('destinationAccountId is required for an own-account transfer.', 400);
    if (parseInt(destinationAccountId, 10) === parseInt(sourceAccountId, 10)) {
      throw new AppError('Source and destination accounts must be different.', 400);
    }
    const destHolding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId: destinationAccountId } });
    if (!destHolding) throw new AppError('Destination account not found or not linked to your profile.', 404);
    resolvedDestinationId = destinationAccountId;
  } else {
    if (!beneficiaryId) throw new AppError('beneficiaryId is required for a third-party transfer.', 400);
    const beneficiary = await Beneficiary.findOne({ where: { id: beneficiaryId, customerId: customer.id } });
    if (!beneficiary || beneficiary.status === 'Deleted') throw new AppError('Beneficiary not found.', 404);
    await beneficiaryService.refreshStatus(beneficiary);
    if (beneficiary.status !== 'Active') {
      throw new AppError('This beneficiary is still in its cooling-off period and cannot receive transfers yet.', 400);
    }
    if (beneficiary.transferLimit && numericAmount > parseFloat(beneficiary.transferLimit)) {
      throw new AppError(`This transfer exceeds the configured limit for this beneficiary (\u20b9${beneficiary.transferLimit}).`, 400);
    }
    resolvedBeneficiaryId = beneficiary.id;
  }

  if (mode === 'RTGS' && numericAmount < RTGS_MIN_AMOUNT) {
    throw new AppError(`RTGS transfers require a minimum of \u20b9${RTGS_MIN_AMOUNT}.`, 400);
  }
  if (mode === 'IMPS' && numericAmount > IMPS_MAX_AMOUNT) {
    throw new AppError(`IMPS transfers are limited to \u20b9${IMPS_MAX_AMOUNT} per transaction. Use NEFT or RTGS for larger amounts.`, 400);
  }
  if (mode === 'NEFT' && numericAmount > NEFT_MAX_AMOUNT) {
    throw new AppError(`NEFT transfers are limited to \u20b9${NEFT_MAX_AMOUNT} per transaction. Use RTGS for larger amounts.`, 400);
  }
  if (parseFloat(sourceAccount.balance) < numericAmount) {
    throw new AppError('Insufficient balance for this transfer.', 400);
  }

  const transaction = await Transaction.create({
    sourceAccountId,
    destinationAccountId: resolvedDestinationId,
    beneficiaryId: resolvedBeneficiaryId,
    transactionType: mode,
    amount: numericAmount,
    status: 'Pending',
    initiatedAt: new Date(),
  });

  await logActivity(userId, `Transfer validated, awaiting MPIN: transaction ${transaction.id}`, 'Transaction', transaction.id);

  return {
    transactionId: transaction.id,
    message: 'Transfer validated. Enter your MPIN to confirm.',
    expiresInSeconds: PENDING_CONFIRM_WINDOW_MS / 1000,
    summary: { sourceAccountId: parseInt(sourceAccountId, 10), destinationAccountId: resolvedDestinationId, beneficiaryId: resolvedBeneficiaryId, amount: numericAmount, mode },
  };
}

// ============================================================
// Phase 4.3 + 4.4 + 4.5 (Exp-3 Level-2 DFD): Authenticate with MPIN,
// Execute Debit/Credit, Generate Reference & Notify.
// State machine (Exp-5): Authenticating -> Processing -> Completed/Failed.
// ============================================================
async function confirm(userId, transactionId, mpin) {
  if (!transactionId || !mpin) throw new AppError('transactionId and mpin are required.', 400);

  const customer = await getCustomerOrThrow(userId);
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) throw new AppError('Transfer not found.', 404);

  const sourceHolding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId: transaction.sourceAccountId } });
  if (!sourceHolding) throw new AppError('Transfer not found.', 404);

  // Single-use guard: once a transaction leaves Pending, it can never be
  // confirmed again - this is what actually prevents replay, not the
  // request itself being hard to reconstruct.
  if (transaction.status !== 'Pending') {
    throw new AppError('This transfer has already been processed and cannot be confirmed again.', 400);
  }
  if (Date.now() - new Date(transaction.initiatedAt).getTime() > PENDING_CONFIRM_WINDOW_MS) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Not confirmed within the allowed time window.';
    transaction.completedAt = new Date();
    await transaction.save();
    throw new AppError('This transfer request has expired. Please start again.', 400);
  }

  const user = await User.findByPk(userId);
  await verifyMpin(user, mpin); // throws on failure, with its own lockout

  const sourceAccount = await Account.findByPk(transaction.sourceAccountId);
  if (!sourceAccount || parseFloat(sourceAccount.balance) < parseFloat(transaction.amount)) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Insufficient balance at confirmation time.';
    transaction.completedAt = new Date();
    await transaction.save();
    throw new AppError('Insufficient balance for this transfer.', 400);
  }

  const posted = simulateCbsPosting();
  if (!posted) {
    transaction.status = 'Failed';
    transaction.failureReason = 'Core Banking System declined the posting (simulated).';
    transaction.completedAt = new Date();
    await transaction.save();
    await logActivity(userId, `Transfer failed (CBS declined): transaction ${transaction.id}`, 'Transaction', transaction.id);
    await notify(user, transaction, 'failed');
    throw new AppError('The transfer could not be completed by the Core Banking System. No funds were moved. Please try again.', 502);
  }

  const referenceNumber = 'UTR' + Date.now() + Math.floor(Math.random() * 1000);
  await sequelize.transaction(async (t) => {
    const freshSource = await Account.findByPk(transaction.sourceAccountId, { transaction: t, lock: t.LOCK.UPDATE });
    freshSource.balance = round2(parseFloat(freshSource.balance) - parseFloat(transaction.amount));
    await freshSource.save({ transaction: t });

    if (transaction.destinationAccountId) {
      const destAccount = await Account.findByPk(transaction.destinationAccountId, { transaction: t, lock: t.LOCK.UPDATE });
      destAccount.balance = round2(parseFloat(destAccount.balance) + parseFloat(transaction.amount));
      await destAccount.save({ transaction: t });
    }

    transaction.status = 'Success';
    transaction.referenceNumber = referenceNumber;
    transaction.completedAt = new Date();
    await transaction.save({ transaction: t });
  });

  await logActivity(userId, `Transfer completed: ${transaction.transactionType} of ${transaction.amount}, ref ${referenceNumber}`, 'Transaction', transaction.id);
  await notify(user, transaction, 'success');

  return { status: 'Success', referenceNumber, transaction };
}

// SRS F28/F55: debit alert to every holder of the source account, credit
// alert to every holder of an own-account destination. Failures always alert.
async function notify(user, transaction, outcome) {
  const source = await Account.findByPk(transaction.sourceAccountId);
  const amount = parseFloat(transaction.amount);
  if (outcome !== 'success') {
    await alertAccountHoldersAlways(source.id, `Your ${transaction.transactionType} transfer of \u20b9${amount} could not be completed. No funds were moved.`);
    return;
  }
  await alertAccountHolders(source.id, amount, `Debit alert: \u20b9${amount} sent via ${transaction.transactionType} from A/c ${maskAccountNumber(source.accountNumber)}. Ref: ${transaction.referenceNumber}.`);
  if (transaction.destinationAccountId) {
    const dest = await Account.findByPk(transaction.destinationAccountId);
    await alertAccountHolders(dest.id, amount, `Credit alert: \u20b9${amount} credited to A/c ${maskAccountNumber(dest.accountNumber)} from A/c ${maskAccountNumber(source.accountNumber)}. Ref: ${transaction.referenceNumber}.`);
  }
}

async function getOne(userId, transactionId) {
  const customer = await getCustomerOrThrow(userId);
  const holdings = await AccountHolder.findAll({ where: { customerId: customer.id }, attributes: ['accountId'] });
  const accountIds = holdings.map((h) => h.accountId);
  const txn = await Transaction.findOne({ where: { id: transactionId, sourceAccountId: { [Op.in]: accountIds } } });
  if (!txn) throw new AppError('Transaction not found.', 404);
  return txn;
}

module.exports = { initiate, confirm, getOne };
