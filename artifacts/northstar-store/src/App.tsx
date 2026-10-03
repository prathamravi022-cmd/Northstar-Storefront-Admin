import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Router as WouterRouter, useLocation } from 'wouter';
import {
  ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Heart, LayoutDashboard,
  LoaderCircle, Menu, Minus, Package, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles,
  Star, Trash2, X, RotateCw, Pencil, PlusCircle, CircleHelp, ShieldCheck, Truck,
} from 'lucide-react';

type Product = { id: number; title: string; price: number; category: string; image: string; description: string; rating?: { rate: number; count: number } };
type LocalChanges = { created: Product[]; edits: Record<number, Product>; deleted: number[] };
type Cart = Record<number, number>;
const API = 'https://fakestoreapi.com';
const STORE_KEY = 'northstar-catalog-v1';
const CART_KEY = 'northstar-cart-v1';
const WISH_KEY = 'northstar-wishlist-v1';
const queryClient = new QueryClient();
const emptyChanges: LocalChanges = { created: [], edits: {}, deleted: [] };

function loadJson<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
function cx(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }

function ProductImage({ product, className = '' }: { product: Product; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.image]);
  return failed || !product.image
    ? <div className={cx('flex h-full w-full items-center justify-center bg-[#e7e9e6] text-[#64758a]', className)} role="img" aria-label={`${product.title} image unavailable`}><Package size={30} strokeWidth={1.3} /><span className="sr-only">Image unavailable</span></div>
    : <img className={cx('h-full w-full object-contain', className)} src={product.image} alt={product.title} onError={() => setFailed(true)} loading="lazy" data-testid={`img-product-${product.id}`} />;
}

function ActionButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cx('inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55', className)}>{children}</button>;
}

