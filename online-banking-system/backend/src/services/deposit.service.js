const { Op } = require('sequelize');
const { sequelize, Account, Deposit, AccountHolder, User } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { verifyMpin } = require('../utils/mpin.util');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const { recordLedger } = require('../utils/ledger');
const { addMonths, isoDate, round2 } = require('../utils/emi');
const { maskAccountNumber } = require('../utils/mask');
const { alertAccountHolders } = require('../utils/notify');

const MAX_TENURE_MONTHS = 120;

// Resolves SRS Appendix C, TBD-1: "Exact interest-rate table for Fixed and
// Recurring Deposits by tenure band." Simple tenure bands, FD paying more
// than RD (both realistic and consistent with typical retail-banking rate
// structures).
function interestRateFor(depositType, tenureMonths) {
  const table = depositType === 'FD'
    ? [[12, 5.5], [24, 6.5], [Infinity, 7.0]]
    : [[12, 5.0], [24, 6.0], [Infinity, 6.5]];
  const band = table.find(([maxMonths]) => tenureMonths <= maxMonths);
  return band[1];
}

// FD: simple interest on the principal, consistent with seed.js.
function computeMaturity(principal, rate, tenureMonths) {
  return round2(principal * (1 + (rate / 100) * (tenureMonths / 12)));
}

// RD: instalment k is paid at the start of month k and so earns interest for
// (tenure - k + 1) months. paidCount lets the same formula price a projected
// maturity (all instalments paid) and an actual one (some missed).
function computeRdMaturity(installment, rate, tenureMonths, paidCount = tenureMonths) {
  let interest = 0;
  for (let k = 1; k <= paidCount; k += 1) {
    interest += installment * (rate / 100) * ((tenureMonths - k + 1) / 12);
  }
  return round2(installment * paidCount + interest);
}

