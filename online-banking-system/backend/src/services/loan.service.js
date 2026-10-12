const { Op } = require('sequelize');
const { sequelize, Loan, Account, AccountHolder, Customer, User } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { verifyMpin } = require('../utils/mpin.util');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const { simulateCbsPosting } = require('../utils/cbsSimulator');
const { computeEmi, buildSchedule, summarise, addMonths, isoDate, round2 } = require('../utils/emi');
const { recordLedger } = require('../utils/ledger');
const { maskAccountNumber } = require('../utils/mask');
const { notifyCustomer, alertAccountHolders, holderCustomerIds } = require('../utils/notify');
const { paginate, pageResult } = require('../utils/pagination');

// Loan products. Resolves the rate/limit gaps the SRS leaves open for the
// "pre-approved" loan flow (F42): a customer's pre-approved limit for each
// product is 10x their total balance, capped at the product maximum.
const PRODUCTS = {
  Personal: { rate: 11.5, minAmount: 10000, maxAmount: 500000, minTenure: 6, maxTenure: 60 },
  Education: { rate: 9.5, minAmount: 25000, maxAmount: 1000000, minTenure: 12, maxTenure: 84 },
  Vehicle: { rate: 9.0, minAmount: 50000, maxAmount: 800000, minTenure: 12, maxTenure: 84 },
  Home: { rate: 8.5, minAmount: 100000, maxAmount: 5000000, minTenure: 60, maxTenure: 240 },
};
const PRE_APPROVAL_MULTIPLE = 10;
const MAX_OPEN_APPLICATIONS = 3;

async function holderAccountIds(customerId) {
  const holdings = await AccountHolder.findAll({ where: { customerId }, attributes: ['accountId'] });
  return holdings.map((h) => h.accountId);
}

function serialize(loan) {
  const json = loan.toJSON();
  const account = loan.Account;
  const applicant = loan.Customer;
  const out = {
    ...json,
    accountNumberMasked: account ? maskAccountNumber(account.accountNumber) : null,
    applicantName: applicant ? applicant.fullName : null,
  };
  delete out.Account;
  delete out.Customer;
  if (loan.status === 'Active') {
    const schedule = buildSchedule(loan.principalAmount, loan.interestRate, loan.tenureMonths, loan.disbursedAt);
    const next = schedule[loan.emisPaid] || null;
    out.emisRemaining = loan.tenureMonths - loan.emisPaid;
    out.nextEmiAmount = next ? next.emi : null;
    out.nextEmiDate = next ? next.dueDate : null;
  } else {
    out.emisRemaining = loan.status === 'Closed' ? 0 : loan.tenureMonths;
    out.nextEmiAmount = null;
  }
  return out;
}

const INCLUDE = [
  { model: Account, attributes: ['id', 'accountNumber'] },
  { model: Customer, attributes: ['id', 'fullName'] },
];

async function offers(userId) {
  const customer = await getCustomerOrThrow(userId);
  const ids = await holderAccountIds(customer.id);
  const accounts = await Account.findAll({ where: { id: { [Op.in]: ids }, status: 'Active' } });
  const totalBalance = round2(accounts.reduce((s, a) => s + parseFloat(a.balance), 0));
  const products = Object.entries(PRODUCTS).map(([loanType, p]) => {
    const preApproved = Math.min(p.maxAmount, Math.floor((totalBalance * PRE_APPROVAL_MULTIPLE) / 1000) * 1000);
    return {
      loanType,
      interestRate: p.rate,
      minAmount: p.minAmount,
      productMaxAmount: p.maxAmount,
      preApprovedLimit: preApproved >= p.minAmount ? preApproved : 0,
      eligible: preApproved >= p.minAmount,
      minTenureMonths: p.minTenure,
      maxTenureMonths: p.maxTenure,
    };
  });
  return {
    totalBalance,
    rule: `Pre-approved limit = ${PRE_APPROVAL_MULTIPLE}x your total balance, capped at the product maximum.`,
    products,
  };
}

