const express = require('express');
const ctrl = require('../controllers/loan.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

router.get('/offers', ctrl.offers);
router.post('/calculate', ctrl.calculate);
router.get('/', ctrl.list);
router.post('/', ctrl.apply);
router.get('/:id', ctrl.getOne);
router.post('/:id/pay-emi', ctrl.payEmi);

module.exports = router;