function monthsBetween(from, to) {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

async function holderAccountIds(userId) {
  const customer = await getCustomerOrThrow(userId);
  const holdings = await AccountHolder.findAll({ where: { customerId: customer.id }, attributes: ['accountId'] });
  return { customer, accountIds: holdings.map((h) => h.accountId) };
}

function serialize(deposit, account) {
  const json = deposit.toJSON();
  return {
    ...json,
    accountNumberMasked: account ? maskAccountNumber(account.accountNumber) : null,
    installmentsRemaining: deposit.depositType === 'RD' ? deposit.tenureMonths - deposit.installmentsPaid : null,
    installmentOverdue: deposit.depositType === 'RD' && deposit.status === 'Active' && !!deposit.nextInstallmentDate
      && new Date(deposit.nextInstallmentDate) <= new Date(),
  };
}

// SRS F34/F35/F36: open a new FD or RD. For an RD, principalAmount in the
// request is the monthly instalment; the first instalment is debited now.
// Needs the MPIN (SRS S7: every fund movement) and is atomic (SRS R2).
async function open(userId, data) {
  const { customer, accountIds } = await holderAccountIds(userId);
  const { accountId, depositType, principalAmount, tenureMonths, mpin } = data || {};

  if (!accountId || !depositType || !principalAmount || !tenureMonths) {
    throw new AppError('accountId, depositType, principalAmount, and tenureMonths are required.', 400);
  }
  if (!['FD', 'RD'].includes(depositType)) throw new AppError('depositType must be FD or RD.', 400);
  const amount = parseFloat(principalAmount);
  const tenure = parseInt(tenureMonths, 10);
  if (!(amount > 0)) throw new AppError('principalAmount must be positive.', 400);
  if (!(tenure > 0)) throw new AppError('tenureMonths must be positive.', 400);
  if (tenure > MAX_TENURE_MONTHS) throw new AppError(`tenureMonths cannot exceed ${MAX_TENURE_MONTHS}.`, 400);
  if (depositType === 'RD' && tenure < 6) throw new AppError('A recurring deposit needs a tenure of at least 6 months.', 400);

  if (!accountIds.includes(Number(accountId))) throw new AppError('Account not found or not linked to your profile.', 404);
  const account = await Account.findByPk(accountId);
  if (account.status !== 'Active') throw new AppError('Account is not active.', 400);
  if (parseFloat(account.balance) < amount) throw new AppError('Insufficient balance to open this deposit.', 400);

  if (!mpin) throw new AppError('mpin is required to open a deposit.', 400);
  const user = await User.findByPk(userId);
  await verifyMpin(user, mpin);

  const interestRate = interestRateFor(depositType, tenure);
  const openedAt = new Date();
  const maturityDate = isoDate(addMonths(openedAt, tenure));
  const isRd = depositType === 'RD';

  let deposit;
  await sequelize.transaction(async (t) => {
    const fresh = await Account.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
    if (parseFloat(fresh.balance) < amount) throw new AppError('Insufficient balance to open this deposit.', 400);
    fresh.balance = round2(parseFloat(fresh.balance) - amount);
    await fresh.save({ transaction: t });

    deposit = await Deposit.create({
      accountId,
      depositType,
      principalAmount: isRd ? round2(amount * tenure) : amount,
      interestRate,
      tenureMonths: tenure,
      maturityDate,
      maturityAmount: isRd ? computeRdMaturity(amount, interestRate, tenure) : computeMaturity(amount, interestRate, tenure),
      installmentAmount: isRd ? amount : null,
      installmentsPaid: isRd ? 1 : 0,
      nextInstallmentDate: isRd && tenure > 1 ? isoDate(addMonths(openedAt, 1)) : null,
      status: 'Active',
    }, { transaction: t });

    await recordLedger({ accountId, type: 'DepositOpen', amount, prefix: depositType, transaction: t });
  });

  await logActivity(userId, `${depositType} opened: ${isRd ? 'instalment' : 'principal'} ${amount}, ${tenure} months @ ${interestRate}%`, 'Deposit', deposit.id);
  await alertAccountHolders(accountId, amount, `Debit alert: ₹${amount} debited from A/c ${maskAccountNumber(account.accountNumber)} to open a ${depositType === 'FD' ? 'fixed' : 'recurring'} deposit (${tenure} months @ ${interestRate}%).`);
  return serialize(deposit, account);
}

// SRS F35/F39: system actions applied lazily the next time a deposit is read.
// 1) Due RD instalments are debited in order, as long as the account can pay.
// 2) On the maturity date the proceeds are credited and the deposit is Matured.
async function refresh(depositId) {
  let credited = null;
  await sequelize.transaction(async (t) => {
    const deposit = await Deposit.findByPk(depositId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!deposit || deposit.status !== 'Active') return;
    const now = new Date();

    if (deposit.depositType === 'RD') {
      const opened = new Date(deposit.createdAt);
      while (deposit.installmentsPaid < deposit.tenureMonths && deposit.nextInstallmentDate
        && new Date(deposit.nextInstallmentDate) <= now && new Date(deposit.nextInstallmentDate) < new Date(deposit.maturityDate)) {
        const account = await Account.findByPk(deposit.accountId, { transaction: t, lock: t.LOCK.UPDATE });
        const amt = parseFloat(deposit.installmentAmount);
        if (account.status !== 'Active' || parseFloat(account.balance) < amt) break; // stays overdue, retried on next read
        account.balance = round2(parseFloat(account.balance) - amt);
        await account.save({ transaction: t });
        await recordLedger({ accountId: deposit.accountId, type: 'RDInstallment', amount: amt, prefix: 'RD', transaction: t });
        deposit.installmentsPaid += 1;
        deposit.nextInstallmentDate = deposit.installmentsPaid < deposit.tenureMonths
          ? isoDate(addMonths(opened, deposit.installmentsPaid)) : null;
        await deposit.save({ transaction: t });
      }
    }

    if (new Date(deposit.maturityDate) <= now) {
      let payout = parseFloat(deposit.maturityAmount);
      if (deposit.depositType === 'RD') {
        payout = computeRdMaturity(parseFloat(deposit.installmentAmount), parseFloat(deposit.interestRate), deposit.tenureMonths, deposit.installmentsPaid);
        deposit.maturityAmount = payout;
      }
      const account = await Account.findByPk(deposit.accountId, { transaction: t, lock: t.LOCK.UPDATE });
      account.balance = round2(parseFloat(account.balance) + payout);
      await account.save({ transaction: t });
      await recordLedger({ accountId: deposit.accountId, type: 'DepositPayout', amount: payout, prefix: 'MAT', transaction: t });
      deposit.status = 'Matured';
      deposit.nextInstallmentDate = null;
      await deposit.save({ transaction: t });
      credited = { accountId: deposit.accountId, payout, type: deposit.depositType };
    }
  });

  if (credited) {
    const account = await Account.findByPk(credited.accountId);
    await alertAccountHolders(credited.accountId, credited.payout, `Credit alert: your ${credited.type} has matured. ₹${credited.payout} credited to A/c ${maskAccountNumber(account.accountNumber)}.`);
  }
  return Deposit.findByPk(depositId);
}

// SRS F38
async function list(userId) {
  const { accountIds } = await holderAccountIds(userId);
  const ids = (await Deposit.findAll({ where: { accountId: { [Op.in]: accountIds } }, attributes: ['id'] })).map((d) => d.id);
  for (const id of ids) await refresh(id);
  const deposits = await Deposit.findAll({ where: { accountId: { [Op.in]: accountIds } }, order: [['id', 'DESC']] });
  const accounts = await Account.findAll({ where: { id: { [Op.in]: accountIds } } });
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  return deposits.map((d) => serialize(d, byId[d.accountId]));
}

async function getOne(userId, depositId) {
  const { accountIds } = await holderAccountIds(userId);
  const found = await Deposit.findOne({ where: { id: depositId, accountId: { [Op.in]: accountIds } } });
  if (!found) throw new AppError('Deposit not found.', 404);
  const deposit = await refresh(found.id);
  return serialize(deposit, await Account.findByPk(deposit.accountId));
}

// Resolves SRS Appendix C, TBD-2: "Exact premature-closure penalty
// percentage." Policy: interest for the elapsed period only, at a rate
// 1 percentage point below the deposit's contracted rate - a standard,
// realistic penalty structure (SRS F37).
const PREMATURE_PENALTY_POINTS = 1.0;

async function closePrematurely(userId, depositId, { mpin } = {}) {
  const found = await getOne(userId, depositId);
  if (found.status !== 'Active') {
    throw new AppError(`This deposit is already ${found.status.toLowerCase()} and cannot be closed again.`, 400);
  }
  if (!mpin) throw new AppError('mpin is required to close a deposit.', 400);
  const user = await User.findByPk(userId);
  await verifyMpin(user, mpin);

  const penalizedRate = Math.max(0, parseFloat(found.interestRate) - PREMATURE_PENALTY_POINTS);
  const elapsedMonths = monthsBetween(new Date(found.createdAt), new Date());

  let proceeds;
  let result;
  await sequelize.transaction(async (t) => {
    const deposit = await Deposit.findByPk(depositId, { transaction: t, lock: t.LOCK.UPDATE });
    if (deposit.status !== 'Active') throw new AppError('This deposit is no longer active.', 400);

    if (deposit.depositType === 'RD') {
      const p = parseFloat(deposit.installmentAmount);
      let interest = 0;
      for (let k = 1; k <= deposit.installmentsPaid; k += 1) {
        interest += p * (penalizedRate / 100) * (Math.max(0, elapsedMonths - (k - 1)) / 12);
      }
      proceeds = round2(p * deposit.installmentsPaid + interest);
    } else {
      proceeds = computeMaturity(parseFloat(deposit.principalAmount), penalizedRate, elapsedMonths);
    }

    const account = await Account.findByPk(deposit.accountId, { transaction: t, lock: t.LOCK.UPDATE });
    account.balance = round2(parseFloat(account.balance) + proceeds);
    await account.save({ transaction: t });
    await recordLedger({ accountId: deposit.accountId, type: 'DepositPayout', amount: proceeds, prefix: 'PRC', transaction: t });

    deposit.status = 'Closed Prematurely';
    deposit.nextInstallmentDate = null;
    await deposit.save({ transaction: t });
    result = deposit;
  });

  await logActivity(userId, `${result.depositType} closed prematurely: proceeds ${proceeds} credited (penalized rate ${penalizedRate}%)`, 'Deposit', result.id);
  const account = await Account.findByPk(result.accountId);
  await alertAccountHolders(result.accountId, proceeds, `Credit alert: ₹${proceeds} credited to A/c ${maskAccountNumber(account.accountNumber)} on premature closure of your ${result.depositType}.`);
  return { message: 'Deposit closed prematurely.', proceeds, penalizedRate, elapsedMonths, deposit: serialize(result, account) };
}

module.exports = { open, list, getOne, closePrematurely, interestRateFor, computeMaturity, computeRdMaturity };
