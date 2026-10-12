const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Matches Exp-4 ER Diagram: SERVICE_REQUESTS entity (SRS F50-F54).
// ref is a derived, human-friendly request ID (SR000012) built from the
// primary key, so it is unique without a second counter to keep in sync.
const ServiceRequest = sequelize.define('ServiceRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ref: {
    type: DataTypes.VIRTUAL,
    get() {
      const id = this.getDataValue('id');
      return id ? `SR${String(id).padStart(6, '0')}` : null;
    },
  },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  resolvedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  requestType: {
    type: DataTypes.ENUM('ChequeBook', 'Statement', 'CardIssue', 'Complaint', 'Other'),
    allowNull: false,
  },
  description: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM('Open', 'In Progress', 'Resolved', 'Closed'),
    allowNull: false,
    defaultValue: 'Open',
  },
  resolutionNotes: { type: DataTypes.TEXT, allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
  relatedCardId: { type: DataTypes.INTEGER, allowNull: true },
  relatedAccountId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'service_requests',
});

// Include the virtual field when a request is serialised to JSON.
ServiceRequest.prototype.toJSON = function toJSON() {
  const values = { ...this.get() };
  values.ref = this.ref;
  return values;
};

module.exports = ServiceRequest;
