const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// SRS F61: basic fraud-monitoring hook. An admin can flag a transaction or an
// account for review; flags carry no automatic blocking behaviour.
const ReviewFlag = sequelize.define('ReviewFlag', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entityType: { type: DataTypes.ENUM('Transaction', 'Account'), allowNull: false },
  entityId: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('Open', 'Cleared'), allowNull: false, defaultValue: 'Open' },
  flaggedByUserId: { type: DataTypes.INTEGER, allowNull: false },
  clearedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  clearedAt: { type: DataTypes.DATE, allowNull: true },
  clearanceNote: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'review_flags',
});

module.exports = ReviewFlag;
