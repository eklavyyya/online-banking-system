const express = require('express');
const ctrl = require('../controllers/notification.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.get('/preferences', ctrl.getPrefs);
router.put('/preferences', ctrl.updatePrefs);
router.post('/read-all', ctrl.markAllRead);
router.post('/:id/read', ctrl.markRead);

module.exports = router;
