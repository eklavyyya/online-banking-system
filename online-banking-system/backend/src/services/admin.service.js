const { Op } = require('sequelize');
const {
  sequelize, User, Customer, Account, AccountHolder, Transaction, Beneficiary, ServiceRequest, Loan,
  ReviewFlag, ActivityLog,
} = require('../models');
const { hash } = require('../utils/auth.util');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const { maskAccountNumber } = require('../utils/mask');
const { paginate, pageResult } = require('../utils/pagination');
const { notifyCustomer } = require('../utils/notify');
const { round2 } = require('../utils/emi');

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayEnd(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// ============================================================
// Overview (landing page of the admin console)
// ============================================================
async function overview() {
  const today = dayStart(new Date());
  const [customers, activeCustomers, pendingLoans, openRequests, openFlags, txnToday, failedToday] = await Promise.all([
    User.count({ where: { role: 'customer' } }),
    User.count({ where: { role: 'customer', isActive: true } }),
    Loan.count({ where: { status: 'Applied' } }),
    ServiceRequest.count({ where: { status: { [Op.in]: ['Open', 'In Progress'] } } }),
    ReviewFlag.count({ where: { status: 'Open' } }),
    Transaction.findAll({ where: { initiatedAt: { [Op.gte]: today } }, attributes: ['amount', 'status'] }),
    Transaction.count({ where: { initiatedAt: { [Op.gte]: today }, status: 'Failed' } }),
  ]);
  const successToday = txnToday.filter((t) => t.status === 'Success');
  return {
    customers, activeCustomers, inactiveCustomers: customers - activeCustomers,
    pendingLoanApplications: pendingLoans,
    openServiceRequests: openRequests,
    openFlags,
    transactionsToday: txnToday.length,
    transactionValueToday: round2(successToday.reduce((s, t) => s + parseFloat(t.amount), 0)),
    failedToday,
  };
}

// ============================================================
// User management (SRS F59)
// ============================================================
function serializeUser(user, accountsByCustomer = {}) {
  const customer = user.Customer;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    phoneNumber: user.phoneNumber,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    locked: !!(user.lockedUntil && user.lockedUntil > new Date()),
    mpinSet: !!user.mpinHash,
    customerId: customer ? customer.id : null,
    fullName: customer ? customer.fullName : null,
    kycRefNumber: customer ? customer.kycRefNumber : null,
    dateOfBirth: customer ? customer.dateOfBirth : null,
    addressCity: customer ? customer.addressCity : null,
    createdAt: user.createdAt,
    accounts: customer ? (accountsByCustomer[customer.id] || []) : [],
  };
}

async function accountsFor(customerIds) {
  if (customerIds.length === 0) return {};
  const holdings = await AccountHolder.findAll({
    where: { customerId: { [Op.in]: customerIds } },
    include: [{ model: Account, attributes: ['id', 'accountNumber', 'accountType', 'status'] }],
  });
  const out = {};
  for (const h of holdings) {
    (out[h.customerId] = out[h.customerId] || []).push({
      id: h.Account.id,
      accountNumberMasked: maskAccountNumber(h.Account.accountNumber),
      accountType: h.Account.accountType,
      status: h.Account.status,
      holderRole: h.holderRole,
    });
  }
  return out;
}

async function listUsers({ q, role, status, page, pageSize } = {}) {
  const p = paginate({ page, pageSize });
  const where = {};
  if (role) where.role = role;
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (q) {
    where[Op.or] = [
      { username: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { phoneNumber: { [Op.like]: `%${q}%` } },
      { '$Customer.full_name$': { [Op.like]: `%${q}%` } },
    ];
  }
  const { rows, count } = await User.findAndCountAll({
    where, include: [{ model: Customer, required: false }], order: [['id', 'ASC']],
    limit: p.limit, offset: p.offset, distinct: true, subQuery: false,
  });
  const accounts = await accountsFor(rows.filter((u) => u.Customer).map((u) => u.Customer.id));
  return pageResult(rows.map((u) => serializeUser(u, accounts)), count, p);
}

async function getUser(id) {
  const user = await User.findByPk(id, { include: [{ model: Customer, required: false }] });
  if (!user) throw new AppError('User not found.', 404);
  const accounts = await accountsFor(user.Customer ? [user.Customer.id] : []);
  return serializeUser(user, accounts);
}

function validateAge(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) throw new AppError('dateOfBirth is not a valid date.', 400);
  const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
  if (d > eighteen) throw new AppError('The customer must be at least 18 years old.', 400);
}

