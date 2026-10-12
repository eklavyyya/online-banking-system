const express = require('express');
const ctrl = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/overview', ctrl.overview);

router.get('/users', ctrl.listUsers);
router.post('/users', ctrl.createCustomer);
router.get('/users/:id', ctrl.getUser);
router.put('/users/:id', ctrl.updateUser);
router.post('/users/:id/deactivate', ctrl.deactivateUser);
router.post('/users/:id/activate', ctrl.activateUser);
router.post('/users/:id/unlock', ctrl.unlockUser);

router.get('/transactions', ctrl.listTransactions);
router.get('/flags', ctrl.listFlags);
router.post('/flags', ctrl.createFlag);
router.post('/flags/:id/clear', ctrl.clearFlag);

router.get('/loans', ctrl.listLoans);
router.post('/loans/:id/approve', ctrl.approveLoan);
router.post('/loans/:id/reject', ctrl.rejectLoan);

router.get('/service-requests', ctrl.listRequests);
router.get('/service-requests/:id', ctrl.getRequest);
router.put('/service-requests/:id', ctrl.updateRequest);

router.get('/reports/summary', ctrl.summaryReport);
router.get('/activity-log', ctrl.activityLog);
router.post('/notifications/broadcast', ctrl.broadcast);

module.exports = router;
