const express = require('express');
const ctrl = require('../controllers/accounts.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/', ctrl.profile);
router.put('/', ctrl.updateProfile);

module.exports = router;
