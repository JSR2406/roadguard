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
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
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
  return { status: response.status, body: await response.json() };
}

async function tempDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'commerce-studio-commerce-'));
  return { directory, databasePath: join(directory, 'commerce.sqlite') };
}

function registration(overrides = {}) {
  return {
    email: 'owner@example.com',
    password: 'correct horse battery staple',
    workspaceName: 'Commerce Workspace',
    ...overrides,
  };
}

async function register(baseUrl, overrides = {}) {
  const response = await request(baseUrl, '/api/auth/register', { method: 'POST', body: registration(overrides) });
  assert.equal(response.status, 201);
  return response.body;
}

async function createProduct(baseUrl, token, overrides = {}) {
  const response = await request(baseUrl, '/api/products', {
    method: 'POST',
    token,
    body: {
      name: 'Canvas Tote',
      sku: 'TOTE-001',
      category: 'Bags',
      description: 'Reusable tote',
      price: '12.50',
      currency: 'USD',
      ...overrides,
    },
  });
  assert.equal(response.status, 201);
  return response.body;
}

test('creates, lists, and archives tenant-scoped products with validation', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const owner = await register(app.baseUrl);
    const product = await createProduct(app.baseUrl, owner.sessionToken);
    assert.equal(product.price, '12.50');
    assert.equal(product.priceMinorUnits, 1250);
    assert.equal(product.status, 'active');
    assert.equal(product.workspaceId, owner.workspace.id);

    const listed = await request(app.baseUrl, '/api/products', { token: owner.sessionToken });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.products.map((item) => item.id), [product.id]);

    const badPrice = await request(app.baseUrl, '/api/products', {
      method: 'POST',
      token: owner.sessionToken,
      body: { name: 'Bad', sku: 'BAD-1', category: 'Test', price: '12.999', currency: 'USD' },
    });
    assert.equal(badPrice.status, 400);
    assert.equal(badPrice.body.error.code, 'invalid_input');

    const badCurrency = await request(app.baseUrl, '/api/products', {
      method: 'POST',
      token: owner.sessionToken,
      body: { name: 'Euro Item', sku: 'EUR-1', category: 'Test', price: '1.00', currency: 'EUR' },
    });
    assert.equal(badCurrency.status, 400);
    assert.equal(badCurrency.body.error.code, 'currency_mismatch');

    const archived = await request(app.baseUrl, `/api/products/${product.id}/archive`, {
      method: 'PATCH',
      token: owner.sessionToken,
    });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.status, 'archived');

    const afterArchive = await request(app.baseUrl, '/api/products', { token: owner.sessionToken });
    assert.equal(afterArchive.body.products[0].status, 'archived');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('creates deterministic quotes with immutable product snapshots and totals', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const owner = await register(app.baseUrl);
    const product = await createProduct(app.baseUrl, owner.sessionToken);
    const quoteResponse = await request(app.baseUrl, '/api/quotes', {
      method: 'POST',
      token: owner.sessionToken,
      body: {
        lines: [{ productId: product.id, quantity: 2 }],
        discountRate: 10,
        taxRate: 8.25,
        taxMode: 'exclusive',
      },
    });
    assert.equal(quoteResponse.status, 201);
    const quote = quoteResponse.body;
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.subtotal.minorUnits, 2500);
    assert.equal(quote.discount.minorUnits, 250);
    assert.equal(quote.taxableSubtotal.minorUnits, 2250);
    assert.equal(quote.tax.minorUnits, 186);
    assert.equal(quote.grandTotal.minorUnits, 2436);
    assert.deepEqual(quote.lines[0], {
      productId: product.id,
      name: 'Canvas Tote',
      sku: 'TOTE-001',
      currency: 'USD',
      unitPrice: { currency: 'USD', minorUnits: 1250 },
      quantity: 2,
      lineSubtotal: { currency: 'USD', minorUnits: 2500 },
    });

    const db = new DatabaseSync(databasePath);
    assert.throws(() => db.prepare('UPDATE quote_lines SET name = ? WHERE quote_id = ?').run('Tampered', quote.id), /immutable/);
    assert.throws(() => db.prepare('UPDATE quotes SET grand_total_minor = 1 WHERE id = ?').run(quote.id), /immutable/);
    db.prepare('UPDATE products SET name = ?, price_minor = ? WHERE id = ?').run('Renamed Tote', 9999, product.id);
    db.close();
    const fetched = await request(app.baseUrl, `/api/quotes/${quote.id}`, { token: owner.sessionToken });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.lines[0].name, 'Canvas Tote');
    assert.equal(fetched.body.lines[0].unitPrice.minorUnits, 1250);
    assert.equal(fetched.body.grandTotal.minorUnits, 2436);

    const archived = await request(app.baseUrl, `/api/products/${product.id}/archive`, { method: 'PATCH', token: owner.sessionToken });
    assert.equal(archived.status, 200);
    const rejected = await request(app.baseUrl, '/api/quotes', {
      method: 'POST',
      token: owner.sessionToken,
      body: { lines: [{ productId: product.id, quantity: 1 }], discountRate: 0, taxRate: 0, taxMode: 'exclusive' },
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'archived_product');
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('persists products and quotes after restart', async () => {
  const { directory, databasePath } = await tempDatabase();
  const first = await startServer({ databasePath });
  let token;
  let productId;
  let quoteId;
  try {
    const owner = await register(first.baseUrl);
    token = owner.sessionToken;
    const product = await createProduct(first.baseUrl, token);
    productId = product.id;
    const quote = await request(first.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { lines: [{ productId, quantity: 1 }], discountRate: 0, taxRate: 0, taxMode: 'exclusive' },
    });
    assert.equal(quote.status, 201);
    quoteId = quote.body.id;
  } finally {
    await first.close();
  }

  const second = await startServer({ databasePath });
  try {
    const products = await request(second.baseUrl, '/api/products', { token });
    assert.equal(products.status, 200);
    assert.equal(products.body.products[0].id, productId);
    const quote = await request(second.baseUrl, `/api/quotes/${quoteId}`, { token });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.lines[0].productId, productId);
    assert.equal(quote.body.grandTotal.minorUnits, 1250);
    assert.equal(second.server.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2);
  } finally {
    await second.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not leak products or quotes across tenant boundaries', async () => {
  const { directory, databasePath } = await tempDatabase();
  const app = await startServer({ databasePath });
  try {
    const first = await register(app.baseUrl);
    const second = await register(app.baseUrl, { email: 'other@example.com', workspaceName: 'Other Workspace' });
    const product = await createProduct(app.baseUrl, first.sessionToken);
    const quote = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token: first.sessionToken,
      body: { lines: [{ productId: product.id, quantity: 1 }], discountRate: 0, taxRate: 0, taxMode: 'exclusive' },
    });
    assert.equal(quote.status, 201);

    const products = await request(app.baseUrl, '/api/products', { token: second.sessionToken });
    assert.equal(products.status, 200);
    assert.deepEqual(products.body.products, []);
    const archiveOther = await request(app.baseUrl, `/api/products/${product.id}/archive`, { method: 'PATCH', token: second.sessionToken });
    assert.equal(archiveOther.status, 404);
    const quoteRead = await request(app.baseUrl, `/api/quotes/${quote.body.id}`, { token: second.sessionToken });
    assert.equal(quoteRead.status, 404);
    const quoteCreate = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token: second.sessionToken,
      body: { lines: [{ productId: product.id, quantity: 1 }], discountRate: 0, taxRate: 0, taxMode: 'exclusive' },
    });
    assert.equal(quoteCreate.status, 404);
    const unknownQuote = await request(app.baseUrl, '/api/quotes/nonexistent', { token: second.sessionToken });
    assert.deepEqual(quoteRead, unknownQuote);
    const unknownProduct = await request(app.baseUrl, '/api/products/nonexistent/archive', { method: 'PATCH', token: second.sessionToken });
    assert.deepEqual(archiveOther, unknownProduct);
    const quotes = await request(app.baseUrl, '/api/quotes', { token: second.sessionToken });
    assert.deepEqual(quotes.body.quotes, []);
    for (const path of ['/api/products', '/api/quotes', `/api/quotes/${quote.body.id}`]) {
      const forbidden = await request(app.baseUrl, `${path}?workspaceId=${first.workspace.id}`, { token: second.sessionToken });
      assert.equal(forbidden.status, 403, path);
    }
    for (const [path, method, body] of [
      ['/api/products', 'POST', { workspaceId: first.workspace.id, name: 'Other', sku: 'OTHER', category: 'Test', price: '1.00' }],
      ['/api/quotes', 'POST', { workspaceId: first.workspace.id, lines: [{ productId: product.id, quantity: 1 }] }],
      [`/api/products/${product.id}/archive`, 'PATCH', { workspaceId: first.workspace.id }],
    ]) {
      const forbidden = await request(app.baseUrl, path, { method, token: second.sessionToken, body });
      assert.equal(forbidden.status, 403, path);
    }
    const unchanged = await request(app.baseUrl, '/api/products', { token: first.sessionToken });
    assert.equal(unchanged.body.products[0].status, 'active');
    // SKU uniqueness is per workspace rather than global.
    const secondProduct = await createProduct(app.baseUrl, second.sessionToken);
    assert.notEqual(secondProduct.id, product.id);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});


