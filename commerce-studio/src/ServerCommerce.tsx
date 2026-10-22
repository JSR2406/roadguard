import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, FileText, Package, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { formatMoney } from './money';
import type { Product, Quote, QuoteTaxMode, WorkspaceProfile } from './types';
import { ApiError, requestErrorMessage, serverApi, useRequestScope } from './server-api';

interface Props {
  token: string;
  profile: WorkspaceProfile;
  disabled: boolean;
  onUnauthorized: (token: string) => void;
}
type DraftLine = { key: number; productId: string; quantity: string };
const emptyProduct = { name: '', sku: '', category: '', description: '', price: '' };

function QuoteDetail({ quote }: { quote: Quote }) {
  return <section className="server-quote-detail" aria-labelledby="server-quote-detail-title">
    <h3 id="server-quote-detail-title">Saved quote snapshot</h3>
    <p className="server-help">{quote.id}<br />{new Date(quote.createdAt).toLocaleString()} · {quote.currency} · {quote.taxMode === 'inclusive' ? 'Tax included' : 'Tax added'}</p>
    <div className="server-table-scroll"><table className="server-table">
      <caption>Product names and prices captured when this quote was saved</caption>
      <thead><tr><th scope="col">Product / SKU</th><th scope="col">Unit price</th><th scope="col">Qty</th><th scope="col">Line subtotal</th></tr></thead>
      <tbody>{quote.lines.map((line) => <tr key={line.productId}><th scope="row">{line.name}<small>{line.sku}</small></th><td>{line.currency} {formatMoney(line.unitPrice)}</td><td>{line.quantity}</td><td>{line.currency} {formatMoney(line.lineSubtotal)}</td></tr>)}</tbody>
    </table></div>
    <dl className="server-totals">
      <div><dt>Subtotal</dt><dd>{quote.currency} {formatMoney(quote.subtotal)}</dd></div>
      <div><dt>Discount ({quote.discountRate}%)</dt><dd>−{quote.currency} {formatMoney(quote.discount)}</dd></div>
      <div><dt>Taxable subtotal</dt><dd>{quote.currency} {formatMoney(quote.taxableSubtotal)}</dd></div>
      <div><dt>{quote.taxMode === 'inclusive' ? 'Included tax' : 'Tax'} ({quote.taxRate}%)</dt><dd>{quote.currency} {formatMoney(quote.tax)}</dd></div>
      <div className="server-grand-total"><dt>Grand total</dt><dd>{quote.currency} {formatMoney(quote.grandTotal)}</dd></div>
    </dl>
  </section>;
}

