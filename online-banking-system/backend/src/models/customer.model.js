const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: CUSTOMERS entity.
// address is a composite attribute (Exp-4), decomposed into four columns.
const Customer = sequelize.define('Customer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  fullName: { type: DataTypes.STRING(100), allowNull: false },
  dateOfBirth: { type: DataTypes.DATEONLY, allowNull: false },
  addressStreet: { type: DataTypes.STRING(150), allowNull: true },
  addressCity: { type: DataTypes.STRING(60), allowNull: true },
  addressState: { type: DataTypes.STRING(60), allowNull: true },
  addressPincode: { type: DataTypes.STRING(10), allowNull: true },
  kycRefNumber: { type: DataTypes.STRING(50), allowNull: false },
}, {
  tableName: 'customers',
});

module.exports = Customer;