async function createCustomer(adminId, data = {}) {
  const required = ['username', 'password', 'email', 'phoneNumber', 'fullName', 'dateOfBirth', 'kycRefNumber'];
  const missing = required.filter((f) => !data[f] || !String(data[f]).trim());
  if (missing.length) throw new AppError(`Missing required field(s): ${missing.join(', ')}.`, 400);
  if (!USERNAME_RE.test(data.username)) throw new AppError('username must be 3-30 characters: letters, digits, dot, dash or underscore.', 400);
  if (String(data.password).length < 8 || !/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)) {
    throw new AppError('password must be at least 8 characters and contain a letter and a digit.', 400);
  }
  if (!EMAIL_RE.test(data.email)) throw new AppError('email is not valid.', 400);
  if (!PHONE_RE.test(data.phoneNumber)) throw new AppError('phoneNumber must be 10 digits.', 400);
  validateAge(data.dateOfBirth);
  if (data.initialMpin !== undefined && data.initialMpin !== '' && !/^\d{4,6}$/.test(String(data.initialMpin))) {
    throw new AppError('initialMpin must be 4-6 digits.', 400);
  }

  if (await User.findOne({ where: { username: data.username } })) throw new AppError('That username is already taken.', 400);
  if (await User.findOne({ where: { email: data.email } })) throw new AppError('That email is already in use.', 400);
  if (await User.findOne({ where: { phoneNumber: data.phoneNumber } })) throw new AppError('That phone number is already in use.', 400);

  let account = null;
  if (data.linkAccountNumber) {
    account = await Account.findOne({ where: { accountNumber: String(data.linkAccountNumber).trim() } });
    if (!account) throw new AppError('No account exists with that account number.', 404);
  }

  let userId;
  let customerId;
  await sequelize.transaction(async (t) => {
    const user = await User.create({
      username: data.username.trim(),
      passwordHash: await hash(data.password),
      mpinHash: data.initialMpin ? await hash(String(data.initialMpin)) : null,
      role: 'customer',
      email: data.email.trim(),
      phoneNumber: data.phoneNumber,
    }, { transaction: t });
    const customer = await Customer.create({
      userId: user.id,
      fullName: data.fullName.trim(),
      dateOfBirth: data.dateOfBirth,
      addressStreet: data.addressStreet || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressPincode: data.addressPincode || null,
      kycRefNumber: data.kycRefNumber.trim(),
    }, { transaction: t });
    if (account) {
      const existing = await AccountHolder.count({ where: { accountId: account.id }, transaction: t });
      await AccountHolder.create({ accountId: account.id, customerId: customer.id, holderRole: existing ? 'Joint' : 'Primary' }, { transaction: t });
    }
    userId = user.id;
    customerId = customer.id;
  });

  await logActivity(adminId, `Customer login account created: ${data.username}`, 'User', userId);
  await notifyCustomer(customerId, 'Welcome to Online Banking System. Please set your transaction MPIN from your Profile page before making payments.', 'Security');
  return getUser(userId);
}

