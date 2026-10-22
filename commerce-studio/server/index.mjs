import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { calculateQuote, QuoteValidationError } from '../src/quotes.ts';
import { MoneyValidationError, parseMoney, rateToUnits } from '../src/money.ts';
import {
  DeploymentError, createAuthRateLimiter, deploymentOptionsFromEnv, enforceMutationPolicy,
  prepareDatabasePath, requestUrl, serveStatic, setSecurityHeaders, staticDirectoryRoot, validateOrigin,
} from './deployment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, 'migrations');
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORTED_CURRENCIES = new Set(['USD', 'CAD', 'EUR', 'GBP']);
const SUPPORTED_LOCALES = new Set(['en-US', 'en-CA', 'en-GB', 'fr-CA']);
const SUPPORTED_TAX_PREFERENCES = new Set(['prices_exclude_tax', 'prices_include_tax', 'tax_exempt']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s().-]{6,}$/;

class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function fail(status, code, message, fields) {
  throw new HttpError(status, code, message, fields);
}

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltEncoded, derivedEncoded] = parts;
  const nValue = Number(n);
  const rValue = Number(r);
  const pValue = Number(p);
  if (!Number.isSafeInteger(nValue) || !Number.isSafeInteger(rValue) || !Number.isSafeInteger(pValue)) return false;
  try {
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(derivedEncoded, 'base64url');
    const actual = scryptSync(password, salt, expected.length, { N: nValue, r: rValue, p: pValue, maxmem: 32 * 1024 * 1024 });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim()) fail(400, 'invalid_input', `${field} is required.`, { [field]: `${field} is required.` });
  const result = value.trim();
  if (result.length > maxLength) fail(400, 'invalid_input', `${field} is too long.`, { [field]: `${field} must be at most ${maxLength} characters.` });
  return result;
}

function optionalString(value, field, maxLength) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail(400, 'invalid_input', `${field} must be a string.`, { [field]: `${field} must be a string.` });
  const result = value.trim();
  if (result.length > maxLength) fail(400, 'invalid_input', `${field} is too long.`, { [field]: `${field} must be at most ${maxLength} characters.` });
  return result;
}

function normalizeEmail(value) {
  const email = requiredString(value, 'email', 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) fail(400, 'invalid_input', 'Enter a valid email address.', { email: 'Enter a valid email address.' });
  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    fail(400, 'invalid_input', 'Password must be between 8 and 128 characters.', { password: 'Password must be between 8 and 128 characters.' });
  }
  return value;
}