function App() {
  const [location] = useLocation();
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [changes, setChanges] = useState<LocalChanges>(() => loadJson(STORE_KEY, emptyChanges));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [cart, setCart] = useState<Cart>(() => loadJson(CART_KEY, {}));
  const [wishlist, setWishlist] = useState<number[]>(() => loadJson(WISH_KEY, []));

  const catalog = useMemo(() => {
    const deleted = new Set(changes.deleted);
    const merged = baseProducts.filter(p => !deleted.has(p.id)).map(p => changes.edits[p.id] || p);
    const existing = new Set(merged.map(p => p.id));
    return [...merged, ...changes.created.filter(p => !deleted.has(p.id) && !existing.has(p.id))];
  }, [baseProducts, changes]);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(changes));
  }, [changes]);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadCatalog = async () => {
    setLoading(true); setError('');
    try {
      const [productsResult, categoriesResult] = await Promise.allSettled([
        fetch(`${API}/products`, { signal: AbortSignal.timeout(8_000) }),
        fetch(`${API}/products/categories`, { signal: AbortSignal.timeout(8_000) }),
      ]);
      if (categoriesResult.status === 'fulfilled' && categoriesResult.value.ok) {
        try {
          const values = await categoriesResult.value.json();
          if (Array.isArray(values) && values.length) setCategories(values);
        } catch {
          // Product categories below are a useful fallback if the categories response is malformed.
        }
      }
      if (productsResult.status === 'rejected') throw new Error('The Northstar catalog is temporarily unavailable. Please retry in a moment; local changes remain saved on this device.');
      const productsRes = productsResult.value;
      if (!productsRes.ok) throw new Error(`The Northstar catalog is temporarily unavailable (HTTP ${productsRes.status}). Please retry in a moment; local changes remain saved on this device.`);
      const products = await productsRes.json() as Product[];
      setBaseProducts(Array.isArray(products) ? products : []);
      setCategories(current => current.length ? current : [...new Set((Array.isArray(products) ? products : []).map(p => p.category))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while loading the catalog.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadCatalog(); }, []);

  const notify = (message: string, kind: 'success' | 'error' = 'success') => { setToast(message); setToastKind(kind); };
  const saveChanges = (next: LocalChanges) => setChanges(next);
  const createProduct = async (product: Omit<Product, 'id'>) => {
    let apiStatus = '';
    try {
      const response = await fetch(`${API}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) apiStatus = `FakeStore returned HTTP ${response.status}`;
    } catch {
      apiStatus = 'FakeStore could not be reached';
    }
    // FakeStore simulates write IDs. Use a negative local ID to avoid collisions and retain this item either way.
    const created = { ...product, id: -Date.now() };
    saveChanges({ ...changes, created: [created, ...changes.created] });
    if (apiStatus) notify(`Saved locally only — ${apiStatus}.`, 'error');
    else notify('Product added successfully!');
    return created;
  };
  const editProduct = (product: Product) => {
    const edits = { ...changes.edits, [product.id]: product };
    const created = changes.created.map(item => item.id === product.id ? product : item);
    saveChanges({ ...changes, edits, created });
    notify('Product changes saved');
  };
  const deleteProduct = (id: number) => {
    saveChanges({ ...changes, deleted: [...new Set([...changes.deleted, id])], created: changes.created.filter(p => p.id !== id) });
    setCart(current => { const next = { ...current }; delete next[id]; return next; });
    setWishlist(current => current.filter(item => item !== id));
    notify('Product deleted');
  };
  const toggleWish = (id: number) => setWishlist(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const addCart = (id: number, quantity = 1) => setCart(current => ({ ...current, [id]: (current[id] || 0) + quantity }));

  const isAdmin = location.startsWith('/admin');
  return <div className="noise min-h-[100dvh]">
    {isAdmin
      ? <AdminLayout location={location} products={catalog} categories={categories} loading={loading} error={error} retry={() => void loadCatalog()} notify={notify} onCreate={createProduct} onEdit={editProduct} onDelete={deleteProduct} />
      : <Storefront products={catalog} categories={categories} loading={loading} error={error} retry={() => void loadCatalog()} cart={cart} wishlist={wishlist} addCart={addCart} setCart={setCart} toggleWish={toggleWish} />}
    {toast && <div role="status" data-testid="status-toast" className={cx('fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-xl fade-up', toastKind === 'error' ? 'bg-[#a23f39]' : 'bg-[#193a5a]')}>
      {toastKind === 'error' ? <CircleHelp size={16} /> : <Check size={16} />}{toast}
    </div>}
  </div>;
}

function Storefront({ products, categories, loading, error, retry, cart, wishlist, addCart, setCart, toggleWish }: {
  products: Product[]; categories: string[]; loading: boolean; error: string; retry: () => void; cart: Cart; wishlist: number[];
  addCart: (id: number) => void; setCart: Dispatch<SetStateAction<Cart>>; toggleWish: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [maxPrice, setMaxPrice] = useState(1000);
  const [sort, setSort] = useState('featured');
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const totalCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const maxAvailable = Math.ceil(Math.max(100, ...products.map(p => p.price)) / 50) * 50;
  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    const result = products.filter(p => (!needle || `${p.title} ${p.description} ${p.category}`.toLowerCase().includes(needle))
      && (category === 'all' || p.category === category) && p.price <= maxPrice && (!wishlistOnly || wishlist.includes(p.id)));
    if (sort === 'price-low') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') result.sort((a, b) => b.price - a.price);
    if (sort === 'rating') result.sort((a, b) => (b.rating?.rate || 0) - (a.rating?.rate || 0));
    if (sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [products, search, category, maxPrice, sort, wishlistOnly, wishlist]);
  const featured = products.slice(0, 4);
  const cartProducts = products.filter(p => cart[p.id]);
  const subtotal = cartProducts.reduce((sum, p) => sum + p.price * cart[p.id], 0);

  return <div className="min-h-[100dvh]">
    <div className="bg-[#183553] px-4 py-2 text-center text-[11px] tracking-[.11em] text-[#f1e8d6]"><span className="font-semibold">A good find, every day.</span><span className="mx-2 text-[#bb9264]">·</span> Thoughtful essentials, picked with care</div>
    <header className="sticky top-0 z-30 border-b border-[#dce0df] bg-[#f8f6f0]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Northstar home" data-testid="link-home">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#183553] text-[#f4e9d7]"><Sparkles size={17} /></span>
          <span className="font-display text-[20px] font-extrabold tracking-[-.06em] text-[#183553]">northstar<span className="text-[#c58b50]">.</span></span>
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] font-semibold text-[#4d5b68] md:flex" aria-label="Shop departments">
          <a href="#shop" className="transition hover:text-[#183553]" data-testid="link-department-all">Shop all</a><a href="#shop" onClick={() => setCategory('electronics')} data-testid="link-department-tech">Tech</a><a href="#shop" onClick={() => setCategory('women\'s clothing')} data-testid="link-department-clothing">Clothing</a><a href="#shop" onClick={() => setCategory('jewelery')} data-testid="link-department-accessories">Accessories</a>
        </nav>
        <div className="flex items-center gap-2">
          <label className="hidden h-10 items-center gap-2 rounded-full border border-[#d9dedc] bg-[#fffefa] px-3 sm:flex">
            <Search size={16} className="text-[#77828c]" /><input aria-label="Search products" data-testid="input-store-search" className="w-36 bg-transparent text-xs outline-none placeholder:text-[#87919a] lg:w-48" placeholder="Find something good" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <ActionButton onClick={() => setWishlistOnly(v => !v)} aria-label="Toggle wishlist" data-testid="button-wishlist" className={cx('h-10 w-10 rounded-full border border-[#d9dedc] bg-[#fffefa] p-0 text-[#183553]', wishlistOnly && 'bg-[#f0e3d2]')}>
            <Heart size={17} fill={wishlistOnly ? 'currentColor' : 'none'} />
          </ActionButton>
          <ActionButton onClick={() => setCartOpen(true)} aria-label={`Open bag, ${totalCount} items`} data-testid="button-open-cart" className="relative h-10 w-10 rounded-full bg-[#183553] p-0 text-white">
            <ShoppingBag size={17} />{totalCount > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d69858] px-1 text-[10px] font-bold text-[#1d3043]" data-testid="text-cart-count">{totalCount}</span>}
          </ActionButton>
        </div>
      </div>
    </header>

    <main>
      <section className="mx-auto grid max-w-[1440px] gap-8 px-4 pb-12 pt-7 sm:px-8 md:grid-cols-[1.06fr_.94fr] md:items-center md:gap-10 md:pb-16 md:pt-10">
        <div className="relative z-10 order-2 md:order-1">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d8d8ce] bg-[#efeee7] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#526277]"><span className="h-1.5 w-1.5 rounded-full bg-[#d29756]" />The everyday edit · no. 04</div>
          <h1 className="font-display max-w-[680px] text-[clamp(3.4rem,8vw,7.2rem)] font-extrabold leading-[.91] tracking-[-.075em] text-[#183553]">Good things,<br /><span className="font-medium italic text-[#c1884f]">found here.</span></h1>
          <p className="mt-6 max-w-[430px] text-[15px] leading-7 text-[#5b6875]">A little less scrolling. A lot more finding. Discover well-made things for the way you live, all in one considered place.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#shop" className="inline-flex items-center gap-3 rounded-full bg-[#183553] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#274b70]" data-testid="link-shop-now">Explore the edit <ArrowRight size={16} /></a>
            <span className="flex items-center gap-1.5 text-xs text-[#66737d]"><ShieldCheck size={15} className="text-[#c1884f]" />Curated, not crowded</span>
          </div>
          <div className="mt-10 flex max-w-[420px] items-center gap-5 border-t border-[#d9ddd7] pt-5">
            <div className="font-display text-[26px] font-extrabold tracking-[-.06em] text-[#183553]">{loading ? '—' : products.length}<span className="text-[#c1884f]">{loading ? '' : '+'}</span></div>
            <p className="max-w-[215px] text-xs leading-5 text-[#697680]">Good finds across tech, clothing, and the little things.</p>
            <div className="ml-auto flex -space-x-2" aria-hidden="true">{featured.slice(0, 3).map((p, i) => <div key={p.id} className="h-9 w-9 overflow-hidden rounded-full border-2 border-[#f8f6f0] bg-white p-1"><ProductImage product={p} /></div>)}</div>
          </div>
        </div>
        <div className="order-1 relative min-h-[290px] overflow-hidden rounded-[1.8rem] bg-[#e4e6de] md:order-2 md:min-h-[510px]">
          <img src="/images/storefront-hero.jpg" alt="A Northstar storefront scene" className="absolute inset-0 h-full w-full object-cover" data-testid="img-storefront-hero" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#142c43]/55 via-transparent to-[#142c43]/5" />
          <div className="absolute bottom-5 left-5 rounded-full border border-white/50 bg-[#f8f6f0]/90 px-4 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#39516a] backdrop-blur">The northstar selection</div>
          <div className="absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#d89a5b] text-[#183553]"><ArrowUpRight size={20} /></div>
        </div>
      </section>
      <section className="border-y border-[#dce0dc] bg-[#f0efe9]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 divide-y divide-[#d7dbd7] px-4 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
          {[{ icon: Sparkles, title: 'A tighter edit', text: 'Only things worth making room for.' }, { icon: Truck, title: 'Easy from here', text: 'Clear prices, simple browsing, no fuss.' }, { icon: ShieldCheck, title: 'Picked with care', text: 'Independent finds alongside familiar favorites.' }].map(item => <div key={item.title} className="flex items-center gap-4 py-5 md:px-7 md:py-6"><item.icon size={19} className="text-[#b57b43]" /><div><div className="text-sm font-bold text-[#183553]">{item.title}</div><div className="mt-1 text-xs text-[#687681]">{item.text}</div></div></div>)}
        </div>
      </section>

      <section id="shop" className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 md:py-16">
        {error && products.length > 0 && <InlineApiNotice message={error} retry={retry} />}
        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#b47a43]">The current edit</div><h2 className="font-display text-4xl font-extrabold tracking-[-.055em] text-[#183553] sm:text-5xl">Find your next favorite.</h2><p className="mt-2 text-sm text-[#687681]">Useful, considered, and just a little unexpected.</p></div>
          <div className="flex items-center gap-2">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-full border border-[#d8ddd9] bg-[#fffefa] px-4 sm:hidden"><Search size={16} /><input aria-label="Search products" data-testid="input-mobile-search" className="w-full bg-transparent text-sm outline-none" placeholder="Search the edit" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <ActionButton onClick={() => setMobileFilters(v => !v)} className="border border-[#d8ddd9] bg-[#fffefa] text-[#314b65] md:hidden" data-testid="button-mobile-filters"><SlidersHorizontal size={16} />Filters</ActionButton>
            <label className="relative flex h-11 items-center gap-2 rounded-full border border-[#d8ddd9] bg-[#fffefa] px-4 text-xs font-semibold text-[#506072]"><ArrowDownWideNarrow size={15} /><span className="sr-only">Sort products</span><select value={sort} onChange={e => setSort(e.target.value)} className="max-w-[145px] appearance-none bg-transparent pr-4 outline-none" aria-label="Sort products" data-testid="select-sort"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option><option value="title">Name A–Z</option></select><ChevronDown size={13} className="absolute right-3 pointer-events-none" /></label>
          </div>
        </div>
        <div className="grid gap-7 md:grid-cols-[220px_1fr]">
          <aside className={cx('space-y-7 rounded-2xl border border-[#dce0dc] bg-[#f0efe9] p-5 md:sticky md:top-24 md:h-fit', !mobileFilters && 'hidden md:block')} aria-label="Product filters">
            <div><div className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#74808b]">Department</div><div className="space-y-1">
              <button onClick={() => { setCategory('all'); setWishlistOnly(false); }} className={cx('flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm', category === 'all' && !wishlistOnly ? 'bg-[#183553] font-semibold text-white' : 'text-[#455a6e] hover:bg-[#e3e4dd]')} data-testid="filter-category-all">Everything <span>{products.length}</span></button>
              {categories.map(cat => <button key={cat} onClick={() => { setCategory(cat); setWishlistOnly(false); }} className={cx('flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] capitalize', category === cat ? 'bg-[#183553] font-semibold text-white' : 'text-[#455a6e] hover:bg-[#e3e4dd]')} data-testid={`filter-category-${cat.replace(/\W/g, '-')}`}>{cat}<ArrowRight size={13} /></button>)}
              <button onClick={() => setWishlistOnly(v => !v)} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm', wishlistOnly ? 'bg-[#183553] font-semibold text-white' : 'text-[#455a6e] hover:bg-[#e3e4dd]')} data-testid="filter-wishlist"><Heart size={15} />Saved things <span className="ml-auto">{wishlist.length}</span></button>
            </div></div>
            <div><div className="mb-3 flex justify-between text-[10px] font-bold uppercase tracking-[.15em] text-[#74808b]"><span>Maximum price</span><span className="mono text-[#304a64]">{money(maxPrice)}</span></div><input type="range" min="10" max={maxAvailable} step="10" value={Math.min(maxPrice, maxAvailable)} onChange={e => setMaxPrice(Number(e.target.value))} aria-label="Maximum product price" data-testid="input-max-price" className="w-full accent-[#b57b43]" /><div className="mt-1 flex justify-between text-[10px] text-[#818b91]"><span>$10</span><span>{money(maxAvailable)}+</span></div></div>
            <button onClick={() => { setSearch(''); setCategory('all'); setMaxPrice(maxAvailable); setSort('featured'); setWishlistOnly(false); }} className="text-xs font-semibold text-[#9a6332] underline underline-offset-4" data-testid="button-clear-filters">Clear all filters</button>
          </aside>

          <div>
            <div className="mb-4 flex items-center justify-between"><div className="text-xs text-[#64717d]" data-testid="text-product-results"><strong className="text-[#183553]">{filtered.length}</strong> thoughtful finds</div>{(search || category !== 'all' || wishlistOnly) && <div className="max-w-[52%] truncate rounded-full bg-[#e8e7df] px-3 py-1.5 text-[10px] capitalize text-[#586a77]">{wishlistOnly ? 'Saved things' : category !== 'all' ? category : `Search: ${search}`}</div>}</div>
            {loading && products.length === 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="animate-pulse"><div className="aspect-[.83] rounded-2xl bg-[#e4e4dc]" /><div className="mt-3 h-3 w-3/4 rounded bg-[#e4e4dc]" /><div className="mt-2 h-3 w-1/3 rounded bg-[#e4e4dc]" /></div>)}</div>
              : error && products.length === 0 ? <LoadError message={error} retry={retry} />
              : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-[#c7d0ce] bg-[#f2f0e9] px-6 py-16 text-center" data-testid="empty-products"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e4e4dc] text-[#63768a]"><Search size={20} /></div><h3 className="font-display text-xl font-bold text-[#183553]">Nothing in this corner yet.</h3><p className="mt-2 text-sm text-[#6d7a83]">Try a different search or loosen the filters.</p><ActionButton onClick={() => { setSearch(''); setCategory('all'); setMaxPrice(maxAvailable); setWishlistOnly(false); }} className="mt-5 bg-[#183553] text-white" data-testid="button-reset-empty">Reset filters</ActionButton></div>
              : <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 xl:grid-cols-4">{filtered.map((product, i) => <ProductCard key={product.id} product={product} saved={wishlist.includes(product.id)} onWish={() => toggleWish(product.id)} onQuick={() => setDetail(product)} onAdd={() => addCart(product.id)} index={i} />)}</div>}
          </div>
        </div>
      </section>
      <section className="bg-[#183553] text-[#f5f0e7]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-4 py-10 sm:px-8 md:flex-row md:items-center md:justify-between md:py-14">
          <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#d7a268]">A note from Northstar</div><h2 className="font-display max-w-[620px] text-3xl font-bold leading-tight tracking-[-.04em] sm:text-4xl">Shopping should feel like a good recommendation.</h2></div>
          <div className="max-w-[330px] text-sm leading-6 text-[#c4ced5]">We keep the choices considered, the details clear, and the path to your next favorite short.</div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-7 text-xs text-[#78828a] sm:px-8 md:flex-row md:items-center md:justify-between"><Link href="/" className="font-display text-lg font-extrabold tracking-[-.06em] text-[#183553]">northstar<span className="text-[#c1884f]">.</span></Link><span>Considered things for everyday living.</span><Link href="/admin" className="font-semibold text-[#455c72] hover:text-[#183553]" data-testid="link-admin">Store admin <ArrowUpRight size={12} className="inline" /></Link></footer>
    </main>
    {detail && <QuickView product={detail} saved={wishlist.includes(detail.id)} onClose={() => setDetail(null)} onAdd={() => { addCart(detail.id); setDetail(null); }} onWish={() => toggleWish(detail.id)} />}
    {cartOpen && <div className="fixed inset-0 z-50">
      <button aria-label="Close bag" className="absolute inset-0 bg-[#122238]/45" onClick={() => setCartOpen(false)} data-testid="button-close-cart-backdrop" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col bg-[#f8f6f0] shadow-2xl fade-up" aria-label="Shopping bag">
        <div className="flex items-center justify-between border-b border-[#d9dedb] px-6 py-5"><div><div className="font-display text-xl font-extrabold tracking-[-.04em] text-[#183553]">Your bag <span className="text-sm font-medium text-[#7b858e]">({totalCount})</span></div><p className="mt-1 text-xs text-[#79838a]">Good choices, right this way.</p></div><button onClick={() => setCartOpen(false)} aria-label="Close bag" data-testid="button-close-cart" className="rounded-full p-2 hover:bg-[#e9e8e0]"><X size={19} /></button></div>
        <div className="flex-1 overflow-auto px-6 py-4">
          {cartProducts.length ? cartProducts.map(p => <div key={p.id} className="flex gap-4 border-b border-[#e0e2dc] py-4" data-testid={`cart-item-${p.id}`}><div className="h-24 w-20 rounded-xl bg-white p-2"><ProductImage product={p} /></div><div className="flex min-w-0 flex-1 flex-col"><div className="line-clamp-2 text-sm font-semibold text-[#263c52]">{p.title}</div><div className="mt-1 text-xs capitalize text-[#7d878c]">{p.category}</div><div className="mt-auto flex items-center justify-between"><span className="font-semibold text-[#183553]">{money(p.price)}</span><div className="flex items-center gap-2 rounded-full border border-[#d5dad5] bg-white px-2 py-1"><button onClick={() => setCart(c => { const n = { ...c }; if (n[p.id] <= 1) delete n[p.id]; else n[p.id]--; return n; })} aria-label={`Decrease ${p.title} quantity`} data-testid={`button-quantity-minus-${p.id}`}><Minus size={13} /></button><span className="mono min-w-4 text-center text-xs" data-testid={`text-quantity-${p.id}`}>{cart[p.id]}</span><button onClick={() => addCart(p.id)} aria-label={`Increase ${p.title} quantity`} data-testid={`button-quantity-plus-${p.id}`}><Plus size={13} /></button></div></div></div><button onClick={() => setCart(c => { const n = { ...c }; delete n[p.id]; return n; })} aria-label={`Remove ${p.title}`} className="self-start rounded-full p-1 text-[#899198] hover:text-[#a23f39]" data-testid={`button-remove-cart-${p.id}`}><Trash2 size={15} /></button></div>)
            : <div className="flex h-full flex-col items-center justify-center text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e8e7df] text-[#52677a]"><ShoppingBag size={22} /></div><h3 className="font-display text-xl font-bold text-[#183553]">Your bag is taking a breather.</h3><p className="mt-2 max-w-[230px] text-sm leading-6 text-[#77828a]">Add something you love and it will be waiting here.</p><ActionButton onClick={() => setCartOpen(false)} className="mt-5 bg-[#183553] text-white" data-testid="button-return-shopping">Keep looking</ActionButton></div>}
        </div>
        {cartProducts.length > 0 && <div className="border-t border-[#d9dedb] px-6 pb-6 pt-5"><div className="mb-4 flex justify-between text-sm"><span className="text-[#66747f]">Subtotal</span><strong className="text-[#183553]" data-testid="text-cart-subtotal">{money(subtotal)}</strong></div><ActionButton onClick={() => setCheckoutOpen(true)} className="w-full bg-[#183553] py-3.5 text-white hover:bg-[#274b70]" data-testid="button-checkout-preview">Continue to checkout preview <ArrowRight size={16} /></ActionButton><p className="mt-3 text-center text-[10px] leading-4 text-[#879097]">Demo preview only · no payment information is collected</p></div>}
      </aside>
    </div>}
    {checkoutOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#14243a]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title" data-testid="dialog-checkout-preview"><div className="w-full max-w-md rounded-3xl bg-[#f8f6f0] p-7 shadow-2xl"><button onClick={() => setCheckoutOpen(false)} aria-label="Close checkout preview" className="float-right rounded-full p-2 hover:bg-[#e8e7df]" data-testid="button-close-checkout"><X size={18} /></button><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8e7df] text-[#183553]"><ShieldCheck size={21} /></div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#b47a43]">Checkout preview</p><h2 id="checkout-title" className="font-display mt-2 text-2xl font-extrabold tracking-[-.04em] text-[#183553]">No payment needed here.</h2><p className="mt-3 text-sm leading-6 text-[#6b7881]">This Northstar storefront is a shopping demo. Checkout and payment processing are not configured, so we haven’t collected any personal or payment details.</p><div className="mt-5 flex justify-between border-t border-[#d9dedb] pt-4 text-sm"><span>Bag subtotal</span><strong>{money(subtotal)}</strong></div><ActionButton onClick={() => { setCheckoutOpen(false); setCartOpen(false); }} className="mt-5 w-full bg-[#183553] text-white" data-testid="button-finish-preview">Back to browsing</ActionButton></div></div>}
  </div>;
}

function ProductCard({ product, saved, onWish, onQuick, onAdd, index }: { product: Product; saved: boolean; onWish: () => void; onQuick: () => void; onAdd: () => void; index: number }) {
  return <article className="product-card group min-w-0 fade-up" style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }} data-testid={`card-product-${product.id}`}>
    <div className="relative aspect-[.82] overflow-hidden rounded-2xl bg-[#ebece6]">
      <button onClick={onQuick} aria-label={`View ${product.title} details`} className="absolute inset-0 z-[1]" data-testid={`button-quickview-${product.id}`}><span className="sr-only">Open product details</span></button>
      <div className="absolute inset-0 flex items-center justify-center p-5 sm:p-8"><ProductImage product={product} className="product-image" /></div>
      <button onClick={onWish} aria-label={saved ? `Remove ${product.title} from saved items` : `Save ${product.title}`} className="absolute right-3 top-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f6f0]/90 text-[#37516b] shadow-sm transition hover:scale-105" data-testid={`button-wishlist-${product.id}`}><Heart size={16} fill={saved ? '#bc6a5c' : 'none'} className={saved ? 'text-[#bc6a5c]' : ''} /></button>
      {product.rating && product.rating.rate >= 4.5 && <div className="absolute bottom-3 left-3 z-[2] rounded-full bg-[#f8f6f0]/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#7b5737]">Customer favorite</div>}
      <button onClick={onAdd} aria-label={`Add ${product.title} to bag`} className="absolute bottom-3 right-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full bg-[#183553] text-white opacity-100 shadow-md transition hover:bg-[#bd8148] sm:opacity-0 sm:group-hover:opacity-100" data-testid={`button-add-cart-${product.id}`}><Plus size={17} /></button>
    </div>
    <button onClick={onQuick} className="mt-3 block w-full text-left" data-testid={`button-title-product-${product.id}`}><div className="mb-1 text-[9px] font-bold uppercase tracking-[.13em] text-[#a37345]" data-testid={`text-category-${product.id}`}>{product.category}</div><h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-5 text-[#263c52] transition group-hover:text-[#9a6332] sm:text-sm">{product.title}</h3></button>
    <div className="mt-2 flex items-center justify-between"><span className="font-display text-sm font-extrabold text-[#183553]" data-testid={`text-price-${product.id}`}>{money(product.price)}</span>{product.rating && <span className="flex items-center gap-1 text-[10px] text-[#77838a]"><Star size={11} fill="#d49959" className="text-[#d49959]" />{product.rating.rate}</span>}</div>
  </article>;
}

function QuickView({ product, saved, onClose, onAdd, onWish }: { product: Product; saved: boolean; onClose: () => void; onAdd: () => void; onWish: () => void }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#14243a]/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-title" data-testid="dialog-quickview">
    <div className="relative grid max-h-[94vh] w-full max-w-[850px] overflow-auto rounded-3xl bg-[#f8f6f0] md:grid-cols-[.95fr_1.05fr]">
      <button onClick={onClose} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f6f0] text-[#30465d] shadow" aria-label="Close product details" data-testid="button-close-quickview"><X size={18} /></button>
      <div className="flex min-h-[270px] items-center justify-center bg-[#e9ebe5] p-10 md:min-h-[480px]"><ProductImage product={product} /></div>
      <div className="flex flex-col p-6 sm:p-9 md:justify-center"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#ad7746]">{product.category}</div><h2 id="quick-title" className="font-display mt-3 text-3xl font-extrabold leading-tight tracking-[-.05em] text-[#183553]" data-testid={`text-quick-title-${product.id}`}>{product.title}</h2><div className="mt-4 flex items-center gap-3"><span className="font-display text-2xl font-extrabold text-[#183553]">{money(product.price)}</span>{product.rating && <span className="flex items-center gap-1 text-xs text-[#667680]"><Star size={13} fill="#d49959" className="text-[#d49959]" />{product.rating.rate} <span>({product.rating.count} reviews)</span></span>}</div><p className="mt-5 text-sm leading-7 text-[#65737d]">{product.description}</p><div className="mt-7 grid gap-3"><ActionButton onClick={onAdd} className="w-full bg-[#183553] py-3.5 text-white hover:bg-[#274b70]" data-testid={`button-quick-add-${product.id}`}><ShoppingBag size={16} />Add to bag</ActionButton><ActionButton onClick={onWish} className="w-full border border-[#d7dcd7] bg-transparent text-[#34516d]" data-testid={`button-quick-wish-${product.id}`}><Heart size={16} fill={saved ? '#bc6a5c' : 'none'} />{saved ? 'Saved to your list' : 'Save for later'}</ActionButton></div><div className="mt-6 flex items-center gap-2 border-t border-[#dcdfd9] pt-5 text-xs text-[#75818a]"><ShieldCheck size={15} className="text-[#b27a46]" />A considered find from the Northstar edit</div></div>
    </div>
  </div>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="rounded-3xl border border-[#e3c7bd] bg-[#f8eee9] px-6 py-14 text-center" data-testid="error-catalog"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0ddd5] text-[#a14c40]"><CircleHelp size={21} /></div><h3 className="font-display text-xl font-bold text-[#183553]">We lost the thread.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-[#7b6761]">{message}</p><ActionButton onClick={retry} className="mt-5 bg-[#183553] text-white" data-testid="button-retry-catalog"><RotateCw size={15} />Try again</ActionButton></div>;
}

function InlineApiNotice({ message, retry }: { message: string; retry: () => void }) {
  return <div role="status" className="mb-6 flex flex-col gap-3 rounded-xl border border-[#e3c7bd] bg-[#f8eee9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="notice-catalog-offline">
    <div className="flex items-start gap-2.5 text-xs leading-5 text-[#80534b]"><CircleHelp size={16} className="mt-0.5 shrink-0 text-[#a14c40]" /><span>{message} Already available catalog items remain visible; local changes stay saved on this device.</span></div>
    <ActionButton onClick={retry} className="shrink-0 border border-[#d9b9ad] bg-[#fffaf6] px-3 py-2 text-xs text-[#7d473e]" data-testid="button-retry-catalog-inline"><RotateCw size={13} />Retry</ActionButton>
  </div>;
}

function AdminSidebar({ location, onNavigate }: { location: string; onNavigate: () => void }) {
  return <nav className="space-y-1" aria-label="Admin navigation">
    <Link href="/admin" onClick={onNavigate} className={cx('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition', location === '/admin' ? 'bg-[#294863] text-white' : 'text-[#c6d1d8] hover:bg-[#23415d]')} data-testid="link-admin-dashboard"><LayoutDashboard size={17} />Dashboard Overview</Link>
    <Link href="/admin/products" onClick={onNavigate} className={cx('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition', location === '/admin/products' || location.includes('/edit') ? 'bg-[#294863] text-white' : 'text-[#c6d1d8] hover:bg-[#23415d]')} data-testid="link-admin-products"><Package size={17} />Manage Products</Link>
    <Link href="/admin/products/new" onClick={onNavigate} className={cx('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition', location.includes('/new') ? 'bg-[#294863] text-white' : 'text-[#c6d1d8] hover:bg-[#23415d]')} data-testid="link-admin-add"><PlusCircle size={17} />Add New Product</Link>
  </nav>;
}

function AdminLayout({ location, products, categories, loading, error, retry, notify, onCreate, onEdit, onDelete }: {
  location: string; products: Product[]; categories: string[]; loading: boolean; error: string; retry: () => void; notify: (m: string, k?: 'success' | 'error') => void;
  onCreate: (p: Omit<Product, 'id'>) => Promise<Product>; onEdit: (p: Product) => void; onDelete: (id: number) => void;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const title = location === '/admin' ? 'Dashboard overview' : location.includes('/new') ? 'Add new product' : location.includes('/edit') ? 'Edit product' : 'Manage products';
  const isEdit = location.match(/^\/admin\/products\/(-?\d+)\/edit$/);
  const editProduct = isEdit ? products.find(p => p.id === Number(isEdit[1])) : undefined;
  return <div className="min-h-[100dvh] bg-[#f3f2ec] md:flex">
    <aside className="hidden w-[248px] shrink-0 flex-col bg-[#183553] px-5 py-6 text-white md:flex">
      <Link href="/" className="mb-12 flex items-center gap-2.5 px-2" data-testid="link-admin-brand"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2e8d6] text-[#183553]"><Sparkles size={17} /></span><span className="font-display text-[20px] font-extrabold tracking-[-.06em]">northstar<span className="text-[#d09a61]">.</span></span></Link>
      <div className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-[#94aabd]">Store management</div><AdminSidebar location={location} onNavigate={() => setMobileNav(false)} />
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#e9dfce]"><ShieldCheck size={15} className="text-[#d49a5e]" />Northstar store</div><p className="mt-2 text-[10px] leading-4 text-[#a9bbc7]">Catalog changes save locally in this browser.</p></div>
    </aside>
    {mobileNav && <div className="fixed inset-0 z-50 md:hidden"><button onClick={() => setMobileNav(false)} className="absolute inset-0 bg-[#122238]/50" aria-label="Close admin navigation" /><aside className="absolute left-0 top-0 h-full w-[280px] bg-[#183553] p-5 text-white"><div className="mb-10 flex items-center justify-between"><Link href="/" className="font-display text-xl font-extrabold">northstar.</Link><button onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-admin-nav"><X size={20} /></button></div><AdminSidebar location={location} onNavigate={() => setMobileNav(false)} /></aside></div>}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe2dc] bg-[#f8f7f2]/95 px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} aria-label="Open navigation" className="rounded-lg p-2 text-[#29435d] hover:bg-[#e8e9e2] md:hidden" data-testid="button-open-admin-nav"><Menu size={20} /></button><div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#aa7749]">Northstar / Admin</div><div className="mt-0.5 text-sm font-semibold text-[#31485d]">{title}</div></div></div>
        <Link href="/" className="flex items-center gap-2 rounded-full border border-[#d9ddd7] bg-[#fffefa] px-3 py-2 text-xs font-semibold text-[#42596f] transition hover:border-[#183553]" data-testid="link-view-store"><span className="hidden sm:inline">View storefront</span><ArrowUpRight size={14} /></Link>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-8 sm:py-9">
        {location === '/admin' ? <Dashboard products={products} loading={loading} error={error} retry={retry} />
          : location === '/admin/products' ? <ProductTable products={products} loading={loading} error={error} retry={retry} onDelete={onDelete} />
          : location === '/admin/products/new' ? <AddProductForm categories={categories} onSave={onCreate} notify={notify} />
          : isEdit ? (editProduct ? <AddProductForm key={editProduct.id} initial={editProduct} categories={categories} onUpdate={onEdit} notify={notify} /> : <div className="rounded-2xl bg-white p-10 text-center"><h2 className="font-display text-xl font-bold">Product not found</h2><Link href="/admin/products" className="mt-4 inline-block text-sm text-[#315371] underline">Back to products</Link></div>)
          : <NotFound />}
      </main>
    </div>
  </div>;
}

function Dashboard({ products, loading, error, retry }: { products: Product[]; loading: boolean; error: string; retry: () => void }) {
  const categories = [...new Set(products.map(p => p.category))];
  const localCount = products.filter(p => p.id < 0).length;
  const avgPrice = products.length ? products.reduce((sum, p) => sum + p.price, 0) / products.length : 0;
  return <div className="fade-up">
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#ad7746]">Your catalog at a glance</div><h1 className="font-display text-4xl font-extrabold tracking-[-.06em] text-[#183553] sm:text-5xl">Good morning.</h1><p className="mt-2 text-sm text-[#6a7882]">A clear view of what’s on the shelves.</p></div><Link href="/admin/products/new" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#183553] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#294e70]" data-testid="link-dashboard-add"><Plus size={16} />Add a product</Link></div>
    {error && (products.length === 0 ? <LoadError message={error} retry={retry} /> : <InlineApiNotice message={error} retry={retry} />)}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: 'Catalog products', value: products.length, icon: Package, foot: 'Live catalog + your local changes' }, { label: 'Departments', value: categories.length, icon: LayoutDashboard, foot: 'Distinct product categories' }, { label: 'Local additions', value: localCount, icon: PlusCircle, foot: 'Saved on this device' }, { label: 'Average item price', value: money(avgPrice), icon: Sparkles, foot: 'Across the current catalog' }].map(stat => <div key={stat.label} className="rounded-2xl border border-[#dde1dc] bg-[#fbfaf6] p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#6c7a84]">{stat.label}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8ece8] text-[#375a78]"><stat.icon size={17} /></span></div><div className="font-display mt-5 text-3xl font-extrabold tracking-[-.05em] text-[#183553]" data-testid={`metric-${stat.label.toLowerCase().replace(/\s/g, '-')}`}>{loading && products.length === 0 ? '—' : stat.value}</div><div className="mt-2 text-[10px] text-[#899197]">{stat.foot}</div></div>)}
    </div>
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <section className="rounded-2xl border border-[#dde1dc] bg-[#fbfaf6] p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-extrabold tracking-[-.04em] text-[#183553]">Recently in the edit</h2><p className="mt-1 text-xs text-[#7b878d]">A snapshot of your product catalog</p></div><Link href="/admin/products" className="text-xs font-bold text-[#a06d3d] hover:underline" data-testid="link-dashboard-manage">See all <ArrowRight size={13} className="inline" /></Link></div>
        {loading && products.length === 0 ? <div className="mt-5 space-y-4">{[1, 2, 3].map(i => <div key={i} className="flex animate-pulse gap-3"><div className="h-12 w-12 rounded-xl bg-[#e5e6df]" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 w-2/3 rounded bg-[#e5e6df]" /><div className="h-3 w-1/3 rounded bg-[#e5e6df]" /></div></div>)}</div>
          : <div className="mt-4 divide-y divide-[#e6e7e1]">{products.slice(0, 5).map(p => <div key={p.id} className="flex items-center gap-3 py-3" data-testid={`dashboard-product-${p.id}`}><div className="h-12 w-12 shrink-0 rounded-xl bg-[#ecece7] p-2"><ProductImage product={p} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#31495e]">{p.title}</div><div className="mt-1 text-[10px] capitalize text-[#899197]">{p.category}</div></div><div className="font-display text-sm font-bold text-[#183553]">{money(p.price)}</div></div>)}</div>}
        {!loading && products.length === 0 && <div className="py-9 text-center text-sm text-[#7d878e]">No products to show yet.</div>}
      </section>
      <section className="rounded-2xl border border-[#dde1dc] bg-[#fbfaf6] p-5 sm:p-6"><div className="mb-5"><h2 className="font-display text-xl font-extrabold tracking-[-.04em] text-[#183553]">Departments</h2><p className="mt-1 text-xs text-[#7b878d]">How the catalog is arranged</p></div>
        {categories.length ? <div className="space-y-4">{categories.map(cat => { const count = products.filter(p => p.category === cat).length; const percentage = products.length ? Math.round(count / products.length * 100) : 0; return <div key={cat}><div className="mb-1.5 flex justify-between text-xs"><span className="capitalize font-medium text-[#4f6273]">{cat}</span><span className="mono text-[10px] text-[#7d878e]">{count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e9eae4]"><div className="h-full rounded-full bg-[#bd8853] transition-all" style={{ width: `${percentage}%` }} /></div></div> })}</div> : <div className="rounded-xl bg-[#f0efe9] px-4 py-8 text-center text-xs text-[#77848b]">{loading ? 'Gathering your catalog…' : 'Department data will appear with products.'}</div>}
        <div className="mt-7 rounded-xl bg-[#e9ede8] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#38536b]"><ShieldCheck size={15} />Local-first edits</div><p className="mt-1.5 text-[11px] leading-5 text-[#697983]">New, edited, and removed products stay in this browser, even when the demo catalog refreshes.</p></div>
      </section>
    </div>
  </div>;
}

function ProductTable({ products, loading, error, retry, onDelete }: { products: Product[]; loading: boolean; error: string; retry: () => void; onDelete: (id: number) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const categories = [...new Set(products.map(p => p.category))];
  const filtered = products.filter(p => (category === 'all' || p.category === category) && `${p.title} ${p.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="fade-up">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#ad7746]">Your shelves</div><h1 className="font-display text-4xl font-extrabold tracking-[-.06em] text-[#183553]">Manage products</h1><p className="mt-2 text-sm text-[#6a7882]">Keep the Northstar edit fresh and useful.</p></div><Link href="/admin/products/new" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#183553] px-5 py-3 text-sm font-bold text-white hover:bg-[#294e70]" data-testid="link-products-add"><Plus size={16} />Add new product</Link></div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-[#d9ded9] bg-[#fbfaf6] px-3"><Search size={16} className="text-[#77858e]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or category" aria-label="Search products" data-testid="input-admin-search" className="w-full bg-transparent text-sm outline-none placeholder:text-[#959da1]" /></label><label className="relative flex h-11 items-center rounded-xl border border-[#d9ded9] bg-[#fbfaf6] px-3 text-sm text-[#53677a]"><span className="mr-2 text-xs text-[#879197]">Category</span><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category" data-testid="select-admin-category" className="max-w-[190px] appearance-none bg-transparent pr-5 capitalize outline-none"><option value="all">All departments</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-3" /></label></div>
    {error && products.length === 0 ? <LoadError message={error} retry={retry} /> : <>{error && <InlineApiNotice message={error} retry={retry} />}<div className="overflow-hidden rounded-2xl border border-[#dce0db] bg-[#fbfaf6]">
      <div className="flex items-center justify-between border-b border-[#e2e4de] px-4 py-4 sm:px-6"><div><h2 className="font-display text-lg font-extrabold tracking-[-.04em] text-[#183553]">Product catalog</h2><p className="mt-1 text-[11px] text-[#7c878e]">{filtered.length} of {products.length} products</p></div><div className="mono text-[10px] text-[#879197]">CATALOG / {new Date().getFullYear()}</div></div>
      {loading && products.length === 0 ? <div className="space-y-4 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[#ecece6]" />)}</div>
        : filtered.length === 0 ? <div className="px-6 py-16 text-center" data-testid="empty-admin-products"><Package size={25} className="mx-auto text-[#95a0a5]" /><h3 className="mt-3 font-display font-bold text-[#304860]">No products match that search.</h3><p className="mt-1 text-xs text-[#7e888e]">Try another term or change the department.</p></div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-[#e4e6e0] bg-[#f4f3ed] text-[9px] font-bold uppercase tracking-[.15em] text-[#78858e]"><th className="px-5 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Rating</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id} className="border-b border-[#e9eae4] last:border-0 hover:bg-[#f7f6f0]" data-testid={`row-product-${p.id}`}><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="h-12 w-12 shrink-0 rounded-xl bg-[#eeefe9] p-2"><ProductImage product={p} /></div><div className="max-w-[300px]"><div className="line-clamp-2 text-xs font-semibold leading-5 text-[#31485e]" data-testid={`text-admin-title-${p.id}`}>{p.title}</div><div className="mt-0.5 text-[9px] text-[#929b9e]">ID {p.id}</div></div></div></td><td className="px-4 py-3 text-xs capitalize text-[#657580]">{p.category}</td><td className="px-4 py-3 font-display text-sm font-bold text-[#25415b]" data-testid={`text-admin-price-${p.id}`}>{money(p.price)}</td><td className="px-4 py-3 text-xs text-[#687983]">{p.rating ? <span className="flex items-center gap-1"><Star size={12} fill="#d49959" className="text-[#d49959]" />{p.rating.rate}</span> : '—'}</td><td className="px-5 py-3"><div className="flex justify-end gap-2"><Link href={`/admin/products/${p.id}/edit`} aria-label={`Edit ${p.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dce1dc] text-[#3e5b74] hover:bg-[#e9ede8]" data-testid={`link-edit-product-${p.id}`}><Pencil size={14} /></Link><button onClick={() => { if (window.confirm(`Delete “${p.title}” from the catalog?`)) onDelete(p.id); }} aria-label={`Delete ${p.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5d9d5] text-[#a55047] hover:bg-[#f6e7e2]" data-testid={`button-delete-product-${p.id}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>}
    </div></>}
  </div>;
}

function AddProductForm({ initial, categories, onSave, onUpdate, notify }: { initial?: Product; categories: string[]; onSave?: (p: Omit<Product, 'id'>) => Promise<Product>; onUpdate?: (p: Product) => void; notify: (m: string, k?: 'success' | 'error') => void }) {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState(initial?.title || '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [category, setCategory] = useState(initial?.category || categories[0] || '');
  const [image, setImage] = useState(initial?.image || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [imageInvalid, setImageInvalid] = useState(false);
  useEffect(() => { if (!category && categories.length) setCategory(categories[0]); }, [categories, category]);
  const isEdit = Boolean(initial);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    const parsed = Number(price);
    if (!title.trim() || !category || !description.trim() || !image.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setFormError('Please complete every field. Price must be greater than zero.'); return;
    }
    try {
      setSubmitting(true);
      const value = { title: title.trim(), price: parsed, category, image: image.trim(), description: description.trim(), ...(initial?.rating ? { rating: initial.rating } : {}) };
      if (initial && onUpdate) { onUpdate({ ...value, id: initial.id }); }
      else if (onSave) await onSave(value);
      setLocation('/admin/products');
      if (!isEdit) { setTitle(''); setPrice(''); setCategory(categories[0] || ''); setImage(''); setDescription(''); }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save product. Please try again.';
      setFormError(message); notify(message, 'error');
    } finally { setSubmitting(false); }
  };
  const field = 'mt-2 w-full rounded-xl border border-[#d9ded9] bg-[#fffefa] px-3.5 py-3 text-sm text-[#294159] outline-none transition placeholder:text-[#9aa2a3] focus:border-[#50799a] focus:ring-2 focus:ring-[#50799a]/15';
  return <div className="fade-up">
    <div className="mb-7"><Link href="/admin/products" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#627684] hover:text-[#183553]" data-testid="link-back-products"><ArrowLeft size={14} />Back to products</Link><div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#ad7746]">{isEdit ? 'Refine the details' : 'Grow the collection'}</div><h1 className="font-display text-4xl font-extrabold tracking-[-.06em] text-[#183553]">{isEdit ? 'Edit product' : 'Add a new product'}</h1><p className="mt-2 text-sm text-[#6a7882]">{isEdit ? 'Make a considered change to the catalog.' : 'Add something worth discovering.'}</p></div>
    <div className="grid max-w-[1080px] gap-6 xl:grid-cols-[1fr_340px]">
      <form onSubmit={submit} className="rounded-2xl border border-[#dde1dc] bg-[#fbfaf6] p-5 sm:p-7" data-testid="form-product">
        {formError && <div role="alert" className="mb-5 rounded-xl border border-[#e8cfc6] bg-[#f8ede8] px-4 py-3 text-xs text-[#974b40]" data-testid="error-product-form">{formError}</div>}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs font-bold text-[#40566a]">Title <span className="text-[#bf694f]">*</span><input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} className={field} placeholder="A name customers will remember" aria-label="Title" data-testid="input-product-title" /></label>
          <label className="text-xs font-bold text-[#40566a]">Price <span className="text-[#bf694f]">*</span><div className="relative"><span className="absolute left-3.5 top-[21px] text-sm text-[#8a959a]">$</span><input required type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className={`${field} pl-8`} placeholder="0.00" aria-label="Price" data-testid="input-product-price" /></div></label>
          <label className="text-xs font-bold text-[#40566a]">Category <span className="text-[#bf694f]">*</span><div className="relative"><select required value={category} onChange={e => setCategory(e.target.value)} className={`${field} appearance-none capitalize`} aria-label="Category" data-testid="select-product-category"><option value="" disabled>Select a department</option>{categories.length ? categories.map(c => <option key={c} value={c}>{c}</option>) : <option value="general">general</option>}{category && !categories.includes(category) && <option value={category}>{category}</option>}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-5 text-[#72808a]" /></div></label>
          <label className="sm:col-span-2 text-xs font-bold text-[#40566a]">Image URL <span className="text-[#bf694f]">*</span><input required type="url" value={image} onChange={e => { setImage(e.target.value); setImageInvalid(false); }} className={field} placeholder="https://…" aria-label="Image URL" data-testid="input-product-image" /></label>
          <label className="sm:col-span-2 text-xs font-bold text-[#40566a]">Description <span className="text-[#bf694f]">*</span><textarea required rows={5} maxLength={1400} value={description} onChange={e => setDescription(e.target.value)} className={`${field} resize-y`} placeholder="What makes this a good find?" aria-label="Description" data-testid="textarea-product-description" /></label>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#e2e4df] pt-5 sm:flex-row sm:justify-end"><Link href="/admin/products" className="inline-flex items-center justify-center rounded-full border border-[#d7ddd9] px-5 py-3 text-sm font-semibold text-[#526777] hover:bg-[#eff0e9]" data-testid="link-cancel-product">Cancel</Link><ActionButton type="submit" disabled={submitting} className="bg-[#183553] px-6 py-3 text-white hover:bg-[#294e70]" data-testid="button-save-product">{submitting ? <><LoaderCircle size={16} className="animate-spin" />{isEdit ? 'Saving…' : 'Adding product…'}</> : <>{isEdit ? 'Save changes' : 'Add product'}<ArrowRight size={15} /></>}</ActionButton></div>
      </form>
      <aside className="h-fit rounded-2xl border border-[#dde1dc] bg-[#eeefe9] p-5"><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#6f7c85]">Product preview</div><Sparkles size={15} className="text-[#ad7746]" /></div><div className="flex aspect-[1.15] items-center justify-center overflow-hidden rounded-xl bg-[#fbfaf6] p-7">{image && !imageInvalid ? <img src={image} alt="Product preview" className="h-full w-full object-contain" onError={() => setImageInvalid(true)} data-testid="img-product-preview" /> : <div className="text-center text-[#9ba4a4]"><Package size={28} className="mx-auto" /><div className="mt-2 text-xs">{imageInvalid ? 'Image could not be loaded' : 'Add an image URL to preview'}</div></div>}</div><div className="mt-4 text-[9px] font-bold uppercase tracking-[.13em] text-[#a57447]">{category || 'Department'}</div><div className="mt-1 line-clamp-2 font-display text-base font-bold text-[#294159]">{title || 'Your product title'}</div><div className="mt-2 font-display text-sm font-extrabold text-[#183553]">{price && Number(price) > 0 ? money(Number(price)) : '$0.00'}</div><div className="mt-4 rounded-xl bg-[#f8f7f2] p-3 text-[10px] leading-4 text-[#738089]">All product details are stored locally in this browser so your edits remain visible.</div></aside>
    </div>
  </div>;
}

function BoundaryFrame() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><App /></ErrorBoundary>;
}

function Root() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><BoundaryFrame /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default Root;