const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

test('the feed is newest-first, paginated and reports the unread count', async () => {
  const token = await login('priya');
  const res = await api('GET', '/notifications?pageSize=3', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.pageSize, 3);
  assert.ok(res.body.items.length <= 3);
  assert.ok(res.body.total >= res.body.items.length);
  assert.equal(typeof res.body.unreadCount, 'number');
  const dates = res.body.items.map((n) => new Date(n.createdAt).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  assert.ok(res.body.items.every((n) => n.customerId === s.priya.customer.id));
});

test('the feed filters by category, read state and text, and rejects bad categories', async () => {
  const token = await login('priya');
  const all = await api('GET', '/notifications?pageSize=100', { token });
  const sec = await api('GET', '/notifications?category=Security&pageSize=100', { token });
  assert.ok(sec.body.items.every((n) => n.category === 'Security'));
  assert.equal(sec.body.total, all.body.items.filter((n) => n.category === 'Security').length);
  const unread = await api('GET', '/notifications?isRead=false&pageSize=100', { token });
  assert.ok(unread.body.items.every((n) => n.isRead === false));
  assert.equal(unread.body.total, unread.body.unreadCount);
  assert.equal((await api('GET', '/notifications?category=Spam', { token })).status, 400);
  const q = await api('GET', '/notifications?q=zzzz-no-such-text', { token });
  assert.equal(q.body.total, 0);
});

test('a notification can be marked read, but only by its owner', async () => {
  const token = await login('priya');
  const unread = await api('GET', '/notifications?isRead=false&pageSize=1', { token });
  assert.ok(unread.body.items.length === 1, 'seed data should contain an unread notification for priya');
  const n = unread.body.items[0];
  assert.equal((await api('POST', `/notifications/${n.id}/read`, { token: await login('meera') })).status, 404);
  const ok = await api('POST', `/notifications/${n.id}/read`, { token });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.notification.isRead, true);
  const count = await api('GET', '/notifications/unread-count', { token });
  assert.equal(count.body.unreadCount, unread.body.unreadCount - 1);
});

test('mark all read clears the badge', async () => {
  const token = await login('arjun');
  const res = await api('POST', '/notifications/read-all', { token });
  assert.equal(res.status, 200);
  assert.equal((await api('GET', '/notifications/unread-count', { token })).body.unreadCount, 0);
});

test('preferences default sensibly and validate input', async () => {
  const token = await login('meera');
  const res = await api('GET', '/notifications/preferences', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.preferences.promotionalEnabled, true);
  assert.equal(res.body.preferences.transactionalEnabled, true);
  assert.equal(res.body.preferences.securityEnabled, true);
  assert.equal(res.body.preferences.alertThreshold, 0);

  const upd = await api('PUT', '/notifications/preferences', { token, body: { promotionalEnabled: false, alertThreshold: 2500 } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.preferences.promotionalEnabled, false);
  assert.equal(upd.body.preferences.alertThreshold, 2500);

  for (const body of [{ transactionalEnabled: false }, { securityEnabled: false }, { promotionalEnabled: 'off' }, { alertThreshold: -1 }, { alertThreshold: 'lots' }, { alertThreshold: 999999999 }]) {
    assert.equal((await api('PUT', '/notifications/preferences', { token, body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await api('GET', '/notifications/preferences', { token })).body.preferences.alertThreshold, 2500);
});

test('a promotional broadcast respects opt-out, a security one does not', async () => {
  const admin = await login('admin');
  const kavyaBefore = await models.Notification.count({ where: { customerId: s.kavya.customer.id } });
  const priyaBefore = await models.Notification.count({ where: { customerId: s.priya.customer.id } });

  // kavya is opted out in the seed data; meera opts out here
  const meeraToken = await login('meera');
  assert.equal((await api('PUT', '/notifications/preferences', { token: meeraToken, body: { promotionalEnabled: false } })).status, 200);
  const meeraBefore = await models.Notification.count({ where: { customerId: s.meera.customer.id } });
  const promo = await api('POST', '/admin/notifications/broadcast', { token: admin, body: { message: 'Festive offer on home loans!', category: 'Promotional' } });
  assert.equal(promo.status, 200);
  assert.equal(promo.body.skippedOptedOut, 2);
  assert.equal(promo.body.delivered + promo.body.skippedOptedOut, promo.body.total);
  assert.equal(await models.Notification.count({ where: { customerId: s.kavya.customer.id } }), kavyaBefore);
  assert.equal(await models.Notification.count({ where: { customerId: s.meera.customer.id } }), meeraBefore);
  assert.equal(await models.Notification.count({ where: { customerId: s.priya.customer.id } }), priyaBefore + 1);

  const sec = await api('POST', '/admin/notifications/broadcast', { token: admin, body: { message: 'Never share your OTP with anyone.', category: 'Security' } });
  assert.equal(sec.body.skippedOptedOut, 0);
  assert.equal(await models.Notification.count({ where: { customerId: s.kavya.customer.id } }), kavyaBefore + 1);
  assert.equal(await models.Notification.count({ where: { customerId: s.meera.customer.id } }), meeraBefore + 1);

  assert.equal((await api('POST', '/admin/notifications/broadcast', { token: admin, body: { message: 'hi', category: 'Promotional' } })).status, 400);
  assert.equal((await api('POST', '/admin/notifications/broadcast', { token: admin, body: { message: 'A valid message', category: 'Transactional' } })).status, 400);
  assert.equal((await api('POST', '/admin/notifications/broadcast', { token: await login('priya'), body: { message: 'A valid message' } })).status, 403);
});

test('deactivated customers do not receive broadcasts', async () => {
  const rohanBefore = await models.Notification.count({ where: { customerId: s.rohan.customer.id } });
  await api('POST', '/admin/notifications/broadcast', { token: await login('admin'), body: { message: 'Maintenance window tonight.', category: 'Security' } });
  assert.equal(await models.Notification.count({ where: { customerId: s.rohan.customer.id } }), rohanBefore);
});
