import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Globe2,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  Save,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react';
import {
  ACTIVE_DEMO_WORKSPACE_ID,
  loadWorkspaceProfile,
  saveWorkspaceProfile,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  validateWorkspaceProfile,
} from './profile';
import { archiveProduct, loadProducts, productFromDraft, saveProducts, searchProducts, validateProduct } from './products';
import { calculateQuote, createQuote, loadQuotes, saveQuote } from './quotes';
import { formatMoney } from './money';
import { EMPTY_PROFILE, type CurrencyCode, type Product, type ProductDraft, type ProductErrors, type ProfileErrors, type Quote, type QuoteDraft, type QuoteTaxMode, type WorkspaceProfile } from './types';

const currencies = [
  { value: SUPPORTED_CURRENCIES[0], label: 'USD — US Dollar' },
  { value: SUPPORTED_CURRENCIES[1], label: 'CAD — Canadian Dollar' },
  { value: SUPPORTED_CURRENCIES[2], label: 'EUR — Euro' },
  { value: SUPPORTED_CURRENCIES[3], label: 'GBP — Pound Sterling' },
];

const locales = [
  { value: SUPPORTED_LOCALES[0], label: 'English (United States)' },
  { value: SUPPORTED_LOCALES[1], label: 'English (Canada)' },
  { value: SUPPORTED_LOCALES[2], label: 'English (United Kingdom)' },
  { value: SUPPORTED_LOCALES[3], label: 'French (Canada)' },
];

const taxPreferences = [
  { value: 'prices_exclude_tax', label: 'Prices exclude tax', hint: 'Add tax at checkout' },
  { value: 'prices_include_tax', label: 'Prices include tax', hint: 'Tax is built into prices' },
  { value: 'tax_exempt', label: 'Tax exempt', hint: 'No tax collected by default' },
] as const;

