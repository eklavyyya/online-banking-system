const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login } = require('./helpers');
const statements = require('../src/services/statement.service');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const balanceOf = async (id) => parseFloat((await models.Account.findByPk(id)).balance);

test('history includes money in as well as money out, with a direction and a description', async () => {
  const token = await login('priya');
  const res = await api('GET', `/accounts/${s.accounts.priyaAcc.id}/transactions`, { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.transactions.length > 0);
  for (const t of res.body.transactions) {
    assert.ok(['debit', 'credit'].includes(t.direction));
    assert.ok(t.description && t.description.length > 3);
  }
  // money in: solo account of arjun receives own-account transfers in the seed data
  const arjun = await login('arjun');
  const soloId = s.accounts.soloAcc.id;
  const credits = await api('GET', `/accounts/${soloId}/transactions?direction=credit`, { token: arjun });
  assert.ok(credits.body.transactions.length > 0);
  assert.ok(credits.body.transactions.every((t) => t.direction === 'credit'));
  assert.ok(credits.body.transactions.every((t) => /^Transfer from A\/c X+\d{4}$/.test(t.description)));
  const debits = await api('GET', `/accounts/${soloId}/transactions?direction=debit`, { token: arjun });
  assert.ok(debits.body.transactions.every((t) => t.direction === 'debit'));
  const everything = await api('GET', `/accounts/${soloId}/transactions`, { token: arjun });
  assert.equal(credits.body.transactions.length + debits.body.transactions.length, everything.body.transactions.length);
});

test('history filters by type, status and date, and is newest first', async () => {
  const token = await login('meera');
  const id = s.accounts.meeraAcc.id;
  const all = (await api('GET', `/accounts/${id}/transactions`, { token })).body.transactions;
  const times = all.map((t) => new Date(t.initiatedAt).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));

  const type = all[0].transactionType;
  const byType = (await api('GET', `/accounts/${id}/transactions?type=${type}`, { token })).body.transactions;
  assert.ok(byType.length > 0 && byType.every((t) => t.transactionType === type));

  const future = (await api('GET', `/accounts/${id}/transactions?from=2999-01-01`, { token })).body.transactions;
  assert.equal(future.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const none = (await api('GET', `/accounts/${id}/transactions?to=2000-01-01`, { token })).body.transactions;
  assert.equal(none.length, 0);
  assert.ok(today);
});

test("another customer's history and statement are not found", async () => {
  const id = s.accounts.priyaAcc.id;
  assert.equal((await api('GET', `/accounts/${id}/transactions`, { token: await login('meera') })).status, 404);
  assert.equal((await api('GET', `/accounts/${id}/statement`, { token: await login('meera') })).status, 404);
});

test('the running balance is consistent and closes on the current balance', async () => {
  for (const [name, acc] of [['priya', s.accounts.priyaAcc], ['arjun', s.accounts.jointAcc], ['meera', s.accounts.meeraAcc]]) {
    await login(name);
    const st = await statements.build(acc.id, {});
    assert.ok(st.lines.length > 0);
    assert.equal(st.closingBalance, await balanceOf(acc.id), `${name}: closing balance equals the account balance`);
    let running = st.openingBalance;
    for (const l of st.lines) {
      running = Math.round((running + l.credit - l.debit) * 100) / 100;
      assert.equal(l.balance, running);
    }
    assert.equal(Math.round((st.openingBalance + st.totalCredits - st.totalDebits) * 100) / 100, st.closingBalance);
    assert.ok(st.account.accountNumberMasked.startsWith('X'));
  }
});

test('a date range narrows the lines and keeps the balances honest', async () => {
  const full = await statements.build(s.accounts.priyaAcc.id, {});
  const mid = new Date(full.lines[Math.floor(full.lines.length / 2)].date);
  const from = mid.toISOString().slice(0, 10);
  const part = await statements.build(s.accounts.priyaAcc.id, { from });
  assert.ok(part.lines.length > 0 && part.lines.length < full.lines.length);
  assert.equal(part.closingBalance, full.closingBalance);
  const first = part.lines[0];
  assert.equal(Math.round((part.openingBalance + first.credit - first.debit) * 100) / 100, first.balance);
  // a range with no activity reports a flat balance
  const empty = await statements.build(s.accounts.priyaAcc.id, { from: '2999-01-01', to: '2999-02-01' });
  assert.equal(empty.lines.length, 0);
  assert.equal(empty.openingBalance, empty.closingBalance);
});

test('CSV download has a header, one row per line and quoted fields', async () => {
  const token = await login('priya');
  const id = s.accounts.priyaAcc.id;
  const res = await api('GET', `/accounts/${id}/statement`, { token, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="statement-account-\d+\.csv"/);
  const text = await res.text();
  const rows = text.trim().split(/\r?\n/);
  const st = await statements.build(id, {});
  assert.ok(rows.some((r) => /^"?Date"?,/.test(r)), 'has a column header row');
  assert.ok(rows.length >= st.lines.length + 1);
  assert.ok(!text.includes(s.accounts.priyaAcc.accountNumber), 'full account number must not appear');
});

test('PDF download is a real PDF', async () => {
  const token = await login('priya');
  const res = await api('GET', `/accounts/${s.accounts.priyaAcc.id}/statement?format=pdf`, { token, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/pdf/);
  assert.match(res.headers.get('content-disposition'), /\.pdf"/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 1500);
  assert.ok(buf.subarray(buf.length - 32).toString().includes('%%EOF'));
});

test('statement input is validated', async () => {
  const token = await login('priya');
  const base = `/accounts/${s.accounts.priyaAcc.id}/statement`;
  assert.equal((await api('GET', `${base}?format=xls`, { token })).status, 400);
  assert.equal((await api('GET', `${base}?from=not-a-date`, { token })).status, 400);
  assert.equal((await api('GET', `${base}?to=nonsense`, { token })).status, 400);
  assert.equal((await api('GET', `${base}?from=2025-02-01&to=2025-01-01`, { token })).status, 400);
  assert.equal((await api('GET', `${base}`)).status, 401);
});

test('generating a statement is written to the activity log', async () => {
  const before = await models.ActivityLog.count({ where: { entityAffected: 'Account' } });
  await api('GET', `/accounts/${s.accounts.priyaAcc.id}/statement?format=csv`, { token: await login('priya') });
  assert.equal(await models.ActivityLog.count({ where: { entityAffected: 'Account' } }), before + 1);
});
