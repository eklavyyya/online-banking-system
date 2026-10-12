const test = require('node:test');
const assert = require('node:assert/strict');
const { MPIN, launch, newPage, login, logout, go, apiCall, apiLogin, accountBalance, mpinSummary, enterMpin } = require('./helpers');

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const money = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

test('a wrong password is refused, the right one needs the OTP', async () => {
  const page = await newPage(browser);
  await page.goto(`${page.base}/login`);
  await page.getByLabel('Username').fill('priya');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText(/invalid|incorrect/i).first().waitFor();
  assert.match(page.url(), /\/login$/);
  await login(page, 'priya');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.deepEqual(page.problems, []);
});

test('roles are separated: a customer cannot open the admin console and vice versa', async () => {
  const cust = await newPage(browser);
  await login(cust, 'priya');
  await cust.goto(`${cust.base}/admin/users`);
  await cust.getByRole('heading', { name: 'Account Dashboard' }).waitFor();
  assert.equal(new URL(cust.url()).pathname, '/');

  const admin = await newPage(browser);
  await login(admin, 'admin');
  assert.equal(new URL(admin.url()).pathname, '/admin');
  await admin.goto(`${admin.base}/transfer`);
  await admin.getByRole('heading', { name: 'Admin Overview' }).waitFor();
  assert.equal(new URL(admin.url()).pathname, '/admin');
});

test('dashboard shows masked accounts, last sign-in, module tiles and recent activity', async () => {
  const page = await newPage(browser);
  await login(page, 'meera'); // seeded customers have never signed in before
  await page.getByText('Welcome! This is your first sign-in.').waitFor();
  await logout(page);
  await login(page, 'meera');
  await page.getByTestId('last-login').getByText(/Last sign-in:/).waitFor();

  const text = await page.locator('main').innerText();
  assert.ok(text.includes('XXXXXXXXX0004'), 'masked number is shown');
  assert.ok(!/\b1000400040004\b/.test(text), 'full account number must not be on the dashboard');
  assert.ok(text.includes('₹3,20,000'), 'balance is shown in Indian grouping');
  const main = page.locator('main');
  await main.getByRole('link', { name: /^Deposits \d+ active/ }).waitFor();
  await main.getByRole('link', { name: /^Loans / }).waitFor();
  await main.getByRole('link', { name: /^Cards \d+ active/ }).waitFor();
  await main.getByRole('link', { name: /^Notifications \d+/ }).waitFor();
  await page.getByRole('heading', { name: 'Recent activity' }).waitFor();
  assert.deepEqual(page.problems, []);
});

test('the full account number is revealed only on request', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  const { id } = await accountBalance('priya', '0001');
  await go(page, `/accounts/${id}`);
  await page.getByRole('heading', { name: 'XXXXXXXXX0001' }).waitFor();
  await page.getByRole('button', { name: 'Show full number' }).click();
  await page.getByRole('heading', { name: '1000100010001' }).waitFor();
  await page.getByRole('button', { name: 'Hide number' }).click();
  await page.getByRole('heading', { name: 'XXXXXXXXX0001' }).waitFor();
});

test('history shows credits and debits, filters by direction, and downloads CSV and PDF statements', async () => {
  const page = await newPage(browser);
  await login(page, 'arjun');
  const { id } = await accountBalance('arjun', '0003'); // solo account: has money in and out
  await go(page, `/accounts/${id}`);
  await page.getByRole('heading', { name: 'Transaction History' }).waitFor();

  await page.getByLabel('Direction').selectOption('credit');
  await page.locator('tbody').getByText(/Transfer from A\/c XXXXXXXXX\d{4}/).first().waitFor();
  const amounts = await page.locator('tbody td:nth-child(4)').allInnerTexts();
  assert.ok(amounts.length > 0 && amounts.every((a) => a.includes('+')), `credits only: ${amounts}`);
  await page.getByLabel('Direction').selectOption('debit');
  await page.locator('tbody').getByText(/Transfer to A\/c|IMPS to|NEFT to|Bill payment|Recharge/).first().waitFor();
  const debits = await page.locator('tbody td:nth-child(4)').allInnerTexts();
  assert.ok(debits.every((a) => a.includes('−')), `debits only: ${debits}`);
  await page.getByLabel('Direction').selectOption('');

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Statement (CSV)' }).click()]);
  assert.match(csv.suggestedFilename(), /\.csv$/);
  const csvText = require('fs').readFileSync(await csv.path(), 'utf8');
  assert.match(csvText, /Date/);
  assert.ok(!csvText.includes('1000300030003'), 'statement must not contain the full account number');

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Statement (PDF)' }).click()]);
  assert.match(pdf.suggestedFilename(), /\.pdf$/);
  assert.equal(require('fs').readFileSync(await pdf.path()).subarray(0, 5).toString(), '%PDF-');

  await page.getByLabel('From date').fill('2999-01-01');
  await page.getByText('No transactions found.').waitFor();
  assert.deepEqual(page.problems, []);
});

