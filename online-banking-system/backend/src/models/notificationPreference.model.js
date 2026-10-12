const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// SRS F58: a customer may opt out of Promotional alerts, but Transactional
// and Security alerts can never be disabled, so they are deliberately not
// represented here. alertThreshold is the minimum debit/credit amount that
// triggers a transaction alert (0 = alert on everything).
const NotificationPreference = sequelize.define('NotificationPreference', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  promotionalEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  smsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  emailEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  alertThreshold: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
}, {
  tableName: 'notification_preferences',
});

module.exports = NotificationPreference;
