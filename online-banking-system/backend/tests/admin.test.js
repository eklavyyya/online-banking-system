const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login, MPIN } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const newCustomer = (over = {}) => ({
  username: 'new.customer', password: 'Welcome@123', email: 'new.customer@example.test', phoneNumber: '9876500001',
  fullName: 'Nisha Verma', dateOfBirth: '1996-04-02', kycRefNumber: 'KYC-NISHA-0006',
  addressStreet: '9 Park Street', addressCity: 'Chennai', addressState: 'Tamil Nadu', addressPincode: '600010', ...over,
});

test('every admin route is closed to customers and anonymous callers', async () => {
  const paths = ['/admin/overview', '/admin/users', '/admin/transactions', '/admin/flags', '/admin/loans', '/admin/service-requests', '/admin/reports/summary', '/admin/activity-log'];
  const priya = await login('priya');
  for (const p of paths) {
    assert.equal((await api('GET', p)).status, 401, `${p} anonymous`);
    assert.equal((await api('GET', p, { token: priya })).status, 403, `${p} customer`);
  }
});

test('the overview reports live counts', async () => {
  const res = await api('GET', '/admin/overview', { token: await login('admin') });
  assert.equal(res.status, 200);
  assert.equal(res.body.customers, 5);
  assert.equal(res.body.activeCustomers, 4);
  assert.equal(res.body.inactiveCustomers, 1);
  assert.equal(res.body.pendingLoanApplications, await models.Loan.count({ where: { status: 'Applied' } }));
  assert.equal(res.body.openFlags, await models.ReviewFlag.count({ where: { status: 'Open' } }));
  assert.ok(res.body.openServiceRequests > 0);
});

test('user search, status filter and pagination', async () => {
  const admin = await login('admin');
  const all = await api('GET', '/admin/users?role=customer', { token: admin });
  assert.equal(all.body.total, 5);
  assert.ok(all.body.items.every((u) => !('passwordHash' in u) && !('mpinHash' in u)));
  const inactive = await api('GET', '/admin/users?status=inactive', { token: admin });
  assert.deepEqual(inactive.body.items.map((u) => u.username), ['rohan']);
  const byName = await api('GET', '/admin/users?q=Nair', { token: admin });
  assert.deepEqual(byName.body.items.map((u) => u.username).sort(), ['arjun', 'kavya']);
  const page = await api('GET', '/admin/users?role=customer&pageSize=2&page=3', { token: admin });
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.totalPages, 3);
  const joint = all.body.items.find((u) => u.username === 'arjun');
  assert.equal(joint.accounts.length, 2);
  assert.ok(joint.accounts.every((a) => /^X+\d{4}$/.test(a.accountNumberMasked)));
});

test('creating a customer validates every field', async () => {
  const admin = await login('admin');
  const bad = [
    [{ username: '' }, /Missing required/], [{ username: 'a b' }, /username/], [{ password: 'short1' }, /password/], [{ password: 'alllettersnodigit' }, /password/],
    [{ email: 'nope' }, /email/], [{ phoneNumber: '12345' }, /phoneNumber/], [{ dateOfBirth: '2020-01-01' }, /18/], [{ dateOfBirth: 'xx' }, /dateOfBirth/],
    [{ initialMpin: '12' }, /initialMpin/], [{ username: 'priya' }, /already taken/], [{ email: 'priya@example.test' }, /email is already/], [{ phoneNumber: '9111111111' }, /phone number is already/],
    [{ linkAccountNumber: '0000000000000' }, /No account exists/],
  ];
  for (const [over, pattern] of bad) {
    const res = await api('POST', '/admin/users', { token: admin, body: newCustomer(over) });
    assert.ok([400, 404].includes(res.status), JSON.stringify(over));
    assert.match(res.body.error, pattern, JSON.stringify(over));
  }
  assert.equal(await models.User.count({ where: { username: 'new.customer' } }), 0);
});

