const test = require('node:test');
const assert = require('node:assert/strict');
const { models, setup, teardown, api, login } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

test('a request gets a reference like SR000012 and starts Open', async () => {
  const token = await login('priya');
  const res = await api('POST', '/service-requests', { token, body: { requestType: 'ChequeBook', description: 'Please send a 25 leaf cheque book.', relatedAccountId: s.accounts.priyaAcc.id } });
  assert.equal(res.status, 201);
  const sr = res.body.serviceRequest;
  assert.match(sr.ref, /^SR\d{6}$/);
  assert.equal(sr.ref, `SR${String(sr.id).padStart(6, '0')}`);
  assert.equal(sr.status, 'Open');
  assert.equal(sr.typeLabel, 'Cheque book request');
});

test('requests are validated', async () => {
  const token = await login('priya');
  assert.equal((await api('POST', '/service-requests', { token, body: { requestType: 'Nonsense', description: 'long enough text' } })).status, 400);
  assert.equal((await api('POST', '/service-requests', { token, body: { requestType: 'Complaint', description: 'abc' } })).status, 400);
  assert.equal((await api('POST', '/service-requests', { token, body: { requestType: 'Complaint', description: 'x'.repeat(2001) } })).status, 400);
  const foreign = await api('POST', '/service-requests', { token, body: { requestType: 'Statement', description: 'Need a statement', relatedAccountId: s.accounts.meeraAcc.id } });
  assert.equal(foreign.status, 404);
});

test('customers see only their own requests and can filter them', async () => {
  const priya = await api('GET', '/service-requests', { token: await login('priya') });
  assert.equal(priya.status, 200);
  assert.ok(priya.body.serviceRequests.length >= 2);
  assert.ok(priya.body.serviceRequests.every((r) => r.ref && r.customerId === s.priya.customer.id));
  const open = await api('GET', '/service-requests?status=Open', { token: await login('priya') });
  assert.ok(open.body.serviceRequests.every((r) => r.status === 'Open'));
  const mine = priya.body.serviceRequests[0];
  assert.equal((await api('GET', `/service-requests/${mine.id}`, { token: await login('meera') })).status, 404);
  assert.equal((await api('GET', `/service-requests/${mine.id}`, { token: await login('priya') })).status, 200);
});

test('customers cannot reach the admin queue', async () => {
  assert.equal((await api('GET', '/admin/service-requests', { token: await login('priya') })).status, 403);
  assert.equal((await api('GET', '/admin/service-requests')).status, 401);
});

test('admin works a request through its life and the customer is told each time', async () => {
  const priya = await login('priya');
  const admin = await login('admin');
  const created = await api('POST', '/service-requests', { token: priya, body: { requestType: 'Complaint', description: 'ATM swallowed my card yesterday.' } });
  const id = created.body.serviceRequest.id;
  const notesBefore = await models.Notification.count({ where: { customerId: s.priya.customer.id } });

  // only a resolved request can be closed by the customer
  assert.equal((await api('POST', `/service-requests/${id}/close`, { token: priya })).status, 400);

  const wip = await api('PUT', `/admin/service-requests/${id}`, { token: admin, body: { status: 'In Progress' } });
  assert.equal(wip.status, 200);
  assert.equal(wip.body.serviceRequest.status, 'In Progress');

  assert.equal((await api('PUT', `/admin/service-requests/${id}`, { token: admin, body: { status: 'Resolved' } })).status, 400);
  assert.equal((await api('PUT', `/admin/service-requests/${id}`, { token: admin, body: { status: 'Bogus' } })).status, 400);

  const done = await api('PUT', `/admin/service-requests/${id}`, { token: admin, body: { status: 'Resolved', resolutionNotes: 'Card recovered from the bank ATM.' } });
  assert.equal(done.status, 200);
  assert.ok(done.body.serviceRequest.resolvedAt);
  assert.ok(done.body.serviceRequest.resolvedByUserId);

  const notesAfter = await models.Notification.count({ where: { customerId: s.priya.customer.id } });
  assert.equal(notesAfter, notesBefore + 2); // In Progress, Resolved

  const closed = await api('POST', `/service-requests/${id}/close`, { token: priya });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.serviceRequest.status, 'Closed');

  // Closed is final, for both sides
  assert.equal((await api('PUT', `/admin/service-requests/${id}`, { token: admin, body: { status: 'Open' } })).status, 400);
  assert.equal((await api('POST', `/service-requests/${id}/close`, { token: priya })).status, 400);
});

test('admin list filters by status, type and free text, and paginates', async () => {
  const admin = await login('admin');
  const all = await api('GET', '/admin/service-requests?pageSize=3', { token: admin });
  assert.equal(all.status, 200);
  assert.equal(all.body.pageSize, 3);
  assert.ok(all.body.items.length <= 3);
  assert.ok(all.body.total >= all.body.items.length);
  assert.equal(all.body.totalPages, Math.ceil(all.body.total / 3));

  const complaints = await api('GET', '/admin/service-requests?type=Complaint', { token: admin });
  assert.ok(complaints.body.items.length > 0);
  assert.ok(complaints.body.items.every((r) => r.requestType === 'Complaint'));

  const byName = await api('GET', '/admin/service-requests?q=Priya', { token: admin });
  assert.ok(byName.body.items.length > 0);
  assert.ok(byName.body.items.every((r) => r.customerName === 'Priya Sharma' || /Priya/.test(r.description)));

  const byRef = await api('GET', `/admin/service-requests?q=${all.body.items[0].ref}`, { token: admin });
  assert.ok(byRef.body.items.some((r) => r.id === all.body.items[0].id));

  const one = await api('GET', `/admin/service-requests/${all.body.items[0].id}`, { token: admin });
  assert.equal(one.status, 200);
  assert.ok(one.body.serviceRequest.customerName);
  assert.equal((await api('GET', '/admin/service-requests/99999', { token: admin })).status, 404);
});
