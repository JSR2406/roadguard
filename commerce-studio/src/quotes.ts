import type {
  CurrencyCode,
  Product,
  Quote,
  QuoteCalculation,
  QuoteDraft,
  QuoteLine,
  QuoteTaxMode,
  QuoteTotals,
  RateInput,
} from './types';
import {
  applyRateHalfUp,
  isSupportedCurrency,
  moneyFromMinorUnits,
  normalizeRate,
  parseMoney,
  RATE_DENOMINATOR,
  rateToUnits,
  roundHalfUp,
} from './money.ts';

const STORAGE_PREFIX = 'commerce-studio:quotes:';

export interface QuoteStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface QuoteValidationErrors {
  workspaceId?: string;
  currency?: string;
  lines?: string;
  discountRate?: string;
  taxRate?: string;
  taxMode?: string;
  lineQuantities?: string[];
}

export class QuoteValidationError extends Error {
  readonly code:
    | 'invalid_workspace'
    | 'invalid_currency'
    | 'empty_lines'
    | 'invalid_quantity'
    | 'invalid_rate'
    | 'invalid_tax_mode'
    | 'mixed_currency'
    | 'archived_product'
    | 'invalid_product_price'
    | 'invalid_quote';

  constructor(code: QuoteValidationError['code'], message: string) {
    super(message);
    this.name = 'QuoteValidationError';
    this.code = code;
  }
}

export function quotesStorageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export const quoteStorageKey = quotesStorageKey;

export function validateQuantity(quantity: number): string | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return 'Quantity must be a positive whole number.';
  return null;
}

export function validateQuoteDraft(draft: QuoteDraft): QuoteValidationErrors {
  const errors: QuoteValidationErrors = {};
  if (!draft.workspaceId.trim()) errors.workspaceId = 'Workspace is required.';
  if (!isSupportedCurrency(draft.currency)) errors.currency = 'Choose a supported two-decimal currency.';
  if (!Array.isArray(draft.lines) || draft.lines.length === 0) errors.lines = 'Add at least one quote line.';

  const discountError = rateError(draft.discountRate);
  if (discountError) errors.discountRate = discountError;
  const taxError = rateError(draft.taxRate);
  if (taxError) errors.taxRate = taxError;
  if (draft.taxMode !== 'exclusive' && draft.taxMode !== 'inclusive') errors.taxMode = 'Choose tax-inclusive or tax-exclusive pricing.';

  const quantities: string[] = [];
  if (Array.isArray(draft.lines)) {
    draft.lines.forEach((line, index) => {
      const quantityError = validateQuantity(line.quantity);
      if (quantityError) quantities[index] = quantityError;
      if (isSupportedCurrency(draft.currency) && line.product.currency !== draft.currency) {
        errors.lines ??= 'Every quote line must use the workspace currency.';
      }
    });
  }
  if (quantities.some(Boolean)) errors.lineQuantities = quantities;

  return errors;
}

function rateError(value: RateInput): string | null {
  try {
    normalizeRate(value);
    return null;
  } catch {
    return 'Enter a percentage from 0 to 100 with up to 4 decimal places.';
  }
}

function assertQuoteDraft(draft: QuoteDraft): void {
  const errors = validateQuoteDraft(draft);
  if (errors.workspaceId) throw new QuoteValidationError('invalid_workspace', errors.workspaceId);
  if (errors.currency) throw new QuoteValidationError('invalid_currency', errors.currency);
  if (errors.lines === 'Add at least one quote line.') throw new QuoteValidationError('empty_lines', errors.lines);
  if (errors.discountRate || errors.taxRate) throw new QuoteValidationError('invalid_rate', errors.discountRate ?? errors.taxRate ?? 'Invalid rate.');
  if (errors.taxMode) throw new QuoteValidationError('invalid_tax_mode', errors.taxMode);
  if (errors.lineQuantities) throw new QuoteValidationError('invalid_quantity', errors.lineQuantities.find(Boolean) ?? 'Invalid quantity.');
  if (errors.lines) throw new QuoteValidationError('mixed_currency', errors.lines);
}

