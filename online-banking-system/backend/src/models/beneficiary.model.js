const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: BENEFICIARIES entity.
// activeFrom is a derived attribute (Exp-4): addedAt + cooling period.
const Beneficiary = sequelize.define('Beneficiary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  beneficiaryName: { type: DataTypes.STRING(100), allowNull: false },
  accountNumber: { type: DataTypes.STRING(20), allowNull: false },
  ifscCode: { type: DataTypes.STRING(11), allowNull: false },
  nickname: { type: DataTypes.STRING(50), allowNull: true },
  status: {
    type: DataTypes.ENUM('Pending Activation', 'Active', 'Deleted'),
    allowNull: false,
    defaultValue: 'Pending Activation',
  },
  transferLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
  addedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  activeFrom: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'beneficiaries',
});

module.exports = Beneficiary;
