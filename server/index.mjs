import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as engine from '../src/engine.ts';
import { convertEnvelope } from './camera-contract.mjs';

const SEGMENTS = Object.freeze({ 'main-east': 1200, 'parallel-east': 1200, 'branch-north': 800 });
const MAX_BODY = 64 * 1024;
const EVENT_PAGE = 100;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireThat(condition, message = 'Invalid request') {
  if (!condition) throw new ApiError(400, message);
}
function shape(value, fields, required = fields) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value));
  requireThat(Object.keys(value).every(key => fields.includes(key)), 'Unknown field');
  requireThat(required.every(key => Object.hasOwn(value, key)), 'Missing field');
}
function text(value) { return typeof value === 'string' && value.length > 0 && value.length <= 160 && value.isWellFormed() && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value); }
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function observation(body, credential) {
  shape(body, ['id', 'sourceId', 'sourceType', 'segmentId', 'direction', 'offsetM', 'confidence', 'observedAt', 'severity', 'clearView', 'finding', 'hazardType', 'lighting'],
    ['id', 'segmentId', 'direction', 'offsetM', 'confidence', 'observedAt', 'severity', 'clearView', 'finding']);
  if ((body.sourceId !== undefined && body.sourceId !== credential.sourceId) || (body.sourceType !== undefined && body.sourceType !== credential.sourceType)) throw new ApiError(403, 'Source identity mismatch');
  requireThat(text(body.id));
  requireThat(Object.hasOwn(SEGMENTS, body.segmentId) && finite(body.offsetM, 0, SEGMENTS[body.segmentId]), 'Invalid road location');
  requireThat(body.direction === 1 || body.direction === -1);
  requireThat(finite(body.confidence, 0, 1) && finite(body.observedAt, 0, 8.64e15));
  requireThat(['low', 'medium', 'high', 'critical'].includes(body.severity) && typeof body.clearView === 'boolean');
  requireThat(['pothole', 'clear'].includes(body.finding));
  if (body.hazardType !== undefined) requireThat(['pothole', 'animal_on_road', 'animal_incident'].includes(body.hazardType));
  if (body.lighting !== undefined) requireThat(['day', 'night', 'unknown'].includes(body.lighting));
  return { ...body, sourceId: credential.sourceId, sourceType: credential.sourceType };
}
function vehicle(body) {
  shape(body, ['id', 'kind', 'speedKph', 'route', 'legIndex', 'offsetM', 'lighting'], ['id', 'kind', 'speedKph', 'route', 'legIndex', 'offsetM']);
  if (body.lighting !== undefined) requireThat(['day', 'night', 'unknown'].includes(body.lighting));
  requireThat(text(body.id) && ['car', 'two-wheeler'].includes(body.kind) && finite(body.speedKph, 0, 200));
  requireThat(Array.isArray(body.route) && body.route.length > 0 && body.route.length <= 100);
  for (const leg of body.route) {
    shape(leg, ['segmentId', 'direction', 'lengthM']);
    requireThat(Object.hasOwn(SEGMENTS, leg.segmentId) && leg.lengthM === SEGMENTS[leg.segmentId], 'Invalid route segment length');
    requireThat(leg.direction === 1 || leg.direction === -1);
  }
  requireThat(Number.isInteger(body.legIndex) && finite(body.legIndex, 0, body.route.length - 1));
  requireThat(finite(body.offsetM, 0, body.route[body.legIndex].lengthM));
  return body;
}
async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiError(415, 'JSON content type required');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new ApiError(415, 'Content encoding unsupported');
  if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); throw new ApiError(413, 'Request body too large'); }
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) { req.resume(); throw new ApiError(413, 'Request body too large'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'Malformed JSON'); }
}
async function ndjsonBody(req) {
  if (!/^application\/x-ndjson(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ApiError(415, 'NDJSON content type required');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new ApiError(415, 'Content encoding unsupported');
  if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); throw new ApiError(413, 'Request body too large'); }
  let size = 0; const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) { req.resume(); throw new ApiError(413, 'Request body too large'); }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length > 128) throw new ApiError(413, 'Too many NDJSON records');
  try { return lines.map(line => JSON.parse(line)); } catch { throw new ApiError(400, 'Malformed NDJSON'); }
}

