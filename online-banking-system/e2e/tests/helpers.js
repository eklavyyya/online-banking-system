const { chromium } = require('playwright');

const WEB = process.env.E2E_WEB;
const WEB_IDLE = process.env.E2E_WEB_IDLE;
const API = process.env.E2E_API;
const MPIN = { priya: '1234', arjun: '4321', kavya: '5678', meera: '2468', rohan: '1357' };

async function launch() {
  return chromium.launch();
}

/** A fresh browser context + page that records console errors and uncaught exceptions. */
async function newPage(browser, { width = 1280, height = 900, base = WEB } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const text = m.text();
      // the browser itself logs every 4xx/5xx response; tests that provoke an API error expect those lines
      if (/Failed to load resource/.test(text)) return;
      page.problems.push(`console.${m.type()}: ${text}`);
    }
  });
  page.base = base;
  return page;
}

/** Password step then OTP step, exactly as a user would. Returns once the app shell is showing. */
async function login(page, username, password) {
  const pw = password || (username === 'admin' ? 'Admin@123' : 'Customer@123');
  await page.goto(`${page.base}/login`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/otp');
  const otp = (await page.locator('span.font-mono.font-bold').innerText()).trim();
  await page.getByLabel('6-digit OTP').fill(otp);
  await page.getByRole('button', { name: /Verify/ }).click();
  await page.locator('main').waitFor();
}

async function logout(page) {
  await page.getByRole('button', { name: 'Log Out' }).click();
  await page.waitForURL('**/login');
}

async function go(page, path) {
  await page.goto(`${page.base}${path}`);
  await page.locator('main').waitFor();
}

// ---- direct API access, for arranging state and checking results independently of the UI
async function apiCall(method, url, { token, body } = {}) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
async function apiLogin(username) {
  const pw = username === 'admin' ? 'Admin@123' : 'Customer@123';
  const a = await apiCall('POST', '/auth/login', { body: { username, password: pw } });
  const b = await apiCall('POST', '/auth/verify-otp', { body: { username, otp: a.body.devOtp } });
  return b.body.token;
}
async function accountBalance(username, accountNumberEnding) {
  const token = await apiLogin(username);
  const { body } = await apiCall('GET', '/accounts', { token });
  const acc = body.accounts.find((a) => a.accountNumber.endsWith(accountNumberEnding));
  return { id: acc.id, balance: Number(acc.balance) };
}

/** Text of the MPIN dialog's summary rows as { label: value }. */
async function mpinSummary(page) {
  const dialog = page.getByRole('dialog');
  await dialog.locator('dl').waitFor();
  const rows = await dialog.locator('dl > div').evaluateAll((els) => els.map((e) => [e.querySelector('dt').innerText, e.querySelector('dd').innerText]));
  return Object.fromEntries(rows);
}
async function enterMpin(page, mpin) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('MPIN').fill(mpin);
  await dialog.locator('button[type=submit]').click();
}

module.exports = { WEB, WEB_IDLE, API, MPIN, launch, newPage, login, logout, go, apiCall, apiLogin, accountBalance, mpinSummary, enterMpin };
