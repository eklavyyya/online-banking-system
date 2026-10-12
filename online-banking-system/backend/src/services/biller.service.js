const { Biller } = require('../models');
const { getCustomerOrThrow } = require('../utils/getCustomer');
const { logActivity } = require('../utils/activityLogger');
const { AppError } = require('../middleware/errorHandler.middleware');

// SRS F29: add a biller to the saved list.
async function add(userId, data) {
  const customer = await getCustomerOrThrow(userId);
  const { billerName, billerCategory, consumerNumber } = data;
  if (!billerName || !billerCategory || !consumerNumber) {
    throw new AppError('billerName, billerCategory, and consumerNumber are required.', 400);
  }
  const biller = await Biller.create({ customerId: customer.id, billerName, billerCategory, consumerNumber });
  await logActivity(userId, `Biller added: ${billerName}`, 'Biller', biller.id);
  return biller;
}

async function list(userId) {
  const customer = await getCustomerOrThrow(userId);
  return Biller.findAll({ where: { customerId: customer.id }, order: [['id', 'DESC']] });
}

async function remove(userId, id) {
  const customer = await getCustomerOrThrow(userId);
  const biller = await Biller.findOne({ where: { id, customerId: customer.id } });
  if (!biller) throw new AppError('Biller not found.', 404);
  await biller.destroy();
  await logActivity(userId, `Biller removed: ${biller.billerName}`, 'Biller', id);
  return { message: 'Biller removed.' };
}

module.exports = { add, list, remove };
