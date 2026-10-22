import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_DEMO_WORKSPACE_ID,
  loadWorkspaceProfile,
  profileStorageKey,
  saveWorkspaceProfile,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  validateWorkspaceProfile,
  type StorageLike,
} from '../src/profile';
import { EMPTY_PROFILE, type WorkspaceProfile } from '../src/types';
import {
  archiveProduct,
  loadProducts,
  productFromDraft,
  productsStorageKey,
  saveProducts,
  searchProducts,
  validateProduct,
} from '../src/products';
import type { ProductDraft } from '../src/types';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const validProfile: WorkspaceProfile = {
  ...EMPTY_PROFILE,
  workspaceName: 'Northstar Commerce',
  businessDisplayName: 'Northstar Goods',
  legalName: 'Northstar Goods, LLC',
  address: '123 Market Street, San Francisco, CA 94105',
  email: 'hello@northstar.example',
  phone: '+1 (415) 555-0142',
};

test('validates required identity and contact fields', () => {
  const errors = validateWorkspaceProfile(EMPTY_PROFILE);
  assert.equal(errors.workspaceName, 'This field is required.');
  assert.equal(errors.email, 'This field is required.');
  assert.equal(errors.phone, 'This field is required.');
  assert.deepEqual(validateWorkspaceProfile(validProfile), {});
});

test('rejects malformed email and phone values', () => {
  const errors = validateWorkspaceProfile({ ...validProfile, email: 'hello', phone: 'abc' });
  assert.equal(errors.email, 'Enter a valid email address.');
  assert.equal(errors.phone, 'Enter a valid phone number.');
});

test('rejects unsupported commerce defaults before they reach a future quote flow', () => {
  const errors = validateWorkspaceProfile({
    ...validProfile,
    currency: 'INR',
    locale: 'en-IN',
    taxPreference: 'unknown' as WorkspaceProfile['taxPreference'],
  });
  assert.equal(errors.currency, 'Choose a supported currency.');
  assert.equal(errors.locale, 'Choose a supported locale.');
  assert.equal(errors.taxPreference, 'Choose a supported tax preference.');
  assert.deepEqual(SUPPORTED_CURRENCIES, ['USD', 'CAD', 'EUR', 'GBP']);
  assert.deepEqual(SUPPORTED_LOCALES, ['en-US', 'en-CA', 'en-GB', 'fr-CA']);
});

test('stores and reads only the active workspace profile key', () => {
  const storage = new MemoryStorage();
  saveWorkspaceProfile(storage, validProfile, ACTIVE_DEMO_WORKSPACE_ID);

  assert.equal(profileStorageKey(ACTIVE_DEMO_WORKSPACE_ID), 'commerce-studio:workspace-profile:demo-commerce-workspace');
  assert.deepEqual(loadWorkspaceProfile(storage, ACTIVE_DEMO_WORKSPACE_ID), validProfile);
  assert.equal(loadWorkspaceProfile(storage, 'another-workspace'), null);
});

test('recovers from malformed stored data without throwing', () => {
  const storage = new MemoryStorage();
  storage.setItem(profileStorageKey(ACTIVE_DEMO_WORKSPACE_ID), '{not-json');
  assert.equal(loadWorkspaceProfile(storage, ACTIVE_DEMO_WORKSPACE_ID), null);
});

test('normalizes unsupported stored defaults to safe demo defaults', () => {
  const storage = new MemoryStorage();
  storage.setItem(profileStorageKey(ACTIVE_DEMO_WORKSPACE_ID), JSON.stringify({ ...validProfile, currency: 'INR', locale: 'en-IN', taxPreference: 'unknown' }));
  assert.deepEqual(loadWorkspaceProfile(storage, ACTIVE_DEMO_WORKSPACE_ID), validProfile);
});

test('validates a product against the workspace currency and safe price format', () => {
  const draft: ProductDraft = { name: '', sku: 'bad sku', category: '', description: '', price: '12.999', currency: 'EUR' };
  const errors = validateProduct(draft, 'USD');
  assert.equal(errors.name, 'This field is required.');
  assert.equal(errors.category, 'This field is required.');
  assert.match(errors.sku ?? '', /up to 64/);
  assert.match(errors.price ?? '', /positive amount/);
  assert.match(errors.currency ?? '', /USD/);
});

test('persists, searches, and archives products inside the workspace key', () => {
  const storage = new MemoryStorage();
  const draft: ProductDraft = { name: 'Canvas Tote', sku: 'TOTE-001', category: 'Bags', description: 'Reusable tote', price: '24.50', currency: 'USD' };
  const product = productFromDraft(draft, 'product-1');
  saveProducts(storage, ACTIVE_DEMO_WORKSPACE_ID, [product]);
  assert.equal(productsStorageKey(ACTIVE_DEMO_WORKSPACE_ID), 'commerce-studio:products:demo-commerce-workspace');
  assert.deepEqual(loadProducts(storage, ACTIVE_DEMO_WORKSPACE_ID), [product]);
  assert.deepEqual(searchProducts([product], 'bags'), [product]);
  assert.equal(searchProducts([product], 'missing').length, 0);
  assert.equal(archiveProduct([product], product.id)[0].status, 'archived');
});

test('ignores malformed product records without crashing the catalog', () => {
  const storage = new MemoryStorage();
  storage.setItem(productsStorageKey(ACTIVE_DEMO_WORKSPACE_ID), JSON.stringify([{ id: 'bad', name: 'Missing fields' }, { id: 'ok', name: 'Valid', sku: 'SKU-1', category: 'Test', description: '', price: '1.00', currency: 'USD', status: 'active' }]));
  assert.deepEqual(loadProducts(storage, ACTIVE_DEMO_WORKSPACE_ID).map((product) => product.id), ['ok']);
});