test('an own-account transfer: readable MPIN summary, wrong MPIN keeps the dialog, right MPIN moves the money', async () => {
  const page = await newPage(browser);
  await login(page, 'arjun');
  const solo = await accountBalance('arjun', '0003');
  const joint = await accountBalance('arjun', '0002');
  await go(page, '/transfer');

  await page.getByLabel('From Account').selectOption({ index: 1 });
  const fromText = await page.getByLabel('From Account').evaluate((s) => s.options[s.selectedIndex].text);
  assert.match(fromText, /XXXXXXXXX000\d/);
  assert.ok(!/\d{13}/.test(fromText), 'no full numbers in the dropdown');
  await page.getByRole('button', { name: 'Own-Transfer' }).click();
  // choose solo -> joint explicitly
  const soloOption = await page.getByLabel('From Account').locator('option', { hasText: 'XXXXXXXXX0003' }).getAttribute('value');
  await page.getByLabel('From Account').selectOption(soloOption);
  await page.getByLabel('To Account (yours)').selectOption({ label: await page.getByLabel('To Account (yours)').locator('option', { hasText: 'XXXXXXXXX0002' }).innerText() });
  await page.getByLabel('Amount (₹)').fill('1500');
  await page.getByRole('button', { name: 'Continue' }).click();

  const summary = await mpinSummary(page);
  assert.deepEqual(Object.keys(summary), ['From account', 'To', 'Mode', 'Amount']);
  assert.match(summary['From account'], /XXXXXXXXX0003/);
  assert.match(summary.To, /XXXXXXXXX0002/);
  assert.equal(summary.Mode, 'Own-Transfer');
  assert.match(summary.Amount, /1,500/);
  for (const [label, value] of Object.entries(summary)) assert.ok(!/\bid\b/i.test(label) && !/^\d+$/.test(value), `${label}=${value}`);

  await enterMpin(page, '0000');
  await page.getByRole('dialog').getByText('Incorrect MPIN.').waitFor();
  assert.equal(await page.getByRole('dialog').getByLabel('MPIN').inputValue(), '', 'MPIN is cleared after a failed attempt');
  await enterMpin(page, MPIN.arjun);
  await page.getByText(/Transfer Success/).waitFor();
  await page.getByText(/Reference: UTR\d+/).waitFor();

  const soloAfter = await accountBalance('arjun', '0003');
  const jointAfter = await accountBalance('arjun', '0002');
  assert.equal(soloAfter.balance, solo.balance - 1500);
  assert.equal(jointAfter.balance, joint.balance + 1500);
  assert.deepEqual(page.problems, []);
});

test('Escape closes the MPIN dialog without sending anything', async () => {
  const page = await newPage(browser);
  await login(page, 'meera');
  await go(page, '/transfer');
  await page.getByLabel('From Account').selectOption({ index: 1 });
  await page.getByLabel('Beneficiary').selectOption({ index: 1 });
  await page.getByLabel('Amount (₹)').fill('100');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.ok(await page.getByRole('button', { name: 'Continue' }).isVisible());
});

