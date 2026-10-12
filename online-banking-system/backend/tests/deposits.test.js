const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login, MPIN } = require('./helpers');
const { computeRdMaturity } = require('../src/services/deposit.service');
const { addMonths } = require('../src/utils/emi');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const balanceOf = async (id) => parseFloat((await models.Account.findByPk(id)).balance);
const sqlDate = (d) => d.toISOString().replace('T', ' ').replace('Z', ' +00:00');
const monthsAgo = (n) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - n); return d; };
const backdate = (id, fields) => {
  const sets = Object.keys(fields).map((k) => `${k} = :${k}`).join(', ');
  return models.sequelize.query(`UPDATE deposits SET ${sets} WHERE id = :id`, { replacements: { id, ...fields } });
};
const ledger = (accountId, type) => models.Transaction.findAll({ where: { sourceAccountId: accountId, transactionType: type }, order: [['id', 'ASC']] });

test('opening a deposit needs the right MPIN, and a wrong one moves no money', async () => {
  const token = await login('arjun');
  const acc = s.accounts.soloAcc.id;
  const before = await balanceOf(acc);
  const base = { accountId: acc, depositType: 'FD', principalAmount: 10000, tenureMonths: 12 };

  assert.equal((await api('POST', '/deposits', { token, body: base })).status, 400); // no MPIN at all
  const wrong = await api('POST', '/deposits', { token, body: { ...base, mpin: '0000' } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /Incorrect MPIN/);
  assert.equal(await balanceOf(acc), before);
  assert.equal((await ledger(acc, 'DepositOpen')).length, 0);
});

test('an FD debits the account once, writes a ledger row and prices maturity from the rate table', async () => {
  const token = await login('arjun');
  const acc = s.accounts.soloAcc.id;
  const before = await balanceOf(acc);
  const res = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'FD', principalAmount: 10000, tenureMonths: 12, mpin: MPIN.arjun } });
  assert.equal(res.status, 201);
  const d = res.body.deposit;
  assert.equal(d.status, 'Active');
  assert.equal(d.interestRate, 5.5);
  assert.equal(parseFloat(d.maturityAmount), 10550);
  assert.match(d.accountNumberMasked, /^X+\d{4}$/);
  assert.equal(await balanceOf(acc), before - 10000);
  const rows = await ledger(acc, 'DepositOpen');
  assert.equal(rows.length, 1);
  assert.equal(parseFloat(rows[0].amount), 10000);
  assert.equal(rows[0].status, 'Success');
});

test('deposit input is validated', async () => {
  const token = await login('arjun');
  const acc = s.accounts.soloAcc.id;
  const bad = [
    { accountId: acc, depositType: 'XX', principalAmount: 1000, tenureMonths: 12 },
    { accountId: acc, depositType: 'FD', principalAmount: -5, tenureMonths: 12 },
    { accountId: acc, depositType: 'FD', principalAmount: 1000, tenureMonths: 0 },
    { accountId: acc, depositType: 'FD', principalAmount: 1000, tenureMonths: 121 },
    { accountId: acc, depositType: 'RD', principalAmount: 1000, tenureMonths: 5 },
    { accountId: acc, depositType: 'FD', principalAmount: 99999999, tenureMonths: 12 },
    { accountId: s.accounts.meeraAcc.id, depositType: 'FD', principalAmount: 1000, tenureMonths: 12 },
  ];
  for (const b of bad) {
    const res = await api('POST', '/deposits', { token, body: { ...b, mpin: MPIN.arjun } });
    assert.ok([400, 404].includes(res.status), `${JSON.stringify(b)} -> ${res.status}`);
  }
});

test('an RD takes the first instalment now and stores the total commitment', async () => {
  const token = await login('priya');
  const acc = s.accounts.priyaAcc.id;
  const before = await balanceOf(acc);
  const res = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'RD', principalAmount: 2000, tenureMonths: 12, mpin: MPIN.priya } });
  assert.equal(res.status, 201);
  const d = res.body.deposit;
  assert.equal(parseFloat(d.installmentAmount), 2000);
  assert.equal(parseFloat(d.principalAmount), 24000);
  assert.equal(d.installmentsPaid, 1);
  assert.equal(d.installmentsRemaining, 11);
  assert.ok(d.nextInstallmentDate);
  assert.equal(parseFloat(d.maturityAmount), computeRdMaturity(2000, 5.0, 12));
  assert.ok(parseFloat(d.maturityAmount) > 24000);
  assert.equal(await balanceOf(acc), before - 2000);
});

test('RD instalments fall due lazily, are debited once each, and stop when the account cannot pay', async () => {
  const token = await login('arjun');
  const acc = s.accounts.soloAcc.id;
  const open = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'RD', principalAmount: 1000, tenureMonths: 6, mpin: MPIN.arjun } });
  const id = open.body.deposit.id;
  const before = await balanceOf(acc);

  // pretend the RD was opened three months and a day ago
  const opened = addMonths(new Date(), -3); opened.setDate(opened.getDate() - 1);
  const next = addMonths(opened, 1);
  await backdate(id, { created_at: sqlDate(opened), next_installment_date: next.toISOString().slice(0, 10) });

  const list = await api('GET', '/deposits', { token });
  const d = list.body.deposits.find((x) => x.id === id);
  assert.equal(d.installmentsPaid, 4);
  assert.equal(await balanceOf(acc), before - 3000);
  assert.equal((await ledger(acc, 'RDInstallment')).length, 3);

  // reading again does not double-charge
  await api('GET', `/deposits/${id}`, { token });
  assert.equal(await balanceOf(acc), before - 3000);
  assert.equal((await ledger(acc, 'RDInstallment')).length, 3);

  // an empty account leaves the instalment overdue instead of overdrawing
  await models.Account.update({ balance: 500 }, { where: { id: acc } });
  const overdueNext = new Date(); overdueNext.setDate(overdueNext.getDate() - 2);
  await backdate(id, { next_installment_date: overdueNext.toISOString().slice(0, 10) });
  const again = await api('GET', `/deposits/${id}`, { token });
  assert.equal(again.body.deposit.installmentsPaid, 4);
  assert.equal(again.body.deposit.installmentOverdue, true);
  assert.equal(await balanceOf(acc), 500);
});

