const svc = require('../services/transfer.service');

async function initiate(req, res, next) {
  try { res.json(await svc.initiate(req.user.id, req.body)); } catch (err) { next(err); }
}

async function confirm(req, res, next) {
  try {
    const { transactionId, mpin } = req.body;
    res.json(await svc.confirm(req.user.id, transactionId, mpin));
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try { res.json({ transaction: await svc.getOne(req.user.id, req.params.id) }); } catch (err) { next(err); }
}

module.exports = { initiate, confirm, getOne };