/** Single-process, single-node pilot. Returns an unbound node:http Server; call listen(0) in tests. */
export function createRoadguardServer(options = {}) {
  const { databasePath = ':memory:', credentials, allowedOrigin, staticDir, cameraMatcher, pilotRegion = 'Pune/Pimpri-Chinchwad', pilotCorridor = 'UNSELECTED' } = options;
  const now = options.now ?? Date.now;
  if (!Array.isArray(credentials) || !credentials.length) throw new Error('Credentials are required');
  const tokenSet = new Set(), identities = new Set();
  const registered = credentials.map(item => {
    if (!item || Object.keys(item).some(key => !['token', 'role', 'sourceId', 'sourceType'].includes(key)) || typeof item.token !== 'string' || item.token.length < 32 || item.token.length > 512 || /\s/.test(item.token) || new Set(item.token).size < 8 || !['reader', 'authority', 'source'].includes(item.role)) throw new Error('Invalid credential configuration');
    const hash = createHash('sha256').update(item.token).digest();
    const key = hash.toString('hex');
    if (tokenSet.has(key)) throw new Error('Duplicate credential');
    tokenSet.add(key);
    if (item.role === 'source') {
      if (!text(item.sourceId) || !['dashcam', 'cctv'].includes(item.sourceType) || identities.has(item.sourceId)) throw new Error('Invalid source registration');
      identities.add(item.sourceId);
    } else if (item.sourceId !== undefined || item.sourceType !== undefined) throw new Error('Source identity requires source role');
    return { hash, role: item.role, sourceId: item.sourceId, sourceType: item.sourceType };
  });
  if (allowedOrigin !== undefined) {
    const url = new URL(allowedOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== allowedOrigin) throw new Error('Invalid allowed origin');
  }
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS hazards (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS replays (source_id TEXT NOT NULL, observation_id TEXT NOT NULL, payload TEXT NOT NULL, receipt TEXT NOT NULL, status INTEGER NOT NULL, PRIMARY KEY(source_id, observation_id)); CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL);');
  let hazards;
  // Fail closed on malformed persisted state instead of serving a corrupt snapshot.
  try {
    hazards = db.prepare('SELECT payload FROM hazards ORDER BY id').all().map(row => JSON.parse(row.payload));
    const ids = new Set();
    for (const hazard of hazards) {
      requireThat(Object.hasOwn(SEGMENTS, hazard.segmentId) && finite(hazard.offsetM, 0, SEGMENTS[hazard.segmentId]));
      requireThat(!ids.has(hazard.id)); ids.add(hazard.id);
      engine.priorityScore(hazard, now());
    }
  } catch { db.close(); throw new Error('Invalid stored hazard state'); }
  const upsert = db.prepare('INSERT INTO hazards VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
  const eventInsert = db.prepare('INSERT INTO events(payload) VALUES (?)');
  const replayGet = db.prepare('SELECT payload,receipt,status FROM replays WHERE source_id=? AND observation_id=?');
  const replayInsert = db.prepare('INSERT INTO replays VALUES (?, ?, ?, ?, ?)');
  const eventsGet = db.prepare('SELECT id,payload FROM events WHERE id > ? ORDER BY id LIMIT ?');
  const cursorGet = db.prepare('SELECT COALESCE(MAX(id), 0) AS cursor FROM events');
  const cursor = () => Number(cursorGet.get().cursor);
  const limits = new Map();
  const metrics = { requests: 0, errors: 0, rejectedObservations: 0, acceptedObservations: 0, cameraRecords: 0, cameraAccepted: 0, cameraRejected: 0 };
  function rate(key) {
    const time = Date.now();
    for (const [entry, bucket] of limits) if (time - bucket.start >= 60_000) limits.delete(entry);
    let bucket = limits.get(key);
    if (!bucket) {
      if (limits.size >= 4096) throw new ApiError(429, 'Rate limit capacity reached');
      bucket = { start: time, count: 0 }; limits.set(key, bucket);
    }
    if (++bucket.count > 240) throw new ApiError(429, 'Rate limit exceeded');
  }
  function authenticate(req, roles) {
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new ApiError(401, 'Bearer authentication required');
    const hash = createHash('sha256').update(match[1]).digest();
    let credential;
    for (const item of registered) if (timingSafeEqual(hash, item.hash)) credential = item;
    if (!credential) throw new ApiError(401, 'Invalid credentials');
    rate(`token:${hash.toString('hex')}`);
    if (!roles.includes(credential.role)) throw new ApiError(403, 'Role not permitted');
    return credential;
  }
  function commit(next, audit, replay) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const hazard of next) {
        const old = hazards.find(item => item.id === hazard.id);
        if (canonical(old) !== canonical(hazard)) {
          upsert.run(hazard.id, JSON.stringify(hazard));
          eventInsert.run(JSON.stringify({ type: 'hazard.updated', at: now(), hazard }));
        }
      }
      eventInsert.run(JSON.stringify(audit));
      if (replay) replayInsert.run(...replay);
      db.exec('COMMIT');
      hazards = next;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const rootPromise = staticDir ? realpath(staticDir) : null;
  // Avoid an unhandled rejection before the first static request.
  rootPromise?.catch(() => {});
  async function serveStatic(req, res, pathname) {
    if (!rootPromise || !['GET', 'HEAD'].includes(req.method)) throw new ApiError(404, 'Not found');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { throw new ApiError(400, 'Invalid path'); }
    requireThat(!decoded.includes('\0') && !decoded.includes('\\') && !decoded.split('/').includes('..'), 'Invalid path');
    const root = await rootPromise;
    let target = path.resolve(root, `.${decoded}`);
    if (target !== root && !target.startsWith(root + path.sep)) throw new ApiError(404, 'Not found');
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      target = await realpath(target);
    } catch {
      if (path.extname(decoded) || !String(req.headers.accept ?? '').includes('text/html')) throw new ApiError(404, 'Not found');
      target = await realpath(path.join(root, 'index.html'));
    }
    if (!target.startsWith(root + path.sep)) throw new ApiError(404, 'Not found');
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream', 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  }
  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, async (req, res) => {
    metrics.requests++;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    function send(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
    try {
      rate(`ip:${req.socket.remoteAddress}`);
      const url = new URL(req.url, 'http://roadguard.invalid');
      if ([...url.searchParams.keys()].some(key => key !== 'after') || (url.search && url.pathname !== '/api/events')) throw new ApiError(400, 'Unsupported query parameter');
      const origin = req.headers.origin;
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (origin && origin === allowedOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if ((mutation || req.method === 'OPTIONS') && origin !== undefined && (!allowedOrigin || origin !== allowedOrigin)) throw new ApiError(403, 'Origin not permitted');
      if (req.method === 'OPTIONS') {
        if (!origin || origin !== allowedOrigin) throw new ApiError(403, 'Origin not permitted');
        const headers = (req.headers['access-control-request-headers'] ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        requireThat(headers.every(value => ['authorization', 'content-type'].includes(value)));
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.writeHead(204); res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/healthz') return send(200, { status: 'ok' });
      if (req.method === 'GET' && url.pathname === '/api/readiness') return send(200, {
        status: 'pilot', roadSafetyValidated: false, warning: 'NOT road-safety validated',
        deployment: 'single-node', storage: databasePath === ':memory:' ? 'ephemeral-sqlite' : 'persistent-sqlite',
        authenticationRequired: true, registeredSources: identities.size, corsConfigured: Boolean(allowedOrigin), staticServing: Boolean(staticDir),
        pilotRegion, pilotCorridor, locationModel: cameraMatcher ? 'injected route matcher' : 'fixed road segments, not real GPS', cameraIngestion: Boolean(cameraMatcher), segments: SEGMENTS,
      });
      if (req.method === 'GET' && url.pathname === '/api/metrics') {
        authenticate(req, ['reader', 'authority']);
        return send(200, { ...metrics, activeHazards: hazards.filter(item => item.status !== 'repaired').length, eventCursor: cursor(), registeredSources: identities.size, roadSafetyValidated: false });
      }
      if (req.method === 'GET' && url.pathname === '/api/hazards') {
        authenticate(req, ['reader', 'authority', 'source']);
        return send(200, { hazards, cursor: cursor() });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        authenticate(req, ['reader', 'authority']);
        const values = url.searchParams.getAll('after');
        requireThat(values.length <= 1 && /^(0|[1-9]\d*)$/.test(values[0] ?? '0'), 'Invalid cursor');
        const after = Number(values[0] ?? 0);
        requireThat(Number.isSafeInteger(after) && after <= cursor(), 'Invalid cursor');
        const rows = eventsGet.all(after, EVENT_PAGE + 1);
        const events = rows.slice(0, EVENT_PAGE).map(row => ({ ...JSON.parse(row.payload), id: Number(row.id) }));
        return send(200, { events, cursor: events.at(-1)?.id ?? after, hasMore: rows.length > EVENT_PAGE });
      }
      if (req.method === 'POST' && url.pathname === '/api/observations') {
        const credential = authenticate(req, ['source']);
        const input = observation(await jsonBody(req), credential);
        const payload = canonical(input);
        const prior = replayGet.get(credential.sourceId, input.id);
        if (prior) {
          if (prior.payload !== payload) throw new ApiError(409, 'Observation ID payload conflict');
          return send(prior.status, { ...JSON.parse(prior.receipt), replayed: true });
        }
        const time = now();
        const evidenceWindow = !input.hazardType || input.hazardType === 'pothole' ? 900_000 : 30_000;
        const qualified = input.confidence >= 0.7 && input.clearView && time - input.observedAt <= evidenceWindow && input.observedAt - time <= 5000;
        const bound = { ...input, id: `source:${encodeURIComponent(input.sourceId)}:${encodeURIComponent(input.id)}` };
        let next = hazards;
        if (qualified) {
          try { next = engine.ingestObservation(hazards, bound, time); }
          catch (error) { if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, 'Observation unsupported by engine'); throw error; }
        }
        const changed = canonical(next) !== canonical(hazards);
         const receipt = { observationId: input.id, status: !qualified ? 'rejected' : changed ? 'accepted' : 'ignored', reason: !qualified ? 'Evidence quality or timestamp outside policy' : changed ? 'Evidence incorporated' : 'No applicable state change', replayed: false };
         if (receipt.status === 'accepted') metrics.acceptedObservations++; else if (receipt.status === 'rejected') metrics.rejectedObservations++;
        const status = qualified ? 200 : 422;
        commit(next, { type: 'observation.receipt', at: time, sourceId: input.sourceId, receipt }, [input.sourceId, input.id, payload, JSON.stringify(receipt), status]);
         return send(status, receipt);
      }
      if (req.method === 'POST' && url.pathname === '/integration/camera/observations') {
        const credential = authenticate(req, ['source']);
        if (!cameraMatcher) throw new ApiError(503, 'Camera route matcher is not configured');
        const records = await ndjsonBody(req);
        const seen = new Set(); const receipts = [];
        for (const record of records) {
          metrics.cameraRecords++;
          const checked = convertEnvelope(record, { matcher: cameraMatcher, seenFrameIds: seen, now: now() });
          if (!checked.ok) { metrics.cameraRejected++; receipts.push(checked); continue; }
          if (checked.observation.sourceId !== credential.sourceId || checked.observation.sourceType !== credential.sourceType) { metrics.cameraRejected++; receipts.push({ ok: false, reason: 'source-identity-mismatch' }); continue; }
          const input = checked.observation;
          if (!Object.hasOwn(SEGMENTS, input.segmentId) || input.offsetM > SEGMENTS[input.segmentId]) { metrics.cameraRejected++; receipts.push({ ok: false, frameId: input.id, reason: 'unsupported-road-segment' }); continue; }
          const bound = { ...input, id: `source:${encodeURIComponent(input.sourceId)}:${encodeURIComponent(input.id)}` };
          if (hazards.some(hazard => hazard.observations.some(item => item.id === bound.id))) { receipts.push({ ok: true, frameId: input.id, status: 'replayed' }); continue; }
          let next;
          try { next = engine.ingestObservation(hazards, bound, now()); } catch { metrics.cameraRejected++; receipts.push({ ok: false, frameId: input.id, reason: 'observation-rejected' }); continue; }
          const changed = canonical(next) !== canonical(hazards);
          commit(next, { type: 'camera.observation', at: now(), sourceId: input.sourceId, frameId: input.id, status: changed ? 'accepted' : 'ignored' });
          metrics.cameraAccepted++;
          receipts.push({ ok: true, frameId: input.id, status: changed ? 'accepted' : 'ignored' });
        }
        return send(200, { receipts, count: receipts.length });
      }
      if (req.method === 'POST' && url.pathname === '/api/alerts') {
        authenticate(req, ['reader', 'authority']);
        const input = vehicle(await jsonBody(req));
        return send(200, { alerts: engine.getAlerts(hazards, input, now()) });
      }
      const resolution = /^\/api\/hazards\/([^/]+)\/resolve$/.exec(url.pathname);
      if (req.method === 'POST' && resolution) {
        authenticate(req, ['authority']);
        shape(await jsonBody(req), []);
        let id;
        try { id = decodeURIComponent(resolution[1]); } catch { throw new ApiError(400, 'Invalid hazard ID'); }
        if (!hazards.some(item => item.id === id)) throw new ApiError(404, 'Hazard not found');
        const next = (engine.requestResolution ?? engine.requestRepair)(hazards, id, now());
        if (canonical(next) === canonical(hazards)) throw new ApiError(409, 'Hazard is not eligible for resolution');
        commit(next, { type: 'resolution.requested', at: now(), hazardId: id });
        return send(200, { hazard: hazards.find(item => item.id === id) });
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) throw new ApiError(404, 'Not found');
      // Check raw path before URL normalization can erase traversal components.
      const rawPath = req.url.split('?')[0];
      await serveStatic(req, res, rawPath);
    } catch (error) {
      metrics.errors++;
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      if (status === 429) res.setHeader('Retry-After', '60');
      send(status, { error: error instanceof ApiError ? error.message : 'Internal server error' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  server.timeout = 20_000;
  server.maxRequestsPerSocket = 1000;
  let closed = false;
  server.on('close', () => { if (!closed) { closed = true; db.close(); limits.clear(); } });
  server.shutdown = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => server.closeAllConnections(), 5000); timer.unref();
    server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
    server.closeIdleConnections();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.env.ROADGUARD_AUTH_FILE) throw new Error('Auth configuration required');
    const config = JSON.parse(readFileSync(process.env.ROADGUARD_AUTH_FILE, 'utf8'));
    if (!config || Object.keys(config).some(key => key !== 'credentials')) throw new Error('Invalid auth configuration');
    const databasePath = process.env.ROADGUARD_DB_PATH ?? '/data/roadguard.sqlite';
    if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
    const port = Number(process.env.PORT ?? 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    let cameraMatcher;
    if (process.env.ROADGUARD_MATCHER_MODULE) {
      const modulePath = path.resolve(process.env.ROADGUARD_MATCHER_MODULE);
      const loaded = await import(pathToFileURL(modulePath).href);
      cameraMatcher = loaded.default ?? loaded.matcher ?? (typeof loaded.createMatcher === 'function' ? await loaded.createMatcher() : undefined);
      if (!cameraMatcher || typeof cameraMatcher.resolve !== 'function') throw new Error('Matcher module must export matcher or createMatcher() with resolve()');
    }
    const server = createRoadguardServer({ databasePath, credentials: config.credentials, allowedOrigin: process.env.ROADGUARD_ALLOWED_ORIGIN, staticDir: process.env.ROADGUARD_STATIC_DIR ?? fileURLToPath(new URL('../dist', import.meta.url)), cameraMatcher, pilotRegion: process.env.ROADGUARD_REGION ?? 'Pune/Pimpri-Chinchwad', pilotCorridor: process.env.ROADGUARD_CORRIDOR ?? 'UNSELECTED' });
    server.on('error', () => { console.error('Roadguard server failed'); process.exitCode = 1; });
    server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.info('Roadguard pilot server listening'));
    let stopping = false;
    const stop = () => { if (stopping) return; stopping = true; server.shutdown().catch(() => { process.exitCode = 1; }); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  } catch { console.error('Roadguard startup failed: check server configuration'); process.exitCode = 1; }
}
