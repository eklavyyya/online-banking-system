const svc = require('../services/biller.service');

async function list(req, res, next) {
  try { res.json({ billers: await svc.list(req.user.id) }); } catch (err) { next(err); }
}
async function add(req, res, next) {
  try { res.status(201).json({ biller: await svc.add(req.user.id, req.body) }); } catch (err) { next(err); }
}
async function remove(req, res, next) {
  try { res.json(await svc.remove(req.user.id, req.params.id)); } catch (err) { next(err); }
}

module.exports = { list, add, remove };
