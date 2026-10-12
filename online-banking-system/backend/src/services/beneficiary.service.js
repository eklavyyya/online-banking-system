const { Op } = require('sequelize');
const { Beneficiary } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');

const COOLING_MINUTES = parseInt(process.env.BENEFICIARY_COOLING_PERIOD_MINUTES || '30', 10);

// F16: lazy activation — a beneficiary past its cooling period is promoted
// to Active the next time it is read, rather than needing a background job.
async function refreshStatus(beneficiary) {
  if (beneficiary.status === 'Pending Activation' && beneficiary.activeFrom <= new Date()) {
    beneficiary.status = 'Active';
    await beneficiary.save();
  }
  return beneficiary;
}

// F18
async function list(userId) {
  const customer = await getCustomerOrThrow(userId);
  const beneficiaries = await Beneficiary.findAll({
    where: { customerId: customer.id, status: { [Op.ne]: 'Deleted' } },
    order: [['addedAt', 'DESC']],
  });
  for (const b of beneficiaries) await refreshStatus(b);
  return beneficiaries;
}

// F15, F16, F19
async function add(userId, data) {
  const customer = await getCustomerOrThrow(userId);
  const { beneficiaryName, accountNumber, ifscCode, nickname, transferLimit } = data;

  if (!beneficiaryName || !accountNumber || !ifscCode) {
    throw new AppError('beneficiaryName, accountNumber, and ifscCode are required.', 400);
  }

  const dup = await Beneficiary.findOne({
    where: {
      customerId: customer.id, accountNumber, ifscCode,
      status: { [Op.in]: ['Active', 'Pending Activation'] },
    },
  });
  if (dup) throw new AppError('A beneficiary with this account number and IFSC already exists.', 400);

  const now = new Date();
  const activeFrom = new Date(now.getTime() + COOLING_MINUTES * 60000);

  const beneficiary = await Beneficiary.create({
    customerId: customer.id,
    beneficiaryName,
    accountNumber,
    ifscCode,
    nickname: nickname || null,
    transferLimit: transferLimit || null,
    status: 'Pending Activation',
    addedAt: now,
    activeFrom,
  });

  await logActivity(userId, `Beneficiary added: ${beneficiaryName}`, 'Beneficiary', beneficiary.id);
  return beneficiary;
}

// F17 (edit) — only nickname/transferLimit are mutable in place; changing
// the payee's account/IFSC requires delete + re-add (and re-cooling), since
// that is effectively a different payee for security purposes.
async function update(userId, id, updates) {
  const customer = await getCustomerOrThrow(userId);
  const beneficiary = await Beneficiary.findOne({ where: { id, customerId: customer.id } });
  if (!beneficiary || beneficiary.status === 'Deleted') throw new AppError('Beneficiary not found.', 404);

  if (updates.nickname !== undefined) beneficiary.nickname = updates.nickname;
  if (updates.transferLimit !== undefined) beneficiary.transferLimit = updates.transferLimit;
  await beneficiary.save();
  await logActivity(userId, `Beneficiary updated: ${beneficiary.beneficiaryName}`, 'Beneficiary', beneficiary.id);
  return refreshStatus(beneficiary);
}

// F17 (delete) — soft delete, preserving history/referential integrity
// with any past Transactions that reference this beneficiary.
async function remove(userId, id) {
  const customer = await getCustomerOrThrow(userId);
  const beneficiary = await Beneficiary.findOne({ where: { id, customerId: customer.id } });
  if (!beneficiary || beneficiary.status === 'Deleted') throw new AppError('Beneficiary not found.', 404);

  beneficiary.status = 'Deleted';
  await beneficiary.save();
  await logActivity(userId, `Beneficiary deleted: ${beneficiary.beneficiaryName}`, 'Beneficiary', beneficiary.id);
  return { message: 'Beneficiary deleted.' };
}

module.exports = { list, add, update, remove, refreshStatus };
