const svc = require('../services/notification.service');
const { handle } = require('../utils/handler');

module.exports = {
  list: handle((req) => svc.list(req.user.id, req.query)),
  unreadCount: handle((req) => svc.unreadCount(req.user.id)),
  markRead: handle((req) => svc.markRead(req.user.id, req.params.id)),
  markAllRead: handle((req) => svc.markAllRead(req.user.id)),
  getPrefs: handle((req) => svc.getPrefs(req.user.id)),
  updatePrefs: handle((req) => svc.updatePrefs(req.user.id, req.body)),
};
