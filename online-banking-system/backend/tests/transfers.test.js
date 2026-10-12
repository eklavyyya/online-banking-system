const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login, MPIN } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const balanceOf = async (id) => parseFloat((await models.Account.findByPk(id)).balance);
const bene = (customer, name) => models.Beneficiary.findOne({ where: { customerId: customer.id, nickname: name } });
const noteCount = (customer) => models.Notification.count({ where: { customerId: customer.id } });
const lastNote = (customer) => models.Notification.findOne({ where: { customerId: customer.id }, order: [['id', 'DESC']] });

async function transfer(username, body) {
  const token = await login(username);
  const init = await api('POST', '/transfers/initiate', { token, body });
  if (init.status !== 200) return { init };
  const done = await api('POST', '/transfers/confirm', { token, body: { transactionId: init.body.transactionId, mpin: MPIN[username] } });
  return { init, done };
}

test('mode limits: IMPS and NEFT have caps, RTGS has a floor, and nothing is created when refused', async () => {
  const meera = await login('meera');
  const sharma = await bene(s.meera.customer, 'Sharma Traders');
  const acc = s.accounts.meeraAcc.id;
  const count = await models.Transaction.count();

  const imps = await api('POST', '/transfers/initiate', { token: meera, body: { sourceAccountId: acc, amount: 500001, mode: 'IMPS', beneficiaryId: sharma.id } });
  assert.equal(imps.status, 400);
  assert.match(imps.body.error, /IMPS transfers are limited/);

  const neft = await api('POST', '/transfers/initiate', { token: meera, body: { sourceAccountId: acc, amount: 2500001, mode: 'NEFT', beneficiaryId: sharma.id } });
  assert.equal(neft.status, 400);
  assert.match(neft.body.error, /NEFT transfers are limited/);

  const rtgs = await api('POST', '/transfers/initiate', { token: meera, body: { sourceAccountId: acc, amount: 199999, mode: 'RTGS', beneficiaryId: sharma.id } });
  assert.equal(rtgs.status, 400);
  assert.match(rtgs.body.error, /RTGS transfers require a minimum/);

  assert.equal(await models.Transaction.count(), count);
});

test('a beneficiary still cooling off cannot be paid', async () => {
  const rent = await bene(s.priya.customer, 'Rent');
  const res = await api('POST', '/transfers/initiate', { token: await login('priya'), body: { sourceAccountId: s.accounts.priyaAcc.id, amount: 100, mode: 'NEFT', beneficiaryId: rent.id } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /cooling-off/);
});

test('an own-account transfer moves money, alerts both holders of the joint account, and is single-use', async () => {
  const solo = s.accounts.soloAcc.id;
  const joint = s.accounts.jointAcc.id;
  await login('arjun'); await login('kavya'); // logging in raises its own security alert, so do it before counting
  const [soloBefore, jointBefore] = [await balanceOf(solo), await balanceOf(joint)];
  const [arjunNotes, kavyaNotes] = [await noteCount(s.arjun.customer), await noteCount(s.kavya.customer)];

  const { init, done } = await transfer('arjun', { sourceAccountId: solo, amount: 7500, mode: 'Own-Transfer', destinationAccountId: joint });
  assert.equal(init.status, 200);
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'Success');
  assert.match(done.body.referenceNumber, /^UTR/);
  assert.equal(await balanceOf(solo), soloBefore - 7500);
  assert.equal(await balanceOf(joint), jointBefore + 7500);

  // arjun gets the debit alert and the credit alert; kavya (joint holder) gets the credit alert
  assert.equal(await noteCount(s.arjun.customer), arjunNotes + 2);
  assert.equal(await noteCount(s.kavya.customer), kavyaNotes + 1);
  assert.match((await lastNote(s.kavya.customer)).message, /^Credit alert/);

  // replaying the confirm is refused and moves nothing
  const replay = await api('POST', '/transfers/confirm', { token: await login('arjun'), body: { transactionId: init.body.transactionId, mpin: MPIN.arjun } });
  assert.equal(replay.status, 400);
  assert.equal(await balanceOf(solo), soloBefore - 7500);

  // the credit shows in the destination's history, the debit in the source's
  const jointHistory = await api('GET', `/accounts/${joint}/transactions`, { token: await login('kavya') });
  const row = jointHistory.body.transactions.find((t) => t.id === init.body.transactionId);
  assert.equal(row.direction, 'credit');
  const soloHistory = await api('GET', `/accounts/${solo}/transactions`, { token: await login('arjun') });
  assert.equal(soloHistory.body.transactions.find((t) => t.id === init.body.transactionId).direction, 'debit');
});

