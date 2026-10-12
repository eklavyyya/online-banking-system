const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: USERS entity, extended with fields needed to run
// the two-factor login flow (SRS F1-F3): a pending OTP is stored here rather
// than in a separate table since it belongs to the login attempt, not to any
// persisted business record, and must work for both Customer and Admin users
// (only Customers have a linked Customer profile).
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('customer', 'admin'), allowNull: false },
  mpinHash: { type: DataTypes.STRING(255), allowNull: true },
  email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  phoneNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lockedUntil: { type: DataTypes.DATE, allowNull: true },
  otpHash: { type: DataTypes.STRING(255), allowNull: true },
  otpExpiresAt: { type: DataTypes.DATE, allowNull: true },
  otpPurpose: { type: DataTypes.ENUM('login', 'password_reset', 'mpin_reset'), allowNull: true },
  otpAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  // The login before the current one - what the dashboard shows as "last login" (SRS F14).
  previousLoginAt: { type: DataTypes.DATE, allowNull: true },
  mpinFailedAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  mpinLockedUntil: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'users',
});

module.exports = User;