async function updateUser(adminId, id, data = {}) {
  const user = await User.findByPk(id, { include: [{ model: Customer, required: false }] });
  if (!user) throw new AppError('User not found.', 404);
  if (user.role !== 'customer') throw new AppError('Only customer login accounts can be edited here.', 403);

  if (data.email !== undefined) {
    if (!EMAIL_RE.test(data.email)) throw new AppError('email is not valid.', 400);
    const other = await User.findOne({ where: { email: data.email } });
    if (other && other.id !== user.id) throw new AppError('That email is already in use.', 400);
    user.email = data.email;
  }
  if (data.phoneNumber !== undefined) {
    if (!PHONE_RE.test(data.phoneNumber)) throw new AppError('phoneNumber must be 10 digits.', 400);
    const other = await User.findOne({ where: { phoneNumber: data.phoneNumber } });
    if (other && other.id !== user.id) throw new AppError('That phone number is already in use.', 400);
    user.phoneNumber = data.phoneNumber;
  }
  const customer = user.Customer;
  if (customer) {
    for (const f of ['fullName', 'addressStreet', 'addressCity', 'addressState', 'addressPincode', 'kycRefNumber']) {
      if (data[f] !== undefined) {
        if ((f === 'fullName' || f === 'kycRefNumber') && !String(data[f]).trim()) throw new AppError(`${f} cannot be empty.`, 400);
        customer[f] = data[f];
      }
    }
    await customer.save();
  }
  await user.save();
  await logActivity(adminId, `Customer login account updated: ${user.username}`, 'User', user.id);
  return getUser(id);
}

async function setActive(adminId, id, active) {
  const user = await User.findByPk(id);
  if (!user) throw new AppError('User not found.', 404);
  if (user.role !== 'customer') throw new AppError('Only customer login accounts can be activated or deactivated here.', 403);
  if (user.isActive === active) throw new AppError(`This account is already ${active ? 'active' : 'deactivated'}.`, 400);
  user.isActive = active;
  await user.save();
  await logActivity(adminId, `Customer login account ${active ? 'activated' : 'deactivated'}: ${user.username}`, 'User', user.id);
  return getUser(id);
}

async function unlockUser(adminId, id) {
  const user = await User.findByPk(id);
  if (!user) throw new AppError('User not found.', 404);
  user.lockedUntil = null;
  user.failedLoginAttempts = 0;
  user.mpinLockedUntil = null;
  user.mpinFailedAttempts = 0;
  await user.save();
  await logActivity(adminId, `Login and MPIN locks cleared for ${user.username}`, 'User', user.id);
  return getUser(id);
}

// ============================================================
// Transaction monitoring (SRS F60) and flags (SRS F61)
// ============================================================
async function accountIdsMatching(q) {
  const ids = new Set();
  const byNumber = await Account.findAll({ where: { accountNumber: { [Op.like]: `%${q}%` } }, attributes: ['id'] });
  byNumber.forEach((a) => ids.add(a.id));
  const customers = await Customer.findAll({ where: { fullName: { [Op.like]: `%${q}%` } }, attributes: ['id'] });
  if (customers.length) {
    const holdings = await AccountHolder.findAll({ where: { customerId: { [Op.in]: customers.map((c) => c.id) } }, attributes: ['accountId'] });
    holdings.forEach((h) => ids.add(h.accountId));
  }
  return [...ids];
}