// SRS F41: standalone EMI calculator, pure computation (P6).
function calculate({ principal, annualRatePercent, tenureMonths }) {
  const P = Number(principal);
  const r = Number(annualRatePercent);
  const n = parseInt(tenureMonths, 10);
  if (!(P > 0) || P > 100000000) throw new AppError('principal must be a positive amount (up to 10 crore).', 400);
  if (!(r >= 0) || r > 40) throw new AppError('annualRatePercent must be between 0 and 40.', 400);
  if (!Number.isInteger(n) || n < 1 || n > 360) throw new AppError('tenureMonths must be a whole number between 1 and 360.', 400);
  return { ...summarise(P, r, n), schedule: buildSchedule(P, r, n, null) };
}

// SRS F40: loans visible to a customer = loans on any account they hold,
// plus applications they raised themselves.
async function list(userId) {
  const customer = await getCustomerOrThrow(userId);
  const ids = await holderAccountIds(customer.id);
  const loans = await Loan.findAll({
    where: { [Op.or]: [{ accountId: { [Op.in]: ids } }, { customerId: customer.id }] },
    include: INCLUDE,
    order: [['id', 'DESC']],
  });
  return loans.map(serialize);
}

async function getOwned(userId, loanId) {
  const customer = await getCustomerOrThrow(userId);
  const ids = await holderAccountIds(customer.id);
  const loan = await Loan.findOne({
    where: { id: loanId, [Op.or]: [{ accountId: { [Op.in]: ids } }, { customerId: customer.id }] },
    include: INCLUDE,
  });
  if (!loan) throw new AppError('Loan not found.', 404);
  return { customer, loan };
}

async function getOne(userId, loanId) {
  const { loan } = await getOwned(userId, loanId);
  const schedule = buildSchedule(loan.principalAmount, loan.interestRate, loan.tenureMonths, loan.status === 'Active' || loan.status === 'Closed' ? loan.disbursedAt : null)
    .map((row, i) => ({ ...row, status: loan.status === 'Active' || loan.status === 'Closed' ? (i < loan.emisPaid ? 'Paid' : 'Due') : 'Indicative' }));
  return { loan: serialize(loan), schedule };
}

// SRS F42/F43: a pre-approved application for Admin review.
async function apply(userId, data) {
  const customer = await getCustomerOrThrow(userId);
  const { accountId, loanType, amount, tenureMonths, purpose } = data || {};
  if (!accountId || !loanType || !amount || !tenureMonths) {
    throw new AppError('accountId, loanType, amount and tenureMonths are required.', 400);
  }
  const product = PRODUCTS[loanType];
  if (!product) throw new AppError(`loanType must be one of ${Object.keys(PRODUCTS).join(', ')}.`, 400);

  const principal = Number(amount);
  const tenure = parseInt(tenureMonths, 10);
  if (!(principal > 0)) throw new AppError('amount must be a positive number.', 400);
  if (!Number.isInteger(tenure)) throw new AppError('tenureMonths must be a whole number.', 400);
  if (tenure < product.minTenure || tenure > product.maxTenure) {
    throw new AppError(`${loanType} loans need a tenure between ${product.minTenure} and ${product.maxTenure} months.`, 400);
  }
  if (principal < product.minAmount) {
    throw new AppError(`The minimum ${loanType} loan is ₹${product.minAmount}.`, 400);
  }

  const holding = await AccountHolder.findOne({ where: { customerId: customer.id, accountId } });
  if (!holding) throw new AppError('Account not found or not linked to your profile.', 404);
  const account = await Account.findByPk(accountId);
  if (account.status !== 'Active') throw new AppError('The disbursal account is not active.', 400);

  const { products } = await offers(userId);
  const offer = products.find((p) => p.loanType === loanType);
  if (!offer.eligible) throw new AppError(`You are not currently pre-approved for a ${loanType} loan.`, 400);
  if (principal > offer.preApprovedLimit) {
    throw new AppError(`Your pre-approved limit for a ${loanType} loan is ₹${offer.preApprovedLimit}.`, 400);
  }

  const open = await Loan.count({ where: { customerId: customer.id, status: 'Applied' } });
  if (open >= MAX_OPEN_APPLICATIONS) {
    throw new AppError(`You already have ${MAX_OPEN_APPLICATIONS} applications awaiting review. Wait for a decision before applying again.`, 400);
  }

  const loan = await Loan.create({
    accountId,
    customerId: customer.id,
    loanType,
    principalAmount: principal,
    interestRate: product.rate,
    tenureMonths: tenure,
    emiAmount: computeEmi(principal, product.rate, tenure),
    status: 'Applied',
    purpose: purpose ? String(purpose).slice(0, 150) : null,
  });

  await logActivity(userId, `Loan application submitted: ${loanType} ₹${principal} for ${tenure} months`, 'Loan', loan.id);
  await notifyCustomer(customer.id, `Your ${loanType} loan application #${loan.id} for ₹${principal} has been received and is awaiting review.`, 'Transactional');
  const { loan: fresh } = await getOwned(userId, loan.id);
  return serialize(fresh);
}

