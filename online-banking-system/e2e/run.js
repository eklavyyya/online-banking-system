// End-to-end test runner.
//
// For every test file it: seeds a fresh throw-away SQLite database, starts the
// API on a private port, runs the file with `node --test`, and stops the API.
// Two copies of the Vite dev server serve the UI: the normal one, and one with a
// 6-second inactivity limit used only by tests/idle.test.js.
//
//   cd e2e && npm install && npx playwright install chromium && npm test
//   npm test -- admin          # only files whose name contains "admin"
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const API_PORT = Number(process.env.E2E_API_PORT || 4310);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5310);
const WEB_IDLE_PORT = Number(process.env.E2E_WEB_IDLE_PORT || 5311);
const DB = path.join(os.tmpdir(), `obs-e2e-${process.pid}.sqlite`);
const filter = process.argv[2];

const children = [];
function start(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => { if (process.env.E2E_VERBOSE) process.stderr.write(d); });
  children.push(child);
  return child;
}
function stop(child) {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}
async function waitFor(url, label, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const res = await fetch(url); if (res.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} did not start at ${url}`);
}

const apiEnv = { ...process.env, PORT: String(API_PORT), DB_STORAGE: DB, DB_DIALECT: 'sqlite', CBS_SIMULATED_FAILURE_RATE: '0', NODE_ENV: 'development', JWT_SECRET: 'e2e-secret' };
function startApi() { return start('node', ['src/server.js'], { cwd: path.join(ROOT, 'backend'), env: apiEnv }); }

async function main() {
  const viteBin = path.join(ROOT, 'frontend', 'node_modules', '.bin', 'vite');
  const webEnv = { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}/api` };
  start(viteBin, ['--port', String(WEB_PORT), '--strictPort'], { cwd: path.join(ROOT, 'frontend'), env: webEnv });
  start(viteBin, ['--port', String(WEB_IDLE_PORT), '--strictPort'], { cwd: path.join(ROOT, 'frontend'), env: { ...webEnv, VITE_IDLE_SECONDS: '6', VITE_IDLE_WARN_SECONDS: '3' } });
  await waitFor(`http://localhost:${WEB_PORT}/`, 'web UI');
  await waitFor(`http://localhost:${WEB_IDLE_PORT}/`, 'web UI (short idle limit)');

  const files = fs.readdirSync(path.join(__dirname, 'tests')).filter((f) => f.endsWith('.test.js') && (!filter || f.includes(filter))).sort();
  let failed = 0;
  for (const file of files) {
    console.log(`\n=== ${file}`);
    const seed = spawnSync('node', ['seed/seed.js'], { cwd: path.join(ROOT, 'backend'), env: apiEnv, encoding: 'utf8' });
    if (seed.status !== 0) { console.error(seed.stdout, seed.stderr); throw new Error('seeding failed'); }
    const api = startApi();
    await waitFor(`http://localhost:${API_PORT}/api/health`, 'API');
    const run = spawnSync('node', ['--test', '--test-reporter=spec', path.join(__dirname, 'tests', file)], {
      stdio: 'inherit',
      env: { ...process.env, E2E_WEB: `http://localhost:${WEB_PORT}`, E2E_WEB_IDLE: `http://localhost:${WEB_IDLE_PORT}`, E2E_API: `http://localhost:${API_PORT}/api` },
    });
    if (run.status !== 0) failed += 1;
    stop(api);
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(failed ? `\n${failed} test file(s) failed.` : '\nAll end-to-end test files passed.');
  return failed;
}

main()
  .then((failed) => { children.forEach(stop); try { fs.unlinkSync(DB); } catch { /* ignore */ } process.exit(failed ? 1 : 0); })
  .catch((err) => { console.error(err); children.forEach(stop); process.exit(1); });
