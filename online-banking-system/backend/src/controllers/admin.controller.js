const admin = require('../services/admin.service');
const loans = require('../services/loan.service');
const requests = require('../services/serviceRequest.service');
const { handle } = require('../utils/handler');

module.exports = {
  overview: handle(() => admin.overview()),

  listUsers: handle((req) => admin.listUsers(req.query)),
  getUser: handle(async (req) => ({ user: await admin.getUser(req.params.id) })),
  createCustomer: handle(async (req) => ({ user: await admin.createCustomer(req.user.id, req.body) }), 201),
  updateUser: handle(async (req) => ({ user: await admin.updateUser(req.user.id, req.params.id, req.body) })),
  deactivateUser: handle(async (req) => ({ user: await admin.setActive(req.user.id, req.params.id, false) })),
  activateUser: handle(async (req) => ({ user: await admin.setActive(req.user.id, req.params.id, true) })),
  unlockUser: handle(async (req) => ({ user: await admin.unlockUser(req.user.id, req.params.id) })),

  listTransactions: handle((req) => admin.listTransactions(req.query)),
  createFlag: handle(async (req) => ({ flag: await admin.createFlag(req.user.id, req.body) }), 201),
  listFlags: handle((req) => admin.listFlags(req.query)),
  clearFlag: handle(async (req) => ({ flag: await admin.clearFlag(req.user.id, req.params.id, req.body && req.body.note) })),

  listLoans: handle((req) => loans.adminList(req.query)),
  approveLoan: handle(async (req) => ({ loan: await loans.approve(req.user.id, req.params.id) })),
  rejectLoan: handle(async (req) => ({ loan: await loans.reject(req.user.id, req.params.id, req.body && req.body.reason) })),

  listRequests: handle((req) => requests.adminList(req.query)),
  getRequest: handle(async (req) => ({ serviceRequest: await requests.adminGet(req.params.id) })),
  updateRequest: handle(async (req) => ({ serviceRequest: await requests.adminUpdate(req.user.id, req.params.id, req.body) })),

  summaryReport: handle((req) => admin.summaryReport(req.query)),
  activityLog: handle((req) => admin.activityLog(req.query)),
  broadcast: handle((req) => admin.broadcast(req.user.id, req.body)),
};
