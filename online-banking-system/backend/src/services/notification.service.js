const { Op } = require('sequelize');
const { Notification } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { AppError } = require('../middleware/errorHandler.middleware');
const { paginate, pageResult } = require('../utils/pagination');
const { getPreferences } = require('../utils/notify');

const CATEGORIES = ['Transactional', 'Promotional', 'Security'];

// SRS F56: chronological, filterable feed.
async function list(userId, query = {}) {
  const customer = await getCustomerOrThrow(userId);
  const p = paginate(query, { defaultSize: 20 });
  const where = { customerId: customer.id };
  if (query.category) {
    if (!CATEGORIES.includes(query.category)) throw new AppError(`category must be one of ${CATEGORIES.join(', ')}.`, 400);
    where.category = query.category;
  }
  if (query.isRead === 'true' || query.isRead === 'false') where.isRead = query.isRead === 'true';
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt[Op.gte] = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      if (String(query.to).length <= 10) end.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = end;
    }
  }
  if (query.q) where.message = { [Op.like]: `%${query.q}%` };

  const { rows, count } = await Notification.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: p.limit, offset: p.offset });
  const unreadCount = await Notification.count({ where: { customerId: customer.id, isRead: false } });
  return { ...pageResult(rows, count, p), unreadCount };
}

async function unreadCount(userId) {
  const customer = await getCustomerOrThrow(userId);
  return { unreadCount: await Notification.count({ where: { customerId: customer.id, isRead: false } }) };
}

async function markRead(userId, id) {
  const customer = await getCustomerOrThrow(userId);
  const n = await Notification.findOne({ where: { id, customerId: customer.id } });
  if (!n) throw new AppError('Notification not found.', 404);
  if (!n.isRead) { n.isRead = true; await n.save(); }
  return { notification: n };
}

async function markAllRead(userId) {
  const customer = await getCustomerOrThrow(userId);
  const [updated] = await Notification.update({ isRead: true }, { where: { customerId: customer.id, isRead: false } });
  return { message: 'All notifications marked as read.', updated };
}

function serializePrefs(prefs) {
  return {
    promotionalEnabled: prefs.promotionalEnabled,
    smsEnabled: prefs.smsEnabled,
    emailEnabled: prefs.emailEnabled,
    alertThreshold: parseFloat(prefs.alertThreshold),
    // Always on, shown so the UI can explain why they cannot be switched off.
    transactionalEnabled: true,
    securityEnabled: true,
  };
}

async function getPrefs(userId) {
  const customer = await getCustomerOrThrow(userId);
  return { preferences: serializePrefs(await getPreferences(customer.id)) };
}

// SRS F58: promotional alerts are optional; transactional ones never are.
async function updatePrefs(userId, data = {}) {
  const customer = await getCustomerOrThrow(userId);
  if (data.transactionalEnabled === false || data.securityEnabled === false) {
    throw new AppError('Transactional and security alerts cannot be disabled.', 400);
  }
  const prefs = await getPreferences(customer.id);
  for (const f of ['promotionalEnabled', 'smsEnabled', 'emailEnabled']) {
    if (data[f] !== undefined) {
      if (typeof data[f] !== 'boolean') throw new AppError(`${f} must be true or false.`, 400);
      prefs[f] = data[f];
    }
  }
  if (data.alertThreshold !== undefined) {
    const n = Number(data.alertThreshold);
    if (data.alertThreshold === '' || Number.isNaN(n) || n < 0 || n > 10000000) {
      throw new AppError('alertThreshold must be a number between 0 and 1,00,00,000.', 400);
    }
    prefs.alertThreshold = n;
  }
  await prefs.save();
  return { message: 'Preferences saved.', preferences: serializePrefs(prefs) };
}

module.exports = { CATEGORIES, list, unreadCount, markRead, markAllRead, getPrefs, updatePrefs };