function readProfileInput(body, { partial = false } = {}) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const fields = {};
  const definitions = [
    ['workspaceName', 100],
    ['businessDisplayName', 160],
    ['legalName', 160],
    ['address', 300],
    ['email', 320],
    ['phone', 40],
  ];
  for (const [field, maxLength] of definitions) {
    if (partial && body[field] === undefined) continue;
    fields[field] = requiredString(body[field], field, maxLength);
  }
  if (fields.email !== undefined && !EMAIL_PATTERN.test(fields.email)) {
    fail(400, 'invalid_input', 'Enter a valid email address.', { email: 'Enter a valid email address.' });
  }
  if (fields.phone !== undefined && !PHONE_PATTERN.test(fields.phone)) {
    fail(400, 'invalid_input', 'Enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  }
  for (const [field, allowed, message] of [
    ['currency', SUPPORTED_CURRENCIES, 'Choose a supported currency.'],
    ['locale', SUPPORTED_LOCALES, 'Choose a supported locale.'],
    ['taxPreference', SUPPORTED_TAX_PREFERENCES, 'Choose a supported tax preference.'],
  ]) {
    if (partial && body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || !allowed.has(body[field])) {
      fail(400, 'invalid_input', message, { [field]: message });
    }
    fields[field] = body[field];
  }
  return fields;
}

function migrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function runMigrations(db) {
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`);
  for (const file of migrationFiles()) {
    if (db.prepare('SELECT 1 AS present FROM schema_migrations WHERE version = ?').get(file)) continue;
    const sql = readFileSync(join(migrationsDirectory, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(file, nowIso());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let total = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'payload_too_large', 'Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (total === 0) {
        resolveBody({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolveBody(parsed);
      } catch {
        reject(new HttpError(400, 'invalid_json', 'Request body must contain valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function safeUser(row) {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

function safeWorkspace(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at, role: row.role ?? 'owner' };
}

function safeProfile(row) {
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    businessDisplayName: row.business_display_name,
    legalName: row.legal_name,
    address: row.address,
    email: row.email,
    phone: row.phone,
    currency: row.currency,
    locale: row.locale,
    taxPreference: row.tax_preference,
    updatedAt: row.updated_at,
  };
}

function recordAudit(db, { workspaceId, actorUserId, action, metadata = {} }) {
  db.prepare(`INSERT INTO audit_events
    (id, workspace_id, actor_user_id, action, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(),
    workspaceId ?? null,
    actorUserId ?? null,
    action,
    JSON.stringify(metadata),
    nowIso(),
  );
}

function findOwnedWorkspace(db, userId, requestedWorkspaceId) {
  const row = db.prepare(`SELECT w.id, w.name, w.created_at, wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ? AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1`).get(userId);
  if (!row) fail(403, 'workspace_not_found', 'No owned workspace is available for this account.');
  if (requestedWorkspaceId !== undefined && requestedWorkspaceId !== row.id) {
    fail(403, 'workspace_scope_violation', 'The requested workspace is not available to this account.');
  }
  return row;
}

function requestedWorkspaceId(url, body) {
  const queryWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
  const bodyWorkspaceId = body && isPlainObject(body) && body.workspaceId !== undefined ? body.workspaceId : undefined;
  if (bodyWorkspaceId !== undefined && typeof bodyWorkspaceId !== 'string') {
    fail(400, 'invalid_input', 'workspaceId must be a string.');
  }
  if (queryWorkspaceId !== undefined && bodyWorkspaceId !== undefined && queryWorkspaceId !== bodyWorkspaceId) {
    fail(400, 'invalid_input', 'workspaceId values must match.');
  }
  return queryWorkspaceId ?? bodyWorkspaceId;
}

function getBearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !/^Bearer\s+\S+$/i.test(header)) {
    fail(401, 'unauthorized', 'A valid Bearer session is required.');
  }
  return header.replace(/^Bearer\s+/i, '').trim();
}

function authenticate(db, request) {
  const token = getBearerToken(request);
  const row = db.prepare(`SELECT s.id AS session_id, s.user_id, s.expires_at, u.email, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL`).get(hashToken(token));
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    fail(401, 'unauthorized', 'A valid Bearer session is required.');
  }
  return { token, session: row, user: { id: row.user_id, email: row.email, created_at: row.created_at } };
}

function createSession(db, userId, sessionTtlMs) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(randomUUID(), userId, hashToken(token), expiresAt, createdAt);
  return { token, expiresAt };
}

function getProfile(db, workspaceId) {
  const row = db.prepare(`SELECT w.id AS workspace_id, w.name AS workspace_name,
    p.business_display_name, p.legal_name, p.address, p.email, p.phone,
    p.currency, p.locale, p.tax_preference, p.updated_at
    FROM workspaces w JOIN business_profiles p ON p.workspace_id = w.id
    WHERE w.id = ?`).get(workspaceId);
  if (!row) fail(404, 'profile_not_found', 'Workspace profile was not found.');
  return row;
}