export default function ServerCommerce({ token, profile, disabled, onUnauthorized }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productDraft, setProductDraft] = useState(emptyProduct);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [archiveCandidate, setArchiveCandidate] = useState<Product | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([{ key: 0, productId: '', quantity: '1' }]);
  const nextLineKey = useRef(1);
  const [discountRate, setDiscountRate] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>(profile.taxPreference === 'prices_include_tax' ? 'inclusive' : 'exclusive');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const { begin } = useRequestScope(token);

  const handleFailure = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) onUnauthorized(token);
    else setError(requestErrorMessage(failure));
  }, [onUnauthorized, token]);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const ticket = begin();
    setLoading(true); setError(''); setNotice('');
    try {
      const [catalog, savedQuotes] = await Promise.all([
        serverApi<{ products: Product[] }>('/api/products', { signal: ticket.signal }, token),
        serverApi<{ quotes: Quote[] }>('/api/quotes', { signal: ticket.signal }, token),
      ]);
      if (!ticket.isCurrent()) return;
      setProducts(catalog.products); setQuotes(savedQuotes.quotes); setLoaded(true);
      setArchiveCandidate(null);
    } catch (failure) {
      if (ticket.isCurrent()) handleFailure(failure);
    } finally {
      if (ticket.isCurrent()) { pending.current = false; setLoading(false); }
    }
  }, [begin, handleFailure, token]);

  useEffect(() => { void refresh(); return () => { pending.current = false; }; }, [refresh]);

  async function mutation<T>(action: string, path: string, method: string, body: unknown, apply: (result: T) => void, success: string) {
    if (pending.current || disabled) return;
    pending.current = true;
    const ticket = begin();
    setBusy(action); setError(''); setNotice('');
    try {
      const result = await serverApi<T>(path, { method, body: JSON.stringify(body), signal: ticket.signal }, token);
      if (!ticket.isCurrent()) return;
      apply(result); setNotice(success);
    } catch (failure) {
      if (ticket.isCurrent()) handleFailure(failure);
    } finally {
      if (ticket.isCurrent()) { pending.current = false; setBusy(''); }
    }
  }

  function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation<Product>('product', '/api/products', 'POST', { ...productDraft, currency: profile.currency }, (saved) => {
      setProducts((current) => [...current, saved]); setProductDraft(emptyProduct);
    }, 'Product saved on the server.');
  }

  function archiveProduct() {
    if (!archiveCandidate) return;
    void mutation<Product>('archive', `/api/products/${encodeURIComponent(archiveCandidate.id)}/archive`, 'PATCH', {}, (saved) => {
      setProducts((current) => current.map((product) => product.id === saved.id ? saved : product));
      setArchiveCandidate(null);
    }, 'Product archived on the server. Existing saved quotes retain their snapshots.');
  }

  function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eligibleIds = new Set(eligibleProducts.map((product) => product.id));
    if (lines.some((line) => !eligibleIds.has(line.productId))) {
      setNotice(''); setError('Choose an active product in the workspace currency for every quote line.'); return;
    }
    void mutation<Quote>('quote', '/api/quotes', 'POST', {
      lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
      discountRate, taxRate: profile.taxPreference === 'tax_exempt' ? '0' : taxRate, taxMode,
    }, (saved) => {
      setQuotes((current) => [saved, ...current]); setSelectedQuote(saved);
      setLines([{ key: nextLineKey.current++, productId: '', quantity: '1' }]); setDiscountRate('0'); setTaxRate('0');
    }, 'Quote saved. The totals below were calculated by the server.');
  }

  async function openQuote(id: string) {
    if (pending.current || disabled) return;
    pending.current = true;
    const ticket = begin();
    setBusy('detail'); setSelectedQuote(null); setError(''); setNotice('');
    try {
      const saved = await serverApi<Quote>(`/api/quotes/${encodeURIComponent(id)}`, { signal: ticket.signal }, token);
      if (ticket.isCurrent()) setSelectedQuote(saved);
    } catch (failure) {
      if (ticket.isCurrent()) handleFailure(failure);
    } finally {
      if (ticket.isCurrent()) { pending.current = false; setBusy(''); }
    }
  }

  function clearFeedback() { setError(''); setNotice(''); }
  const locked = disabled || loading || !!busy;
  const eligibleProducts = products.filter((product) => product.status === 'active' && product.currency === profile.currency);
  const query = search.trim().toLocaleLowerCase();
  const filteredProducts = products.filter((product) => (statusFilter === 'all' || product.status === statusFilter)
    && [product.name, product.sku, product.category, product.description].some((value) => value.toLocaleLowerCase().includes(query)));

  return <section className="server-card server-commerce" aria-label="Server products and quotes" aria-busy={loading || !!busy}>
    <header className="server-section-header"><div><div className="server-kicker">CATALOG & QUOTES · {profile.currency}</div><h2>Your sales workspace</h2></div><button className="server-logout" disabled={locked} type="button" onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />Refresh lists</button></header>
    {error && <p className="server-error" role="alert">{error}</p>}
    {notice && <p className="server-notice" role="status">{notice}</p>}
    {loading && <p className="server-help" role="status">Loading products and saved quotes…</p>}
    {!loading && !loaded && <p className="server-help">The workspace data could not be loaded. Start the API if needed, then use Refresh lists.</p>}
    <fieldset className="server-fieldset server-commerce-content" disabled={locked || !loaded}>
      <section aria-labelledby="server-products-title">
        <h2 id="server-products-title"><Package size={20} aria-hidden="true" />Products</h2>
        <div className="server-commerce-columns">
          <form className="server-form server-inset" onSubmit={createProduct} onChange={clearFeedback}>
            <h3>Add product</h3>
            <label className="server-field"><span>Product name</span><input required maxLength={160} value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} /></label>
            <label className="server-field"><span>SKU</span><input required maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,63}" title="Letters, numbers, dots, dashes, or underscores; start with a letter or number." value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} /></label>
            <label className="server-field"><span>Category</span><input required maxLength={120} value={productDraft.category} onChange={(event) => setProductDraft({ ...productDraft, category: event.target.value })} /></label>
            <label className="server-field"><span>Description (optional)</span><textarea rows={3} maxLength={2000} value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} /></label>
            <label className="server-field"><span>Unit price ({profile.currency})</span><input type="number" inputMode="decimal" required min="0.01" step="0.01" value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} /></label>
            <button type="submit" className="server-primary"><Plus size={16} aria-hidden="true" />{busy === 'product' ? 'Saving product…' : 'Save product'}</button>
          </form>
          <div>
            <div className="server-catalog-filters"><label className="server-field"><span>Search products</span><input type="search" placeholder="Name, SKU, category…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="server-field"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All products</option><option value="active">Active</option><option value="archived">Archived</option></select></label></div>
            {loaded && !filteredProducts.length && <p className="server-empty">{products.length ? 'No products match your filters.' : 'No products yet. Add your first product to build a quote.'}</p>}
            <ul className="server-product-list">{filteredProducts.map((product) => <li key={product.id}>
              <div><h3>{product.name}</h3><p className="server-help">{product.sku} · {product.category}</p>{product.description && <p className="server-product-description">{product.description}</p>}<p className="server-product-price">{product.currency} {product.price} <span className="server-status">{product.status}</span></p></div>
              {product.status === 'active' && <button className="server-logout" type="button" aria-label={`Archive ${product.name}`} onClick={() => { setArchiveCandidate(product); clearFeedback(); }}><Archive size={14} aria-hidden="true" />Archive</button>}
            </li>)}</ul>
            {archiveCandidate && <section className="server-confirm" aria-label="Confirm product archive"><h3>Archive {archiveCandidate.name}?</h3><p>It will no longer be available for new quotes. Saved quote snapshots will remain.</p><div className="server-action-row"><button type="button" className="server-primary" onClick={archiveProduct}>{busy === 'archive' ? 'Archiving…' : 'Confirm archive'}</button><button type="button" className="server-logout" onClick={() => { setArchiveCandidate(null); clearFeedback(); }}>Cancel</button></div></section>}
          </div>
        </div>
      </section>
      <section className="server-quotes" aria-labelledby="server-quotes-title">
        <h2 id="server-quotes-title"><FileText size={20} aria-hidden="true" />Quotes</h2>
        <p className="server-help">Choose active {profile.currency} products. The server snapshots product details and calculates all totals when you save.</p>
        {loaded && !eligibleProducts.length && <p className="server-empty">Add an active product in {profile.currency} to create a quote. Products in other currencies remain in your catalog.</p>}
        <form className="server-form server-inset" onSubmit={createQuote} onChange={clearFeedback}>
          <h3>New quote</h3>
          {lines.map((line, index) => <div className="server-quote-line" key={line.key}>
            <label className="server-field"><span>Product {index + 1}</span><select required value={line.productId} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, productId: event.target.value } : item))}>
              <option value="">Select a product</option>
              {line.productId && !eligibleProducts.some((product) => product.id === line.productId) && <option value={line.productId} disabled>Unavailable product — choose another</option>}
              {eligibleProducts.map((product) => <option key={product.id} value={product.id} disabled={lines.some((item) => item.key !== line.key && item.productId === product.id)}>{product.name} · {product.sku} · {product.currency} {product.price}</option>)}
            </select></label>
            <label className="server-field"><span>Quantity {index + 1}</span><input type="number" inputMode="numeric" required min="1" max={Number.MAX_SAFE_INTEGER} step="1" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} /></label>
            <button className="server-logout" type="button" disabled={lines.length === 1} aria-label={`Remove quote line ${index + 1}`} onClick={() => { setLines((current) => current.filter((item) => item.key !== line.key)); clearFeedback(); }}><Trash2 size={16} aria-hidden="true" /><span>Remove</span></button>
          </div>)}
          <button className="server-logout server-add-line" type="button" disabled={lines.length >= eligibleProducts.length || lines.length >= 100} onClick={() => { setLines((current) => [...current, { key: nextLineKey.current++, productId: '', quantity: '1' }]); clearFeedback(); }}><Plus size={16} aria-hidden="true" />Add line</button>
          <div className="server-rate-fields">
            <label className="server-field"><span>Discount (%)</span><input required type="number" inputMode="decimal" min="0" max="100" step="0.0001" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} /></label>
            <label className="server-field"><span>Tax (%)</span><input required type="number" inputMode="decimal" min="0" max="100" step="0.0001" disabled={profile.taxPreference === 'tax_exempt'} value={profile.taxPreference === 'tax_exempt' ? '0' : taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label>
            <label className="server-field"><span>Tax mode</span><select value={taxMode} onChange={(event) => setTaxMode(event.target.value as QuoteTaxMode)}><option value="exclusive">Add tax to prices</option><option value="inclusive">Tax included in prices</option></select></label>
          </div>
          {profile.taxPreference === 'tax_exempt' && <p className="server-help">This workspace is tax exempt; new quotes use 0% tax.</p>}
          <button className="server-primary server-save-quote" type="submit" disabled={!eligibleProducts.length}><Save size={16} aria-hidden="true" />{busy === 'quote' ? 'Saving quote…' : 'Calculate & save quote'}</button>
        </form>
        <h3 className="server-saved-heading">Saved quotes</h3>
        {loaded && !quotes.length && <p className="server-empty">No saved quotes yet.</p>}
        <ul className="server-quote-list">{quotes.map((quote) => <li key={quote.id}><button type="button" className="server-quote-button" aria-pressed={selectedQuote?.id === quote.id} onClick={() => void openQuote(quote.id)}><span><strong>Quote {quote.id.slice(0, 8)}</strong><small>{new Date(quote.createdAt).toLocaleString()} · {quote.lines.length} line{quote.lines.length === 1 ? '' : 's'}</small></span><strong>{quote.currency} {formatMoney(quote.grandTotal)}</strong><span>View snapshot</span></button></li>)}</ul>
      </section>
    </fieldset>
    {busy === 'detail' && <p className="server-help" role="status">Loading saved quote snapshot…</p>}
    {selectedQuote && <QuoteDetail quote={selectedQuote} />}
  </section>;
}
