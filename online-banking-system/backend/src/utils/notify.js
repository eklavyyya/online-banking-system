const { Notification, NotificationPreference, Customer, AccountHolder } = require('../models');

// One place that creates alerts, so category rules (SRS F58) are enforced
// once: Promotional can be switched off, Transactional and Security cannot.
// SMS/e-mail delivery is simulated (SRS 2.5): the channel is recorded on the
// row and echoed to the server log outside of tests.

const MAX_LEN = 255;

async function getPreferences(customerId) {
  const [prefs] = await NotificationPreference.findOrCreate({ where: { customerId }, defaults: { customerId } });
  return prefs;
}

function clip(message) {
  const m = String(message);
  return m.length > MAX_LEN ? `${m.slice(0, MAX_LEN - 1)}…` : m;
}

async function notifyCustomer(customerId, message, category = 'Transactional', options = {}) {
  const prefs = await getPreferences(customerId);
  if (category === 'Promotional' && !prefs.promotionalEnabled) return null;

  const channels = ['In-App'];
  if (prefs.smsEnabled) channels.push('SMS');
  if (prefs.emailEnabled) channels.push('Email');

  const row = await Notification.create({
    customerId,
    message: clip(message),
    category,
    channels: channels.join(','),
  }, options.transaction ? { transaction: options.transaction } : {});

  if (process.env.NODE_ENV !== 'test' && !process.env.OBS_QUIET) {
    if (channels.includes('SMS') || channels.includes('Email')) {
      console.log(`[simulated ${channels.slice(1).join('+')} to customer ${customerId}] ${row.message}`);
    }
  }
  return row;
}

// Customers on an account (joint accounts have more than one).
async function holderCustomerIds(accountId) {
  const holders = await AccountHolder.findAll({ where: { accountId }, attributes: ['customerId'] });
  return holders.map((h) => h.customerId);
}

// Debit/credit alert (SRS F55): sent to every holder whose threshold is met.
async function alertAccountHolders(accountId, amount, message) {
  const ids = await holderCustomerIds(accountId);
  for (const customerId of ids) {
    const prefs = await getPreferences(customerId);
    if (Number(amount) >= Number(prefs.alertThreshold)) {
      await notifyCustomer(customerId, message, 'Transactional');
    }
  }
}

// Failure and security messages ignore the amount threshold.
async function alertAccountHoldersAlways(accountId, message, category = 'Transactional') {
  const ids = await holderCustomerIds(accountId);
  for (const customerId of ids) await notifyCustomer(customerId, message, category);
}

async function customerIdForUser(userId) {
  const customer = await Customer.findOne({ where: { userId }, attributes: ['id'] });
  return customer ? customer.id : null;
}

async function notifyUser(userId, message, category = 'Transactional') {
  const customerId = await customerIdForUser(userId);
  if (!customerId) return null;
  return notifyCustomer(customerId, message, category);
}

module.exports = {
  getPreferences, notifyCustomer, alertAccountHolders, alertAccountHoldersAlways,
  holderCustomerIds, customerIdForUser, notifyUser,
};
