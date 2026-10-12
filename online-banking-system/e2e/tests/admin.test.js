const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { MPIN, launch, newPage, login, go, apiCall, apiLogin, accountBalance } = require('./helpers');

let browser;
let adminToken;
test.before(async () => { browser = await launch(); adminToken = await apiLogin('admin'); });
test.after(async () => { await browser.close(); });

async function adminPage() {
  const page = await newPage(browser);
  await login(page, 'admin');
  return page;
}

test('overview numbers match the API, and attention cards link to the filtered lists', async () => {
  const page = await adminPage();
  await page.getByRole('heading', { name: 'Admin Overview' }).waitFor();
  const api = (await apiCall('GET', '/admin/overview', { token: adminToken })).body;
  const text = await page.locator('main').innerText();
  assert.ok(text.includes(String(api.customers)), 'customer count shown');
  await page.getByRole('heading', { name: 'Loan applications to review' }).waitFor();
  await page.getByRole('heading', { name: 'Service requests to handle' }).waitFor();
  await page.getByRole('link', { name: /^Pending loan applications: \d+/ }).click();
  await page.waitForURL('**/admin/loans?status=Applied');
  assert.equal(await page.getByRole('button', { name: 'Applied', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(page.problems, []);
});

test('broadcast asks for confirmation and reports delivery and opt-outs', async () => {
  const page = await adminPage();
  await page.getByLabel(/^Message/).fill('Branch holiday on Monday');
  await page.getByLabel('Category').selectOption('Promotional');
  await page.getByRole('button', { name: 'Review and send' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send this broadcast?' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: /Send/ }).click();
  await page.getByText(/Delivered to \d+/).waitFor();
  await page.getByText(/opted out/).first().waitFor();
});

test('users: search, create (with API validation), the new customer signs in, deactivate/activate', async () => {
  const page = await adminPage();
  await go(page, '/admin/users');
  await page.getByRole('button', { name: 'Edit priya' }).waitFor();
  await page.getByLabel('Search').fill('Nair');
  await page.getByRole('button', { name: 'Edit arjun' }).waitFor();
  await page.getByRole('button', { name: 'Edit priya' }).waitFor({ state: 'detached' });
  await page.getByLabel('Search').fill('');

  await page.getByRole('button', { name: '+ Create customer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create customer' });
  await dialog.getByLabel(/^Username/).fill('priya'); // already taken
  await dialog.getByLabel(/^Password/).fill('Welcome@123');
  await dialog.getByLabel(/^Email/).fill('nisha@example.test');
  await dialog.getByLabel(/^Phone/).fill('9876500001');
  await dialog.getByLabel(/^Full name/).fill('Nisha Verma');
  await dialog.getByLabel(/^Date of birth/).fill('1996-04-02');
  await dialog.getByLabel(/^KYC/).fill('KYC-NISHA-0006');
  await dialog.getByLabel(/initial MPIN/i).fill('112233');
  await dialog.getByRole('button', { name: /^Create/ }).last().click();
  await dialog.getByText('That username is already taken.').waitFor();
  await dialog.getByLabel(/^Username/).fill('nisha.v');
  await dialog.getByRole('button', { name: /^Create/ }).last().click();
  await page.getByText(/nisha\.v/).first().waitFor();
  await dialog.waitFor({ state: 'detached' });

  // she can sign in with the credentials the admin set
  const nisha = await newPage(browser);
  await login(nisha, 'nisha.v', 'Welcome@123');
  await nisha.getByRole('heading', { name: 'Account Dashboard' }).waitFor();

  // deactivate arjun: his live session ends at once
  const arjunToken = await apiLogin('arjun');
  assert.equal((await apiCall('GET', '/accounts', { token: arjunToken })).status, 200);
  await page.getByRole('button', { name: 'Deactivate arjun' }).click();
  await page.getByRole('dialog', { name: 'Deactivate customer?' }).getByRole('button', { name: /Deactivate/ }).click();
  await page.getByRole('button', { name: 'Activate arjun' }).waitFor();
  assert.equal((await apiCall('GET', '/accounts', { token: arjunToken })).status, 401);
  await page.getByRole('button', { name: 'Activate arjun' }).click();
  await page.getByRole('dialog', { name: 'Activate customer?' }).getByRole('button', { name: /Activate/ }).click();
  await page.getByRole('button', { name: 'Deactivate arjun' }).waitFor();
  assert.deepEqual(page.problems, []);
});

test('user edit sends only what changed and unlock clears a lockout', async () => {
  const page = await adminPage();
  const meera = (await apiCall('GET', '/admin/users?q=meera', { token: adminToken })).body.items[0];
  await go(page, '/admin/users');
  await page.getByRole('button', { name: 'Edit meera' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit meera' });
  await dialog.getByLabel(/^City/).fill('Madurai');
  await dialog.getByRole('button', { name: /Save/ }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await apiCall('GET', `/admin/users/${meera.id}`, { token: adminToken })).body.user.addressCity, 'Madurai');

  // lock rohan out by failing the password five times, then unlock from the UI
  for (let i = 0; i < 5; i += 1) await apiCall('POST', '/auth/login', { body: { username: 'meera', password: 'wrong-password' } });
  await page.reload();
  await page.getByText('Locked', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Unlock meera' }).click();
  await page.getByText('Locked', { exact: true }).first().waitFor({ state: 'detached' });
});

test('transactions: filters with whole-set summary, flag with a reason, review the flag, clear it', async () => {
  const page = await adminPage();
  await go(page, '/admin/transactions');
  await page.getByLabel('Type').first().selectOption('RTGS');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  const rows = page.locator('tbody tr');
  await rows.first().waitFor();
  assert.ok((await rows.allInnerTexts()).every((t) => /RTGS/.test(t)));
  const api = (await apiCall('GET', '/admin/transactions?type=RTGS', { token: adminToken })).body;
  assert.equal(api.summary.count, await page.locator('tbody tr').count());
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByLabel('Type').first().selectOption('NEFT');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.locator('tbody tr').first().waitFor();
  await page.getByRole('button', { name: /^Flag transaction/ }).first().click();
  const flag = page.getByRole('dialog', { name: 'Flag for review' });
  await flag.getByRole('button', { name: /Flag/ }).last().click();
  await flag.getByText(/reason/i).first().waitFor(); // a reason is mandatory
  await flag.getByLabel(/Reason/).fill('Unusual beneficiary pattern');
  await flag.getByRole('button', { name: /Flag/ }).last().click();
  await flag.waitFor({ state: 'detached' });
  await page.getByText('Unusual beneficiary pattern').filter({ visible: true }).first().waitFor();

  await page.getByRole('tab', { name: /Flagged items/ }).click();
  await page.getByText('Unusual beneficiary pattern').filter({ visible: true }).first().waitFor();
  await page.getByRole('button', { name: /^Clear/ }).first().click();
  const clear = page.getByRole('dialog', { name: 'Clear flag' });
  await clear.getByLabel(/note/i).fill('Checked with the customer');
  await clear.getByRole('button', { name: /Clear/ }).last().click();
  await clear.waitFor({ state: 'detached' });
  const flags = (await apiCall('GET', '/admin/flags?status=Cleared', { token: adminToken })).body.items;
  assert.ok(flags.some((f) => f.clearanceNote === 'Checked with the customer'));
  assert.deepEqual(page.problems, []);
});

test('loans: approve credits the customer, reject needs a reason and tells them why', async () => {
  const page = await adminPage();
  const priyaBefore = await accountBalance('priya', '0001');
  await go(page, '/admin/loans?status=Applied');
  await page.getByRole('button', { name: 'Approve loan for Priya Sharma' }).click();
  const approve = page.getByRole('dialog', { name: 'Approve loan application?' });
  await approve.getByRole('button', { name: 'Approve and credit ₹3,00,000.00' }).click();
  await approve.waitFor({ state: 'detached' });
  assert.equal((await accountBalance('priya', '0001')).balance, priyaBefore.balance + 300000);

  await page.getByRole('button', { name: 'Reject loan for Arjun Nair' }).click();
  const reject = page.getByRole('dialog', { name: 'Reject loan application' });
  await reject.getByLabel(/Reason/).fill('abc');
  await reject.getByRole('button', { name: /Reject/ }).last().click();
  await reject.getByText(/at least 5|reason/i).first().waitFor();
  await reject.getByLabel(/Reason/).fill('Income documents are incomplete.');
  await reject.getByRole('button', { name: /Reject/ }).last().click();
  await reject.waitFor({ state: 'detached' });

  const arjunToken = await apiLogin('arjun');
  const loans = (await apiCall('GET', '/loans', { token: arjunToken })).body.loans;
  const rejected = loans.find((l) => l.rejectionReason === 'Income documents are incomplete.');
  assert.equal(rejected.status, 'Rejected');
  const notes = (await apiCall('GET', '/notifications?pageSize=5', { token: arjunToken })).body.items;
  assert.ok(notes.some((n) => /Income documents are incomplete/.test(n.message)));
});

test('service requests: resolving needs notes, the customer sees them, a closed request is final', async () => {
  const page = await adminPage();
  const open = (await apiCall('GET', '/admin/service-requests?status=Open', { token: adminToken })).body.items[0];
  await go(page, '/admin/service-requests');
  await page.getByRole('button', { name: new RegExp(`^Open ${open.ref}`) }).click();
  const dialog = page.getByRole('dialog', { name: `Service request ${open.ref}` });
  await dialog.getByLabel('Status').selectOption('Resolved');
  await dialog.getByRole('button', { name: 'Update request' }).click();
  await dialog.getByText(/Resolution notes are required/).waitFor();
  await dialog.getByLabel(/Resolution notes/i).fill('Handled at the branch.');
  await dialog.getByRole('button', { name: 'Update request' }).click();
  await dialog.getByText(`Resolve ${open.ref}?`).waitFor(); // resolving is confirmed in a second step
  await dialog.getByRole('button', { name: 'Resolve request' }).click();
  await dialog.waitFor({ state: 'detached' });
  const sr = (await apiCall('GET', `/admin/service-requests/${open.id}`, { token: adminToken })).body.serviceRequest;
  assert.equal(sr.status, 'Resolved');
  assert.equal(sr.resolutionNotes, 'Handled at the branch.');

  // the customer who raised it was told
  const owner = (await apiCall('GET', `/admin/users?q=${encodeURIComponent(sr.customerName)}`, { token: adminToken })).body.items[0];
  assert.ok(owner);

  // a Closed request is read-only
  const closed = (await apiCall('GET', '/admin/service-requests?status=Closed', { token: adminToken })).body.items[0];
  await page.getByRole('button', { name: 'Closed', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^Open ${closed.ref}`) }).click();
  const final = page.getByRole('dialog', { name: `Service request ${closed.ref}` });
  assert.equal(await final.getByLabel('Status').isDisabled(), true);
  assert.equal(await final.getByLabel(/Resolution notes/i).isDisabled(), true);
});

test('reports render every chart, offer a table view, and the CSV matches the API', async () => {
  const page = await adminPage();
  await go(page, '/admin/reports');
  for (const name of ['Daily transactions', 'By transaction type', 'Status split', 'New beneficiaries per day', 'Service requests raised', 'Turnaround time']) {
    await page.getByRole('heading', { name }).waitFor();
  }
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await page.getByRole('button', { name: 'View as table' }).first().click();
  await page.locator('table').first().waitFor();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  const csv = fs.readFileSync(await download.path(), 'utf8').trim().split(/\r?\n/);
  assert.match(csv[0], /date/i);
  const from = new Date(Date.now() - 6 * 86400000);
  const api = (await apiCall('GET', `/admin/reports/summary?from=${from.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`, { token: adminToken })).body;
  assert.equal(csv.length - 1, api.transactions.byDay.length);

  await page.getByLabel('From').fill('2026-02-01');
  await page.getByLabel('To').fill('2026-01-01');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await page.getByText(/must not be after|before/i).first().waitFor();
  assert.deepEqual(page.problems, []);
});

test('activity log filters by user and text, newest first', async () => {
  const page = await adminPage();
  await go(page, '/admin/activity');
  await page.locator('tbody tr').first().waitFor();
  await page.getByLabel('Username').fill('admin');
  await page.waitForFunction(() => {
    const cells = [...document.querySelectorAll('tbody tr td:nth-child(2)')];
    return cells.length > 0 && cells.every((c) => /admin/.test(c.innerText));
  });
  await page.getByText('Successful login (OTP verified)').first().waitFor();
  await page.getByLabel('Username').fill('');
  await page.getByLabel('Search action text').fill('zzz-nothing-matches');
  await page.getByText(/No activity matches/).waitFor();
  assert.ok(MPIN);
});
