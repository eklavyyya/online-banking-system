const test = require('node:test');
const assert = require('node:assert/strict');
const { MPIN, launch, newPage, login, go, apiCall, apiLogin, accountBalance, mpinSummary, enterMpin } = require('./helpers');

let browser;
let adminToken;
test.before(async () => { browser = await launch(); adminToken = await apiLogin('admin'); });
test.after(async () => { await browser.close(); });

// ------------------------------------------------------------------ loans
test('EMI calculator gives the same EMI as the API and shows the schedule', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  await go(page, '/loans');
  await page.getByRole('tab', { name: 'EMI calculator' }).click();
  await page.getByLabel(/Loan amount|Principal/i).fill('100000');
  await page.getByLabel(/Interest rate|Annual interest/i).fill('12');
  await page.getByLabel(/Tenure/i).fill('12');
  await page.getByText('8,884.88').first().waitFor();
  const token = await apiLogin('priya');
  const api = await apiCall('POST', '/loans/calculate', { token, body: { principal: 100000, annualRatePercent: 12, tenureMonths: 12 } });
  assert.equal(api.body.emi, 8884.88);
  assert.equal(await page.locator('tbody tr').count(), 12);
  assert.equal(await page.getByRole('button', { name: /Show all/ }).count(), 0, 'a 12-month schedule is already fully shown');
  await page.getByLabel(/Tenure/i).fill('36');
  assert.equal(await page.locator('tbody tr').count(), 12, 'long schedules start collapsed');
  await page.getByRole('button', { name: /Show all/ }).click();
  assert.equal(await page.locator('tbody tr').count(), 36);
  assert.deepEqual(page.problems, []);
});

test('my loans: status-specific cards, schedule, and paying an EMI with the MPIN', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  const before = await accountBalance('priya', '0001');
  await go(page, '/loans');
  await page.getByText('Awaiting bank review').waitFor();
  const active = page.locator('article, div').filter({ has: page.getByRole('button', { name: 'Pay EMI' }) }).last();
  await page.getByRole('button', { name: 'View schedule' }).click();
  await page.getByText('Paid', { exact: true }).first().waitFor();
  await page.getByText('Due', { exact: true }).first().waitFor();

  await page.getByRole('button', { name: 'Pay EMI' }).first().click();
  const summary = await mpinSummary(page);
  assert.match(summary.Instalment, /^7 of 24$/);
  assert.match(summary.Amount, /9,368\.06/);
  assert.match(summary['Debited from'], /XXXXXXXXX0001/);
  await enterMpin(page, '0000');
  await page.getByRole('dialog').getByText('Incorrect MPIN.').waitFor();
  await enterMpin(page, MPIN.priya);
  await page.getByText(/Instalment 7 of 24 paid/).waitFor();
  await page.getByText(/Reference number: EMI\d+/).waitFor();
  assert.equal((await accountBalance('priya', '0001')).balance, Math.round((before.balance - 9368.06) * 100) / 100);
  await page.getByText('8 of 24').or(page.getByText('7 of 24')).first().waitFor();
  assert.ok(active);
});

