const svc = require('../services/serviceRequest.service');
const { handle } = require('../utils/handler');

module.exports = {
  create: handle(async (req) => ({ serviceRequest: await svc.create(req.user.id, req.body) }), 201),
  list: handle(async (req) => ({ serviceRequests: await svc.list(req.user.id, req.query) })),
  getOne: handle(async (req) => ({ serviceRequest: await svc.getOne(req.user.id, req.params.id) })),
  close: handle(async (req) => ({ serviceRequest: await svc.closeResolved(req.user.id, req.params.id) })),
};