// Customer pays the next EMI (needs MPIN: a fund-movement action, SRS S7).
async function payEmi(userId, loanId, { mpin } = {}) {
  if (!mpin) throw new AppError('mpin is required.', 400);
  const { loan } = await getOwned(userId, loanId);
  if (loan.status !== 'Active') throw new AppError('Only an active loan has EMIs to pay.', 400);

  const user = await User.findByPk(userId);
  await verifyMpin(user, mpin);

  const schedule = buildSchedule(loan.principalAmount, loan.interestRate, loan.tenureMonths, loan.disbursedAt);
  const row = schedule[loan.emisPaid];
  if (!row) throw new AppError('This loan has no EMIs remaining.', 400);

  const account = await Account.findByPk(loan.accountId);
  if (account.status !== 'Active') throw new AppError('The linked account is not active.', 400);
  if (parseFloat(account.balance) < row.emi) throw new AppError('Insufficient balance in the linked account to pay this EMI.', 400);

  if (!simulateCbsPosting()) {
    await logActivity(userId, `Loan EMI failed (CBS declined): loan ${loan.id}`, 'Loan', loan.id);
    throw new AppError('The payment could not be completed by the Core Banking System. No funds were moved. Please try again.', 502);
  }

  let ledger;
  await sequelize.transaction(async (t) => {
    const fresh = await Account.findByPk(loan.accountId, { transaction: t, lock: t.LOCK.UPDATE });
    fresh.balance = round2(parseFloat(fresh.balance) - row.emi);
    await fresh.save({ transaction: t });

    ledger = await recordLedger({ accountId: loan.accountId, type: 'LoanEMI', amount: row.emi, prefix: 'EMI', transaction: t });

    loan.emisPaid += 1;
    loan.outstandingBalance = row.balanceAfter;
    if (loan.emisPaid >= loan.tenureMonths) {
      loan.status = 'Closed';
      loan.outstandingBalance = 0;
      loan.nextEmiDate = null;
    } else {
      loan.nextEmiDate = schedule[loan.emisPaid].dueDate;
    }
    await loan.save({ transaction: t });
  });

  await logActivity(userId, `Loan EMI ${row.installment}/${loan.tenureMonths} paid: ₹${row.emi} (loan ${loan.id})`, 'Loan', loan.id);
  const closedNote = loan.status === 'Closed' ? ' Your loan is now fully repaid and closed.' : '';
  await alertAccountHolders(loan.accountId, row.emi, `EMI ${row.installment}/${loan.tenureMonths} of ₹${row.emi} debited for loan #${loan.id}. Ref ${ledger.referenceNumber}.${closedNote}`);

  const { loan: updated } = await getOwned(userId, loanId);
  return { message: loan.status === 'Closed' ? 'Final EMI paid. Loan closed.' : 'EMI paid.', referenceNumber: ledger.referenceNumber, payment: row, loan: serialize(updated) };
}

