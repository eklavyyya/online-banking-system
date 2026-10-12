const express = require('express');
const billerCtrl = require('../controllers/biller.controller');
const billCtrl = require('../controllers/bill.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('customer'));

// Saved billers (SRS F29)
router.get('/billers', billerCtrl.list);
router.post('/billers', billerCtrl.add);
router.delete('/billers/:id', billerCtrl.remove);

// Payment / recharge (SRS F30-F33)
router.post('/pay/initiate', billCtrl.initiate);
router.post('/pay/confirm', billCtrl.confirm);
router.get('/pay/history', billCtrl.history);

module.exports = router;
