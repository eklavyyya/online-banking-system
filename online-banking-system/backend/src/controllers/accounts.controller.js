const svc = require('../services/accounts.service');

async function list(req, res, next) {
  try { res.json({ accounts: await svc.listAccounts(req.user.id) }); } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try { res.json({ account: await svc.getAccount(req.user.id, req.params.id) }); } catch (err) { next(err); }
}

async function transactions(req, res, next) {
  try {
    const { from, to, type, status, direction } = req.query;
    const txns = await svc.getTransactions(req.user.id, req.params.id, { from, to, type, status, direction });
    res.json({ transactions: txns });
  } catch (err) { next(err); }
}

async function statement(req, res, next) {
  try {
    const { from, to, format } = req.query;
    const out = await svc.getStatement(req.user.id, req.params.id, { from, to, format: (format || 'csv').toLowerCase() });
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="statement-account-${req.params.id}.${out.format}"`);
    res.send(out.body);
  } catch (err) { next(err); }
}

async function profile(req, res, next) {
  try { res.json(await svc.getProfile(req.user.id)); } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try { res.json(await svc.updateProfile(req.user.id, req.body)); } catch (err) { next(err); }
}

module.exports = { list, getOne, transactions, statement, profile, updateProfile };
