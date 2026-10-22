export type TaxPreference = 'prices_exclude_tax' | 'prices_include_tax' | 'tax_exempt';

export interface WorkspaceProfile {
  workspaceName: string;
  businessDisplayName: string;
  legalName: string;
  address: string;
  email: string;
  phone: string;
  currency: string;
  locale: string;
  taxPreference: TaxPreference;
}

export type ProfileErrors = Partial<Record<keyof WorkspaceProfile, string>>;

export type ProductStatus = 'active' | 'archived';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: string;
  currency: string;
  status: ProductStatus;
}

export type ProductDraft = Omit<Product, 'id' | 'status'>;
export type ProductErrors = Partial<Record<keyof ProductDraft, string>>;

/** The currencies supported by the browser-only commerce demo. */
export type CurrencyCode = 'USD' | 'CAD' | 'EUR' | 'GBP';

/** A two-decimal currency amount represented without floating-point arithmetic. */
export interface Money {
  currency: CurrencyCode;
  minorUnits: number;
}

export type QuoteTaxMode = 'exclusive' | 'inclusive';
export type RateInput = number | string;

export interface QuoteLineInput {
  product: Product;
  quantity: number;
}

/** Product values copied into a quote so later catalog edits cannot change it. */
export interface QuoteLine {
  productId: string;
  name: string;
  sku: string;
  currency: CurrencyCode;
  unitPrice: Money;
  quantity: number;
  lineSubtotal: Money;
}

export interface QuoteDraft {
  workspaceId: string;
  currency: CurrencyCode;
  lines: QuoteLineInput[];
  discountRate: RateInput;
  taxRate: RateInput;
  taxMode: QuoteTaxMode;
}

export interface QuoteTotals {
  subtotal: Money;
  discount: Money;
  taxableSubtotal: Money;
  tax: Money;
  grandTotal: Money;
}

export interface QuoteCalculation extends QuoteTotals {
  currency: CurrencyCode;
  lines: QuoteLine[];
  discountRate: number;
  taxRate: number;
  taxMode: QuoteTaxMode;
}

export interface Quote extends QuoteCalculation {
  id: string;
  workspaceId: string;
  createdAt: string;
}

export const EMPTY_PROFILE: WorkspaceProfile = {
  workspaceName: '',
  businessDisplayName: '',
  legalName: '',
  address: '',
  email: '',
  phone: '',
  currency: 'USD',
  locale: 'en-US',
  taxPreference: 'prices_exclude_tax',
};