function lineFromProduct(product: Product, quantity: number, workspaceCurrency: CurrencyCode): QuoteLine {
  if (product.status === 'archived') throw new QuoteValidationError('archived_product', `Product ${product.id} is archived.`);
  if (product.currency !== workspaceCurrency) throw new QuoteValidationError('mixed_currency', 'Every quote line must use the workspace currency.');

  let unitPrice;
  try {
    unitPrice = parseMoney(product.price, workspaceCurrency);
  } catch {
    throw new QuoteValidationError('invalid_product_price', `Product ${product.id} has an invalid price.`);
  }
  const lineSubtotalMinor = unitPrice.minorUnits * quantity;
  if (!Number.isSafeInteger(lineSubtotalMinor)) throw new QuoteValidationError('invalid_product_price', `Product ${product.id} total is outside the safe integer range.`);

  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    currency: workspaceCurrency,
    unitPrice,
    quantity,
    lineSubtotal: moneyFromMinorUnits(lineSubtotalMinor, workspaceCurrency),
  };
}

export function calculateQuote(draft: QuoteDraft): QuoteCalculation {
  assertQuoteDraft(draft);
  const currency = draft.currency;
  const lines = draft.lines.map((line) => lineFromProduct(line.product, line.quantity, currency));
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineSubtotal.minorUnits, 0);
  if (!Number.isSafeInteger(subtotalMinor)) throw new QuoteValidationError('invalid_quote', 'Quote subtotal is outside the safe integer range.');

  const discountRate = normalizeRate(draft.discountRate);
  const taxRate = normalizeRate(draft.taxRate);
  const taxRateUnits = rateToUnits(draft.taxRate);
  const discountMinor = applyRateHalfUp(subtotalMinor, draft.discountRate);
  const taxableOrGrossMinor = subtotalMinor - discountMinor;
  let taxableSubtotalMinor: number;
  let taxMinor: number;
  let grandTotalMinor: number;

  if (draft.taxMode === 'exclusive') {
    taxableSubtotalMinor = taxableOrGrossMinor;
    taxMinor = applyRateHalfUp(taxableSubtotalMinor, draft.taxRate);
    grandTotalMinor = taxableSubtotalMinor + taxMinor;
  } else {
    grandTotalMinor = taxableOrGrossMinor;
    // For inclusive prices, round the tax portion first and make the net amount the remainder.
    taxMinor = roundHalfUp(taxableOrGrossMinor * taxRateUnits, RATE_DENOMINATOR + taxRateUnits);
    taxableSubtotalMinor = grandTotalMinor - taxMinor;
  }

  const totals: QuoteTotals = {
    subtotal: moneyFromMinorUnits(subtotalMinor, currency),
    discount: moneyFromMinorUnits(discountMinor, currency),
    taxableSubtotal: moneyFromMinorUnits(taxableSubtotalMinor, currency),
    tax: moneyFromMinorUnits(taxMinor, currency),
    grandTotal: moneyFromMinorUnits(grandTotalMinor, currency),
  };
  return { currency, lines, discountRate, taxRate, taxMode: draft.taxMode, ...totals };
}

export function createQuote(draft: QuoteDraft, id: string, createdAt = '1970-01-01T00:00:00.000Z'): Quote {
  if (!id.trim()) throw new QuoteValidationError('invalid_quote', 'Quote id is required.');
  return { id, workspaceId: draft.workspaceId, createdAt, ...calculateQuote(draft) };
}

export function saveQuote(storage: QuoteStorageLike, workspaceId: string, quote: Quote): void {
  const normalized = normalizeQuote(quote, workspaceId);
  if (!normalized) throw new QuoteValidationError('invalid_quote', 'Cannot save an invalid quote.');
  const quotes = loadQuotes(storage, workspaceId).filter((existing) => existing.id !== normalized.id);
  storage.setItem(quotesStorageKey(workspaceId), JSON.stringify([...quotes, normalized]));
}

export function saveQuotes(storage: QuoteStorageLike, workspaceId: string, quotes: Quote[]): void {
  const normalized = quotes.map((quote) => normalizeQuote(quote, workspaceId)).filter((quote): quote is Quote => quote !== null);
  storage.setItem(quotesStorageKey(workspaceId), JSON.stringify(normalized));
}

export function loadQuotes(storage: QuoteStorageLike, workspaceId: string): Quote[] {
  const raw = storage.getItem(quotesStorageKey(workspaceId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => normalizeQuote(value, workspaceId)).filter((quote): quote is Quote => quote !== null);
  } catch {
    return [];
  }
}

export function loadQuote(storage: QuoteStorageLike, workspaceId: string, quoteId: string): Quote | null {
  return loadQuotes(storage, workspaceId).find((quote) => quote.id === quoteId) ?? null;
}

