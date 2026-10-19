import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createRoadguardServer, type Credential } from '../server/index.mjs';

const tokens = {
  reader: 'reader-0123456789-abcdefghijklmnopqrstuvwxyz',
  authority: 'authority-0123456789-abcdefghijklmnopqrstuvwxyz',
  source: 'source-0123456789-abcdefghijklmnopqrstuvwxyz',
  second: 'second-0123456789-abcdefghijklmnopqrstuvwxyz',
};
const credentials: Credential[] = [
  { token: tokens.reader, role: 'reader' }, { token: tokens.authority, role: 'authority' },
  { token: tokens.source, role: 'source', sourceId: 'camera-one', sourceType: 'dashcam' },
  { token: tokens.second, role: 'source', sourceId: 'camera-two', sourceType: 'cctv' },
];
const initial = 1_800_000_000_000;
const observation = (id: string, extra = {}) => ({ id, segmentId: 'main-east', direction: 1, offsetM: 200, confidence: .95, observedAt: initial, severity: 'high', clearView: true, finding: 'pothole', ...extra });
const vehicle = { id: 'driver', kind: 'car', speedKph: 40, route: [{ segmentId: 'main-east', direction: 1, lengthM: 1200 }], legIndex: 0, offsetM: 100 };
async function start(extra = {}) {
  const server = createRoadguardServer({ credentials, now: () => initial, ...extra });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (url: string, token?: string, body?: unknown, extraHeaders = {}) => {
    const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  return { server, base, call };
}

test('configuration fails closed and identity registration cannot be repurposed', () => {
  for (const bad of [[], [{ token: 'short', role: 'reader' }], [{ token: 'a'.repeat(40), role: 'reader' }], [credentials[0], credentials[0]], [{ ...credentials[0], sourceId: 'spoof' }], [credentials[2], { ...credentials[3], sourceId: 'camera-one' }]]) {
    assert.throws(() => createRoadguardServer({ credentials: bad as Credential[] }));
  }
  assert.throws(() => createRoadguardServer({ credentials, allowedOrigin: '*' }));
});

test('authentication, role boundaries, registered source identity and public readiness', async t => {
  const { server, call } = await start(); t.after(() => server.shutdown());
  assert.equal((await call('/healthz')).status, 200);
  const readiness = await call('/api/readiness');
  assert.equal(readiness.body.roadSafetyValidated, false);
  assert.equal(JSON.stringify(readiness.body).includes(tokens.source), false);
  assert.equal((await call('/api/hazards')).status, 401);
  assert.equal((await call('/api/hazards', 'invalid')).status, 401);
  assert.equal((await call(`/api/hazards?token=${tokens.reader}`)).status, 400);
  for (const token of Object.values(tokens)) assert.equal((await call('/api/hazards', token)).status, 200);
  assert.equal((await call('/api/observations', tokens.reader, observation('a'))).status, 403);
  assert.equal((await call('/api/alerts', tokens.source, vehicle)).status, 403);
  assert.equal((await call('/api/events', tokens.source)).status, 403);
  assert.equal((await call('/api/hazards/x/resolve', tokens.reader, {})).status, 403);
  assert.equal((await call('/api/observations', tokens.source, observation('a', { sourceId: 'camera-two' }))).status, 403);
  assert.equal((await call('/api/observations', tokens.source, observation('a', { sourceType: 'cctv' }))).status, 403);
  assert.equal((await call('/api/observations', tokens.source, observation('a'))).body.status, 'accepted');
  const hazards = (await call('/api/hazards', tokens.reader)).body.hazards;
  assert.equal(hazards[0].observations[0].sourceId, 'camera-one');
});

test('strict input, exact CORS, malformed/oversized bodies and security headers', async t => {
  const { server, base, call } = await start({ allowedOrigin: 'https://pilot.example' }); t.after(() => server.shutdown());
  for (const origin of ['null', 'https://evil.example', 'https://pilot.example.evil']) assert.equal((await call('/api/observations', tokens.source, observation('x'), { Origin: origin })).status, 403);
  const accepted = await call('/api/observations', tokens.source, observation('x'), { Origin: 'https://pilot.example' });
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'https://pilot.example');
  assert.equal(accepted.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('/healthz', undefined, undefined, { Origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null);
  for (const patch of [{ surprise: 1 }, { segmentId: 'fake' }, { offsetM: 1201 }, { direction: 0 }, { confidence: 1.1 }, { observedAt: 8.64e15 + 1 }, { lighting: 'bright' }, { finding: 'other' }]) assert.equal((await call('/api/observations', tokens.source, observation('bad', patch))).status, 400);
  assert.equal((await call('/api/alerts', tokens.reader, { ...vehicle, route: [{ segmentId: 'main-east', direction: 1, lengthM: 9999 }] })).status, 400);
  assert.equal((await call('/api/alerts', tokens.reader, { ...vehicle, offsetM: 1201 })).status, 400);
  const malformed = await fetch(base + '/api/observations', { method: 'POST', headers: { Authorization: `Bearer ${tokens.source}`, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error, 'Malformed JSON');
  assert.equal((await call('/api/observations', tokens.source, { ...observation('large'), unknown: 'x'.repeat(65536) })).status, 413);
  const chunked = await new Promise<number>((resolve, reject) => {
    const request = http.request(base + '/api/observations', { method: 'POST', headers: { Authorization: `Bearer ${tokens.source}`, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode!)); });
    request.on('error', reject);
    request.write('x'.repeat(40_000)); request.end('x'.repeat(40_000));
  });
  assert.equal(chunked, 413);
});

test('durable replay receipts include rejected/ignored evidence and source-scoped IDs', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'roadguard-api-'));
  const databasePath = path.join(directory, 'state.sqlite');
  let app = await start({ databasePath });
  t.after(async () => { if (app.server.listening) await app.server.shutdown(); await rm(directory, { recursive: true, force: true }); });
  const low = observation('low', { confidence: .2 });
  assert.equal((await app.call('/api/observations', tokens.source, low)).status, 422);
  const ignored = observation('ignored', { finding: 'clear' });
  assert.equal((await app.call('/api/observations', tokens.source, ignored)).body.status, 'ignored');
  assert.equal((await app.call('/api/observations', tokens.source, observation('shared'))).body.status, 'accepted');
  assert.equal((await app.call('/api/observations', tokens.second, observation('shared'))).body.status, 'accepted');
  const before = (await app.call('/api/hazards', tokens.reader)).body;
  assert.equal(before.hazards.length, 1); assert.equal(before.hazards[0].status, 'verified');
  await app.server.shutdown();
  app = await start({ databasePath });
  const replay = await app.call('/api/observations', tokens.source, low);
  assert.equal(replay.status, 422); assert.equal(replay.body.replayed, true);
  assert.equal((await app.call('/api/observations', tokens.source, ignored)).body.replayed, true);
  assert.equal((await app.call('/api/observations', tokens.source, observation('low', { confidence: .9 }))).status, 409);
  assert.equal((await app.call('/api/observations', tokens.source, observation('shared'))).body.replayed, true);
  assert.deepEqual((await app.call('/api/hazards', tokens.reader)).body, before);
  const events = (await app.call('/api/events?after=0', tokens.reader)).body;
  assert.equal(events.events.filter((event: { type: string }) => event.type === 'observation.receipt').length, 4);
  assert.equal(events.cursor, before.cursor);
  assert.deepEqual((await app.call(`/api/events?after=${events.cursor}`, tokens.reader)).body.events, []);
  for (const after of ['-1', '1.2', 'wat', '999999999999999999999999', String(events.cursor + 1), '0&after=1']) assert.equal((await app.call(`/api/events?after=${after}`, tokens.reader)).status, 400);
});

