// Shared test harness. Each test file runs in its own process (node --test),
// so each gets its own throw-away SQLite database, seeded from seed/seed.js.
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.CBS_SIMULATED_FAILURE_RATE = '0';
process.env.DB_DIALECT = 'sqlite';
const dbFile = path.join(os.tmpdir(), `obs-test-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_STORAGE = dbFile;

const models = require('../src/models');
const { seed } = require('../seed/seed');

let server;
let base;
const tokens = {};

async function setup() {
  const seeded = await seed({ quiet: true });
  const app = require('../src/app');
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  return seeded;
}

async function teardown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await models.sequelize.close();
  for (const f of [dbFile, `${dbFile}-journal`]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
}

async function api(method, url, { token, body, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

// Full two-step login; tokens are cached per username unless fresh is set.
async function login(username, password = username === 'admin' ? 'Admin@123' : 'Customer@123', { fresh = false } = {}) {
  if (!fresh && tokens[username]) return tokens[username];
  const step1 = await api('POST', '/auth/login', { body: { username, password } });
  if (step1.status !== 200) throw new Error(`login failed for ${username}: ${step1.status} ${JSON.stringify(step1.body)}`);
  const step2 = await api('POST', '/auth/verify-otp', { body: { username, otp: step1.body.devOtp } });
  if (step2.status !== 200) throw new Error(`otp failed for ${username}: ${JSON.stringify(step2.body)}`);
  tokens[username] = step2.body.token;
  return step2.body.token;
}

const MPIN = { priya: '1234', arjun: '4321', kavya: '5678', meera: '2468', rohan: '1357' };

module.exports = { models, setup, teardown, api, login, MPIN };