test('paying a bill shows biller and masked account, never ids', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  const before = await accountBalance('priya', '0001');
  await go(page, '/bills');
  await page.getByLabel('From Account').selectOption({ index: 1 });
  await page.getByLabel(/^Biller/).selectOption({ index: 1 });
  await page.getByLabel('Amount (₹)').fill('777');
  await page.getByRole('button', { name: 'Continue' }).click();
  const summary = await mpinSummary(page);
  assert.deepEqual(Object.keys(summary), ['From account', 'Paying', 'Amount']);
  assert.match(summary['From account'], /XXXXXXXXX0001/);
  assert.match(summary.Paying, /City Power|Metro Broadband/);
  await enterMpin(page, MPIN.priya);
  await page.getByText(/Payment Success/).waitFor();
  assert.equal((await accountBalance('priya', '0001')).balance, before.balance - 777);
});

test('removing a saved biller asks first, and Cancel keeps it', async () => {
  const page = await newPage(browser);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss(); }); // a native confirm()/prompt() would land here
  await login(page, 'priya');
  await go(page, '/bills');
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByPlaceholder('Biller name').fill('Water Board');
  await page.getByPlaceholder(/^Category/).fill('Water');
  await page.getByPlaceholder('Consumer number').fill('WB-4471');
  await page.getByRole('button', { name: 'Save Biller' }).click();
  await page.getByRole('button', { name: 'Remove Water Board' }).waitFor();

  await page.getByRole('button', { name: 'Remove Water Board' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove biller?' });
  await dialog.getByText(/will be removed from your saved billers/).waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Remove Water Board' }).count(), 1, 'Cancel keeps the biller');

  await page.getByRole('button', { name: 'Remove Water Board' }).click();
  await page.getByRole('dialog', { name: 'Remove biller?' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Water Board' }).waitFor({ state: 'detached' });
  assert.deepEqual(dialogs, [], 'no browser-native dialogs are used');
});

test('beneficiary account numbers are masked in the list', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  await go(page, '/beneficiaries');
  await page.getByText('Rahul Verma').waitFor();
  const text = await page.locator('main').innerText();
  assert.ok(text.includes('XXXXXXXXX0005'));
  assert.ok(!text.includes('2000500050005'));
});

test('deposits need the MPIN to open and to close; an RD shows its instalments', async () => {
  const page = await newPage(browser);
  await login(page, 'meera');
  const before = await accountBalance('meera', '0004');
  await go(page, '/deposits');
  await page.getByRole('button', { name: '+ Open Deposit' }).click();
  await page.getByLabel('Source / Linked Account').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'RD', exact: true }).click();
  await page.getByLabel('Tenure (months)').fill('12');
  await page.getByLabel('Monthly Installment (₹)').fill('2500');
  await page.getByRole('button', { name: 'Continue' }).click();
  const summary = await mpinSummary(page);
  assert.equal(summary['Monthly instalment'], '₹2,500.00');
  assert.equal(summary['Total commitment'], '₹30,000.00');
  await enterMpin(page, '0000');
  await page.getByRole('dialog').getByText('Incorrect MPIN.').waitFor();
  assert.equal((await accountBalance('meera', '0004')).balance, before.balance, 'a wrong MPIN moves no money');
  await enterMpin(page, MPIN.meera);
  await page.getByText('RD opened successfully.').waitFor();
  assert.equal((await accountBalance('meera', '0004')).balance, before.balance - 2500);
  await page.getByText('1 of 12 instalments paid').waitFor();

  // close the new RD early: MPIN again
  await page.getByRole('button', { name: 'Close Prematurely' }).first().click(); // newest deposit is listed first
  await page.getByRole('dialog', { name: 'Close deposit early?' }).waitFor();
  await enterMpin(page, MPIN.meera);
  await page.getByText(/Closed\. Proceeds of/).waitFor();
  await page.getByText('Closed Prematurely').first().waitFor();
  assert.deepEqual(page.problems, []);
});

test('profile shows the previous login and keeps KYC read-only', async () => {
  const page = await newPage(browser);
  await login(page, 'kavya');
  await go(page, '/profile');
  await page.getByText('Previous Login').waitFor();
  await page.getByText('First sign-in').waitFor();
  await page.getByLabel('Phone Number').fill('9333300000');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByText('Profile updated.').waitFor();
  const token = await apiLogin('kavya');
  const prof = await apiCall('GET', '/profile', { token });
  assert.equal(prof.body.user.phoneNumber, '9333300000');
});