// ---------------- Admin review (SRS F43, F44) ----------------
async function adminList({ status, q, page, pageSize } = {}) {
  const p = paginate({ page, pageSize });
  const where = {};
  if (status) where.status = status;
  let include = INCLUDE;
  if (q) {
    include = [
      { model: Account, attributes: ['id', 'accountNumber'] },
      { model: Customer, attributes: ['id', 'fullName'], where: { fullName: { [Op.like]: `%${q}%` } } },
    ];
  }
  const { rows, count } = await Loan.findAndCountAll({ where, include, order: [['id', 'DESC']], limit: p.limit, offset: p.offset, distinct: true });
  return pageResult(rows.map(serialize), count, p);
}

async function approve(adminUserId, loanId) {
  const loan = await Loan.findByPk(loanId, { include: INCLUDE });
  if (!loan) throw new AppError('Loan not found.', 404);
  if (loan.status !== 'Applied') throw new AppError(`This application is already ${loan.status.toLowerCase()}.`, 400);

  const account = await Account.findByPk(loan.accountId);
  if (!account || account.status !== 'Active') throw new AppError('The disbursal account is not active, so the loan cannot be disbursed.', 400);

  const now = new Date();
  const emi = computeEmi(loan.principalAmount, loan.interestRate, loan.tenureMonths);
  let ledger;
  await sequelize.transaction(async (t) => {
    const fresh = await Account.findByPk(loan.accountId, { transaction: t, lock: t.LOCK.UPDATE });
    fresh.balance = round2(parseFloat(fresh.balance) + parseFloat(loan.principalAmount));
    await fresh.save({ transaction: t });

    ledger = await recordLedger({ accountId: loan.accountId, type: 'LoanDisbursal', amount: loan.principalAmount, prefix: 'LN', transaction: t });

    loan.status = 'Active';
    loan.approvedByUserId = adminUserId;
    loan.decidedAt = now;
    loan.disbursedAt = now;
    loan.emiAmount = emi;
    loan.outstandingBalance = loan.principalAmount;
    loan.emisPaid = 0;
    loan.nextEmiDate = isoDate(addMonths(now, 1));
    await loan.save({ transaction: t });
  });

  await logActivity(adminUserId, `Loan ${loan.id} approved and disbursed: ₹${loan.principalAmount}`, 'Loan', loan.id);
  const masked = maskAccountNumber(account.accountNumber);
  if (loan.customerId) {
    await notifyCustomer(loan.customerId, `Good news: your ${loan.loanType} loan #${loan.id} of ₹${loan.principalAmount} is approved and credited to A/c ${masked}. First EMI ₹${emi} is due on ${loan.nextEmiDate}.`, 'Transactional');
  }
  for (const cid of await holderCustomerIds(loan.accountId)) {
    if (cid !== loan.customerId) await notifyCustomer(cid, `Credit alert: ₹${loan.principalAmount} loan amount credited to A/c ${masked}. Ref ${ledger.referenceNumber}.`, 'Transactional');
  }
  return serialize(await Loan.findByPk(loanId, { include: INCLUDE }));
}

async function reject(adminUserId, loanId, reason) {
  if (!reason || !String(reason).trim()) throw new AppError('A reason is required to reject an application.', 400);
  const loan = await Loan.findByPk(loanId, { include: INCLUDE });
  if (!loan) throw new AppError('Loan not found.', 404);
  if (loan.status !== 'Applied') throw new AppError(`This application is already ${loan.status.toLowerCase()}.`, 400);

  loan.status = 'Rejected';
  loan.rejectionReason = String(reason).trim().slice(0, 255);
  loan.approvedByUserId = adminUserId;
  loan.decidedAt = new Date();
  await loan.save();

  await logActivity(adminUserId, `Loan ${loan.id} rejected: ${loan.rejectionReason}`, 'Loan', loan.id);
  if (loan.customerId) {
    await notifyCustomer(loan.customerId, `Your ${loan.loanType} loan application #${loan.id} was not approved. Reason: ${loan.rejectionReason}`, 'Transactional');
  }
  return serialize(loan);
}

module.exports = { PRODUCTS, offers, calculate, list, getOne, apply, payEmi, adminList, approve, reject };