test('a wrong MPIN leaves the transfer pending and moves nothing', async () => {
  const token = await login('priya');
  const acc = s.accounts.priyaAcc.id;
  const rahul = await bene(s.priya.customer, 'Rahul');
  const before = await balanceOf(acc);
  const init = await api('POST', '/transfers/initiate', { token, body: { sourceAccountId: acc, amount: 1000, mode: 'IMPS', beneficiaryId: rahul.id } });
  assert.equal(init.status, 200);
  const bad = await api('POST', '/transfers/confirm', { token, body: { transactionId: init.body.transactionId, mpin: '0000' } });
  assert.equal(bad.status, 400);
  assert.equal(await balanceOf(acc), before);
  assert.equal((await models.Transaction.findByPk(init.body.transactionId)).status, 'Pending');
  const good = await api('POST', '/transfers/confirm', { token, body: { transactionId: init.body.transactionId, mpin: MPIN.priya } });
  assert.equal(good.status, 200);
  assert.equal(await balanceOf(acc), before - 1000);
});

test("someone else's pending transfer cannot be confirmed", async () => {
  const token = await login('priya');
  const rahul = await bene(s.priya.customer, 'Rahul');
  const init = await api('POST', '/transfers/initiate', { token, body: { sourceAccountId: s.accounts.priyaAcc.id, amount: 100, mode: 'IMPS', beneficiaryId: rahul.id } });
  const res = await api('POST', '/transfers/confirm', { token: await login('meera'), body: { transactionId: init.body.transactionId, mpin: MPIN.meera } });
  assert.equal(res.status, 404);
});

test('an amount below the customer alert threshold sends no debit alert; failures always alert', async () => {
  // arjun's seeded threshold is 5000
  const dhruv = await bene(s.arjun.customer, 'Dhruv');
  const acc = s.accounts.soloAcc.id;
  await login('arjun');
  const before = await noteCount(s.arjun.customer);
  const small = await transfer('arjun', { sourceAccountId: acc, amount: 250, mode: 'IMPS', beneficiaryId: dhruv.id });
  assert.equal(small.done.status, 200);
  assert.equal(await noteCount(s.arjun.customer), before, 'a 250 debit is below the 5000 threshold');

  const big = await transfer('arjun', { sourceAccountId: acc, amount: 6000, mode: 'IMPS', beneficiaryId: dhruv.id });
  assert.equal(big.done.status, 200);
  assert.equal(await noteCount(s.arjun.customer), before + 1);

  // failures bypass the threshold: force the simulated core banking system to decline
  const original = process.env.CBS_SIMULATED_FAILURE_RATE;
  process.env.CBS_SIMULATED_FAILURE_RATE = '1';
  try {
    const balance = await balanceOf(acc);
    const failed = await transfer('arjun', { sourceAccountId: acc, amount: 100, mode: 'IMPS', beneficiaryId: dhruv.id });
    assert.equal(failed.done.status, 502);
    assert.equal(await balanceOf(acc), balance);
    assert.equal(await noteCount(s.arjun.customer), before + 2);
    assert.match((await lastNote(s.arjun.customer)).message, /could not be completed/);
  } finally {
    process.env.CBS_SIMULATED_FAILURE_RATE = original;
  }
});

test('insufficient balance is refused up front', async () => {
  const sharma = await bene(s.meera.customer, 'Sharma Traders');
  const res = await api('POST', '/transfers/initiate', { token: await login('meera'), body: { sourceAccountId: s.accounts.meeraAcc.id, amount: 400000, mode: 'IMPS', beneficiaryId: sharma.id } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Insufficient balance|limited/);
});

test('balances stay exact to the paisa after fractional transfers', async () => {
  const solo = s.accounts.soloAcc.id;
  const joint = s.accounts.jointAcc.id;
  const [a, b] = [await balanceOf(solo), await balanceOf(joint)];
  for (const amount of [0.1, 0.2, 10.01]) {
    const { done } = await transfer('arjun', { sourceAccountId: solo, amount, mode: 'Own-Transfer', destinationAccountId: joint });
    assert.equal(done.status, 200);
  }
  assert.equal(await balanceOf(solo), Math.round((a - 10.31) * 100) / 100);
  assert.equal(await balanceOf(joint), Math.round((b + 10.31) * 100) / 100);
});
