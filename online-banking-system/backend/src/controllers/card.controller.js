const svc = require('../services/card.service');
const { handle } = require('../utils/handler');

module.exports = {
  list: handle(async (req) => ({ cards: await svc.list(req.user.id) })),
  getOne: handle(async (req) => ({ card: await svc.getOne(req.user.id, req.params.id) })),
  block: handle((req) => svc.block(req.user.id, req.params.id)),
  requestUnblock: handle((req) => svc.requestUnblock(req.user.id, req.params.id, req.body), 201),
  updateLimits: handle((req) => svc.updateLimits(req.user.id, req.params.id, req.body)),
  updateChannels: handle((req) => svc.updateChannels(req.user.id, req.params.id, req.body)),
};