async function listTransactions(query = {}) {
  const p = paginate(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.type) where.transactionType = query.type;
  if (query.from || query.to) {
    where.initiatedAt = {};
    if (query.from) where.initiatedAt[Op.gte] = dayStart(query.from);
    if (query.to) where.initiatedAt[Op.lte] = dayEnd(query.to);
  }
  if (query.minAmount !== undefined && query.minAmount !== '') {
    where.amount = { ...(where.amount || {}), [Op.gte]: Number(query.minAmount) };
  }
  if (query.maxAmount !== undefined && query.maxAmount !== '') {
    where.amount = { ...(where.amount || {}), [Op.lte]: Number(query.maxAmount) };
  }
  const and = [];
  if (query.q) {
    const accIds = await accountIdsMatching(query.q);
    const ors = [{ referenceNumber: { [Op.like]: `%${query.q}%` } }];
    if (accIds.length) ors.push({ sourceAccountId: { [Op.in]: accIds } }, { destinationAccountId: { [Op.in]: accIds } });
    and.push({ [Op.or]: ors });
  }
  if (query.flagged === 'true' || query.flagged === 'false') {
    const flagged = await ReviewFlag.findAll({ where: { entityType: 'Transaction', status: 'Open' }, attributes: ['entityId'] });
    const ids = flagged.map((f) => f.entityId);
    and.push({ id: query.flagged === 'true' ? { [Op.in]: ids } : { [Op.notIn]: ids } });
  }
  if (and.length) where[Op.and] = and;

  const { rows, count } = await Transaction.findAndCountAll({
    where,
    include: [
      { model: Account, as: 'SourceAccount', attributes: ['id', 'accountNumber'] },
      { model: Account, as: 'DestinationAccount', attributes: ['id', 'accountNumber'] },
    ],
    order: [['initiatedAt', 'DESC'], ['id', 'DESC']],
    limit: p.limit, offset: p.offset, distinct: true,
  });

  const accountIds = [...new Set(rows.map((t) => t.sourceAccountId))];
  const holdings = accountIds.length ? await AccountHolder.findAll({
    where: { accountId: { [Op.in]: accountIds } },
    include: [{ model: Customer, attributes: ['fullName'] }],
  }) : [];
  const names = {};
  for (const h of holdings) (names[h.accountId] = names[h.accountId] || []).push(h.Customer.fullName);
  const openFlags = rows.length ? await ReviewFlag.findAll({
    where: { entityType: 'Transaction', status: 'Open', entityId: { [Op.in]: rows.map((t) => t.id) } },
  }) : [];
  const flagByTxn = Object.fromEntries(openFlags.map((f) => [f.entityId, f]));

  const items = rows.map((t) => ({
    id: t.id,
    transactionType: t.transactionType,
    amount: parseFloat(t.amount),
    status: t.status,
    referenceNumber: t.referenceNumber,
    failureReason: t.failureReason,
    initiatedAt: t.initiatedAt,
    completedAt: t.completedAt,
    sourceAccountMasked: maskAccountNumber(t.SourceAccount && t.SourceAccount.accountNumber),
    destinationAccountMasked: t.DestinationAccount ? maskAccountNumber(t.DestinationAccount.accountNumber) : null,
    customerNames: names[t.sourceAccountId] || [],
    flagged: !!flagByTxn[t.id],
    flagId: flagByTxn[t.id] ? flagByTxn[t.id].id : null,
    flagReason: flagByTxn[t.id] ? flagByTxn[t.id].reason : null,
  }));

  // Totals for the whole filtered set, not just this page.
  const totalRows = await Transaction.findAll({ where, attributes: ['amount', 'status'] });
  const successRows = totalRows.filter((r) => r.status === 'Success');
  return {
    ...pageResult(items, count, p),
    summary: {
      count: totalRows.length,
      successCount: successRows.length,
      failedCount: totalRows.filter((r) => r.status === 'Failed').length,
      successValue: round2(successRows.reduce((s, r) => s + parseFloat(r.amount), 0)),
    },
  };
}

async function createFlag(adminId, { entityType, entityId, reason } = {}) {
  if (!['Transaction', 'Account'].includes(entityType)) throw new AppError('entityType must be Transaction or Account.', 400);
  if (!entityId) throw new AppError('entityId is required.', 400);
  if (!reason || !String(reason).trim()) throw new AppError('A reason is required to flag an item for review.', 400);
  const target = entityType === 'Transaction' ? await Transaction.findByPk(entityId) : await Account.findByPk(entityId);
  if (!target) throw new AppError(`${entityType} not found.`, 404);
  const existing = await ReviewFlag.findOne({ where: { entityType, entityId, status: 'Open' } });
  if (existing) throw new AppError(`This ${entityType.toLowerCase()} is already flagged for review.`, 400);

  const flag = await ReviewFlag.create({ entityType, entityId, reason: String(reason).trim().slice(0, 255), flaggedByUserId: adminId });
  await logActivity(adminId, `${entityType} ${entityId} flagged for review: ${flag.reason}`, entityType, Number(entityId));
  return flag;
}

