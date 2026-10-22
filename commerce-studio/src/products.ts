import type { Product, ProductDraft, ProductErrors, ProductStatus } from './types';

const STORAGE_PREFIX = 'commerce-studio:products:';

export interface ProductStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function productsStorageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export function validateProduct(product: ProductDraft, workspaceCurrency: string): ProductErrors {
  const errors: ProductErrors = {};
  const requiredFields: Array<keyof ProductDraft> = ['name', 'sku', 'category', 'price'];

  for (const field of requiredFields) {
    if (!product[field].trim()) errors[field] = 'This field is required.';
  }

  if (product.sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(product.sku.trim())) {
    errors.sku = 'Use up to 64 letters, numbers, dots, dashes, or underscores.';
  }

  if (product.price.trim() && (!/^\d+(\.\d{1,2})?$/.test(product.price.trim()) || Number(product.price) <= 0)) {
    errors.price = 'Enter a positive amount with up to 2 decimal places.';
  }

  if (product.currency !== workspaceCurrency) {
    errors.currency = `Product currency must match the workspace currency (${workspaceCurrency}).`;
  }

  return errors;
}

export function loadProducts(storage: ProductStorageLike, workspaceId: string): Product[] {
  const raw = storage.getItem(productsStorageKey(workspaceId));
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProduct).map((product) => ({ ...product }));
  } catch {
    return [];
  }
}

export function saveProducts(storage: ProductStorageLike, workspaceId: string, products: Product[]): void {
  storage.setItem(productsStorageKey(workspaceId), JSON.stringify(products));
}

export function productFromDraft(draft: ProductDraft, id: string): Product {
  return { ...draft, id, status: 'active' };
}

export function archiveProduct(products: Product[], productId: string): Product[] {
  return products.map((product) => product.id === productId ? { ...product, status: 'archived' } : product);
}

export function searchProducts(products: Product[], query: string): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return products;
  return products.filter((product) => [product.name, product.sku, product.category].some((value) => value.toLowerCase().includes(normalized)));
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<Product>;
  return typeof product.id === 'string'
    && typeof product.name === 'string'
    && typeof product.sku === 'string'
    && typeof product.category === 'string'
    && typeof product.description === 'string'
    && typeof product.price === 'string'
    && typeof product.currency === 'string'
    && (product.status === 'active' || product.status === 'archived');
}
