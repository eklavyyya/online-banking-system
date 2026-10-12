const express = require('express');
const ctrl = require('../controllers/serviceRequest.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);
router.post('/:id/close', ctrl.close);

module.exports = router;
