const { ActivityLog } = require('../models');

// Records an audit-trail entry (SRS F63 / S5). Never throws — logging must
// never be the reason a real business action fails.
async function logActivity(userId, actionDescription, entityAffected = null, entityId = null) {
  try {
    await ActivityLog.create({ userId, actionDescription, entityAffected, entityId });
  } catch (err) {
    console.error('Activity log write failed:', err.message);
  }
}

module.exports = { logActivity };