async function listFlags({ status, entityType, page, pageSize } = {}) {
  const p = paginate({ page, pageSize });
  const where = {};
  if (status) where.status = status;
  if (entityType) where.entityType = entityType;
  const { rows, count } = await ReviewFlag.findAndCountAll({
    where, include: [{ model: User, as: 'FlaggedBy', attributes: ['username'] }],
    order: [['id', 'DESC']], limit: p.limit, offset: p.offset, distinct: true,
  });
  const items = [];
  for (const f of rows) {
    const json = f.toJSON();
    json.flaggedByUsername = f.FlaggedBy ? f.FlaggedBy.username : null;
    delete json.FlaggedBy;
    if (f.entityType === 'Transaction') {
      const t = await Transaction.findByPk(f.entityId);
      json.entitySummary = t ? `${t.transactionType} ₹${t.amount} (${t.status}) ${t.referenceNumber || ''}`.trim() : 'Transaction no longer available';
    } else {
      const a = await Account.findByPk(f.entityId);
      json.entitySummary = a ? `Account ${maskAccountNumber(a.accountNumber)} (${a.accountType})` : 'Account no longer available';
    }
    items.push(json);
  }
  return pageResult(items, count, p);
}

async function clearFlag(adminId, id, note) {
  const flag = await ReviewFlag.findByPk(id);
  if (!flag) throw new AppError('Flag not found.', 404);
  if (flag.status !== 'Open') throw new AppError('This flag has already been cleared.', 400);
  flag.status = 'Cleared';
  flag.clearedByUserId = adminId;
  flag.clearedAt = new Date();
  flag.clearanceNote = note ? String(note).trim().slice(0, 255) : null;
  await flag.save();
  await logActivity(adminId, `Review flag ${flag.id} cleared for ${flag.entityType} ${flag.entityId}`, flag.entityType, flag.entityId);
  return flag;
}

// ============================================================
// Reports (SRS F62)
// ============================================================
async function summaryReport({ from, to } = {}) {
  const end = to ? dayEnd(to) : new Date();
  const start = from ? dayStart(from) : dayStart(new Date(end.getTime() - 29 * 86400000));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError('from/to must be valid dates.', 400);
  if (start > end) throw new AppError('from must not be after to.', 400);
  if ((end - start) / 86400000 > 366) throw new AppError('Choose a range of at most one year.', 400);

  const days = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) days.push(dayKey(d));
  const zeroSeries = () => Object.fromEntries(days.map((k) => [k, { count: 0, amount: 0 }]));

  // --- transactions ---
  const txns = await Transaction.findAll({ where: { initiatedAt: { [Op.between]: [start, end] } }, attributes: ['transactionType', 'amount', 'status', 'initiatedAt'] });
  const byDay = zeroSeries();
  const byType = {};
  const byStatus = { Success: 0, Failed: 0, Pending: 0 };
  let successValue = 0;
  for (const t of txns) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const k = dayKey(t.initiatedAt);
    if (byDay[k]) byDay[k].count += 1;
    byType[t.transactionType] = byType[t.transactionType] || { count: 0, amount: 0 };
    byType[t.transactionType].count += 1;
    if (t.status === 'Success') {
      const amt = parseFloat(t.amount);
      successValue += amt;
      if (byDay[k]) byDay[k].amount = round2(byDay[k].amount + amt);
      byType[t.transactionType].amount = round2(byType[t.transactionType].amount + amt);
    }
  }

  // --- beneficiaries ---
  const benes = await Beneficiary.findAll({ where: { addedAt: { [Op.between]: [start, end] } }, attributes: ['addedAt'] });
  const beneByDay = Object.fromEntries(days.map((k) => [k, 0]));
  benes.forEach((b) => { const k = dayKey(b.addedAt); if (k in beneByDay) beneByDay[k] += 1; });

  // --- service requests ---
  const raised = await ServiceRequest.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, attributes: ['requestType', 'status', 'createdAt', 'resolvedAt'] });
  const resolvedInRange = await ServiceRequest.findAll({ where: { resolvedAt: { [Op.between]: [start, end] } }, attributes: ['requestType', 'createdAt', 'resolvedAt'] });
  const tatHours = (r) => (new Date(r.resolvedAt) - new Date(r.createdAt)) / 3600000;
  const tatByType = {};
  for (const r of resolvedInRange) {
    tatByType[r.requestType] = tatByType[r.requestType] || { resolved: 0, totalHours: 0 };
    tatByType[r.requestType].resolved += 1;
    tatByType[r.requestType].totalHours += tatHours(r);
  }
  const avgTat = resolvedInRange.length ? round2(resolvedInRange.reduce((s, r) => s + tatHours(r), 0) / resolvedInRange.length) : null;
  const raisedByType = {};
  raised.forEach((r) => { raisedByType[r.requestType] = (raisedByType[r.requestType] || 0) + 1; });

  // --- loans ---
  const applied = await Loan.count({ where: { createdAt: { [Op.between]: [start, end] } } });
  const decided = await Loan.findAll({ where: { decidedAt: { [Op.between]: [start, end] } }, attributes: ['status', 'principalAmount', 'disbursedAt'] });
  const disbursed = decided.filter((l) => l.disbursedAt);

  return {
    range: { from: dayKey(start), to: dayKey(end), days: days.length },
    transactions: {
      total: txns.length,
      byStatus,
      successValue: round2(successValue),
      byType: Object.entries(byType).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count),
      byDay: days.map((date) => ({ date, ...byDay[date] })),
    },
    beneficiaries: {
      added: benes.length,
      byDay: days.map((date) => ({ date, count: beneByDay[date] })),
    },
    serviceRequests: {
      raised: raised.length,
      resolved: resolvedInRange.length,
      openNow: await ServiceRequest.count({ where: { status: { [Op.in]: ['Open', 'In Progress'] } } }),
      averageTatHours: avgTat,
      raisedByType: Object.entries(raisedByType).map(([type, count]) => ({ type, count })),
      tatByType: Object.entries(tatByType).map(([type, v]) => ({ type, resolved: v.resolved, averageHours: round2(v.totalHours / v.resolved) })),
    },
    loans: {
      applied,
      approved: disbursed.length,
      rejected: decided.filter((l) => l.status === 'Rejected').length,
      totalDisbursed: round2(disbursed.reduce((s, l) => s + parseFloat(l.principalAmount), 0)),
    },
  };
}

