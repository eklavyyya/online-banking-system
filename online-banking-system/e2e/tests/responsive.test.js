const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPage, login, go, accountBalance } = require('./helpers');

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const CUSTOMER_PAGES = ['/', '/beneficiaries', '/transfer', '/bills', '/deposits', '/loans', '/cards', '/service-requests', '/notifications', '/profile'];
const ADMIN_PAGES = ['/admin', '/admin/users', '/admin/transactions', '/admin/loans', '/admin/service-requests', '/admin/reports', '/admin/activity'];

// Runs in the page: every visible control needs an accessible name; reports offenders.
function unnamedControls() {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length) || el.title || (el.innerText || '').trim() || el.getAttribute('placeholder') || '');
  const bad = [];
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((el) => {
    if (visible(el) && !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length))) bad.push(`${el.tagName.toLowerCase()}[${el.type}]`);
  });
  document.querySelectorAll('button,[role=button],a[href]').forEach((el) => {
    if (visible(el) && !nameOf(el)) bad.push(`${el.tagName.toLowerCase()} without a name`);
  });
  return bad;
}

async function sweep(page, paths, label) {
  for (const path of paths) {
    await go(page, path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const { overflow, width } = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, width: window.innerWidth }));
    assert.ok(overflow <= 1, `${label} ${path}: page scrolls sideways by ${overflow}px at ${width}px wide`);
    const bad = await page.evaluate(unnamedControls);
    assert.deepEqual(bad, [], `${label} ${path}: controls without an accessible name`);
  }
}

test('customer pages: no sideways scroll, every control named, no console problems (desktop and phone)', async () => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const page = await newPage(browser, { width: w, height: h });
    await login(page, 'priya');
    const { id } = await accountBalance('priya', '0001');
    await sweep(page, [...CUSTOMER_PAGES, `/accounts/${id}`], `customer ${w}px`);
    assert.deepEqual(page.problems, [], `customer ${w}px`);
  }
});

test('admin pages: no sideways scroll, every control named, no console problems (desktop and phone)', async () => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const page = await newPage(browser, { width: w, height: h });
    await login(page, 'admin');
    await sweep(page, ADMIN_PAGES, `admin ${w}px`);
    assert.deepEqual(page.problems, [], `admin ${w}px`);
  }
});

test('on a phone the sidebar is a slide-over menu that closes after navigating', async () => {
  const page = await newPage(browser, { width: 390, height: 844 });
  await login(page, 'priya');
  assert.equal(await page.getByRole('dialog', { name: 'Menu' }).count(), 0, 'menu is hidden until opened');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await menu.getByRole('link', { name: 'Cards', exact: true }).click();
  await page.getByRole('heading', { name: 'Cards', exact: true }).waitFor();
  await menu.waitFor({ state: 'detached' });
});

test('unknown routes show the 404 page', async () => {
  const page = await newPage(browser);
  await login(page, 'priya');
  await page.goto(`${page.base}/no-such-page`);
  await page.getByText("This page doesn't exist.").waitFor();
});