test('a matured FD pays out exactly once', async () => {
  const token = await login('meera');
  const acc = s.accounts.meeraAcc.id;
  const open = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'FD', principalAmount: 50000, tenureMonths: 12, mpin: MPIN.meera } });
  const id = open.body.deposit.id;
  const maturity = parseFloat(open.body.deposit.maturityAmount);
  const afterOpen = await balanceOf(acc);

  await backdate(id, { maturity_date: '2020-01-01' });
  const first = await api('GET', `/deposits/${id}`, { token });
  assert.equal(first.body.deposit.status, 'Matured');
  assert.equal(await balanceOf(acc), afterOpen + maturity);
  await api('GET', '/deposits', { token });
  await api('GET', `/deposits/${id}`, { token });
  assert.equal(await balanceOf(acc), afterOpen + maturity);

  const payouts = await ledger(acc, 'DepositPayout');
  assert.equal(payouts.length, 1);
  assert.equal(parseFloat(payouts[0].amount), maturity);
  // credit-only ledger rows store the credited account in sourceAccountId and read as credits in history
  const history = await api('GET', `/accounts/${acc}/transactions?direction=credit`, { token });
  const credit = history.body.transactions.find((t) => t.transactionType === 'DepositPayout');
  assert.ok(credit);
  assert.equal(credit.direction, 'credit');
  assert.equal(credit.description, 'Deposit proceeds');

  // a matured deposit cannot then be closed prematurely
  const close = await api('POST', `/deposits/${id}/close`, { token, body: { mpin: MPIN.meera } });
  assert.equal(close.status, 400);
});

test('a matured RD pays out on the instalments actually made', async () => {
  const token = await login('meera');
  const acc = s.accounts.meeraAcc.id;
  const open = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'RD', principalAmount: 1000, tenureMonths: 6, mpin: MPIN.meera } });
  const id = open.body.deposit.id;
  const afterOpen = await balanceOf(acc);
  await backdate(id, { maturity_date: '2020-01-01', next_installment_date: null });
  const res = await api('GET', `/deposits/${id}`, { token });
  assert.equal(res.body.deposit.status, 'Matured');
  const expected = computeRdMaturity(1000, 5.0, 6, 1);
  assert.equal(parseFloat(res.body.deposit.maturityAmount), expected);
  assert.equal(await balanceOf(acc), Math.round((afterOpen + expected) * 100) / 100);
});

test('premature closure needs the MPIN, pays interest at 1 point below the rate, and works once', async () => {
  const token = await login('priya');
  const acc = s.accounts.priyaAcc.id;
  const open = await api('POST', '/deposits', { token, body: { accountId: acc, depositType: 'FD', principalAmount: 10000, tenureMonths: 12, mpin: MPIN.priya } });
  const id = open.body.deposit.id;
  await backdate(id, { created_at: sqlDate(monthsAgo(6)) });
  const before = await balanceOf(acc);

  assert.equal((await api('POST', `/deposits/${id}/close`, { token, body: {} })).status, 400);
  const wrong = await api('POST', `/deposits/${id}/close`, { token, body: { mpin: '9999' } });
  assert.equal(wrong.status, 400);
  assert.equal(await balanceOf(acc), before);

  const res = await api('POST', `/deposits/${id}/close`, { token, body: { mpin: MPIN.priya } });
  assert.equal(res.status, 200);
  assert.equal(res.body.penalizedRate, 4.5);
  assert.equal(res.body.elapsedMonths, 6);
  assert.equal(res.body.proceeds, 10225); // 10000 * (1 + 4.5% * 6/12)
  assert.equal(res.body.deposit.status, 'Closed Prematurely');
  assert.equal(await balanceOf(acc), before + 10225);

  assert.equal((await api('POST', `/deposits/${id}/close`, { token, body: { mpin: MPIN.priya } })).status, 400);
  assert.equal(await balanceOf(acc), before + 10225);
});

test("another customer's deposit is not found", async () => {
  const dep = await models.Deposit.findOne({ where: { accountId: s.accounts.meeraAcc.id } });
  assert.equal((await api('GET', `/deposits/${dep.id}`, { token: await login('priya') })).status, 404);
  assert.equal((await api('POST', `/deposits/${dep.id}/close`, { token: await login('priya'), body: { mpin: MPIN.priya } })).status, 404);
});

test('joint-account holders both see a deposit made from the joint account', async () => {
  const open = await api('POST', '/deposits', { token: await login('arjun'), body: { accountId: s.accounts.jointAcc.id, depositType: 'FD', principalAmount: 5000, tenureMonths: 12, mpin: MPIN.arjun } });
  assert.equal(open.status, 201);
  const kavya = await api('GET', '/deposits', { token: await login('kavya') });
  assert.ok(kavya.body.deposits.some((d) => d.id === open.body.deposit.id));
});