const EMPTY_PRODUCT: ProductDraft = {
  name: '', sku: '', category: '', description: '', price: '', currency: 'USD',
};

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function App() {
  const [profile, setProfile] = useState<WorkspaceProfile>(EMPTY_PROFILE);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [isSaved, setIsSaved] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasStoredProfile, setHasStoredProfile] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productDraft, setProductDraft] = useState<ProductDraft>(EMPTY_PRODUCT);
  const [productErrors, setProductErrors] = useState<ProductErrors>({});
  const [productSearch, setProductSearch] = useState('');
  const [productNotice, setProductNotice] = useState('');
  const [quoteQuantities, setQuoteQuantities] = useState<Record<string, string>>({});
  const [discountRate, setDiscountRate] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>('exclusive');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteNotice, setQuoteNotice] = useState('');
  const [quoteError, setQuoteError] = useState('');

  useEffect(() => {
    const storage = getBrowserStorage();
    const storedProfile = storage ? loadWorkspaceProfile(storage, ACTIVE_DEMO_WORKSPACE_ID) : null;
    const storedProducts = storage ? loadProducts(storage, ACTIVE_DEMO_WORKSPACE_ID) : [];
    const storedQuotes = storage ? loadQuotes(storage, ACTIVE_DEMO_WORKSPACE_ID) : [];
    if (storedProfile) {
      setProfile(storedProfile);
      setProductDraft((current) => ({ ...current, currency: storedProfile.currency }));
      setHasStoredProfile(true);
    }
    setProducts(storedProducts);
    setQuotes(storedQuotes);
    setHasLoaded(true);
  }, []);

  const isEditing = useMemo(() => hasLoaded && hasStoredProfile, [hasLoaded, hasStoredProfile]);

  function updateField(field: keyof WorkspaceProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    if (field === 'currency') setProductDraft((current) => ({ ...current, currency: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setIsSaved(false);
    setStorageError('');
  }

  function handleChange(field: keyof WorkspaceProfile) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      updateField(field, event.target.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateWorkspaceProfile(profile);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setIsSaved(false);
      document.querySelector<HTMLElement>('.field-error')?.closest('.field')?.querySelector<HTMLElement>('input, textarea, select')?.focus();
      return;
    }

    const storage = getBrowserStorage();
    if (!storage) {
      setIsSaved(false);
      setStorageError('Browser storage is unavailable. Your profile is only kept in this tab until storage is enabled.');
      return;
    }
    try {
      saveWorkspaceProfile(storage, profile, ACTIVE_DEMO_WORKSPACE_ID);
      setHasStoredProfile(true);
      setIsSaved(true);
      setStorageError('');
    } catch {
      setIsSaved(false);
      setStorageError('The profile could not be saved in this browser. Check available storage and try again.');
    }
  }

  function updateProductField(field: keyof ProductDraft, value: string) {
    setProductDraft((current) => ({ ...current, [field]: value }));
    setProductErrors((current) => ({ ...current, [field]: undefined }));
    setProductNotice('');
  }

  function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProduct(productDraft, profile.currency);
    setProductErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      document.querySelector<HTMLElement>('.catalog-section [aria-invalid="true"]')?.focus();
      return;
    }

    const storage = getBrowserStorage();
    if (!storage) {
      setProductNotice('Browser storage is unavailable. The product was not saved.');
      return;
    }
    try {
      const nextProducts = [...products, productFromDraft(productDraft, globalThis.crypto?.randomUUID?.() ?? `product-${Date.now()}`)];
      saveProducts(storage, ACTIVE_DEMO_WORKSPACE_ID, nextProducts);
      setProducts(nextProducts);
      setProductDraft({ ...EMPTY_PRODUCT, currency: profile.currency });
      setProductErrors({});
      setProductNotice('Product added to the local catalog.');
    } catch {
      setProductNotice('The product could not be saved in this browser. Check available storage and try again.');
    }
  }

  function handleArchive(productId: string) {
    const storage = getBrowserStorage();
    if (!storage) {
      setProductNotice('Browser storage is unavailable. The product was not archived.');
      return;
    }
    try {
      const nextProducts = archiveProduct(products, productId);
      saveProducts(storage, ACTIVE_DEMO_WORKSPACE_ID, nextProducts);
      setProducts(nextProducts);
      setQuoteQuantities((current) => { const next = { ...current }; delete next[productId]; return next; });
      setProductNotice('Product archived. Archived products stay in the local history.');
    } catch {
      setProductNotice('The product could not be archived in this browser.');
    }
  }

  const visibleProducts = useMemo(() => searchProducts(products.filter((product) => product.status === 'active'), productSearch), [products, productSearch]);
  const quoteDraft = useMemo<QuoteDraft>(() => ({
    workspaceId: ACTIVE_DEMO_WORKSPACE_ID,
    currency: profile.currency as CurrencyCode,
    lines: products.filter((product) => product.status === 'active' && quoteQuantities[product.id] !== undefined)
      .map((product) => ({ product, quantity: Number(quoteQuantities[product.id]) })),
    discountRate,
    taxRate,
    taxMode,
  }), [products, profile.currency, quoteQuantities, discountRate, taxRate, taxMode]);
  const quoteCalculation = useMemo(() => {
    if (!quoteDraft.lines.length) return null;
    try { return calculateQuote(quoteDraft); } catch { return null; }
  }, [quoteDraft]);
  const activeQuoteLines = quoteDraft.lines;

  function addProductToQuote(productId: string) {
    setQuoteQuantities((current) => ({ ...current, [productId]: current[productId] ?? '1' }));
    setQuoteNotice('Product added to the quote draft.');
    setQuoteError('');
  }

  function updateQuoteQuantity(productId: string, value: string) {
    setQuoteQuantities((current) => ({ ...current, [productId]: value }));
    setQuoteNotice('');
    setQuoteError('');
  }

  function removeQuoteLine(productId: string) {
    setQuoteQuantities((current) => { const next = { ...current }; delete next[productId]; return next; });
    setQuoteNotice('');
  }

  function handleSaveQuote() {
    if (!hasStoredProfile) { setQuoteError('Save the workspace profile before saving a quote.'); return; }
    try {
      const quote = createQuote(quoteDraft, globalThis.crypto?.randomUUID?.() ?? `quote-${Date.now()}`, new Date().toISOString());
      const storage = getBrowserStorage();
      if (!storage) { setQuoteError('Browser storage is unavailable. The quote was not saved.'); return; }
      saveQuote(storage, ACTIVE_DEMO_WORKSPACE_ID, quote);
      setQuotes((current) => [...current.filter((existing) => existing.id !== quote.id), quote]);
      setQuoteNotice('Quote saved locally with product snapshots and deterministic totals.');
      setQuoteError('');
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'The quote could not be saved.');
      setQuoteNotice('');
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={18} /></div>
          <span>Commerce Studio</span>
          <span className="prototype-pill">Prototype</span>
        </div>
        <div className="hero-content">
          <p className="eyebrow">A calm starting point for selling well</p>
          <h1 id="hero-title">Make your business the source of truth.</h1>
          <p className="hero-copy">Set up the workspace details your commerce team will use across catalogs, orders, and customer conversations.</p>
          <div className="hero-list">
            <div className="hero-list-item"><span className="hero-list-icon"><Check size={16} /></span><span>One profile for your storefront essentials</span></div>
            <div className="hero-list-item"><span className="hero-list-icon"><Check size={16} /></span><span>Clear defaults for currency, locale, and tax</span></div>
            <div className="hero-list-item"><span className="hero-list-icon"><Check size={16} /></span><span>Ready for the next commerce workflow</span></div>
          </div>
        </div>
        <div className="hero-footer"><ShieldCheck size={16} /><span>Demo data stays in this browser, scoped to one workspace.</span></div>
      </section>

      <section className="form-panel" aria-labelledby="form-title">
        <div className="form-header">
          <div>
            <p className="eyebrow">Workspace onboarding</p>
            <h2 id="form-title">{isEditing ? 'Update your workspace' : 'Create your workspace'}</h2>
            <p className="form-intro">Start with the details that keep your business identity consistent.</p>
          </div>
          <div className="workspace-avatar" aria-hidden="true"><Building2 size={21} /></div>
        </div>

        <div className="boundary-note"><ShieldCheck size={17} /><div><strong>Local demo boundary</strong><span>Saved only for <code>{ACTIVE_DEMO_WORKSPACE_ID}</code>. No AI, billing, or external services are connected.</span></div></div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <div className="section-heading"><span className="section-number">01</span><div><h3>Workspace identity</h3><p>How your team will recognize this workspace.</p></div></div>
            <div className="field-grid two-columns">
              <div className="field"><label htmlFor="workspaceName">Workspace name <span>*</span></label><input id="workspaceName" value={profile.workspaceName} onChange={handleChange('workspaceName')} placeholder="Northstar Commerce" aria-invalid={Boolean(errors.workspaceName)} aria-describedby="workspaceName-error" /> <FieldError id="workspaceName-error" message={errors.workspaceName} /></div>
              <div className="field"><label htmlFor="businessDisplayName">Business display name <span>*</span></label><input id="businessDisplayName" value={profile.businessDisplayName} onChange={handleChange('businessDisplayName')} placeholder="Northstar Goods" aria-invalid={Boolean(errors.businessDisplayName)} aria-describedby="businessDisplayName-error" /> <FieldError id="businessDisplayName-error" message={errors.businessDisplayName} /></div>
            </div>
            <div className="field"><label htmlFor="legalName">Legal business name <span>*</span></label><input id="legalName" value={profile.legalName} onChange={handleChange('legalName')} placeholder="Northstar Goods, LLC" aria-invalid={Boolean(errors.legalName)} aria-describedby="legalName-error" /> <FieldError id="legalName-error" message={errors.legalName} /></div>
          </div>

          <div className="form-section">
            <div className="section-heading"><span className="section-number">02</span><div><h3>Business contact</h3><p>Where customers and partners can reach you.</p></div></div>
            <div className="field"><label htmlFor="address"><MapPin size={14} /> Business address <span>*</span></label><textarea id="address" value={profile.address} onChange={handleChange('address')} placeholder="123 Market Street\nSan Francisco, CA 94105" rows={3} aria-invalid={Boolean(errors.address)} aria-describedby="address-error" /> <FieldError id="address-error" message={errors.address} /></div>
            <div className="field-grid two-columns">
              <div className="field"><label htmlFor="email"><Mail size={14} /> Business email <span>*</span></label><input id="email" type="email" value={profile.email} onChange={handleChange('email')} placeholder="hello@northstar.example" aria-invalid={Boolean(errors.email)} aria-describedby="email-error" /> <FieldError id="email-error" message={errors.email} /></div>
              <div className="field"><label htmlFor="phone"><Phone size={14} /> Business phone <span>*</span></label><input id="phone" type="tel" value={profile.phone} onChange={handleChange('phone')} placeholder="+1 (415) 555-0142" aria-invalid={Boolean(errors.phone)} aria-describedby="phone-error" /> <FieldError id="phone-error" message={errors.phone} /></div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-heading"><span className="section-number">03</span><div><h3>Commerce defaults</h3><p>Choose the starting rules for your storefront.</p></div></div>
            <div className="field-grid two-columns">
               <div className="field"><label htmlFor="currency"><Store size={14} /> Default currency <span>*</span></label><select id="currency" value={profile.currency} onChange={handleChange('currency')} aria-invalid={Boolean(errors.currency)} aria-describedby="currency-error">{currencies.map((currency) => <option key={currency.value} value={currency.value}>{currency.label}</option>)}</select><FieldError id="currency-error" message={errors.currency} /></div>
               <div className="field"><label htmlFor="locale"><Globe2 size={14} /> Locale <span>*</span></label><select id="locale" value={profile.locale} onChange={handleChange('locale')} aria-invalid={Boolean(errors.locale)} aria-describedby="locale-error">{locales.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}</select><FieldError id="locale-error" message={errors.locale} /></div>
            </div>
             <fieldset className="tax-fieldset" aria-invalid={Boolean(errors.taxPreference)} aria-describedby="taxPreference-error"><legend>Tax preference <span>*</span></legend><div className="tax-options">{taxPreferences.map((option) => <label className={`tax-option ${profile.taxPreference === option.value ? 'selected' : ''}`} key={option.value}><input type="radio" name="taxPreference" value={option.value} checked={profile.taxPreference === option.value} onChange={handleChange('taxPreference')} /><span className="radio-mark" /><span><strong>{option.label}</strong><small>{option.hint}</small></span></label>)}</div><FieldError id="taxPreference-error" message={errors.taxPreference} /></fieldset>
          </div>

           {storageError && <p className="storage-error" role="alert">{storageError}</p>}
           <div className="form-actions">
            <div className={`save-status ${isSaved ? 'visible' : ''}`} role="status" aria-live="polite"><CheckCircle2 size={17} /><span>Workspace profile saved locally.</span></div>
            <button className="primary-button" type="submit"><Save size={17} />{isEditing ? 'Update profile' : 'Save profile'}<ArrowRight size={16} /></button>
           </div>
         </form>

         <section className="catalog-section" aria-labelledby="catalog-title">
           <div className="section-heading"><span className="section-number">04</span><div><h3 id="catalog-title">Product catalog</h3><p>Build reusable line items before catalogues and quotations.</p></div></div>
           {!hasStoredProfile ? <div className="catalog-boundary"><Package size={18} /><span>Save the workspace profile first. Product prices will use the selected workspace currency.</span></div> : <>
             <form className="product-form" onSubmit={handleProductSubmit} noValidate>
               <div className="field-grid two-columns">
                 <div className="field"><label htmlFor="productName">Product name <span>*</span></label><input id="productName" value={productDraft.name} onChange={(event) => updateProductField('name', event.target.value)} aria-invalid={Boolean(productErrors.name)} /><FieldError id="product-name-error" message={productErrors.name} /></div>
                 <div className="field"><label htmlFor="productSku">SKU <span>*</span></label><input id="productSku" value={productDraft.sku} onChange={(event) => updateProductField('sku', event.target.value)} aria-invalid={Boolean(productErrors.sku)} /><FieldError id="product-sku-error" message={productErrors.sku} /></div>
                 <div className="field"><label htmlFor="productCategory">Category <span>*</span></label><input id="productCategory" value={productDraft.category} onChange={(event) => updateProductField('category', event.target.value)} aria-invalid={Boolean(productErrors.category)} /><FieldError id="product-category-error" message={productErrors.category} /></div>
                 <div className="field"><label htmlFor="productPrice">Price ({profile.currency}) <span>*</span></label><input id="productPrice" inputMode="decimal" value={productDraft.price} onChange={(event) => updateProductField('price', event.target.value)} aria-invalid={Boolean(productErrors.price)} /><FieldError id="product-price-error" message={productErrors.price} /></div>
               </div>
               <div className="field"><label htmlFor="productDescription">Description</label><textarea id="productDescription" value={productDraft.description} onChange={(event) => updateProductField('description', event.target.value)} rows={2} placeholder="Short factual description for future catalog and quote drafts." /></div>
               <div className="product-form-actions"><div><span className="product-currency-note">Currency locked to workspace default: {profile.currency}</span>{productErrors.currency && <p className="field-error">{productErrors.currency}</p>}</div><button className="secondary-button" type="submit"><Package size={16} />Add product</button></div>
             </form>
             {productNotice && <p className="storage-error" role="status">{productNotice}</p>}
             <div className="catalog-toolbar"><label className="search-field" htmlFor="productSearch"><Search size={15} /><span className="sr-only">Search products</span><input id="productSearch" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search name, SKU, or category" /></label><span className="catalog-count">{visibleProducts.length} active product{visibleProducts.length === 1 ? '' : 's'}</span></div>
              {visibleProducts.length ? <div className="product-list">{visibleProducts.map((product) => <article className="product-card" key={product.id}><div><div className="product-card-meta"><span>{product.category}</span><code>{product.sku}</code></div><h4>{product.name}</h4><p>{product.description || 'No description added yet.'}</p></div><div className="product-card-side"><strong>{product.currency} {product.price}</strong><div className="product-card-actions"><button className="quote-add-button" type="button" onClick={() => addProductToQuote(product.id)}>{quoteQuantities[product.id] !== undefined ? 'Added' : 'Add to quote'}</button><button className="archive-button" type="button" onClick={() => handleArchive(product.id)}>Archive</button></div></div></article>)}</div> : <div className="catalog-empty"><Package size={20} /><span>{products.length ? 'No active products match this search.' : 'No products yet. Add the first reusable line item above.'}</span></div>}
            </>}
          </section>

          <section className="quote-section" aria-labelledby="quote-title">
            <div className="section-heading"><span className="section-number">05</span><div><h3 id="quote-title">Quotation builder</h3><p>Review deterministic totals before the future PDF/share workflow.</p></div></div>
            {!hasStoredProfile ? <div className="catalog-boundary"><ReceiptText size={18} /><span>Save the workspace profile before creating a quote.</span></div> : !products.some((product) => product.status === 'active') ? <div className="catalog-boundary"><ReceiptText size={18} /><span>Add an active product to start a quote.</span></div> : <>
              <div className="quote-controls">
                <label className="field"><span>Discount (%)</span><input inputMode="decimal" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} /></label>
                <label className="field"><span>Tax rate (%)</span><input inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label>
                <label className="field"><span>Tax treatment</span><select value={taxMode} onChange={(event) => setTaxMode(event.target.value as QuoteTaxMode)}><option value="exclusive">Tax added to prices</option><option value="inclusive">Tax included in prices</option></select></label>
              </div>
              {activeQuoteLines.length ? <div className="quote-lines">{activeQuoteLines.map((line) => <div className="quote-line" key={line.product.id}><div><strong>{line.product.name}</strong><span>{line.product.sku} · {line.product.currency} {line.product.price}</span></div><label><span className="sr-only">Quantity for {line.product.name}</span><input aria-label={`Quantity for ${line.product.name}`} type="number" min="1" step="1" value={quoteQuantities[line.product.id]} onChange={(event) => updateQuoteQuantity(line.product.id, event.target.value)} /></label><button className="archive-button" type="button" onClick={() => removeQuoteLine(line.product.id)}>Remove</button></div>)}</div> : <div className="catalog-empty"><ReceiptText size={20} /><span>Choose “Add to quote” on an active product above.</span></div>}
              <div className="quote-summary">
                <div><span>Subtotal</span><strong>{quoteCalculation ? `${quoteCalculation.currency} ${formatMoney(quoteCalculation.subtotal)}` : '—'}</strong></div>
                <div><span>Discount</span><strong>{quoteCalculation ? `− ${quoteCalculation.currency} ${formatMoney(quoteCalculation.discount)}` : '—'}</strong></div>
                <div><span>Taxable subtotal</span><strong>{quoteCalculation ? `${quoteCalculation.currency} ${formatMoney(quoteCalculation.taxableSubtotal)}` : '—'}</strong></div>
                <div><span>Tax</span><strong>{quoteCalculation ? `${quoteCalculation.currency} ${formatMoney(quoteCalculation.tax)}` : '—'}</strong></div>
                <div className="quote-total"><span>Grand total</span><strong>{quoteCalculation ? `${quoteCalculation.currency} ${formatMoney(quoteCalculation.grandTotal)}` : '—'}</strong></div>
              </div>
              {quoteError && <p className="storage-error" role="alert">{quoteError}</p>}
              {quoteNotice && <p className="storage-error quote-success" role="status">{quoteNotice}</p>}
              <div className="quote-actions"><span className="product-currency-note">Integer minor units · half-up rounding · local draft</span><button className="secondary-button" type="button" onClick={handleSaveQuote} disabled={!quoteCalculation}><ReceiptText size={16} />Save quote</button></div>
              {quotes.length > 0 && <p className="quote-history">{quotes.length} local quote{quotes.length === 1 ? '' : 's'} saved for this workspace. Latest: {new Date(quotes[quotes.length - 1].createdAt).toLocaleString()}</p>}
            </>}
          </section>
        </section>
    </main>
  );
}

export default App;