function register(db, body, sessionTtlMs) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const workspaceName = requiredString(body.workspaceName, 'workspaceName', 100);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) fail(409, 'email_in_use', 'An account with that email already exists.');
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const createdAt = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(userId, email, hashPassword(password), createdAt);
    db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').run(workspaceId, workspaceName, createdAt);
    db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`).run(workspaceId, userId, createdAt);
    db.prepare(`INSERT INTO business_profiles
      (workspace_id, business_display_name, legal_name, address, email, phone, currency, locale, tax_preference, updated_at)
      VALUES (?, ?, ?, '', ?, '', 'USD', 'en-US', 'prices_exclude_tax', ?)`).run(workspaceId, workspaceName, workspaceName, email, createdAt);
    recordAudit(db, { workspaceId, actorUserId: userId, action: 'auth.registered', metadata: { source: 'api' } });
    const session = createSession(db, userId, sessionTtlMs);
    recordAudit(db, { workspaceId, actorUserId: userId, action: 'auth.logged_in', metadata: { source: 'register' } });
    db.exec('COMMIT');
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(userId);
    const workspace = db.prepare(`SELECT w.id, w.name, w.created_at, wm.role FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id WHERE w.id = ? AND wm.user_id = ?`).get(workspaceId, userId);
    return { sessionToken: session.token, sessionExpiresAt: session.expiresAt, user: safeUser(user), workspace: safeWorkspace(workspace), profile: safeProfile(getProfile(db, workspaceId)) };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function login(db, body, sessionTtlMs) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const row = db.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?').get(email);
  if (!row || !verifyPassword(password, row.password_hash)) fail(401, 'invalid_credentials', 'Email or password is incorrect.');
  const workspace = findOwnedWorkspace(db, row.id);
  const session = createSession(db, row.id, sessionTtlMs);
  recordAudit(db, { workspaceId: workspace.id, actorUserId: row.id, action: 'auth.logged_in', metadata: { source: 'login' } });
  return { sessionToken: session.token, sessionExpiresAt: session.expiresAt, user: safeUser(row), workspace: safeWorkspace(workspace), profile: safeProfile(getProfile(db, workspace.id)) };
}

function updateProfile(db, userId, url, body) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const workspaceId = requestedWorkspaceId(url, body);
  const workspace = findOwnedWorkspace(db, userId, workspaceId);
  const profile = readProfileInput(body);
  const current = getProfile(db, workspace.id);
  const next = { ...current, ...profile };
  db.exec('BEGIN');
  try {
    if (next.workspaceName !== current.workspaceName) {
      db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(next.workspaceName, workspace.id);
    }
    db.prepare(`UPDATE business_profiles SET
      business_display_name = ?, legal_name = ?, address = ?, email = ?, phone = ?,
      currency = ?, locale = ?, tax_preference = ?, updated_at = ?
      WHERE workspace_id = ?`).run(
      next.businessDisplayName,
      next.legalName,
      next.address,
      next.email,
      next.phone,
      next.currency,
      next.locale,
      next.taxPreference,
      nowIso(),
      workspace.id,
    );
    const changedFields = Object.keys(profile).filter((field) => field !== 'workspaceId' && profile[field] !== current[field]);
    recordAudit(db, { workspaceId: workspace.id, actorUserId: userId, action: 'workspace.profile_updated', metadata: { fields: changedFields } });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return safeProfile(getProfile(db, workspace.id));
}

// Format stored integer cents without floating-point division at large amounts.
function formatMoneyMinorUnits(minorUnits) {
  const digits = String(minorUnits).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function safeProduct(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    description: row.description,
    price: formatMoneyMinorUnits(row.price_minor),
    priceMinorUnits: row.price_minor,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readProductInput(body, workspaceCurrency) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const name = requiredString(body.name, 'name', 160);
  const sku = requiredString(body.sku, 'sku', 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku)) {
    fail(400, 'invalid_input', 'Use up to 64 letters, numbers, dots, dashes, or underscores.', { sku: 'Use up to 64 letters, numbers, dots, dashes, or underscores.' });
  }
  const category = requiredString(body.category, 'category', 120);
  const description = body.description === undefined ? '' : optionalString(body.description, 'description', 2000);
  const currency = body.currency === undefined ? workspaceCurrency : body.currency;
  if (typeof currency !== 'string' || !SUPPORTED_CURRENCIES.has(currency)) {
    fail(400, 'invalid_input', 'Choose a supported currency.', { currency: 'Choose a supported currency.' });
  }
  if (currency !== workspaceCurrency) {
    fail(400, 'currency_mismatch', `Product currency must match the workspace currency (${workspaceCurrency}).`, { currency: `Product currency must match the workspace currency (${workspaceCurrency}).` });
  }
  let money;
  try {
    money = parseMoney(body.price, currency);
  } catch (error) {
    fail(400, 'invalid_input', error instanceof Error ? error.message : 'Enter a positive amount with up to 2 decimal places.', { price: 'Enter a positive amount with up to 2 decimal places.' });
  }
  if (money.minorUnits <= 0) {
    fail(400, 'invalid_input', 'Price must be greater than zero.', { price: 'Price must be greater than zero.' });
  }
  return { name, sku, category, description, currency, priceMinor: money.minorUnits };
}

function listProducts(db, userId, url) {
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, undefined));
  return db.prepare(`SELECT id, workspace_id, sku, name, category, description, price_minor,
    currency, status, created_at, updated_at
    FROM products WHERE workspace_id = ? ORDER BY created_at ASC, id ASC`).all(workspace.id).map(safeProduct);
}

function commerceTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createProduct(db, userId, url, body) {
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, body));
  const input = readProductInput(body, getProfile(db, workspace.id).currency);
  const id = randomUUID();
  const createdAt = nowIso();
  try {
    db.prepare(`INSERT INTO products
      (id, workspace_id, sku, name, category, description, price_minor, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(
      id, workspace.id, input.sku, input.name, input.category, input.description,
      input.priceMinor, input.currency, createdAt, createdAt,
    );
  } catch (error) {
    if (String(error?.message ?? '').includes('UNIQUE constraint failed')) {
      fail(409, 'sku_in_use', 'A product with this SKU already exists in the workspace.', { sku: 'SKU must be unique within the workspace.' });
    }
    throw error;
  }
  recordAudit(db, { workspaceId: workspace.id, actorUserId: userId, action: 'product.created', metadata: { productId: id } });
  return safeProduct(db.prepare(`SELECT id, workspace_id, sku, name, category, description, price_minor,
    currency, status, created_at, updated_at FROM products WHERE id = ? AND workspace_id = ?`).get(id, workspace.id));
}

