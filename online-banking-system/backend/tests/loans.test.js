const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login, MPIN } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const balanceOf = async (id) => parseFloat((await models.Account.findByPk(id)).balance);

test('offers: pre-approved limit is 10x total balance capped at the product maximum', async () => {
  const token = await login('priya');
  const res = await api('GET', '/loans/offers', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.totalBalance, 85000);
  const byType = Object.fromEntries(res.body.products.map((p) => [p.loanType, p]));
  assert.equal(byType.Personal.preApprovedLimit, 500000);
  assert.equal(byType.Education.preApprovedLimit, 850000);
  assert.equal(byType.Home.preApprovedLimit, 850000);
  assert.equal(byType.Personal.interestRate, 11.5);
});

test('EMI calculator is a pure computation with validation', async () => {
  const token = await login('priya');
  const ok = await api('POST', '/loans/calculate', { token, body: { principal: 100000, annualRatePercent: 12, tenureMonths: 12 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.emi, 8884.88);
  assert.equal(ok.body.schedule.length, 12);
  assert.equal(ok.body.schedule[11].balanceAfter, 0);
  for (const body of [{ principal: 0, annualRatePercent: 10, tenureMonths: 12 }, { principal: 1000, annualRatePercent: 99, tenureMonths: 12 }, { principal: 1000, annualRatePercent: 10, tenureMonths: 0 }, { principal: 1000, annualRatePercent: 10, tenureMonths: 400 }, {}]) {
    assert.equal((await api('POST', '/loans/calculate', { token, body })).status, 400, JSON.stringify(body));
  }
});

test('list shows the seeded loans, including those on a joint account', async () => {
  const priya = await api('GET', '/loans', { token: await login('priya') });
  assert.equal(priya.status, 200);
  const active = priya.body.loans.find((l) => l.status === 'Active');
  assert.equal(active.loanType, 'Personal');
  assert.equal(active.emisPaid, 6);
  assert.equal(active.emisRemaining, 18);
  assert.ok(active.nextEmiAmount > 0 && active.nextEmiDate);
  assert.match(active.accountNumberMasked, /^X+0001$/);

  // Kavya is a joint holder of Arjun's account and therefore sees its loans.
  const kavya = await api('GET', '/loans', { token: await login('kavya') });
  assert.ok(kavya.body.loans.some((l) => l.loanType === 'Vehicle' && l.status === 'Applied'));
});

test('loan detail returns the full schedule with paid and due rows', async () => {
  const token = await login('priya');
  const list = await api('GET', '/loans', { token });
  const active = list.body.loans.find((l) => l.status === 'Active');
  const res = await api('GET', `/loans/${active.id}`, { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.schedule.length, 24);
  assert.equal(res.body.schedule.filter((r) => r.status === 'Paid').length, 6);
  assert.equal(res.body.schedule[23].balanceAfter, 0);
  assert.equal(parseFloat(res.body.loan.outstandingBalance), res.body.schedule[5].balanceAfter);
  assert.equal((await api('GET', `/loans/${active.id}`, { token: await login('arjun') })).status, 404, "another customer's loan is hidden");
});

test('apply validates product, amount, tenure, account and eligibility', async () => {
  const token = await login('kavya');
  const acc = s.accounts.jointAcc.id;
  const bad = [
    [{ accountId: acc, loanType: 'Personal', amount: 50000 }, 400],
    [{ accountId: acc, loanType: 'Yacht', amount: 50000, tenureMonths: 12 }, 400],
    [{ accountId: acc, loanType: 'Personal', amount: 5000, tenureMonths: 12 }, 400],
    [{ accountId: acc, loanType: 'Personal', amount: 50000, tenureMonths: 2 }, 400],
    [{ accountId: acc, loanType: 'Personal', amount: 50000, tenureMonths: 120 }, 400],
    [{ accountId: s.accounts.priyaAcc.id, loanType: 'Personal', amount: 50000, tenureMonths: 12 }, 404],
    [{ accountId: acc, loanType: 'Personal', amount: 600000, tenureMonths: 12 }, 400],
  ];
  for (const [body, status] of bad) {
    const res = await api('POST', '/loans', { token, body });
    assert.equal(res.status, status, JSON.stringify(body) + ' -> ' + JSON.stringify(res.body));
  }
});

test('a customer with too little balance is not pre-approved', async () => {
  const user = await models.User.findOne({ where: { username: 'rohan' } });
  const acc = await models.Account.findByPk(s.accounts.rohanAcc.id);
  const originalBalance = acc.balance;
  await user.update({ isActive: true });
  await acc.update({ balance: 1000 }); // limit = 10 x 1000 = 10,000
  try {
    const token = await login('rohan', undefined, { fresh: true });
    const offers = await api('GET', '/loans/offers', { token });
    assert.equal(offers.status, 200);
    const personal = offers.body.products.find((p) => p.loanType === 'Personal');
    // Personal minimum is 10,000 and the limit is exactly 10,000, so only Personal is on offer.
    assert.equal(personal.eligible, true);
    assert.ok(offers.body.products.filter((p) => p.loanType !== 'Personal').every((p) => p.eligible === false));
    const res = await api('POST', '/loans', { token, body: { accountId: acc.id, loanType: 'Education', amount: 30000, tenureMonths: 24 } });
    assert.equal(res.status, 400);
    const ok = await api('POST', '/loans', { token, body: { accountId: acc.id, loanType: 'Personal', amount: 10000, tenureMonths: 12 } });
    assert.equal(ok.status, 201);
  } finally {
    await acc.update({ balance: originalBalance });
    await user.update({ isActive: false });
    await models.Loan.destroy({ where: { customerId: (await models.Customer.findOne({ where: { userId: user.id } })).id, status: 'Applied' } });
  }
});

test('full lifecycle: apply, admin approves and disburses, customer pays every EMI, loan closes', async () => {
  const priya = await login('priya');
  const admin = await login('admin');
  const acc = s.accounts.priyaAcc.id;
  const before = await balanceOf(acc);

  const applied = await api('POST', '/loans', { token: priya, body: { accountId: acc, loanType: 'Personal', amount: 12000, tenureMonths: 6, purpose: 'Test' } });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  const id = applied.body.loan.id;
  assert.equal(applied.body.loan.status, 'Applied');
  assert.equal(await balanceOf(acc), before, 'nothing is credited at application time');

  // Admin sees it and approves.
  const queue = await api('GET', '/admin/loans?status=Applied', { token: admin });
  assert.ok(queue.body.items.some((l) => l.id === id && l.applicantName === 'Priya Sharma'));
  const approved = await api('POST', `/admin/loans/${id}/approve`, { token: admin });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.loan.status, 'Active');
  assert.equal(approved.body.loan.emisRemaining, 6);
  assert.equal(await balanceOf(acc), before + 12000, 'principal is credited on approval');
  assert.equal((await api('POST', `/admin/loans/${id}/approve`, { token: admin })).status, 400, 'cannot approve twice');
  assert.equal((await api('POST', `/admin/loans/${id}/reject`, { token: admin, body: { reason: 'late' } })).status, 400, 'cannot reject after approval');

  // The credit is on the ledger and the customer was told.
  const hist = await api('GET', `/accounts/${acc}/transactions?type=LoanDisbursal`, { token: priya });
  assert.equal(hist.body.transactions.length, 1);
  assert.equal(hist.body.transactions[0].direction, 'credit');
  const feed = await api('GET', '/notifications?pageSize=50', { token: priya });
  assert.ok(feed.body.items.some((n) => /loan #\d+ of .*is approved and credited/.test(n.message)));

  // MPIN is required and checked; a wrong PIN moves nothing.
  const bal0 = await balanceOf(acc);
  assert.equal((await api('POST', `/loans/${id}/pay-emi`, { token: priya, body: {} })).status, 400);
  assert.equal((await api('POST', `/loans/${id}/pay-emi`, { token: priya, body: { mpin: '9999' } })).status, 400);
  assert.equal(await balanceOf(acc), bal0);

  let outstanding = 12000;
  for (let k = 1; k <= 6; k += 1) {
    const paid = await api('POST', `/loans/${id}/pay-emi`, { token: priya, body: { mpin: MPIN.priya } });
    assert.equal(paid.status, 200, `EMI ${k}: ${JSON.stringify(paid.body)}`);
    assert.ok(paid.body.loan.outstandingBalance < outstanding || k === 6);
    outstanding = parseFloat(paid.body.loan.outstandingBalance);
    assert.equal(paid.body.payment.installment, k);
  }
  const final = await api('GET', `/loans/${id}`, { token: priya });
  assert.equal(final.body.loan.status, 'Closed');
  assert.equal(parseFloat(final.body.loan.outstandingBalance), 0);
  assert.equal((await api('POST', `/loans/${id}/pay-emi`, { token: priya, body: { mpin: MPIN.priya } })).status, 400, 'a closed loan has nothing to pay');

  // Total debited equals the sum of the schedule, and every EMI is on the ledger.
  const emis = await api('GET', `/accounts/${acc}/transactions?type=LoanEMI`, { token: priya });
  assert.equal(emis.body.transactions.length, 6);
  const total = emis.body.transactions.reduce((a, t) => a + parseFloat(t.amount), 0);
  assert.ok(total > 12000 && total < 12600, `total repaid ${total}`);
});

test('rejection needs a reason and the customer is told why', async () => {
  const arjun = await login('arjun');
  const admin = await login('admin');
  const applied = await api('POST', '/loans', { token: arjun, body: { accountId: s.accounts.soloAcc.id, loanType: 'Vehicle', amount: 60000, tenureMonths: 24 } });
  assert.equal(applied.status, 201);
  const id = applied.body.loan.id;
  assert.equal((await api('POST', `/admin/loans/${id}/reject`, { token: admin, body: {} })).status, 400);
  const rej = await api('POST', `/admin/loans/${id}/reject`, { token: admin, body: { reason: 'Income proof incomplete.' } });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.loan.status, 'Rejected');
  assert.equal(rej.body.loan.rejectionReason, 'Income proof incomplete.');
  const feed = await api('GET', '/notifications?pageSize=50', { token: arjun });
  assert.ok(feed.body.items.some((n) => n.message.includes('Income proof incomplete.')));
  assert.equal((await api('POST', `/loans/${id}/pay-emi`, { token: arjun, body: { mpin: MPIN.arjun } })).status, 400);
});

test('no more than three applications may await review', async () => {
  const meera = await login('meera');
  const acc = s.accounts.meeraAcc.id;
  const mk = () => api('POST', '/loans', { token: meera, body: { accountId: acc, loanType: 'Personal', amount: 20000, tenureMonths: 12 } });
  assert.equal((await mk()).status, 201);
  assert.equal((await mk()).status, 201);
  assert.equal((await mk()).status, 201);
  const fourth = await mk();
  assert.equal(fourth.status, 400);
  assert.match(fourth.body.error, /awaiting review/);
});

test('insufficient balance blocks an EMI payment', async () => {
  const token = await login('meera');
  const list = await api('GET', '/loans', { token });
  const home = list.body.loans.find((l) => l.loanType === 'Home' && l.status === 'Active');
  await models.Account.update({ balance: 10 }, { where: { id: s.accounts.meeraAcc.id } });
  const res = await api('POST', `/loans/${home.id}/pay-emi`, { token, body: { mpin: MPIN.meera } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Insufficient/);
});
