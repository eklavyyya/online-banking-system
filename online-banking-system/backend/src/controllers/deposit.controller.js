const svc = require('../services/deposit.service');

async function open(req, res, next) {
  try { res.status(201).json({ deposit: await svc.open(req.user.id, req.body) }); } catch (err) { next(err); }
}
async function list(req, res, next) {
  try { res.json({ deposits: await svc.list(req.user.id) }); } catch (err) { next(err); }
}
async function getOne(req, res, next) {
  try { res.json({ deposit: await svc.getOne(req.user.id, req.params.id) }); } catch (err) { next(err); }
}
async function closePrematurely(req, res, next) {
  try { res.json(await svc.closePrematurely(req.user.id, req.params.id, req.body)); } catch (err) { next(err); }
}

module.exports = { open, list, getOne, closePrematurely };
