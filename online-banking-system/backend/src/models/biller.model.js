const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: BILLERS entity.
const Biller = sequelize.define('Biller', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  billerName: { type: DataTypes.STRING(100), allowNull: false },
  billerCategory: { type: DataTypes.STRING(50), allowNull: false },
  consumerNumber: { type: DataTypes.STRING(50), allowNull: false },
}, {
  tableName: 'billers',
});

module.exports = Biller;
