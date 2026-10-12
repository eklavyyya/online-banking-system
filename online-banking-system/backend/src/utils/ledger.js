const { Transaction } = require('../models');

// Phase 2 puts every balance change on the ledger. For the two credit-only
// types the account being credited is stored in source_account_id (the
// "account of record"), so direction is decided by type first.
const CREDIT_ONLY_TYPES = new Set(['DepositPayout', 'LoanDisbursal']);

function directionFor(txn, accountId) {
  const id = Number(accountId);
  if (CREDIT_ONLY_TYPES.has(txn.transactionType)) return 'credit';
  if (Number(txn.sourceAccountId) === id) return 'debit';
  if (Number(txn.destinationAccountId) === id) return 'credit';
  return 'debit';
}

function newReference(prefix) {
  return `${prefix}${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
}

// Writes a completed ledger entry inside the caller's DB transaction.
async function recordLedger({ accountId, type, amount, prefix = 'LDG', transaction }) {
  const now = new Date();
  return Transaction.create({
    sourceAccountId: accountId,
    transactionType: type,
    amount,
    status: 'Success',
    referenceNumber: newReference(prefix),
    initiatedAt: now,
    completedAt: now,
  }, { transaction });
}

module.exports = { CREDIT_ONLY_TYPES, directionFor, recordLedger, newReference };
