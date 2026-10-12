const express = require('express');
const ctrl = require('../controllers/beneficiary.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.list);
router.post('/', ctrl.add);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