test('all commerce routes require authentication and reject malformed JSON safely', async () => {
  const app = await startServer();
  try {
    for (const [path, method] of [
      ['/api/products', 'GET'], ['/api/products', 'POST'],
      ['/api/products/unknown/archive', 'PATCH'],
      ['/api/quotes', 'GET'], ['/api/quotes', 'POST'], ['/api/quotes/unknown', 'GET'],
    ]) {
      const response = await request(app.baseUrl, path, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal(response.body.error.code, 'unauthorized');
    }
    const owner = await register(app.baseUrl);
    for (const path of ['/api/products', '/api/quotes']) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        method: 'POST', headers: { authorization: `Bearer ${owner.sessionToken}` }, body: '{',
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'invalid_json');
    }
  } finally {
    await app.close();
  }
});

test('rejects invalid product fields and workspace-local duplicate SKUs without saving records', async () => {
  const app = await startServer();
  try {
    const owner = await register(app.baseUrl);
    const token = owner.sessionToken;
    const valid = { name: 'Test', sku: 'SKU-1', category: 'Test', price: '1.00', currency: 'USD' };
    for (const invalid of [
      { name: '' }, { name: 23 }, { name: 'x'.repeat(161) },
      { sku: 'bad sku' }, { sku: 'x'.repeat(65) }, { category: '' },
      { category: [] }, { description: {} }, { price: '0' }, { price: '-1' },
      { price: '1.001' }, { price: '1e3' }, { price: '9007199254740992' },
      { price: null }, { price: false }, { price: {} }, { currency: 'INR' },
    ]) {
      const response = await request(app.baseUrl, '/api/products', { method: 'POST', token, body: { ...valid, ...invalid } });
      assert.equal(response.status, 400, JSON.stringify(invalid));
      assert.equal(response.body.error.stack, undefined);
    }
    assert.deepEqual((await request(app.baseUrl, '/api/products', { token })).body.products, []);
    const product = await createProduct(app.baseUrl, token, valid);
    const duplicate = await request(app.baseUrl, '/api/products', { method: 'POST', token, body: valid });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'sku_in_use');
    const listed = await request(app.baseUrl, '/api/products', { token });
    assert.deepEqual(listed.body.products.map((value) => value.id), [product.id]);
  } finally {
    await app.close();
  }
});

