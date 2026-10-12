const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: ACCOUNTS entity.
const Account = sequelize.define('Account', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  accountType: { type: DataTypes.ENUM('Savings', 'Current'), allowNull: false },
  branchIfsc: { type: DataTypes.STRING(11), allowNull: false },
  balance: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('Active', 'Dormant', 'Closed'), allowNull: false, defaultValue: 'Active' },
  openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'accounts',
});

module.exports = Account;
