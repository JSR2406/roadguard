import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCommerceServer } from '../server/index.mjs';

async function start(options = {}) {
  const server = createCommerceServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { server, baseUrl, async close() {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeDatabase();
  } };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function tempDir(prefix = 'commerce-deployment-') { return mkdtemp(join(tmpdir(), prefix)); }

test('healthz returns JSON and security headers', async () => {
  const app = await start();
  try {
    const { response, body } = await request(app.baseUrl, '/healthz');
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  } finally { await app.close(); }
});

test('same-origin static GET and HEAD serve built assets, while API unknowns stay JSON', async () => {
  const dir = await tempDir();
  const staticDir = join(dir, 'dist');
  await mkdir(staticDir);
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>ok</title>');
  await writeFile(join(staticDir, 'asset.css'), 'body { color: red }');
  const app = await start({ staticDirectory: staticDir });
  try {
    const page = await request(app.baseUrl, '/');
    assert.equal(page.response.status, 200);
    assert.match(page.response.headers.get('content-type'), /^text\/html/);
    assert.equal(page.body, '<!doctype html><title>ok</title>');
    const head = await request(app.baseUrl, '/asset.css', { method: 'HEAD' });
    assert.equal(head.response.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.response.headers.get('content-length'), '19');
    const unknown = await request(app.baseUrl, '/api/no-such-route');
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(unknown.body.error.code, 'not_found');
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('static traversal, encoded separators, and symlinks are rejected', async () => {
  const dir = await tempDir();
  const staticDir = join(dir, 'dist');
  await mkdir(staticDir);
  await writeFile(join(dir, 'secret.txt'), 'secret');
  await writeFile(join(staticDir, 'index.html'), 'ok');
  await symlink(join(dir, 'secret.txt'), join(staticDir, 'secret.txt'));
  const app = await start({ staticDirectory: staticDir });
  try {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/secret.txt', '/%2fetc%2fpasswd']) {
      const { response } = await request(app.baseUrl, path);
      assert.ok([400, 404].includes(response.status), `${path} returned ${response.status}`);
    }
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('production requires persistent storage and exact origin, and disables registration by default', async () => {
  assert.throws(() => createCommerceServer({ production: true, allowedOrigin: 'https://shop.example.test' }), /persistent/);
  const dir = await tempDir();
  const app = await start({ databasePath: join(dir, 'data', 'commerce.sqlite'), production: true, allowedOrigin: 'https://shop.example.test' });
  try {
    const missing = await request(app.baseUrl, '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missing.response.status, 403);
    assert.equal(missing.body.error.code, 'origin_forbidden');
    const wrong = await request(app.baseUrl, '/api/auth/register', { method: 'POST', headers: { origin: 'https://evil.example.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(wrong.response.status, 403);
    const disabled = await request(app.baseUrl, '/api/auth/register', { method: 'POST', headers: { origin: 'https://shop.example.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(disabled.response.status, 403);
    assert.equal(disabled.body.error.code, 'registration_disabled');
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('browser-origin mutations require strict JSON content type', async () => {
  const app = await start({ allowedOrigin: 'http://127.0.0.1' });
  try {
    const { response, body } = await request(app.baseUrl, '/api/auth/login', { method: 'POST', headers: { origin: 'http://127.0.0.1', 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(response.status, 415);
    assert.equal(body.error.code, 'unsupported_media_type');
  } finally { await app.close(); }
});

test('login and registration attempts are bounded per socket IP', async () => {
  const app = await start({ authRateLimit: { maxAttempts: 2, windowMs: 60_000 } });
  try {
    const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'unknown@example.com', password: 'not-a-real-password' }) };
    assert.equal((await fetch(`${app.baseUrl}/api/auth/login`, options)).status, 401);
    assert.equal((await fetch(`${app.baseUrl}/api/auth/login`, options)).status, 401);
    const limited = await fetch(`${app.baseUrl}/api/auth/register`, { ...options, headers: { ...options.headers, 'x-forwarded-for': '203.0.113.99' }, body: JSON.stringify({ email: 'new@example.com', password: 'correct horse battery staple', workspaceName: 'New' }) });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  } finally { await app.close(); }
});
