const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { models, setup, teardown, api, login } = require('./helpers');

let s;
test.before(async () => { s = await setup(); });
test.after(teardown);

const cardByLast4 = (last4) => models.Card.findOne({ where: { cardNumberMasked: { [Op.like]: `%${last4}` } } });
const notesFor = async (customer) => models.Notification.findAll({ where: { customerId: customer.id }, order: [['id', 'ASC']] });

test('a customer lists only cards on their own accounts, with masked numbers', async () => {
  const priya = await api('GET', '/cards', { token: await login('priya') });
  assert.equal(priya.status, 200);
  assert.equal(priya.body.cards.length, 2);
  for (const c of priya.body.cards) {
    assert.match(c.cardNumberMasked, /^XXXX XXXX XXXX \d{4}$/);
    assert.match(c.accountNumberMasked, /^X+\d{4}$/);
    assert.ok(c.ceilings.dailyLimit > 0);
  }
  const arjun = await api('GET', '/cards', { token: await login('arjun') });
  assert.equal(arjun.body.cards.length, 2); // joint-account card + solo-account card
  const kavya = await api('GET', '/cards', { token: await login('kavya') });
  assert.equal(kavya.body.cards.length, 1); // joint-account card only
});

test("another customer's card is not found", async () => {
  const card = await cardByLast4('4821'); // priya's debit card
  const res = await api('GET', `/cards/${card.id}`, { token: await login('meera') });
  assert.equal(res.status, 404);
  const block = await api('POST', `/cards/${card.id}/block`, { token: await login('meera') });
  assert.equal(block.status, 404);
});

test('admins cannot use the customer card endpoints', async () => {
  const res = await api('GET', '/cards', { token: await login('admin') });
  assert.equal(res.status, 403);
});

