import { constants, closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

export class DeploymentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => { throw new DeploymentError(status, code, message); };
const isWithin = (root, target) => {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

export function validateOrigin(origin) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error();
  } catch {
    throw new TypeError('allowedOrigin must be an exact HTTP(S) origin without a path, credentials, or trailing slash');
  }
  return origin;
}

// Configuration is explicit for embedded/test servers. Only the CLI reads env.
export function deploymentOptionsFromEnv(env, defaultDatabasePath) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('PORT must be an integer from 1 to 65535');
  if (env.COMMERCE_ALLOW_REGISTRATION !== undefined && !['true', 'false'].includes(env.COMMERCE_ALLOW_REGISTRATION)) {
    throw new TypeError('COMMERCE_ALLOW_REGISTRATION must be true or false');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    production,
    databasePath: env.COMMERCE_DATABASE_PATH ?? (production ? ':memory:' : defaultDatabasePath),
    allowedOrigin: env.COMMERCE_ALLOWED_ORIGIN ?? null,
    registrationEnabled: env.COMMERCE_ALLOW_REGISTRATION === undefined ? !production : env.COMMERCE_ALLOW_REGISTRATION === 'true',
  };
}

export function prepareDatabasePath(databasePath, { production, staticRoot }) {
  if (typeof databasePath !== 'string' || !databasePath.trim()) throw new TypeError('databasePath must be a non-empty string');
  if (databasePath === ':memory:') {
    if (production) throw new TypeError('Production requires a persistent COMMERCE_DATABASE_PATH');
    return databasePath;
  }
  if (databasePath.startsWith('file:') || databasePath.includes('\0')) throw new TypeError('databasePath must be a filesystem path');
  const path = resolve(databasePath);
  // Reject symlinked ancestors rather than creating directories through them.
  const parent = dirname(path);
  let current = parse(parent).root;
  for (const component of relative(current, parent).split(sep).filter(Boolean)) {
    current = join(current, component);
    try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TypeError('Database parent must contain only real directories');
  }
  if (staticRoot && isWithin(staticRoot, join(realpathSync(parent), parse(path).base))) {
    throw new TypeError('Database must be outside the static directory');
  }
  // SQLite sidecars must not be existing links or special files either.
  for (const candidate of [path, `${path}-journal`, `${path}-wal`, `${path}-shm`]) {
    try {
      const stat = lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new TypeError('Database files must be regular files, not symlinks');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!existsSync(path)) closeSync(openSync(path, 'wx', 0o600));
  return path;
}

export function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

// Validate the raw request target before URL normalizes dot segments away.
export function requestUrl(request) {
  const target = request.url ?? '/';
  const rawPath = target.split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { reject(400, 'invalid_path', 'Invalid request path.'); }
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || /%2f|%5c/i.test(rawPath)
    || /[\\%:#\x00-\x20\x7f]/.test(decoded) || decoded.split('/').some((part) => part.startsWith('.'))) {
    reject(400, 'invalid_path', 'Invalid request path.');
  }
  return new URL(target, 'http://localhost');
}

export function enforceMutationPolicy(request, { production, allowedOrigin }) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.origin;
  // Local non-browser clients remain compatible. Production clients must also
  // send the configured Origin; no proxy or forwarded headers are trusted.
  if (origin === undefined && !production) return;
  let expected = allowedOrigin;
  if (!expected) {
    const scheme = request.socket.encrypted ? 'https' : 'http';
    expected = `${scheme}://${request.headers.host}`;
  }
  if (typeof origin !== 'string' || origin !== expected || origin === 'null') {
    reject(403, 'origin_forbidden', 'Request origin is not allowed.');
  }
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
    reject(415, 'unsupported_media_type', 'Browser mutations require application/json.');
  }
}

// One shared login/register budget per socket IP, with bounded retained state.
// When full, new IPs fail closed until a window expires; no eviction bypass.
export function createAuthRateLimiter({ maxAttempts = 20, windowMs = 60_000, maxEntries = 10_000, now = Date.now } = {}) {
  for (const value of [maxAttempts, windowMs, maxEntries]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('Rate limit settings must be positive integers');
  }
  if (typeof now !== 'function') throw new TypeError('Rate limiter clock must be a function');
  const entries = new Map();
  return (ip) => {
    const time = now();
    for (const [key, entry] of entries) if (entry.resetAt <= time) entries.delete(key);
    let entry = entries.get(ip);
    if (!entry) {
      if (entries.size >= maxEntries) return Math.max(1, Math.ceil(windowMs / 1000));
      entry = { attempts: 0, resetAt: time + windowMs };
      entries.set(ip, entry);
    }
    if (entry.attempts >= maxAttempts) return Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
    entry.attempts += 1;
    return 0;
  };
}

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'], ['.webmanifest', 'application/manifest+json'],
]);

export function staticDirectoryRoot(directory) {
  if (directory === null) return null;
  if (typeof directory !== 'string' || !directory.trim()) throw new TypeError('staticDirectory must be a directory path or null');
  const root = realpathSync(resolve(directory));
  if (!lstatSync(root).isDirectory()) throw new TypeError('staticDirectory must be a directory');
  return root;
}

async function openStaticFile(root, pathname) {
  const path = resolve(root, `.${pathname}`);
  if (!isWithin(root, path)) reject(400, 'invalid_path', 'Invalid request path.');
  let current = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) reject(404, 'not_found', 'Route not found.');
  }
  if (!isWithin(root, await realpath(path))) reject(404, 'not_found', 'Route not found.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      await handle.close();
      return null;
    }
    return { handle, size: stat.size };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function serveStatic(request, response, url, root) {
  if (!root || !['GET', 'HEAD'].includes(request.method) || /^\/api(?:\/|$)/i.test(url.pathname)) return false;
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  let file;
  try { file = await openStaticFile(root, pathname); } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }
  // SPA fallback only for HTML navigations, never missing assets/API routes.
  if (!file && !extname(pathname) && request.headers.accept?.includes('text/html')) {
    pathname = '/index.html';
    try { file = await openStaticFile(root, pathname); } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  if (!file) return false;
  try {
    const contentType = MIME_TYPES.get(extname(pathname).toLowerCase());
    if (!contentType) return false;
    response.writeHead(200, { 'content-type': contentType, 'content-length': file.size, 'cache-control': 'no-cache' });
    if (request.method === 'HEAD') response.end();
    else {
      // Stream instead of buffering an unbounded build asset in memory.
      const stream = file.handle.createReadStream({ autoClose: false });
      await new Promise((resolveStream, rejectStream) => {
        const cleanup = () => {
          response.off('close', onClose);
          response.off('finish', onFinish);
          stream.off('error', onError);
        };
        const onClose = () => { cleanup(); stream.destroy(); resolveStream(); };
        const onFinish = () => { cleanup(); resolveStream(); };
        const onError = (error) => { cleanup(); rejectStream(error); };
        response.once('close', onClose);
        response.once('finish', onFinish);
        stream.once('error', onError);
        stream.pipe(response);
      });
    }
    return true;
  } finally { await file.handle.close(); }
}
