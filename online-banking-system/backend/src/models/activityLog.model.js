const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: ACTIVITY_LOGS entity.
// Audit trail infrastructure (SRS S5) — every create/update/status-change
// across every module writes here, so it is built in Phase 1 even though
// most of the modules that will eventually log to it arrive in Phase 2.
const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  actionDescription: { type: DataTypes.STRING(255), allowNull: false },
  entityAffected: { type: DataTypes.STRING(50), allowNull: true },
  entityId: { type: DataTypes.INTEGER, allowNull: true },
  timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'activity_logs',
  updatedAt: false,
});

module.exports = ActivityLog;