test('reuses shared half-up, inclusive-tax, and percentage precision rules', async () => {
  const app = await startServer();
  try {
    const { sessionToken: token } = await register(app.baseUrl);
    const product = await createProduct(app.baseUrl, token, { price: '10.00' });
    const inclusive = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { lines: [{ productId: product.id, quantity: 1, unitPrice: 1 }], discountRate: '0', taxRate: '10', taxMode: 'inclusive', grandTotal: { minorUnits: 1 } },
    });
    assert.equal(inclusive.status, 201);
    assert.equal(inclusive.body.taxableSubtotal.minorUnits, 909);
    assert.equal(inclusive.body.tax.minorUnits, 91);
    assert.equal(inclusive.body.grandTotal.minorUnits, 1000);
    const penny = await createProduct(app.baseUrl, token, { sku: 'PENNY', price: '0.01' });
    const rounded = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { lines: [{ productId: penny.id, quantity: 1 }], discountRate: '50.0000', taxRate: 0, taxMode: 'exclusive' },
    });
    assert.equal(rounded.status, 201);
    assert.equal(rounded.body.discount.minorUnits, 1);
    assert.equal(rounded.body.grandTotal.minorUnits, 0);
    const precise = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { lines: [{ productId: product.id, quantity: 3 }], discountRate: '0.0001', taxRate: '8.1234', taxMode: 'exclusive' },
    });
    assert.equal(precise.status, 201);
    assert.equal(precise.body.taxRate, 8.1234);
    assert.equal(precise.body.tax.minorUnits, 244);
    const listed = await request(app.baseUrl, '/api/quotes', { token });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.quotes.length, 3);
    assert.deepEqual(listed.body.quotes.find((quote) => quote.id === inclusive.body.id), inclusive.body);
  } finally {
    await app.close();
  }
});