test('limits can be changed within the product ceiling and are validated', async () => {
  const token = await login('priya');
  const card = await cardByLast4('4821');
  const ok = await api('PUT', `/cards/${card.id}/limits`, { token, body: { dailyLimit: 80000, atmLimit: 10000, posLimit: 60000, onlineLimit: 30000 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.card.dailyLimit, 80000);
  assert.equal(ok.body.card.atmLimit, 10000);

  const tooHigh = await api('PUT', `/cards/${card.id}/limits`, { token, body: { dailyLimit: 250000 } });
  assert.equal(tooHigh.status, 400);
  assert.match(tooHigh.body.error, /cannot exceed/);

  const channelAboveDaily = await api('PUT', `/cards/${card.id}/limits`, { token, body: { posLimit: 90000 } });
  assert.equal(channelAboveDaily.status, 400);
  assert.match(channelAboveDaily.body.error, /daily limit/);

  for (const body of [{}, { dailyLimit: -5 }, { dailyLimit: 'abc' }, { atmLimit: '' }]) {
    const bad = await api('PUT', `/cards/${card.id}/limits`, { token, body });
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
  const after = await cardByLast4('4821');
  assert.equal(parseFloat(after.dailyLimit), 80000); // failed updates changed nothing
});

test('a credit card has its own, tighter ATM ceiling', async () => {
  const token = await login('priya');
  const credit = await cardByLast4('9034');
  const res = await api('PUT', `/cards/${credit.id}/limits`, { token, body: { atmLimit: 60000 } });
  assert.equal(res.status, 400);
  const ok = await api('PUT', `/cards/${credit.id}/limits`, { token, body: { atmLimit: 50000 } });
  assert.equal(ok.status, 200);
});

test('channels can be switched on and off, and only with real booleans', async () => {
  const token = await login('priya');
  const card = await cardByLast4('4821');
  const res = await api('PUT', `/cards/${card.id}/channels`, { token, body: { onlineEnabled: false, internationalEnabled: true } });
  assert.equal(res.status, 200);
  assert.equal(res.body.card.onlineEnabled, false);
  assert.equal(res.body.card.internationalEnabled, true);
  assert.equal((await api('PUT', `/cards/${card.id}/channels`, { token, body: { posEnabled: 'no' } })).status, 400);
  assert.equal((await api('PUT', `/cards/${card.id}/channels`, { token, body: {} })).status, 400);
});

test('blocking is immediate, alerts every holder, and cannot be repeated', async () => {
  const card = await cardByLast4('1177'); // joint card (arjun + kavya)
  const before = (await notesFor(s.kavya.customer)).length;
  const res = await api('POST', `/cards/${card.id}/block`, { token: await login('kavya') });
  assert.equal(res.status, 200);
  assert.equal(res.body.card.status, 'Blocked');
  assert.ok(res.body.card.blockedAt);

  const kavyaNotes = await notesFor(s.kavya.customer);
  assert.equal(kavyaNotes.length, before + 1);
  assert.equal(kavyaNotes[kavyaNotes.length - 1].category, 'Security');
  const arjunNotes = await notesFor(s.arjun.customer);
  assert.match(arjunNotes[arjunNotes.length - 1].message, /has been blocked/);

  assert.equal((await api('POST', `/cards/${card.id}/block`, { token: await login('kavya') })).status, 400);
  // a blocked card's limits and channels are frozen
  assert.equal((await api('PUT', `/cards/${card.id}/limits`, { token: await login('kavya'), body: { dailyLimit: 1000 } })).status, 400);
  assert.equal((await api('PUT', `/cards/${card.id}/channels`, { token: await login('kavya'), body: { atmEnabled: false } })).status, 400);
});

test('unblock raises a card service request and the card waits for the admin', async () => {
  const token = await login('kavya');
  const card = await cardByLast4('1177');
  assert.equal((await api('POST', `/cards/${card.id}/request-unblock`, { token: await login('priya') })).status, 404);
  const res = await api('POST', `/cards/${card.id}/request-unblock`, { token, body: { reason: 'Found my card' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.card.status, 'Reissue Requested');
  assert.equal(res.body.serviceRequest.requestType, 'CardIssue');
  assert.equal(res.body.serviceRequest.status, 'Open');
  assert.match(res.body.serviceRequest.description, /Found my card/);
  assert.equal(res.body.serviceRequest.relatedCardId, card.id);

  const again = await api('POST', `/cards/${card.id}/request-unblock`, { token });
  assert.equal(again.status, 400);

  // admin resolves: a fresh card number and Active status
  const admin = await login('admin');
  const noNote = await api('PUT', `/admin/service-requests/${res.body.serviceRequest.id}`, { token: admin, body: { status: 'Resolved' } });
  assert.equal(noNote.status, 400);
  const resolved = await api('PUT', `/admin/service-requests/${res.body.serviceRequest.id}`, { token: admin, body: { status: 'Resolved', resolutionNotes: 'Replacement card issued.' } });
  assert.equal(resolved.status, 200);
  const fresh = await models.Card.findByPk(card.id);
  assert.equal(fresh.status, 'Active');
  assert.equal(fresh.blockedAt, null);
  assert.match(fresh.cardNumberMasked, /^XXXX XXXX XXXX \d{4}$/);
  assert.ok(new Date(fresh.expiryDate).getFullYear() >= new Date().getFullYear() + 4);
});

test('an active card has nothing to unblock', async () => {
  const card = await cardByLast4('4821');
  const res = await api('POST', `/cards/${card.id}/request-unblock`, { token: await login('priya') });
  assert.equal(res.status, 400);
});

test('closing the request without resolving leaves the card blocked', async () => {
  const token = await login('meera');
  const card = await cardByLast4('5512');
  assert.equal((await api('POST', `/cards/${card.id}/block`, { token })).status, 200);
  const raised = await api('POST', `/cards/${card.id}/request-unblock`, { token });
  const admin = await login('admin');
  const closed = await api('PUT', `/admin/service-requests/${raised.body.serviceRequest.id}`, { token: admin, body: { status: 'Closed', resolutionNotes: 'Declined after verification.' } });
  assert.equal(closed.status, 200);
  assert.equal((await models.Card.findByPk(card.id)).status, 'Blocked');
  // and a Closed request is immutable
  const reopen = await api('PUT', `/admin/service-requests/${raised.body.serviceRequest.id}`, { token: admin, body: { status: 'Open' } });
  assert.equal(reopen.status, 400);
});

test('the seeded Reissue Requested card cannot be blocked again', async () => {
  const card = await cardByLast4('2205');
  assert.equal(card.status, 'Reissue Requested');
  const res = await api('POST', `/cards/${card.id}/block`, { token: await login('arjun') });
  assert.equal(res.status, 400);
});
