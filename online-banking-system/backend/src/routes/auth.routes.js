const express = require('express');
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

// Public
router.post('/login', ctrl.login);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/forgot-password', ctrl.requestPasswordReset);
router.post('/reset-password', ctrl.resetPassword);

// Authenticated
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/mpin', requireAuth, ctrl.setMpin);

module.exports = router;
