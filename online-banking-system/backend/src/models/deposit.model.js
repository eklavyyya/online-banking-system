const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: DEPOSITS entity.
// maturityAmount is a derived attribute (Exp-4): computed from principal,
// rate and tenure at creation time (see services/deposit.service.js).
const Deposit = sequelize.define('Deposit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountId: { type: DataTypes.INTEGER, allowNull: false },
  depositType: { type: DataTypes.ENUM('FD', 'RD'), allowNull: false },
  principalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  interestRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  tenureMonths: { type: DataTypes.INTEGER, allowNull: false },
  maturityDate: { type: DataTypes.DATEONLY, allowNull: false },
  maturityAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  // Recurring-deposit schedule (SRS F35). For an RD, principalAmount is the total of all
  // instalments over the tenure and installmentAmount is the monthly debit.
  installmentAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  installmentsPaid: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextInstallmentDate: { type: DataTypes.DATEONLY, allowNull: true },
  status: {
    type: DataTypes.ENUM('Active', 'Matured', 'Closed Prematurely'),
    allowNull: false,
    defaultValue: 'Active',
  },
}, {
  tableName: 'deposits',
});

module.exports = Deposit;
