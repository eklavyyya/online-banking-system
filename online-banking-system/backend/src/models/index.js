const sequelize = require('../config/database');

const User = require('./user.model');
const Customer = require('./customer.model');
const Account = require('./account.model');
const AccountHolder = require('./accountHolder.model');
const Beneficiary = require('./beneficiary.model');
const Transaction = require('./transaction.model');
const Biller = require('./biller.model');
const Deposit = require('./deposit.model');
const Loan = require('./loan.model');
const Card = require('./card.model');
const ServiceRequest = require('./serviceRequest.model');
const Notification = require('./notification.model');
const ActivityLog = require('./activityLog.model');
const NotificationPreference = require('./notificationPreference.model');
const ReviewFlag = require('./reviewFlag.model');

// ===================== Associations (Exp-4 ER Diagram / Exp-6 Class Diagram) =====================

// User <-> Customer (1:1, Generalization in the Class Diagram, FK in the ER Diagram)
User.hasOne(Customer, { foreignKey: 'userId', onDelete: 'CASCADE' });
Customer.belongsTo(User, { foreignKey: 'userId' });

// User <-> ActivityLog (1:M)
User.hasMany(ActivityLog, { foreignKey: 'userId' });
ActivityLog.belongsTo(User, { foreignKey: 'userId' });

// User (Admin) <-> Loan (1:M, approver, nullable/partial)
User.hasMany(Loan, { foreignKey: 'approvedByUserId', as: 'ApprovedLoans' });
Loan.belongsTo(User, { foreignKey: 'approvedByUserId', as: 'ApprovedBy' });

// User (Admin) <-> ServiceRequest (1:M, resolver, nullable/partial)
User.hasMany(ServiceRequest, { foreignKey: 'resolvedByUserId', as: 'ResolvedRequests' });
ServiceRequest.belongsTo(User, { foreignKey: 'resolvedByUserId', as: 'ResolvedBy' });

// Customer <-> Account (M:N via AccountHolder association class)
Customer.hasMany(AccountHolder, { foreignKey: 'customerId' });
AccountHolder.belongsTo(Customer, { foreignKey: 'customerId' });
Account.hasMany(AccountHolder, { foreignKey: 'accountId' });
AccountHolder.belongsTo(Account, { foreignKey: 'accountId' });
Customer.belongsToMany(Account, { through: AccountHolder, foreignKey: 'customerId', otherKey: 'accountId' });
Account.belongsToMany(Customer, { through: AccountHolder, foreignKey: 'accountId', otherKey: 'customerId' });

// Customer <-> Beneficiary (1:M, Aggregation in the Class Diagram)
Customer.hasMany(Beneficiary, { foreignKey: 'customerId' });
Beneficiary.belongsTo(Customer, { foreignKey: 'customerId' });

// Customer <-> Biller (1:M)
Customer.hasMany(Biller, { foreignKey: 'customerId' });
Biller.belongsTo(Customer, { foreignKey: 'customerId' });

// Customer <-> ServiceRequest (1:M, raises)
Customer.hasMany(ServiceRequest, { foreignKey: 'customerId' });
ServiceRequest.belongsTo(Customer, { foreignKey: 'customerId' });

// Customer <-> Notification (1:M)
Customer.hasMany(Notification, { foreignKey: 'customerId' });
Notification.belongsTo(Customer, { foreignKey: 'customerId' });

// Account <-> Transaction (1:M, initiates, as source)
Account.hasMany(Transaction, { foreignKey: 'sourceAccountId', as: 'OutgoingTransactions' });
Transaction.belongsTo(Account, { foreignKey: 'sourceAccountId', as: 'SourceAccount' });

// Account <-> Transaction (1:M, as destination, own-account transfers only)
Account.hasMany(Transaction, { foreignKey: 'destinationAccountId', as: 'IncomingTransactions' });
Transaction.belongsTo(Account, { foreignKey: 'destinationAccountId', as: 'DestinationAccount' });

// Beneficiary <-> Transaction (1:M, nullable/partial)
Beneficiary.hasMany(Transaction, { foreignKey: 'beneficiaryId' });
Transaction.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId' });

// Biller <-> Transaction (1:M, nullable/partial)
Biller.hasMany(Transaction, { foreignKey: 'billerId' });
Transaction.belongsTo(Biller, { foreignKey: 'billerId' });

// Account <-> Deposit (1:M)
Account.hasMany(Deposit, { foreignKey: 'accountId' });
Deposit.belongsTo(Account, { foreignKey: 'accountId' });

// Account <-> Loan (1:M)
Account.hasMany(Loan, { foreignKey: 'accountId' });
Loan.belongsTo(Account, { foreignKey: 'accountId' });

// Customer <-> Loan (1:M, the applicant; the loan is disbursed to a linked account)
Customer.hasMany(Loan, { foreignKey: 'customerId' });
Loan.belongsTo(Customer, { foreignKey: 'customerId' });

// Customer <-> NotificationPreference (1:1, SRS F58)
Customer.hasOne(NotificationPreference, { foreignKey: 'customerId', onDelete: 'CASCADE' });
NotificationPreference.belongsTo(Customer, { foreignKey: 'customerId' });

// User (Admin) <-> ReviewFlag (1:M, SRS F61)
User.hasMany(ReviewFlag, { foreignKey: 'flaggedByUserId', as: 'RaisedFlags' });
ReviewFlag.belongsTo(User, { foreignKey: 'flaggedByUserId', as: 'FlaggedBy' });

// Account <-> Card (1:M, Composition in the Class Diagram)
Account.hasMany(Card, { foreignKey: 'accountId' });
Card.belongsTo(Account, { foreignKey: 'accountId' });

module.exports = {
  sequelize,
  User,
  Customer,
  Account,
  AccountHolder,
  Beneficiary,
  Transaction,
  Biller,
  Deposit,
  Loan,
  Card,
  ServiceRequest,
  Notification,
  ActivityLog,
  NotificationPreference,
  ReviewFlag,
};