test('applying for a loan: live EMI preview, validation, then admin approval credits the account', async () => {
  const page = await newPage(browser);
  await login(page, 'meera');
  const before = await accountBalance('meera', '0004');
  await go(page, '/loans');
  await page.getByRole('tab', { name: 'Apply' }).click();
  await page.getByText(/10x your total balance/i).waitFor();
  await page.getByLabel('Disbursal account').selectOption({ index: 1 });
  await page.getByLabel('Loan type').selectOption('Personal');
  await page.getByLabel(/^Amount/).fill('5000'); // below the Personal minimum
  await page.getByLabel(/^Tenure/).fill('12');
  await page.getByRole('button', { name: /Submit application|Apply/ }).last().click();
  await page.getByText(/minimum/i).first().waitFor();

  await page.getByLabel(/^Amount/).fill('60000');
  await page.getByText(/EMI/).first().waitFor();
  await page.getByLabel(/Purpose/i).fill('Laptop and desk');
  await page.getByRole('button', { name: /Submit application|Apply/ }).last().click();
  await page.getByText(/submitted/i).first().waitFor();
  await page.getByText('Awaiting bank review').first().waitFor();

  // the admin sees it, approves it, and the money arrives
  const list = await apiCall('GET', '/admin/loans?status=Applied&q=Meera', { token: adminToken });
  const loan = list.body.items.find((l) => Number(l.principalAmount) === 60000);
  assert.ok(loan, 'application is visible to the admin');
  const approved = await apiCall('POST', `/admin/loans/${loan.id}/approve`, { token: adminToken });
  assert.equal(approved.status, 200);
  assert.equal((await accountBalance('meera', '0004')).balance, before.balance + 60000);
  await go(page, '/loans');
  await page.getByRole('heading', { name: 'Personal loan' }).first().waitFor();
  await page.getByText('Active').first().waitFor();
});

