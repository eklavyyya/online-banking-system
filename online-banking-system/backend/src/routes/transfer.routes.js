const express = require('express');
const ctrl = require('../controllers/transfer.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.post('/initiate', ctrl.initiate);
router.post('/confirm', ctrl.confirm);
router.get('/:id', ctrl.getOne);

module.exports = router;
