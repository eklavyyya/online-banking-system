const svc = require('../services/loan.service');
const { handle } = require('../utils/handler');

module.exports = {
  offers: handle((req) => svc.offers(req.user.id)),
  calculate: handle((req) => svc.calculate(req.body || {})),
  list: handle(async (req) => ({ loans: await svc.list(req.user.id) })),
  getOne: handle((req) => svc.getOne(req.user.id, req.params.id)),
  apply: handle(async (req) => ({ loan: await svc.apply(req.user.id, req.body) }), 201),
  payEmi: handle((req) => svc.payEmi(req.user.id, req.params.id, req.body)),
};