// ============================================================
// Audit trail viewer (SRS F63)
// ============================================================
async function activityLog({ q, username, entity, from, to, page, pageSize } = {}) {
  const p = paginate({ page, pageSize }, { defaultSize: 25 });
  const where = {};
  if (entity) where.entityAffected = entity;
  if (q) where.actionDescription = { [Op.like]: `%${q}%` };
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp[Op.gte] = dayStart(from);
    if (to) where.timestamp[Op.lte] = dayEnd(to);
  }
  const include = [{ model: User, attributes: ['id', 'username', 'role'], ...(username ? { where: { username: { [Op.like]: `%${username}%` } } } : {}) }];
  const { rows, count } = await ActivityLog.findAndCountAll({ where, include, order: [['timestamp', 'DESC'], ['id', 'DESC']], limit: p.limit, offset: p.offset, distinct: true });
  const items = rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    userId: r.userId,
    username: r.User ? r.User.username : null,
    role: r.User ? r.User.role : null,
    actionDescription: r.actionDescription,
    entityAffected: r.entityAffected,
    entityId: r.entityId,
  }));
  return pageResult(items, count, p);
}

// ============================================================
// Broadcast (drives the SRS F58 opt-out rule)
// ============================================================
async function broadcast(adminId, { message, category = 'Promotional' } = {}) {
  const text = String(message || '').trim();
  if (text.length < 5) throw new AppError('Write a message of at least 5 characters.', 400);
  if (!['Promotional', 'Security'].includes(category)) throw new AppError('category must be Promotional or Security.', 400);
  const customers = await Customer.findAll({ include: [{ model: User, where: { isActive: true }, attributes: [] }], attributes: ['id'] });
  let delivered = 0;
  let skipped = 0;
  for (const c of customers) {
    const sent = await notifyCustomer(c.id, text, category);
    if (sent) delivered += 1; else skipped += 1;
  }
  await logActivity(adminId, `Broadcast (${category}) sent to ${delivered} customer(s), ${skipped} opted out`, 'Notification', null);
  return { message: 'Broadcast sent.', delivered, skippedOptedOut: skipped, total: customers.length };
}

module.exports = {
  overview, listUsers, getUser, createCustomer, updateUser, setActive, unlockUser,
  listTransactions, createFlag, listFlags, clearFlag, summaryReport, activityLog, broadcast,
};
