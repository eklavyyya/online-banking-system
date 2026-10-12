const express = require('express');
const ctrl = require('../controllers/accounts.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/transactions', ctrl.transactions);
router.get('/:id/statement', ctrl.statement);

module.exports = router;