test('API alerts, authority resolution and independent post-request clear evidence', async t => {
  let time = initial;
  const { server, call } = await start({ now: () => time }); t.after(() => server.shutdown());
  await call('/api/observations', tokens.source, observation('a'));
  await call('/api/observations', tokens.second, observation('b'));
  const id = (await call('/api/hazards', tokens.reader)).body.hazards[0].id;
  assert.equal((await call('/api/alerts', tokens.reader, vehicle)).body.alerts.length, 1);
  assert.equal((await call('/api/alerts', tokens.reader, { ...vehicle, route: [{ segmentId: 'parallel-east', direction: 1, lengthM: 1200 }] })).body.alerts.length, 0);
  assert.equal((await call(`/api/hazards/${encodeURIComponent(id)}/resolve`, tokens.authority, {})).body.hazard.status, 'repair_pending');
  assert.equal((await call(`/api/hazards/${encodeURIComponent(id)}/resolve`, tokens.authority, {})).status, 409);
  time += 1000;
  await call('/api/observations', tokens.source, observation('clear-one', { finding: 'clear', observedAt: time }));
  assert.equal((await call('/api/alerts', tokens.reader, vehicle)).body.alerts.length, 1);
  await call('/api/observations', tokens.second, observation('clear-two', { finding: 'clear', observedAt: time }));
  assert.equal((await call('/api/hazards', tokens.reader)).body.hazards[0].status, 'repaired');
  assert.equal((await call('/api/alerts', tokens.reader, vehicle)).body.alerts.length, 0);
});

