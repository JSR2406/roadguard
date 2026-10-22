import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuote, loadQuote, loadQuotes, quotesStorageKey, saveQuote, validateQuoteDraft } from '../src/quotes';
import type { Product } from '../src/types';
import type { QuoteStorageLike } from '../src/quotes';

class MemoryStorage implements QuoteStorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1', name: 'Canvas Tote', sku: 'TOTE-001', category: 'Bags', description: 'Reusable tote', price: '12.50', currency: 'USD', status: 'active', ...overrides,
});

const draft = (overrides: Partial<Parameters<typeof createQuote>[0]> = {}) => ({
  workspaceId: 'workspace-a', currency: 'USD' as const, lines: [{ product: product(), quantity: 2 }], discountRate: 10, taxRate: 8.25, taxMode: 'exclusive' as const, ...overrides,
});

test('uses integer minor units for quantity, discount, and exclusive tax', () => {
  const quote = createQuote(draft(), 'quote-1', '2026-10-22T00:00:00.000Z');
  assert.equal(quote.subtotal.minorUnits, 2500);
  assert.equal(quote.discount.minorUnits, 250);
  assert.equal(quote.taxableSubtotal.minorUnits, 2250);
  assert.equal(quote.tax.minorUnits, 186);
  assert.equal(quote.grandTotal.minorUnits, 2436);
  assert.equal(quote.lines[0].unitPrice.minorUnits, 1250);
});

test('rounds half up at a financial boundary', () => {
  const quote = createQuote({ ...draft(), lines: [{ product: product({ price: '0.01' }), quantity: 1 }], discountRate: 50, taxRate: 0 }, 'quote-round');
  assert.equal(quote.discount.minorUnits, 1);
  assert.equal(quote.grandTotal.minorUnits, 0);
});

test('extracts tax from tax-inclusive totals with deterministic rounding', () => {
  const quote = createQuote({ ...draft(), lines: [{ product: product({ price: '10.00' }), quantity: 1 }], discountRate: 0, taxRate: 10, taxMode: 'inclusive' }, 'quote-inclusive');
  assert.equal(quote.subtotal.minorUnits, 1000);
  assert.equal(quote.taxableSubtotal.minorUnits, 909);
  assert.equal(quote.tax.minorUnits, 91);
  assert.equal(quote.grandTotal.minorUnits, 1000);
});

test('rejects empty lines, invalid quantities, rates, and mixed currencies', () => {
  assert.equal(validateQuoteDraft({ ...draft(), lines: [] }).lines, 'Add at least one quote line.');
  assert.ok(validateQuoteDraft({ ...draft(), lines: [{ product: product(), quantity: 0 }] }).lineQuantities);
  assert.ok(validateQuoteDraft({ ...draft(), discountRate: 100.001 }).discountRate);
  assert.match(validateQuoteDraft({ ...draft(), lines: [{ product: product({ currency: 'EUR' }), quantity: 1 }] }).lines ?? '', /workspace currency/);
  assert.throws(() => createQuote({ ...draft(), lines: [{ product: product({ currency: 'EUR' }), quantity: 1 }] }, 'bad-currency'), /workspace currency/);
});

test('snapshots product fields and persists normalized quotes by workspace', () => {
  const storage = new MemoryStorage();
  const quote = createQuote(draft(), 'quote-persisted', '2026-10-22T00:00:00.000Z');
  saveQuote(storage, 'workspace-a', quote);
  assert.equal(quotesStorageKey('workspace-a'), 'commerce-studio:quotes:workspace-a');
  const loaded = loadQuote(storage, 'workspace-a', 'quote-persisted');
  assert.equal(loaded?.lines[0].name, 'Canvas Tote');
  assert.equal(loaded?.lines[0].sku, 'TOTE-001');
  assert.equal(loaded?.lines[0].unitPrice.minorUnits, 1250);
  assert.equal(loaded?.lines[0].currency, 'USD');
  assert.deepEqual(loadQuotes(storage, 'workspace-b'), []);

  storage.setItem(quotesStorageKey('workspace-a'), JSON.stringify([quote, { ...quote, workspaceId: 'workspace-b' }, { malformed: true }]));
  assert.deepEqual(loadQuotes(storage, 'workspace-a').map((item) => item.id), ['quote-persisted']);

  storage.setItem(quotesStorageKey('workspace-a'), JSON.stringify([{ ...quote, grandTotal: { currency: 'USD', minorUnits: 1 } }]));
  assert.deepEqual(loadQuotes(storage, 'workspace-a'), []);
});
