const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createGuardianServer } = require('../server');

async function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-guardian-'));
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>Guardian</title>');
  fs.writeFileSync(path.join(publicDir, 'styles.css'), 'body{}');
  const statusPath = path.join(root, 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify({
    schema_version: 1,
    service: 'Radclaw Node Guardian',
    generated_at: new Date().toISOString(),
    status: 'ok',
    network: 'bitcoin',
    version: 'v26.06.1',
    block_height: 910000,
    normal_channels: 1,
    receive_ready: true,
    secret: 'MUST-NOT-LEAK',
  }));
  const server = createGuardianServer({ publicDir, statusPath, rateLimit: options.rateLimit || 100 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { root, server, base, statusPath };
}

async function cleanup(ctx) {
  await new Promise(resolve => ctx.server.close(resolve));
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test('health route is minimal and hardened', async () => {
  const ctx = await fixture();
  try {
    const response = await fetch(`${ctx.base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { await cleanup(ctx); }
});

test('status route strips fields outside the public allowlist', async () => {
  const ctx = await fixture();
  try {
    const response = await fetch(`${ctx.base}/api/v1/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.secret, undefined);
    assert.deepEqual(Object.keys(body).sort(), [
      'block_height', 'generated_at', 'network', 'normal_channels', 'receive_ready',
      'schema_version', 'service', 'status', 'version',
    ]);
  } finally { await cleanup(ctx); }
});

test('stale status makes both status and health unavailable', async () => {
  const ctx = await fixture();
  try {
    const value = JSON.parse(fs.readFileSync(ctx.statusPath, 'utf8'));
    value.generated_at = '2000-01-01T00:00:00Z';
    fs.writeFileSync(ctx.statusPath, JSON.stringify(value));
    assert.equal((await fetch(`${ctx.base}/api/v1/status`)).status, 503);
    const health = await fetch(`${ctx.base}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { status: 'unavailable' });
  } finally { await cleanup(ctx); }
});

test('missing required status fields fail closed', async () => {
  const ctx = await fixture();
  try {
    fs.writeFileSync(ctx.statusPath, JSON.stringify({
      schema_version: 1,
      service: 'Radclaw Node Guardian',
      generated_at: new Date().toISOString(),
      status: 'ok',
    }));
    assert.equal((await fetch(`${ctx.base}/api/v1/status`)).status, 503);
  } finally { await cleanup(ctx); }
});

test('malformed timestamps fail closed instead of being coerced by Date.parse', async () => {
  const ctx = await fixture();
  try {
    const value = JSON.parse(fs.readFileSync(ctx.statusPath, 'utf8'));
    for (const generatedAt of [[new Date().toISOString()], new Date().toISOString().replace(/Z$/, ''), '2026-02-31T00:00:00Z']) {
      value.generated_at = generatedAt;
      fs.writeFileSync(ctx.statusPath, JSON.stringify(value));
      assert.equal((await fetch(`${ctx.base}/api/v1/status`)).status, 503);
      assert.equal((await fetch(`${ctx.base}/health`)).status, 503);
    }
  } finally { await cleanup(ctx); }
});

test('degraded status remains inspectable but health is unhealthy', async () => {
  const ctx = await fixture();
  try {
    const value = JSON.parse(fs.readFileSync(ctx.statusPath, 'utf8'));
    value.status = 'degraded';
    fs.writeFileSync(ctx.statusPath, JSON.stringify(value));
    assert.equal((await fetch(`${ctx.base}/api/v1/status`)).status, 200);
    const health = await fetch(`${ctx.base}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { status: 'degraded' });
  } finally { await cleanup(ctx); }
});

test('landing page and stylesheet use only fixed static routes', async () => {
  const ctx = await fixture();
  try {
    assert.equal((await fetch(`${ctx.base}/`)).status, 200);
    assert.equal((await fetch(`${ctx.base}/styles.css`)).status, 200);
    assert.equal((await fetch(`${ctx.base}/../server.js`)).status, 404);
    assert.equal((await fetch(`${ctx.base}/missing`)).status, 404);
  } finally { await cleanup(ctx); }
});

test('state-changing methods are rejected', async () => {
  const ctx = await fixture();
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${ctx.base}/api/v1/status`, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS');
    }
  } finally { await cleanup(ctx); }
});

test('CORS allows only the configured public site', async () => {
  const ctx = await fixture();
  try {
    const allowed = await fetch(`${ctx.base}/api/v1/status`, { headers: { Origin: 'https://radsclaw.github.io' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://radsclaw.github.io');
    const denied = await fetch(`${ctx.base}/api/v1/status`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally { await cleanup(ctx); }
});

test('rate limiting returns 429 without reflecting client input', async () => {
  const ctx = await fixture({ rateLimit: 2 });
  try {
    assert.equal((await fetch(`${ctx.base}/health`)).status, 200);
    assert.equal((await fetch(`${ctx.base}/health`)).status, 200);
    const limited = await fetch(`${ctx.base}/health`);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  } finally { await cleanup(ctx); }
});