test('a storage failure rolls back hazard, audit, replay registry and in-memory state together', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'roadguard-atomic-'));
  const databasePath = path.join(directory, 'state.sqlite');
  const { server, call } = await start({ databasePath });
  const inspection = new DatabaseSync(databasePath);
  t.after(async () => { inspection.close(); await server.shutdown(); await rm(directory, { recursive: true, force: true }); });
  inspection.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON replays BEGIN SELECT RAISE(ABORT, 'private database error'); END;");
  const failed = await call('/api/observations', tokens.source, observation('atomic'));
  assert.equal(failed.status, 500); assert.deepEqual(failed.body, { error: 'Internal server error' });
  assert.deepEqual((await call('/api/hazards', tokens.reader)).body, { hazards: [], cursor: 0 });
  assert.equal(inspection.prepare('SELECT COUNT(*) AS count FROM hazards').get()!.count, 0);
  assert.equal(inspection.prepare('SELECT COUNT(*) AS count FROM replays').get()!.count, 0);
  assert.equal(inspection.prepare('SELECT COUNT(*) AS count FROM events').get()!.count, 0);
  inspection.exec('DROP TRIGGER fail_receipt');
  assert.equal((await call('/api/observations', tokens.source, observation('atomic'))).body.status, 'accepted');
});

test('API-only defaults reject browser mutations without a configured origin', async t => {
  const { server, base, call } = await start(); t.after(() => server.shutdown());
  for (const origin of ['null', 'https://pilot.example']) assert.equal((await call('/api/observations', tokens.source, observation('origin'), { Origin: origin })).status, 403);
  const staticResponse = await fetch(base + '/');
  assert.equal(staticResponse.status, 404);
  assert.equal((await call('/api/observations', tokens.source, observation('nonbrowser'))).status, 200);
});

test('bounded event paging never drops incremental updates', async t => {
  const { server, call } = await start(); t.after(() => server.shutdown());
  for (let i = 0; i < 105; i++) assert.equal((await call('/api/observations', tokens.source, observation(`ignored-${i}`, { finding: 'clear' }))).body.status, 'ignored');
  const first = (await call('/api/events?after=0', tokens.reader)).body;
  assert.equal(first.events.length, 100); assert.equal(first.hasMore, true);
  const second = (await call(`/api/events?after=${first.cursor}`, tokens.reader)).body;
  assert.equal(second.events.length, 5); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.events, ...second.events].map(event => event.id)).size, 105);
});

test('static MIME, SPA fallback, traversal and symlink escape protections', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'roadguard-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'dist'); await mkdir(root);
  await writeFile(path.join(root, 'index.html'), '<h1>Pilot</h1>');
  await writeFile(path.join(root, 'app.js'), 'export {};');
  await writeFile(path.join(directory, 'secret.txt'), 'secret');
  let hasSymlink = true;
  try { await symlink(path.join(directory, 'secret.txt'), path.join(root, 'escape.txt')); } catch { hasSymlink = false; }
  const { server, base } = await start({ staticDir: root }); t.after(() => server.shutdown());
  const js = await fetch(base + '/app.js'); assert.match(js.headers.get('content-type')!, /javascript/);
  assert.equal((await fetch(base + '/app/route', { headers: { Accept: 'text/html' } })).status, 200);
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  if (hasSymlink) assert.equal((await fetch(base + '/escape.txt')).status, 404);
  for (const target of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/%00']) {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.get(base, { path: target }, response => {
        let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, body }));
      }); request.on('error', reject);
    });
    assert.ok(result.status >= 400); assert.equal(result.body.includes('secret'), false);
  }
});

test('hazard type isolation and lighting survive the API', async t => {
  const { server, call } = await start(); t.after(() => server.shutdown());
  for (const hazardType of ['pothole', 'animal_on_road', 'animal_incident']) {
    for (const [index, token] of [tokens.source, tokens.second].entries()) {
      const result = await call('/api/observations', token, observation(`${hazardType}-${index}`, { hazardType, lighting: 'night' }));
      assert.equal(result.status, 200);
    }
  }
  const hazards = (await call('/api/hazards', tokens.reader)).body.hazards;
  assert.equal(hazards.length, 3);
  assert.deepEqual(new Set(hazards.map((hazard: { hazardType: string }) => hazard.hazardType)), new Set(['pothole', 'animal_on_road', 'animal_incident']));
  for (const hazard of hazards) { assert.equal(hazard.status, 'verified'); assert.equal(hazard.lighting, 'night'); }
  const alerts = await call('/api/alerts', tokens.reader, { ...vehicle, lighting: 'night' });
  assert.equal(alerts.status, 200); assert.equal(alerts.body.alerts.length, 3);
  const stale = observation('stale-animal', { hazardType: 'animal_on_road', observedAt: initial - 30_001 });
  const rejected = await call('/api/observations', tokens.source, stale);
  assert.equal(rejected.status, 422); assert.equal(rejected.body.status, 'rejected');
  assert.equal((await call('/api/observations', tokens.source, stale)).body.replayed, true);
});
