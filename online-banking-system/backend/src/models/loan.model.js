const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: LOANS entity (SRS F40-F44).
// Lifecycle: Applied -> (admin) Rejected | Active (approved and disbursed)
// -> Closed (all EMIs paid). 'Approved' is kept in the enum for the instant
// between approval and disbursal; the service performs both in one step.
const Loan = sequelize.define('Loan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountId: { type: DataTypes.INTEGER, allowNull: false },
  customerId: { type: DataTypes.INTEGER, allowNull: true },
  approvedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  loanType: { type: DataTypes.STRING(50), allowNull: false },
  principalAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  interestRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  tenureMonths: { type: DataTypes.INTEGER, allowNull: false },
  emiAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  outstandingBalance: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  status: {
    type: DataTypes.ENUM('Applied', 'Approved', 'Rejected', 'Active', 'Closed'),
    allowNull: false,
    defaultValue: 'Applied',
  },
  purpose: { type: DataTypes.STRING(150), allowNull: true },
  rejectionReason: { type: DataTypes.STRING(255), allowNull: true },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  disbursedAt: { type: DataTypes.DATE, allowNull: true },
  emisPaid: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextEmiDate: { type: DataTypes.DATEONLY, allowNull: true },
}, {
  tableName: 'loans',
});

module.exports = Loan;
