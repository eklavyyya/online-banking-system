// Runs against the UI build that has a 6-second inactivity limit (3-second warning).
const test = require('node:test');
const assert = require('node:assert/strict');
const { WEB_IDLE, launch, newPage, login } = require('./helpers');

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

test('inactivity: a warning appears, "Stay signed in" keeps the session, and silence signs the user out', async () => {
  const page = await newPage(browser, { base: WEB_IDLE });
  await login(page, 'priya');

  const warning = page.getByRole('alertdialog', { name: 'Session about to expire' });
  await warning.waitFor({ timeout: 8000 });
  await warning.getByText(/\ds$/).waitFor();
  await warning.getByRole('button', { name: 'Stay signed in' }).click();
  await warning.waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, '/');

  // a full idle period with no input at all ends the session and clears the stored token
  await page.waitForURL('**/login', { timeout: 15000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('obs_token')), null);
});

test('activity resets the clock', async () => {
  const page = await newPage(browser, { base: WEB_IDLE });
  await login(page, 'kavya');
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(1500);
    await page.mouse.move(100 + i * 10, 200 + i * 10);
  }
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'no warning while the user is active');
  assert.equal(new URL(page.url()).pathname, '/');
});
