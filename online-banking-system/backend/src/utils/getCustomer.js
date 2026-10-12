const { Customer } = require('../models');
const { AppError } = require('../middleware/errorHandler.middleware');

// Every customer-facing service needs this same lookup, since the JWT only
// carries the User id/role (SRS: Users and Customers are separate entities
// so the same login mechanism can serve Admins too - see Exp-4 Section 7).
async function getCustomerOrThrow(userId) {
  const customer = await Customer.findOne({ where: { userId } });
  if (!customer) {
    throw new AppError('No customer profile is linked to this account.', 403);
  }
  return customer;
}

module.exports = { getCustomerOrThrow };