test('a created customer can log in, is welcomed, and can be linked to an account', async () => {
  const admin = await login('admin');
  const res = await api('POST', '/admin/users', { token: admin, body: newCustomer({ initialMpin: '112233', linkAccountNumber: s.accounts.rohanAcc.accountNumber }) });
  assert.equal(res.status, 201);
  const u = res.body.user;
  assert.equal(u.username, 'new.customer');
  assert.equal(u.role, 'customer');
  assert.equal(u.isActive, true);
  assert.equal(u.mpinSet, true);
  assert.equal(u.accounts.length, 1);
  assert.equal(u.accounts[0].holderRole, 'Joint'); // rohan already holds it
  assert.ok(!('passwordHash' in u));

  const token = await login('new.customer', 'Welcome@123');
  const accounts = await api('GET', '/accounts', { token });
  assert.equal(accounts.body.accounts.length, 1);
  const notes = await api('GET', '/notifications', { token });
  assert.ok(notes.body.items.some((n) => /Welcome/.test(n.message)));
});

test('editing a customer checks uniqueness and keeps identity fields intact', async () => {
  const admin = await login('admin');
  const meera = await models.User.findOne({ where: { username: 'meera' } });
  const ok = await api('PUT', `/admin/users/${meera.id}`, { token: admin, body: { addressCity: 'Coimbatore', phoneNumber: '9444400000' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.addressCity, 'Coimbatore');
  assert.equal(ok.body.user.phoneNumber, '9444400000');
  assert.equal(ok.body.user.username, 'meera');

  const clash = await api('PUT', `/admin/users/${meera.id}`, { token: admin, body: { email: 'priya@example.test' } });
  assert.equal(clash.status, 400);
  assert.equal((await api('PUT', `/admin/users/${meera.id}`, { token: admin, body: { fullName: '  ' } })).status, 400);
  assert.equal((await api('PUT', `/admin/users/${meera.id}`, { token: admin, body: { phoneNumber: '12' } })).status, 400);
  const adminUser = await models.User.findOne({ where: { username: 'admin' } });
  assert.equal((await api('PUT', `/admin/users/${adminUser.id}`, { token: admin, body: { email: 'x@y.test' } })).status, 403);
  assert.equal((await api('PUT', '/admin/users/99999', { token: admin, body: {} })).status, 404);
});

test('deactivating ends the session and blocks login; activating restores it', async () => {
  const admin = await login('admin');
  const kavya = await models.User.findOne({ where: { username: 'kavya' } });
  const token = await login('kavya', undefined, { fresh: true });
  assert.equal((await api('GET', '/accounts', { token })).status, 200);

  const off = await api('POST', `/admin/users/${kavya.id}/deactivate`, { token: admin });
  assert.equal(off.status, 200);
  assert.equal(off.body.user.isActive, false);
  assert.equal((await api('GET', '/accounts', { token })).status, 401);
  const attempt = await api('POST', '/auth/login', { body: { username: 'kavya', password: 'Customer@123' } });
  assert.ok([401, 403].includes(attempt.status));
  assert.equal((await api('POST', `/admin/users/${kavya.id}/deactivate`, { token: admin })).status, 400);

  const on = await api('POST', `/admin/users/${kavya.id}/activate`, { token: admin });
  assert.equal(on.body.user.isActive, true);
  assert.equal((await api('GET', '/accounts', { token })).status, 200);

  const adminUser = await models.User.findOne({ where: { username: 'admin' } });
  assert.equal((await api('POST', `/admin/users/${adminUser.id}/deactivate`, { token: admin })).status, 403);
});

test('unlock clears login and MPIN lockouts', async () => {
  const admin = await login('admin');
  const rohan = await models.User.findOne({ where: { username: 'rohan' } });
  await rohan.update({ lockedUntil: new Date(Date.now() + 3600000), failedLoginAttempts: 5, mpinLockedUntil: new Date(Date.now() + 3600000), mpinFailedAttempts: 2 });
  const listed = await api('GET', '/admin/users?q=rohan', { token: admin });
  assert.equal(listed.body.items[0].locked, true);
  const res = await api('POST', `/admin/users/${rohan.id}/unlock`, { token: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.locked, false);
  await rohan.reload();
  assert.equal(rohan.failedLoginAttempts, 0);
  assert.equal(rohan.mpinLockedUntil, null);
});

test('the transaction monitor filters and its summary covers the whole filtered set', async () => {
  const admin = await login('admin');
  const all = await api('GET', '/admin/transactions?pageSize=100', { token: admin });
  assert.equal(all.status, 200);
  assert.equal(all.body.summary.count, all.body.total);
  assert.ok(all.body.items.every((t) => /^X+\d{4}$/.test(t.sourceAccountMasked)));
  assert.ok(all.body.items.every((t) => Array.isArray(t.customerNames) && t.customerNames.length > 0));

  const small = await api('GET', '/admin/transactions?pageSize=2', { token: admin });
  assert.equal(small.body.items.length, 2);
  assert.equal(small.body.summary.count, all.body.summary.count);
  assert.equal(small.body.summary.successValue, all.body.summary.successValue);

  const failed = await api('GET', '/admin/transactions?status=Failed&pageSize=100', { token: admin });
  assert.ok(failed.body.items.every((t) => t.status === 'Failed'));
  assert.equal(failed.body.summary.failedCount, failed.body.total);

  const big = await api('GET', '/admin/transactions?minAmount=100000&pageSize=100', { token: admin });
  assert.ok(big.body.items.length > 0 && big.body.items.every((t) => t.amount >= 100000));
  const band = await api('GET', '/admin/transactions?minAmount=1000&maxAmount=5000&pageSize=100', { token: admin });
  assert.ok(band.body.items.every((t) => t.amount >= 1000 && t.amount <= 5000));

  const byType = await api('GET', '/admin/transactions?type=RTGS&pageSize=100', { token: admin });
  assert.ok(byType.body.items.length > 0 && byType.body.items.every((t) => t.transactionType === 'RTGS'));

  const byAcc = await api('GET', `/admin/transactions?q=${s.accounts.meeraAcc.accountNumber}&pageSize=100`, { token: admin });
  assert.ok(byAcc.body.items.length > 0);
  const byName = await api('GET', '/admin/transactions?q=Meera&pageSize=100', { token: admin });
  assert.equal(byName.body.total, byAcc.body.total);

  const future = await api('GET', '/admin/transactions?from=2999-01-01', { token: admin });
  assert.equal(future.body.total, 0);
  assert.equal(future.body.summary.successValue, 0);
});

test('flagging: needs a reason, rejects duplicates, appears in the monitor, and can be cleared once', async () => {
  const admin = await login('admin');
  const txn = await models.Transaction.findOne({ where: { status: 'Success', transactionType: 'NEFT' } });
  assert.equal((await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Transaction', entityId: txn.id, reason: '  ' } })).status, 400);
  assert.equal((await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Loan', entityId: 1, reason: 'x' } })).status, 400);
  assert.equal((await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Transaction', entityId: 99999, reason: 'x' } })).status, 404);

  const made = await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Transaction', entityId: txn.id, reason: 'Unusual counterparty' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.flag.status, 'Open');
  assert.equal((await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Transaction', entityId: txn.id, reason: 'again' } })).status, 400);

  const flagged = await api('GET', '/admin/transactions?flagged=true&pageSize=100', { token: admin });
  const row = flagged.body.items.find((t) => t.id === txn.id);
  assert.equal(row.flagged, true);
  assert.equal(row.flagReason, 'Unusual counterparty');
  const unflagged = await api('GET', '/admin/transactions?flagged=false&pageSize=100', { token: admin });
  assert.ok(!unflagged.body.items.some((t) => t.id === txn.id));

  const list = await api('GET', '/admin/flags?status=Open', { token: admin });
  const item = list.body.items.find((f) => f.id === made.body.flag.id);
  assert.ok(item.entitySummary.includes('NEFT'));
  assert.equal(item.flaggedByUsername, 'admin');

  const cleared = await api('POST', `/admin/flags/${made.body.flag.id}/clear`, { token: admin, body: { note: 'Verified with customer' } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.flag.status, 'Cleared');
  assert.equal(cleared.body.flag.clearanceNote, 'Verified with customer');
  assert.equal((await api('POST', `/admin/flags/${made.body.flag.id}/clear`, { token: admin, body: {} })).status, 400);
  assert.equal((await api('POST', '/admin/flags/99999/clear', { token: admin, body: {} })).status, 404);

  // once cleared, the same transaction can be flagged again
  assert.equal((await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Transaction', entityId: txn.id, reason: 'Second look' } })).status, 201);

  const acct = await api('POST', '/admin/flags', { token: admin, body: { entityType: 'Account', entityId: s.accounts.meeraAcc.id, reason: 'Dormant then active' } });
  assert.equal(acct.status, 201);
  const accts = await api('GET', '/admin/flags?entityType=Account', { token: admin });
  assert.ok(accts.body.items.every((f) => f.entityType === 'Account'));
  assert.match(accts.body.items[0].entitySummary, /^Account X+\d{4}/);
});

test('the summary report adds up', async () => {
  const admin = await login('admin');
  const res = await api('GET', '/admin/reports/summary', { token: admin });
  assert.equal(res.status, 200);
  const t = res.body.transactions;
  assert.equal(res.body.range.days, 30);
  assert.equal(t.byDay.length, 30);
  const statusTotal = Object.values(t.byStatus).reduce((a, b) => a + b, 0);
  assert.equal(statusTotal, t.total);
  assert.equal(t.byType.reduce((a, b) => a + b.count, 0), t.total);
  assert.equal(t.byDay.reduce((a, b) => a + b.count, 0), t.total);
  assert.equal(Math.round(t.byType.reduce((a, b) => a + b.amount, 0) * 100) / 100, t.successValue);
  assert.equal(Math.round(t.byDay.reduce((a, b) => a + b.amount, 0) * 100) / 100, t.successValue);
  assert.equal(res.body.beneficiaries.byDay.reduce((a, b) => a + b.count, 0), res.body.beneficiaries.added);
  assert.ok(res.body.beneficiaries.added > 0);
  assert.ok(res.body.serviceRequests.raised > 0);
  assert.ok(res.body.serviceRequests.resolved > 0);
  assert.ok(res.body.serviceRequests.averageTatHours > 0);
  assert.ok(res.body.loans.applied > 0);

  // the same totals as the transaction monitor for the same window
  const monitor = await api('GET', `/admin/transactions?from=${res.body.range.from}&to=${res.body.range.to}`, { token: admin });
  assert.equal(monitor.body.summary.count, t.total);
  assert.equal(monitor.body.summary.successValue, t.successValue);
});

test('report ranges are validated', async () => {
  const admin = await login('admin');
  assert.equal((await api('GET', '/admin/reports/summary?from=2026-02-01&to=2026-01-01', { token: admin })).status, 400);
  assert.equal((await api('GET', '/admin/reports/summary?from=2020-01-01&to=2026-01-01', { token: admin })).status, 400);
  assert.equal((await api('GET', '/admin/reports/summary?from=garbage', { token: admin })).status, 400);
  const week = await api('GET', `/admin/reports/summary?from=${new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, { token: admin });
  assert.equal(week.status, 200);
  assert.equal(week.body.range.days, 7);
});

test('the activity log records admin and customer actions and can be searched', async () => {
  const admin = await login('admin');
  const rohan = await models.User.findOne({ where: { username: 'rohan' } });
  await api('POST', `/admin/users/${rohan.id}/activate`, { token: admin });
  const log = await api('GET', '/admin/activity-log?pageSize=100', { token: admin });
  assert.equal(log.status, 200);
  assert.ok(log.body.total > 0);
  const stamps = log.body.items.map((l) => new Date(l.timestamp).getTime());
  assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a));

  const byUser = await api('GET', '/admin/activity-log?username=admin&pageSize=100', { token: admin });
  assert.ok(byUser.body.items.length > 0 && byUser.body.items.every((l) => l.username === 'admin'));
  assert.ok(byUser.body.items.some((l) => /activated: rohan/.test(l.actionDescription)));

  const byText = await api('GET', '/admin/activity-log?q=activated&pageSize=100', { token: admin });
  assert.ok(byText.body.items.every((l) => /activated/.test(l.actionDescription)));
  const byEntity = await api('GET', '/admin/activity-log?entity=User&pageSize=100', { token: admin });
  assert.ok(byEntity.body.items.every((l) => l.entityAffected === 'User'));
  const none = await api('GET', '/admin/activity-log?from=2999-01-01', { token: admin });
  assert.equal(none.body.total, 0);
});

test('admin loan review keeps its own role gate', async () => {
  const loan = await models.Loan.findOne({ where: { status: 'Applied' } });
  assert.equal((await api('POST', `/admin/loans/${loan.id}/approve`, { token: await login('priya') })).status, 403);
  const list = await api('GET', '/admin/loans?status=Applied', { token: await login('admin') });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length > 0);
  assert.ok(MPIN.priya);
});