export function normalizeQuote(value: unknown, workspaceId: string): Quote | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Quote>;
  if (candidate.workspaceId !== workspaceId || typeof candidate.id !== 'string' || !candidate.id || typeof candidate.createdAt !== 'string') return null;
  const candidateCurrency = candidate.currency;
  if (!candidateCurrency || !isSupportedCurrency(candidateCurrency) || !Array.isArray(candidate.lines) || candidate.lines.length === 0) return null;
  const currency: CurrencyCode = candidateCurrency;
  if (candidate.taxMode !== 'exclusive' && candidate.taxMode !== 'inclusive') return null;

  try {
    const discountRate = normalizeRate(candidate.discountRate as RateInput);
    const taxRate = normalizeRate(candidate.taxRate as RateInput);
    const lines = candidate.lines.map(normalizeLine);
    if (lines.some((line) => line === null)) return null;
    const normalizedLines = lines as QuoteLine[];
    if (normalizedLines.some((line) => line.currency !== currency)) return null;
    const totals = normalizeTotals(candidate, currency);
    if (!totals) return null;
    const subtotalMinor = normalizedLines.reduce((sum, line) => sum + line.lineSubtotal.minorUnits, 0);
    const discountMinor = applyRateHalfUp(subtotalMinor, discountRate);
    const afterDiscountMinor = subtotalMinor - discountMinor;
    const expectedTaxMinor = candidate.taxMode === 'exclusive'
      ? applyRateHalfUp(afterDiscountMinor, taxRate)
      : roundHalfUp(afterDiscountMinor * rateToUnits(taxRate), RATE_DENOMINATOR + rateToUnits(taxRate));
    const expectedTaxableMinor = candidate.taxMode === 'exclusive'
      ? afterDiscountMinor
      : afterDiscountMinor - expectedTaxMinor;
    const expectedGrandTotalMinor = candidate.taxMode === 'exclusive'
      ? expectedTaxableMinor + expectedTaxMinor
      : afterDiscountMinor;
    if (totals.subtotal.minorUnits !== subtotalMinor
      || totals.discount.minorUnits !== discountMinor
      || totals.taxableSubtotal.minorUnits !== expectedTaxableMinor
      || totals.tax.minorUnits !== expectedTaxMinor
      || totals.grandTotal.minorUnits !== expectedGrandTotalMinor) return null;
    return { ...candidate, currency, lines: normalizedLines, discountRate, taxRate, ...totals } as Quote;
  } catch {
    return null;
  }
}

function normalizeLine(value: unknown): QuoteLine | null {
  if (!value || typeof value !== 'object') return null;
  const line = value as Partial<QuoteLine>;
  const lineCurrency = line.currency;
  const lineQuantity = line.quantity;
  if (typeof line.productId !== 'string' || typeof line.name !== 'string' || typeof line.sku !== 'string' || !lineCurrency || !isSupportedCurrency(lineCurrency) || lineQuantity === undefined || validateQuantity(lineQuantity)) return null;
  const currency: CurrencyCode = lineCurrency;
  const quantity = lineQuantity;
  if (!line.unitPrice || line.unitPrice.currency !== currency || !Number.isSafeInteger(line.unitPrice.minorUnits) || line.unitPrice.minorUnits < 0) return null;
  if (!line.lineSubtotal || line.lineSubtotal.currency !== currency || !Number.isSafeInteger(line.lineSubtotal.minorUnits) || line.lineSubtotal.minorUnits !== line.unitPrice.minorUnits * quantity) return null;
  return {
    productId: line.productId,
    name: line.name,
    sku: line.sku,
    currency,
    unitPrice: moneyFromMinorUnits(line.unitPrice.minorUnits, currency),
    quantity,
    lineSubtotal: moneyFromMinorUnits(line.lineSubtotal.minorUnits, currency),
  };
}

function normalizeTotals(candidate: Partial<Quote>, currency: CurrencyCode): QuoteTotals | null {
  const fields: Array<keyof QuoteTotals> = ['subtotal', 'discount', 'taxableSubtotal', 'tax', 'grandTotal'];
  for (const field of fields) {
    const value = candidate[field];
    if (!value || value.currency !== currency || !Number.isSafeInteger(value.minorUnits) || value.minorUnits < 0) return null;
  }
  return {
    subtotal: moneyFromMinorUnits(candidate.subtotal!.minorUnits, currency),
    discount: moneyFromMinorUnits(candidate.discount!.minorUnits, currency),
    taxableSubtotal: moneyFromMinorUnits(candidate.taxableSubtotal!.minorUnits, currency),
    tax: moneyFromMinorUnits(candidate.tax!.minorUnits, currency),
    grandTotal: moneyFromMinorUnits(candidate.grandTotal!.minorUnits, currency),
  };
}
