const svc = require('../services/bill.service');

async function initiate(req, res, next) {
  try { res.json(await svc.initiate(req.user.id, req.body)); } catch (err) { next(err); }
}
async function confirm(req, res, next) {
  try {
    const { transactionId, mpin } = req.body;
    res.json(await svc.confirm(req.user.id, transactionId, mpin));
  } catch (err) { next(err); }
}
async function history(req, res, next) {
  try {
    const { from, to, billerId } = req.query;
    res.json({ transactions: await svc.history(req.user.id, { from, to, billerId }) });
  } catch (err) { next(err); }
}

module.exports = { initiate, confirm, history };
