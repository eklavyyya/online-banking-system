const express = require('express');
const ctrl = require('../controllers/deposit.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.post('/', ctrl.open);
router.get('/:id', ctrl.getOne);
router.post('/:id/close', ctrl.closePrematurely);

module.exports = router;