function archiveProductRecord(db, userId, url, body, productId) {
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, body));
  const current = db.prepare(`SELECT id, workspace_id, sku, name, category, description, price_minor,
    currency, status, created_at, updated_at FROM products WHERE id = ? AND workspace_id = ?`).get(productId, workspace.id);
  if (!current) fail(404, 'product_not_found', 'Product was not found.');
  const updatedAt = nowIso();
  db.prepare('UPDATE products SET status = \'archived\', updated_at = ? WHERE id = ? AND workspace_id = ?').run(updatedAt, productId, workspace.id);
  recordAudit(db, { workspaceId: workspace.id, actorUserId: userId, action: 'product.archived', metadata: { productId } });
  return safeProduct(db.prepare(`SELECT id, workspace_id, sku, name, category, description, price_minor,
    currency, status, created_at, updated_at FROM products WHERE id = ? AND workspace_id = ?`).get(productId, workspace.id));
}

function safeMoney(row, prefix) {
  return { currency: row.currency, minorUnits: row[`${prefix}_minor`] };
}

function safeQuote(db, row) {
  const lines = db.prepare(`SELECT product_id, name, sku, currency, unit_price_minor,
    quantity, line_subtotal_minor FROM quote_lines WHERE quote_id = ? AND workspace_id = ? ORDER BY rowid ASC`).all(row.id, row.workspace_id).map((line) => ({
    productId: line.product_id,
    name: line.name,
    sku: line.sku,
    currency: line.currency,
    unitPrice: { currency: line.currency, minorUnits: line.unit_price_minor },
    quantity: line.quantity,
    lineSubtotal: { currency: line.currency, minorUnits: line.line_subtotal_minor },
  }));
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    currency: row.currency,
    lines,
    discountRate: row.discount_rate_units / 10_000,
    taxRate: row.tax_rate_units / 10_000,
    taxMode: row.tax_mode,
    subtotal: safeMoney(row, 'subtotal'),
    discount: safeMoney(row, 'discount'),
    taxableSubtotal: safeMoney(row, 'taxable_subtotal'),
    tax: safeMoney(row, 'tax'),
    grandTotal: safeMoney(row, 'grand_total'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const quoteSelect = `SELECT id, workspace_id, currency, discount_rate_units, tax_rate_units,
  tax_mode, subtotal_minor, discount_minor, taxable_subtotal_minor, tax_minor,
  grand_total_minor, created_at, updated_at FROM quotes`;

function listQuotes(db, userId, url) {
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, undefined));
  const rows = db.prepare(`${quoteSelect} WHERE workspace_id = ? ORDER BY created_at DESC, id DESC`).all(workspace.id);
  return rows.map((row) => safeQuote(db, row));
}

