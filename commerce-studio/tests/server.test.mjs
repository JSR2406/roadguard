import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createCommerceServer } from '../server/index.mjs';

async function startServer(options = {}) {
  const server = createCommerceServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeDatabase();
    },
  };
}

async function request(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

async function tempDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'commerce-studio-server-'));
  return { directory, databasePath: join(directory, 'commerce.sqlite') };
}

const registration = (overrides = {}) => ({
  email: 'owner@example.com',
  password: 'correct horse battery staple',
  workspaceName: 'Acme Commerce',
  ...overrides,
});

const completeProfile = (overrides = {}) => ({
  workspaceName: 'Acme Commerce',
  businessDisplayName: 'Acme Storefront',
  legalName: 'Acme Commerce LLC',
  address: '100 Market Street',
  email: 'billing@example.com',
  phone: '+1 555 555 0100',
  currency: 'USD',
  locale: 'en-US',
  taxPreference: 'prices_exclude_tax',
  ...overrides,
});

test('boots migrations and creates foundation and commerce tables', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const db = new DatabaseSync(databasePath);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((row) => row.name);
    assert.deepEqual(tables, [
      'audit_events',
      'business_profiles',
      'products',
      'quote_lines',
      'quotes',
      'schema_migrations',
      'sessions',
      'users',
      'workspace_members',
      'workspaces',
    ]);
    assert.deepEqual(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version), ['001_foundation.sql', '002_commerce.sql']);
    db.close();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('register, login, me, profile update, logout, and unauthorized access', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const unauthenticated = await request(app.baseUrl, '/api/me');
    assert.equal(unauthenticated.status, 401);

    const registered = await request(app.baseUrl, '/api/auth/register', { method: 'POST', body: registration() });
    assert.equal(registered.status, 201);
    assert.match(registered.body.sessionToken, /^[A-Za-z0-9_-]{40,}$/);
    assert.equal(registered.body.user.email, 'owner@example.com');
    assert.equal(registered.body.workspace.name, 'Acme Commerce');
    assert.equal(registered.body.profile.address, '');

    const me = await request(app.baseUrl, '/api/me', { token: registered.body.sessionToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, registered.body.user.id);
    assert.equal(me.body.workspace.id, registered.body.workspace.id);

    const profile = await request(app.baseUrl, '/api/workspace/profile', { token: registered.body.sessionToken });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.workspaceId, registered.body.workspace.id);

    const updated = await request(app.baseUrl, '/api/workspace/profile', {
      method: 'PUT',
      token: registered.body.sessionToken,
      body: completeProfile(),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.businessDisplayName, 'Acme Storefront');
    assert.equal(updated.body.workspaceName, 'Acme Commerce');

    const login = await request(app.baseUrl, '/api/auth/login', { method: 'POST', body: registration() });
    assert.equal(login.status, 200);
    assert.notEqual(login.body.sessionToken, registered.body.sessionToken);

    const logout = await request(app.baseUrl, '/api/auth/logout', { method: 'POST', token: login.body.sessionToken });
    assert.deepEqual(logout, { status: 200, body: { ok: true } });
    const afterLogout = await request(app.baseUrl, '/api/me', { token: login.body.sessionToken });
    assert.equal(afterLogout.status, 401);
    const originalStillWorks = await request(app.baseUrl, '/api/me', { token: registered.body.sessionToken });
    assert.equal(originalStillWorks.status, 200);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('workspace identifiers cannot cross tenant boundaries', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const first = await request(app.baseUrl, '/api/auth/register', { method: 'POST', body: registration() });
    const second = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: registration({ email: 'other@example.com', workspaceName: 'Other Commerce' }),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const readOther = await request(app.baseUrl, `/api/workspace/profile?workspaceId=${second.body.workspace.id}`, { token: first.body.sessionToken });
    assert.equal(readOther.status, 403);
    assert.equal(readOther.body.error.code, 'workspace_scope_violation');

    const updateOther = await request(app.baseUrl, '/api/workspace/profile', {
      method: 'PUT',
      token: first.body.sessionToken,
      body: completeProfile({ workspaceId: second.body.workspace.id, workspaceName: 'Hijacked' }),
    });
    assert.equal(updateOther.status, 403);

    const otherProfile = await request(app.baseUrl, '/api/workspace/profile', { token: second.body.sessionToken });
    assert.equal(otherProfile.status, 200);
    assert.equal(otherProfile.body.workspaceName, 'Other Commerce');
    assert.equal(otherProfile.body.businessDisplayName, 'Other Commerce');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('sessions and profiles persist after a server restart', async () => {
  const { directory, databasePath } = await tempDatabase();
  const firstApp = await startServer({ databasePath });
  let token;
  try {
    const registered = await request(firstApp.baseUrl, '/api/auth/register', { method: 'POST', body: registration() });
    token = registered.body.sessionToken;
    const updated = await request(firstApp.baseUrl, '/api/workspace/profile', {
      method: 'PUT',
      token,
      body: completeProfile({ businessDisplayName: 'Persisted Store' }),
    });
    assert.equal(updated.status, 200);
  } finally {
    await firstApp.close();
  }

  const secondApp = await startServer({ databasePath });
  try {
    const me = await request(secondApp.baseUrl, '/api/me', { token });
    assert.equal(me.status, 200);
    const profile = await request(secondApp.baseUrl, '/api/workspace/profile', { token });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.businessDisplayName, 'Persisted Store');
  } finally {
    await secondApp.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('audit events are append-only records without passwords or session tokens', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  const password = 'secret password that must not be stored';
  try {
    const registered = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: registration({ password }),
    });
    const updated = await request(app.baseUrl, '/api/workspace/profile', {
      method: 'PUT',
      token: registered.body.sessionToken,
      body: completeProfile(),
    });
    assert.equal(updated.status, 200);
    const logout = await request(app.baseUrl, '/api/auth/logout', { method: 'POST', token: registered.body.sessionToken });
    assert.equal(logout.status, 200);

    const db = new DatabaseSync(databasePath);
    const storedUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(registered.body.user.id);
    const storedSession = db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').get(registered.body.user.id);
    assert.match(storedUser.password_hash, /^scrypt\$/);
    assert.notEqual(storedUser.password_hash, password);
    assert.match(storedSession.token_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(storedSession.token_hash, registered.body.sessionToken);

    const events = db.prepare('SELECT action, metadata_json FROM audit_events ORDER BY created_at, rowid').all();
    const serialized = JSON.stringify(events);
    assert.deepEqual(events.map((event) => event.action), [
      'auth.registered',
      'auth.logged_in',
      'workspace.profile_updated',
      'auth.logged_out',
    ]);
    assert.doesNotMatch(serialized, new RegExp(password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, new RegExp(registered.body.sessionToken));
    assert.ok(events.every((event) => JSON.parse(event.metadata_json) && typeof JSON.parse(event.metadata_json) === 'object'));
    db.close();
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('validation returns safe JSON errors', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const invalid = await request(app.baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { email: 'bad', password: 'short', workspaceName: '' },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'invalid_input');
    assert.equal(typeof invalid.body.error.message, 'string');
    assert.equal(invalid.body.error.stack, undefined);

    const malformed = await fetch(`${app.baseUrl}/api/auth/login`, { method: 'POST', body: '{' });
    const malformedBody = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedBody.error.code, 'invalid_json');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
