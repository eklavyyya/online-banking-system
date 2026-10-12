const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, api, login } = require('./helpers');

test.before(setup);
test.after(teardown);

test('two-step login returns a token and the previous login time', async () => {
  const first = await api('POST', '/auth/login', { body: { username: 'priya', password: 'Customer@123' } });
  assert.equal(first.status, 200);
  assert.match(first.body.devOtp, /^\d{6}$/);
  const second = await api('POST', '/auth/verify-otp', { body: { username: 'priya', otp: first.body.devOtp } });
  assert.equal(second.status, 200);
  assert.ok(second.body.token);
  assert.equal(second.body.user.role, 'customer');
  assert.equal(second.body.user.previousLoginAt, null, 'seed users have never logged in');

  const again = await api('POST', '/auth/login', { body: { username: 'priya', password: 'Customer@123' } });
  const third = await api('POST', '/auth/verify-otp', { body: { username: 'priya', otp: again.body.devOtp } });
  assert.ok(third.body.user.previousLoginAt, 'second login reports the earlier login');
});

test('profile exposes previousLoginAt for the dashboard', async () => {
  const token = await login('priya', undefined, { fresh: true });
  const res = await api('GET', '/profile', { token });
  assert.equal(res.status, 200);
  assert.ok('previousLoginAt' in res.body.user);
});

test('wrong password and wrong OTP are rejected', async () => {
  assert.equal((await api('POST', '/auth/login', { body: { username: 'priya', password: 'nope' } })).status, 401);
  const step1 = await api('POST', '/auth/login', { body: { username: 'arjun', password: 'Customer@123' } });
  const bad = await api('POST', '/auth/verify-otp', { body: { username: 'arjun', otp: step1.body.devOtp === '000000' ? '111111' : '000000' } });
  assert.equal(bad.status, 400);
});

test('a deactivated customer cannot log in', async () => {
  const res = await api('POST', '/auth/login', { body: { username: 'rohan', password: 'Customer@123' } });
  assert.equal(res.status, 403);
});

test('requests without a token are rejected', async () => {
  for (const url of ['/accounts', '/loans', '/cards', '/service-requests', '/notifications', '/admin/overview']) {
    assert.equal((await api('GET', url)).status, 401, url);
  }
});

test('roles are enforced in both directions', async () => {
  const customer = await login('priya');
  const admin = await login('admin');
  for (const url of ['/admin/overview', '/admin/users', '/admin/transactions', '/admin/loans', '/admin/service-requests', '/admin/reports/summary', '/admin/activity-log']) {
    assert.equal((await api('GET', url, { token: customer })).status, 403, `customer on ${url}`);
  }
  for (const url of ['/loans', '/cards', '/service-requests', '/notifications', '/accounts', '/deposits']) {
    assert.equal((await api('GET', url, { token: admin })).status, 403, `admin on ${url}`);
  }
});

test('health endpoint is public', async () => {
  assert.equal((await api('GET', '/health')).status, 200);
});
