const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: NOTIFICATIONS entity (SRS F55-F58).
// channels records which delivery channels the (simulated) alert went out on.
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  message: { type: DataTypes.STRING(255), allowNull: false },
  category: {
    type: DataTypes.ENUM('Transactional', 'Promotional', 'Security'),
    allowNull: false,
  },
  isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  channels: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'In-App' },
}, {
  tableName: 'notifications',
});

module.exports = Notification;
