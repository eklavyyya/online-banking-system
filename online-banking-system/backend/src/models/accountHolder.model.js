const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: ACCOUNT_HOLDERS entity — the associative (bridge)
// class resolving the Customers <-> Accounts many-to-many relationship
// (joint accounts). See Exp-4 Section 7 and Exp-6 Design Decisions.
const AccountHolder = sequelize.define('AccountHolder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountId: { type: DataTypes.INTEGER, allowNull: false },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  holderRole: { type: DataTypes.ENUM('Primary', 'Joint'), allowNull: false, defaultValue: 'Primary' },
  addedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'account_holders',
  indexes: [{ unique: true, fields: ['account_id', 'customer_id'] }],
});

module.exports = AccountHolder;