function createQuoteRecord(db, userId, url, body) {
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, body));
  if (!isPlainObject(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
  if (!Array.isArray(body.lines) || body.lines.length === 0) fail(400, 'empty_lines', 'Add at least one quote line.');
  if (body.lines.length > 100) fail(400, 'invalid_input', 'A quote cannot contain more than 100 lines.');
  const seen = new Set();
  const products = body.lines.map((line) => {
    if (!isPlainObject(line)) fail(400, 'invalid_input', 'Each quote line must be an object.');
    const productId = requiredString(line.productId, 'productId', 100);
    if (seen.has(productId)) fail(400, 'invalid_input', 'A product may appear only once in a quote.', { productId: 'Duplicate productId.' });
    seen.add(productId);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      fail(400, 'invalid_quantity', 'Quantity must be a positive whole number.', { quantity: 'Quantity must be a positive whole number.' });
    }
    const product = db.prepare(`SELECT id, workspace_id, sku, name, category, description, price_minor,
      currency, status, created_at, updated_at FROM products WHERE id = ? AND workspace_id = ?`).get(productId, workspace.id);
    if (!product) fail(404, 'product_not_found', 'Product was not found.');
    return { product, quantity: line.quantity };
  });
  const profileCurrency = getProfile(db, workspace.id).currency;
  if (body.currency !== undefined && body.currency !== profileCurrency) {
    fail(400, 'currency_mismatch', `Quote currency must match the workspace currency (${profileCurrency}).`, { currency: `Quote currency must match the workspace currency (${profileCurrency}).` });
  }
  const domainLines = products.map(({ product, quantity }) => ({
    product: { ...product, price: formatMoneyMinorUnits(product.price_minor) },
    quantity,
  }));
  let calculation;
  try {
    calculation = calculateQuote({
      workspaceId: workspace.id,
      currency: profileCurrency,
      lines: domainLines,
      discountRate: body.discountRate === undefined ? 0 : body.discountRate,
      taxRate: body.taxRate === undefined ? 0 : body.taxRate,
      taxMode: body.taxMode === undefined ? 'exclusive' : body.taxMode,
    });
  } catch (error) {
    if (error instanceof QuoteValidationError || error instanceof MoneyValidationError) fail(400, error.code, error.message);
    throw error;
  }

  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(`INSERT INTO quotes
    (id, workspace_id, currency, discount_rate_units, tax_rate_units, tax_mode,
     subtotal_minor, discount_minor, taxable_subtotal_minor, tax_minor, grand_total_minor, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, workspace.id, calculation.currency, rateToUnits(calculation.discountRate), rateToUnits(calculation.taxRate),
    calculation.taxMode, calculation.subtotal.minorUnits, calculation.discount.minorUnits,
    calculation.taxableSubtotal.minorUnits, calculation.tax.minorUnits, calculation.grandTotal.minorUnits,
    createdAt, createdAt,
  );
  const insertLine = db.prepare(`INSERT INTO quote_lines
    (id, quote_id, workspace_id, product_id, name, sku, currency, unit_price_minor, quantity, line_subtotal_minor, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const line of calculation.lines) {
    insertLine.run(randomUUID(), id, workspace.id, line.productId, line.name, line.sku, line.currency,
      line.unitPrice.minorUnits, line.quantity, line.lineSubtotal.minorUnits, createdAt, createdAt);
  }
  recordAudit(db, { workspaceId: workspace.id, actorUserId: userId, action: 'quote.created', metadata: { quoteId: id, grandTotalMinor: calculation.grandTotal.minorUnits } });
  return safeQuote(db, db.prepare(`${quoteSelect} WHERE id = ? AND workspace_id = ?`).get(id, workspace.id));
}

function getQuote(db, userId, url, quoteId) {
  const workspace = findOwnedWorkspace(db, userId, requestedWorkspaceId(url, undefined));
  const row = db.prepare(`${quoteSelect} WHERE id = ? AND workspace_id = ?`).get(quoteId, workspace.id);
  if (!row) fail(404, 'quote_not_found', 'Quote was not found.');
  return safeQuote(db, row);
}

function me(db, auth) {
  const workspace = findOwnedWorkspace(db, auth.user.id);
  return {
    user: safeUser({ id: auth.user.id, email: auth.user.email, created_at: auth.user.created_at }),
    workspace: safeWorkspace(workspace),
    sessionExpiresAt: auth.session.expires_at,
  };
}

export function createCommerceServer({
  databasePath = ':memory:', sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  staticDirectory = null, production = false, allowedOrigin = null,
  registrationEnabled = !production, authRateLimit = {},
} = {}) {
  if (typeof production !== 'boolean' || typeof registrationEnabled !== 'boolean') throw new TypeError('Production and registration settings must be booleans');
  if (production && !allowedOrigin) throw new TypeError('Production requires COMMERCE_ALLOWED_ORIGIN');
  if (allowedOrigin !== null) validateOrigin(allowedOrigin);
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs <= 0) throw new TypeError('sessionTtlMs must be a positive integer');
  const limitAuth = createAuthRateLimiter(authRateLimit);
  const staticRoot = staticDirectoryRoot(staticDirectory);
  const db = new DatabaseSync(prepareDatabasePath(databasePath, { production, staticRoot }));
  try { runMigrations(db); } catch (error) { db.close(); throw error; }
  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const url = requestUrl(request);
      enforceMutationPolicy(request, { production, allowedOrigin });
      if (request.method === 'GET' && url.pathname === '/healthz') {
        sendJson(response, 200, { ok: true });
        return;
      }
      let body = {};
      if (request.method === 'POST' && (url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login')) {
        const retryAfter = limitAuth(request.socket.remoteAddress ?? 'unknown');
        if (retryAfter) {
          response.setHeader('retry-after', retryAfter);
          fail(429, 'rate_limited', 'Too many authentication attempts. Try again later.');
        }
        if (url.pathname === '/api/auth/register' && !registrationEnabled) fail(403, 'registration_disabled', 'Registration is disabled.');
        body = await readBody(request);
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/register') {
        sendJson(response, 201, register(db, body, sessionTtlMs));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        sendJson(response, 200, login(db, body, sessionTtlMs));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        const auth = authenticate(db, request);
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), auth.session.session_id);
        const workspace = findOwnedWorkspace(db, auth.user.id);
        recordAudit(db, { workspaceId: workspace.id, actorUserId: auth.user.id, action: 'auth.logged_out', metadata: { source: 'api' } });
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/me') {
        const auth = authenticate(db, request);
        sendJson(response, 200, me(db, auth));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/products') {
        const auth = authenticate(db, request);
        sendJson(response, 200, { products: listProducts(db, auth.user.id, url) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/products') {
        const auth = authenticate(db, request);
        body = await readBody(request);
        sendJson(response, 201, commerceTransaction(db, () => createProduct(db, auth.user.id, url, body)));
        return;
      }
      const archiveMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/archive$/);
      if (request.method === 'PATCH' && archiveMatch) {
        const auth = authenticate(db, request);
        body = await readBody(request);
        sendJson(response, 200, commerceTransaction(db, () => archiveProductRecord(db, auth.user.id, url, body, archiveMatch[1])));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/quotes') {
        const auth = authenticate(db, request);
        sendJson(response, 200, { quotes: listQuotes(db, auth.user.id, url) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/quotes') {
        const auth = authenticate(db, request);
        body = await readBody(request);
        sendJson(response, 201, commerceTransaction(db, () => createQuoteRecord(db, auth.user.id, url, body)));
        return;
      }
      const quoteMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)$/);
      if (request.method === 'GET' && quoteMatch) {
        const auth = authenticate(db, request);
        sendJson(response, 200, getQuote(db, auth.user.id, url, quoteMatch[1]));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/workspace/profile') {
        const auth = authenticate(db, request);
        const workspace = findOwnedWorkspace(db, auth.user.id, requestedWorkspaceId(url, undefined));
        sendJson(response, 200, safeProfile(getProfile(db, workspace.id)));
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/workspace/profile') {
        const auth = authenticate(db, request);
        body = await readBody(request);
        sendJson(response, 200, updateProfile(db, auth.user.id, url, body));
        return;
      }
      if (await serveStatic(request, response, url, staticRoot)) return;
      sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found.' } });
    } catch (error) {
      if (error instanceof HttpError || error instanceof DeploymentError) {
        const payload = { error: { code: error.code, message: error.message } };
        if (error.fields) payload.error.fields = error.fields;
        sendJson(response, error.status, payload);
        return;
      }
      // Never log request bodies, credentials, tokens, database paths, or raw errors.
      console.error('Commerce request failed with an internal error.');
      if (!response.headersSent) sendJson(response, 500, { error: { code: 'internal_error', message: 'An unexpected server error occurred.' } });
      else response.destroy();
    }
  });
  server.database = db;
  server.db = db;
  let databaseClosed = false;
  server.closeDatabase = () => {
    if (!databaseClosed) {
      databaseClosed = true;
      db.close();
    }
  };
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const { host, port, ...options } = deploymentOptionsFromEnv(process.env, join(process.cwd(), 'commerce-studio.sqlite'));
    const server = createCommerceServer({ ...options, staticDirectory: join(here, '..', 'dist') });
    server.once('error', () => {
      console.error('Commerce server could not listen. Check HOST and PORT.');
      server.closeDatabase();
      process.exitCode = 1;
    });
    server.listen(port, host, () => {
      console.log(`Commerce Studio server listening on port ${port}`);
    });
    const shutdown = () => server.close(() => server.closeDatabase());
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    console.error('Commerce startup failed. Check the build, database path, origin, and deployment settings.');
    process.exitCode = 1;
  }
}
