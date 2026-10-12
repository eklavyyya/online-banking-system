const express = require('express');
const ctrl = require('../controllers/card.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/:id/block', ctrl.block);
router.post('/:id/request-unblock', ctrl.requestUnblock);
router.put('/:id/limits', ctrl.updateLimits);
router.put('/:id/channels', ctrl.updateChannels);

module.exports = router;
