const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: TRANSACTIONS entity, extended with
// destinationAccountId for own-account transfers (the ER diagram only
// modeled the beneficiary path for third-party transfers; an own-account
// transfer needs a destination among the customer's own linked accounts,
// which is a distinct concept from a beneficiary).
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sourceAccountId: { type: DataTypes.INTEGER, allowNull: false },
  destinationAccountId: { type: DataTypes.INTEGER, allowNull: true },
  beneficiaryId: { type: DataTypes.INTEGER, allowNull: true },
  billerId: { type: DataTypes.INTEGER, allowNull: true },
  transactionType: {
    type: DataTypes.ENUM(
      'Own-Transfer', 'NEFT', 'RTGS', 'IMPS', 'BillPay', 'Recharge',
      // Phase 2 ledger entries, so the statement reflects every balance change:
      'DepositOpen', 'RDInstallment', 'DepositPayout', 'LoanDisbursal', 'LoanEMI'
    ),
    allowNull: false,
  },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  status: {
    type: DataTypes.ENUM('Pending', 'Success', 'Failed'),
    allowNull: false,
    defaultValue: 'Pending',
  },
  referenceNumber: { type: DataTypes.STRING(30), allowNull: true, unique: true },
  failureReason: { type: DataTypes.STRING(200), allowNull: true },
  initiatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'transactions',
});

module.exports = Transaction;