test('rejects malformed quote inputs, arithmetic overflow, and mixed currencies atomically', async () => {
  const app = await startServer();
  try {
    const owner = await register(app.baseUrl);
    const token = owner.sessionToken;
    const product = await createProduct(app.baseUrl, token);
    const valid = { lines: [{ productId: product.id, quantity: 1 }], discountRate: 0, taxRate: 0, taxMode: 'exclusive' };
    for (const invalid of [
      { lines: [] }, { lines: {} }, { lines: [null] },
      { lines: [{ productId: product.id, quantity: 0 }] },
      { lines: [{ productId: product.id, quantity: '1' }] },
      { lines: [{ productId: product.id, quantity: 1.5 }] },
      { lines: [{ productId: product.id, quantity: Number.MAX_SAFE_INTEGER }] },
      { lines: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }] },
      { discountRate: -1 }, { discountRate: 101 }, { discountRate: '0.00001' },
      { taxRate: {} }, { taxRate: null }, { taxMode: null }, { taxMode: 'unknown' },
      { currency: 'EUR' },
    ]) {
      const response = await request(app.baseUrl, '/api/quotes', { method: 'POST', token, body: { ...valid, ...invalid } });
      assert.equal(response.status, 400, JSON.stringify(invalid));
      assert.equal(response.body.error.stack, undefined);
    }
    const large = await createProduct(app.baseUrl, token, { sku: 'LARGE', price: '1000000000.00' });
    const unsafe = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { ...valid, lines: [{ productId: large.id, quantity: 1 }], taxRate: 100 },
    });
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.error.code, 'unsafe_amount');
    const profile = await request(app.baseUrl, '/api/workspace/profile', {
      method: 'PUT', token,
      body: { workspaceName: 'Commerce', businessDisplayName: 'Commerce', legalName: 'Commerce LLC', address: '100 Market St', email: 'hello@example.com', phone: '+1 555 555 1234', currency: 'EUR', locale: 'en-US', taxPreference: 'prices_exclude_tax' },
    });
    assert.equal(profile.status, 200);
    const euro = await createProduct(app.baseUrl, token, { sku: 'EURO', currency: 'EUR' });
    const mixed = await request(app.baseUrl, '/api/quotes', {
      method: 'POST', token,
      body: { ...valid, lines: [{ productId: product.id, quantity: 1 }, { productId: euro.id, quantity: 1 }] },
    });
    assert.equal(mixed.status, 400);
    assert.equal(mixed.body.error.code, 'mixed_currency');
    assert.deepEqual((await request(app.baseUrl, '/api/quotes', { token })).body.quotes, []);
    assert.equal(app.server.db.prepare('SELECT COUNT(*) AS count FROM quote_lines').get().count, 0);
  } finally {
    await app.close();
  }
});
