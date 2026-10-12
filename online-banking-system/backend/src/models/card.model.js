const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: CARDS entity (SRS F45-F49).
// Phase 2 adds per-channel daily limits and channel switches so a customer
// can e.g. disable international or online use without blocking the card.
// dailyLimit stays the overall daily ceiling for the card.
const Card = sequelize.define('Card', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountId: { type: DataTypes.INTEGER, allowNull: false },
  cardNumberMasked: { type: DataTypes.STRING(20), allowNull: false },
  cardType: { type: DataTypes.ENUM('Debit', 'Credit'), allowNull: false },
  dailyLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: {
    type: DataTypes.ENUM('Active', 'Blocked', 'Reissue Requested'),
    allowNull: false,
    defaultValue: 'Active',
  },
  cardHolderName: { type: DataTypes.STRING(100), allowNull: true },
  network: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'RuPay' },
  atmLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 25000 },
  posLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 100000 },
  onlineLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 50000 },
  atmEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  posEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  onlineEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  internationalEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  blockedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'cards',
});

module.exports = Card;