// ------------------------------------------------------------------ cards
test('cards: limits within the ceiling, channel switches, block, and the unblock request flow', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  await go(page, '/cards');
  const debit = page.locator('section, article, div').filter({ has: page.getByRole('heading', { name: 'Debit card ending 4821' }) }).last();

  // limits
  await page.getByLabel('Daily limit (₹)').first().fill('250000');
  await page.getByText(/Cannot exceed the ceiling of ₹2,00,000/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save limits' }).first().isDisabled(), true, 'an over-ceiling limit cannot be saved');
  await page.getByLabel('Daily limit (₹)').first().fill('90000');
  await page.getByLabel('ATM limit (₹)').first().fill('12000');
  await page.getByRole('button', { name: 'Save limits' }).first().click();
  await page.getByText(/Limits (updated|saved)/i).first().waitFor();

  // channels
  const online = page.getByRole('switch', { name: /Online/ }).first();
  assert.equal(await online.getAttribute('aria-checked'), 'true');
  await online.click();
  await page.waitForFunction((el) => el.getAttribute('aria-checked') === 'false', await online.elementHandle());
  const token = await apiLogin('priya');
  let cards = (await apiCall('GET', '/cards', { token })).body.cards;
  const d = cards.find((c) => c.last4 === '4821');
  assert.equal(d.dailyLimit, 90000);
  assert.equal(d.atmLimit, 12000);
  assert.equal(d.onlineEnabled, false);

  // block
  await page.getByRole('button', { name: 'Block card' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Block card' }).click();
  await page.getByText('Blocked', { exact: true }).first().waitFor();
  cards = (await apiCall('GET', '/cards', { token })).body.cards;
  assert.equal(cards.find((c) => c.last4 === '4821').status, 'Blocked');

  // unblock request -> reissue requested
  await page.getByRole('button', { name: /Request unblock/ }).first().click();
  const dlg = page.getByRole('dialog');
  if (await dlg.count()) await dlg.getByRole('button', { name: /Request|Submit|Send/ }).click();
  await page.getByText('Reissue Requested').first().waitFor();

  // admin resolves it; the customer's card is live again with a new number
  const reqs = await apiCall('GET', '/admin/service-requests?type=CardIssue&status=Open&q=4821', { token: adminToken });
  const sr = reqs.body.items.find((r) => /4821/.test(r.description));
  assert.ok(sr, 'the unblock request reached the admin queue');
  const done = await apiCall('PUT', `/admin/service-requests/${sr.id}`, { token: adminToken, body: { status: 'Resolved', resolutionNotes: 'Replacement issued after KYC check.' } });
  assert.equal(done.status, 200);
  await go(page, '/cards');
  cards = (await apiCall('GET', '/cards', { token })).body.cards;
  const renewed = cards.find((c) => c.id === d.id);
  assert.equal(renewed.status, 'Active');
  assert.notEqual(renewed.last4, '4821');
  await page.getByRole('heading', { name: `Debit card ending ${renewed.last4}` }).waitFor();
  assert.ok(debit);
});

// ------------------------------------------------------------------ service requests
test('service requests: raise, follow the admin through to Resolved, then close', async () => {
  const page = await newPage(browser);
  await login(page, 'kavya');
  await go(page, '/service-requests');
  await page.getByRole('button', { name: /New request/ }).click();
  await page.getByLabel('Request type').selectOption('Complaint');
  const description = page.getByLabel('Description');
  await description.fill('abc');
  await page.getByText('3 / 2000 characters (minimum 5)').waitFor();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await page.getByText(/at least 5/i).first().waitFor();
  await description.fill('The ATM on Anna Salai kept my card for no reason.');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await page.getByText(/SR\d{6}/).first().waitFor();

  const token = await apiLogin('kavya');
  const mine = (await apiCall('GET', '/service-requests', { token })).body.serviceRequests;
  const sr = mine.find((r) => /Anna Salai/.test(r.description));
  assert.equal(sr.status, 'Open');
  await apiCall('PUT', `/admin/service-requests/${sr.id}`, { token: adminToken, body: { status: 'Resolved', resolutionNotes: 'Card returned to the branch counter.' } });

  await go(page, '/service-requests');
  await page.getByText('Card returned to the branch counter.').waitFor().catch(async () => {
    await page.getByText(sr.ref).first().click();
    await page.getByText('Card returned to the branch counter.').waitFor();
  });
  await page.getByRole('button', { name: 'Close request' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Close request|Confirm/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Closed'));
  const after = (await apiCall('GET', `/service-requests/${sr.id}`, { token })).body.serviceRequest;
  assert.equal(after.status, 'Closed');
});

// ------------------------------------------------------------------ notifications
test('notifications: unread badge, mark all read, and preferences', async () => {
  const page = await newPage(browser);
  await login(page, 'meera');
  const token = await apiLogin('meera');
  const unread = (await apiCall('GET', '/notifications/unread-count', { token })).body.unreadCount;
  assert.ok(unread > 0);
  const badge = page.getByRole('navigation', { name: 'Main' }).getByLabel(/unread/);
  await badge.waitFor();

  await go(page, '/notifications');
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await badge.waitFor({ state: 'detached' });
  assert.equal((await apiCall('GET', '/notifications/unread-count', { token })).body.unreadCount, 0);

  // preferences
  await page.getByRole('switch', { name: /Promotional/ }).click();
  await page.getByLabel(/Minimum amount/).fill('1500');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByText(/saved/i).first().waitFor();
  const prefs = (await apiCall('GET', '/notifications/preferences', { token })).body.preferences;
  assert.equal(prefs.promotionalEnabled, false);
  assert.equal(prefs.alertThreshold, 1500);
  for (const name of [/Transactional/, /Security/]) {
    const sw = page.getByRole('switch', { name });
    assert.equal(await sw.getAttribute('aria-checked'), 'true');
    assert.equal(await sw.isDisabled(), true);
  }

  // a promotional broadcast no longer reaches meera, a security one does
  const before = (await apiCall('GET', '/notifications?pageSize=1', { token })).body.total;
  await apiCall('POST', '/admin/notifications/broadcast', { token: adminToken, body: { message: 'Festival offer: 0% processing fee', category: 'Promotional' } });
  assert.equal((await apiCall('GET', '/notifications?pageSize=1', { token })).body.total, before);
  await apiCall('POST', '/admin/notifications/broadcast', { token: adminToken, body: { message: 'Security notice: never share your OTP', category: 'Security' } });
  assert.equal((await apiCall('GET', '/notifications?pageSize=1', { token })).body.total, before + 1);
  await page.reload();
  await page.getByText('Security notice: never share your OTP').waitFor();
  assert.deepEqual(page.problems, []);
});
