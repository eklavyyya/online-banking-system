const { Op } = require('sequelize');
const { ServiceRequest, Customer, Card, AccountHolder } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');
const { notifyCustomer } = require('../utils/notify');
const { paginate, pageResult } = require('../utils/pagination');
const { issueReplacementNumber } = require('./card.service');

const TYPES = ['ChequeBook', 'Statement', 'CardIssue', 'Complaint', 'Other'];
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const TYPE_LABEL = { ChequeBook: 'Cheque book request', Statement: 'Statement request', CardIssue: 'Card request', Complaint: 'Complaint', Other: 'Service request' };

function serialize(sr) {
  const json = sr.toJSON();
  const customer = sr.Customer;
  delete json.Customer;
  return { ...json, ref: sr.ref, typeLabel: TYPE_LABEL[sr.requestType], customerName: customer ? customer.fullName : undefined };
}

async function holderAccountIds(customerId) {
  const holdings = await AccountHolder.findAll({ where: { customerId }, attributes: ['accountId'] });
  return holdings.map((h) => h.accountId);
}

// SRS F50/F51: raise a request; ID and 'Open' status are set automatically.
async function create(userId, data = {}) {
  const customer = await getCustomerOrThrow(userId);
  const { requestType, description, relatedCardId, relatedAccountId } = data;
  if (!TYPES.includes(requestType)) throw new AppError(`requestType must be one of ${TYPES.join(', ')}.`, 400);
  const text = String(description || '').trim();
  if (text.length < 5) throw new AppError('Please describe your request in at least 5 characters.', 400);
  if (text.length > 2000) throw new AppError('The description is too long (2000 characters maximum).', 400);

  const accountIds = await holderAccountIds(customer.id);
  if (relatedAccountId && !accountIds.includes(Number(relatedAccountId))) {
    throw new AppError('Account not found or not linked to your profile.', 404);
  }
  if (relatedCardId) {
    const card = await Card.findOne({ where: { id: relatedCardId, accountId: { [Op.in]: accountIds } } });
    if (!card) throw new AppError('Card not found.', 404);
  }

  const request = await ServiceRequest.create({
    customerId: customer.id,
    requestType,
    description: text,
    status: 'Open',
    relatedCardId: relatedCardId || null,
    relatedAccountId: relatedAccountId || null,
  });
  await logActivity(userId, `Service request ${request.ref} raised (${requestType})`, 'ServiceRequest', request.id);
  await notifyCustomer(customer.id, `Your ${TYPE_LABEL[requestType].toLowerCase()} ${request.ref} has been raised. Status: Open.`, 'Transactional');
  return serialize(request);
}

// SRS F52: customers track their own requests.
async function list(userId, { status, type } = {}) {
  const customer = await getCustomerOrThrow(userId);
  const where = { customerId: customer.id };
  if (status) where.status = status;
  if (type) where.requestType = type;
  const rows = await ServiceRequest.findAll({ where, order: [['id', 'DESC']] });
  return rows.map(serialize);
}

async function getOne(userId, id) {
  const customer = await getCustomerOrThrow(userId);
  const sr = await ServiceRequest.findOne({ where: { id, customerId: customer.id } });
  if (!sr) throw new AppError('Service request not found.', 404);
  return serialize(sr);
}

// A customer can close a request once it is resolved.
async function closeResolved(userId, id) {
  const customer = await getCustomerOrThrow(userId);
  const sr = await ServiceRequest.findOne({ where: { id, customerId: customer.id } });
  if (!sr) throw new AppError('Service request not found.', 404);
  if (sr.status !== 'Resolved') throw new AppError('Only a resolved request can be closed.', 400);
  sr.status = 'Closed';
  await sr.save();
  await logActivity(userId, `Service request ${sr.ref} closed by customer`, 'ServiceRequest', sr.id);
  return serialize(sr);
}

// ---------------- Admin (SRS F53/F54) ----------------
async function adminList({ status, type, q, page, pageSize } = {}) {
  const p = paginate({ page, pageSize });
  const where = {};
  if (status) where.status = status;
  if (type) where.requestType = type;
  const include = [{ model: Customer, attributes: ['id', 'fullName'] }];
  if (q) {
    const num = String(q).replace(/\D/g, '');
    const orClauses = [{ description: { [Op.like]: `%${q}%` } }];
    if (num) orClauses.push({ id: Number(num) });
    include[0].required = false;
    where[Op.or] = [...orClauses, { '$Customer.full_name$': { [Op.like]: `%${q}%` } }];
  }
  const { rows, count } = await ServiceRequest.findAndCountAll({ where, include, order: [['id', 'DESC']], limit: p.limit, offset: p.offset, distinct: true, subQuery: false });
  return pageResult(rows.map(serialize), count, p);
}

async function adminGet(id) {
  const sr = await ServiceRequest.findByPk(id, { include: [{ model: Customer, attributes: ['id', 'fullName'] }] });
  if (!sr) throw new AppError('Service request not found.', 404);
  return serialize(sr);
}

async function adminUpdate(adminUserId, id, { status, resolutionNotes } = {}) {
  const sr = await ServiceRequest.findByPk(id, { include: [{ model: Customer, attributes: ['id', 'fullName'] }] });
  if (!sr) throw new AppError('Service request not found.', 404);
  if (!STATUSES.includes(status)) throw new AppError(`status must be one of ${STATUSES.join(', ')}.`, 400);
  if (sr.status === 'Closed') throw new AppError('A closed request cannot be changed.', 400);
  const notes = resolutionNotes ? String(resolutionNotes).trim() : '';
  if ((status === 'Resolved' || status === 'Closed') && !notes && !sr.resolutionNotes) {
    throw new AppError('Add resolution notes before resolving or closing a request.', 400);
  }

  const previous = sr.status;
  sr.status = status;
  if (notes) sr.resolutionNotes = notes.slice(0, 2000);
  if (status === 'Resolved' || status === 'Closed') {
    sr.resolvedByUserId = adminUserId;
    sr.resolvedAt = sr.resolvedAt || new Date();
  }
  await sr.save();

  // A card unblock/reissue request drives the card's own status.
  let cardMessage = '';
  if (sr.requestType === 'CardIssue' && sr.relatedCardId) {
    const card = await Card.findByPk(sr.relatedCardId);
    if (card && card.status === 'Reissue Requested') {
      if (status === 'Resolved') {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 5);
        card.cardNumberMasked = issueReplacementNumber();
        card.expiryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        card.status = 'Active';
        card.blockedAt = null;
        await card.save();
        cardMessage = ` A replacement card ending ${String(card.cardNumberMasked).slice(-4)} is now active.`;
      } else if (status === 'Closed') {
        card.status = 'Blocked';
        await card.save();
        cardMessage = ' Your card remains blocked.';
      }
    }
  }

  await logActivity(adminUserId, `Service request ${sr.ref} moved ${previous} -> ${status}`, 'ServiceRequest', sr.id);
  if (previous !== status) {
    const tail = notes ? ` Note: ${notes}` : '';
    await notifyCustomer(sr.customerId, `Your request ${sr.ref} is now ${status}.${cardMessage}${tail}`, 'Transactional');
  }
  return serialize(sr);
}

module.exports = { TYPES, STATUSES, create, list, getOne, closeResolved, adminList, adminGet, adminUpdate };
