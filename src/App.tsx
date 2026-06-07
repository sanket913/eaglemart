import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  Home,
  LogIn,
  LogOut,
  MapPin,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  TicketPercent,
  Truck,
  User,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

type Role = 'CUSTOMER' | 'ADMIN';
type SavedAddress = { id?: string; label?: string; name?: string; phone?: string; line1: string; line2?: string; city: string; state: string; pincode: string; isDefault?: boolean };
type UserAccount = { id: string; name: string; email: string; phone?: string; role: Role; addresses?: SavedAddress[] };
type Category = { id: string; name: string; slug: string };
type Product = { id: string; name: string; slug: string; brand: string; categoryId?: string; category?: Category; description: string; images: string[]; mrp: number | string; sellingPrice: number | string; discount: number; unit: string; stock: number; lowStockThreshold?: number | string; rating: number | string; reviewCount: number; isFeatured: boolean; isBestSeller: boolean; isActive: boolean };
type Banner = { id: string; title: string; subtitle?: string; image: string; isActive: boolean };
type StoreSettings = { minOrderValue: number | string; freeDeliveryAbove: number | string; deliveryFee: number | string; estimatedDeliveryMins: number | string; taxPercent?: number | string; isStoreOpen?: boolean; storeName?: string; supportEmail?: string; supportPhone?: string };
type CartLine = { product: Product; quantity: number };
type Order = { orderId: string; orderStatus: string; paymentStatus: string; paymentMethod?: string; total: number | string; createdAt: string; updatedAt?: string; customerName?: string; phone?: string; email?: string; customer?: { name?: string; email?: string }; items?: Array<{ name: string; quantity: number; price?: number | string; total?: number | string }> };
type CheckoutStep = 'address' | 'payment' | 'success' | 'failure' | 'tracking';
type PaymentMethod = 'COD' | 'RAZORPAY';
type Toast = { type: 'success' | 'error' | 'info'; message: string };
type RazorpayOrderPayload = { provider: string; keyId: string; providerOrderId: string; amount: number; currency: string };
type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: unknown) => void) => void };
  }
}

const money = (value: number | string | undefined) => `Rs ${Number(value || 0).toFixed(0)}`;
const groceryImages = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=85',
];
const imageIndex = (value = 'eagle-mart') => Math.abs([...value].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % groceryImages.length;
const fallbackProductImage = (product?: Product) => groceryImages[imageIndex(product?.id || product?.name)];
const productImage = (product?: Product) => {
  const image = product?.images?.find(Boolean);
  if (!image || image.includes('source.unsplash.com')) return fallbackProductImage(product);
  return image;
};
const handleProductImageError = (product?: Product) => (event: { currentTarget: HTMLImageElement }) => {
  const fallback = fallbackProductImage(product);
  if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
};
const phoneOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const isPhone = (value?: string) => /^\d{10}$/.test(value || '');
const isEmail = (value?: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
const required = (value?: string | number | null) => String(value ?? '').trim().length > 0;
const validateAddress = (address: SavedAddress) => {
  if (!required(address.name) || !isPhone(address.phone)) return 'Enter name and valid 10-digit mobile number.';
  if (!required(address.label) || !required(address.line1) || !required(address.line2) || !required(address.city) || !required(address.state) || !required(address.pincode)) return 'All address fields are mandatory.';
  if (!/^\d{6}$/.test(address.pincode || '')) return 'Enter a valid 6-digit pincode.';
  return '';
};

type InvoiceLine = { name: string; quantity: number; unitPrice?: number; total?: number };
type InvoiceInput = {
  orderId: string;
  customerName: string;
  email?: string;
  phone?: string;
  address?: Partial<SavedAddress>;
  items: InvoiceLine[];
  total: number;
  paymentStatus: string;
  paymentMethod?: string;
  orderStatus: string;
  createdAt?: string;
};

async function loadImageDataUrl(path: string) {
  try {
    const blob = await (await fetch(path)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

async function generateInvoicePdf(input: InvoiceInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  const gold = '#b98622';
  const dark = '#17110a';
  const muted = '#756852';
  const line = '#ead7b6';
  const logo = await loadImageDataUrl('/eagle_logo.png');
  const isCod = (input.paymentMethod || '').toLowerCase().includes('cash') || input.paymentMethod === 'COD';
  const paymentLabel = isCod && input.paymentStatus !== 'Paid' ? 'Payment Pending (Cash on Delivery)' : input.paymentStatus === 'Paid' ? 'Payment Paid' : input.paymentStatus;

  doc.setFillColor(255, 249, 235);
  doc.rect(0, 0, pageWidth, 842, 'F');
  doc.setFillColor(23, 17, 10);
  doc.roundedRect(margin, 30, pageWidth - margin * 2, 118, 16, 16, 'F');
  if (logo) doc.addImage(logo, 'PNG', margin + 18, 48, 88, 56);
  doc.setTextColor('#f4d46a');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.text('Eagle Mart', margin + 122, 72);
  doc.setFontSize(10);
  doc.setTextColor('#fff8ef');
  doc.text('Premium grocery delivery', margin + 122, 93);
  doc.text('Secure checkout | Live order tracking', margin + 122, 109);
  doc.setTextColor('#f4d46a');
  doc.setFontSize(14);
  doc.text('Tax Invoice / Bill', pageWidth - margin - 22, 64, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor('#fff8ef');
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin - 22, 86, { align: 'right' });
  doc.text('www.eaglemart.local', pageWidth - margin - 22, 106, { align: 'right' });

  let y = 178;
  doc.setTextColor(dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Order invoice', margin, y);
  doc.setFontSize(10);
  doc.setTextColor(muted);
  doc.text(`Order ID: ${input.orderId}`, margin, y + 20);
  doc.text(`Order date: ${input.createdAt ? new Date(input.createdAt).toLocaleString() : new Date().toLocaleString()}`, margin, y + 36);

  doc.setFillColor(255, 244, 224);
  doc.roundedRect(pageWidth - margin - 170, y - 14, 170, 58, 10, 10, 'F');
  doc.setTextColor(gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYMENT STATUS', pageWidth - margin - 150, y + 4);
  doc.setTextColor(dark);
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize(paymentLabel, 138), pageWidth - margin - 150, y + 26);

  y += 78;
  doc.setFillColor(255, 250, 241);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 96, 14, 14, 'F');
  doc.setDrawColor(line);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 96, 14, 14, 'S');
  doc.setTextColor(gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BILL TO', margin + 18, y + 24);
  doc.text('DELIVERY ADDRESS', pageWidth / 2 + 8, y + 24);
  doc.setTextColor(dark);
  doc.setFontSize(12);
  doc.text(input.customerName || 'Eagle Mart Customer', margin + 18, y + 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(muted);
  doc.text(input.email || '-', margin + 18, y + 62);
  doc.text(input.phone || '-', margin + 18, y + 78);
  const addressText = [input.address?.line1, input.address?.line2, input.address?.city, input.address?.state, input.address?.pincode].filter(Boolean).join(', ');
  doc.text(doc.splitTextToSize(addressText || 'Address saved with order', pageWidth / 2 - 56), pageWidth / 2 + 8, y + 45);

  y += 132;
  doc.setFillColor(23, 17, 10);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 8, 8, 'F');
  doc.setTextColor('#fff8ef');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Item', margin + 14, y + 20);
  doc.text('Qty', pageWidth - margin - 190, y + 20);
  doc.text('Price', pageWidth - margin - 132, y + 20);
  doc.text('Amount', pageWidth - margin - 62, y + 20, { align: 'right' });
  y += 42;

  const rows = input.items.length ? input.items : [{ name: 'Eagle Mart grocery order', quantity: 1, total: input.total }];
  rows.forEach((item, index) => {
    if (y > 700) {
      doc.addPage();
      y = 56;
    }
    const amount = item.total ?? (item.unitPrice ? item.unitPrice * item.quantity : undefined);
    doc.setFillColor(index % 2 ? 255 : 255, index % 2 ? 250 : 247, index % 2 ? 241 : 232);
    doc.roundedRect(margin, y - 16, pageWidth - margin * 2, 34, 6, 6, 'F');
    doc.setTextColor(dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(item.name, 250), margin + 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.quantity), pageWidth - margin - 184, y);
    doc.text(item.unitPrice ? money(item.unitPrice) : '-', pageWidth - margin - 132, y);
    doc.text(amount ? money(amount) : '-', pageWidth - margin - 62, y, { align: 'right' });
    y += 40;
  });

  y += 12;
  doc.setDrawColor(line);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;
  doc.setFillColor(255, 240, 204);
  doc.roundedRect(pageWidth - margin - 220, y - 18, 220, 58, 12, 12, 'F');
  doc.setTextColor(muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(isCod && input.paymentStatus !== 'Paid' ? 'Amount due' : 'Total paid', pageWidth - margin - 200, y);
  doc.setTextColor(dark);
  doc.setFontSize(22);
  doc.text(money(input.total), pageWidth - margin - 18, y + 4, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(muted);
  doc.text(`Payment: ${paymentLabel}`, pageWidth - margin - 200, y + 26);

  doc.setDrawColor(gold);
  doc.setTextColor(gold);
  doc.setFont('helvetica', 'bold');
  doc.circle(margin + 74, y + 8, 40, 'S');
  doc.setFontSize(13);
  doc.text('EAGLE', margin + 74, y + 2, { align: 'center' });
  doc.setFontSize(9);
  doc.text('MART VERIFIED', margin + 74, y + 16, { align: 'center' });
  doc.setTextColor(muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This is a computer-generated invoice for your Eagle Mart order.', margin, 792);
  doc.text('Thank you for shopping with Eagle Mart.', pageWidth - margin, 792, { align: 'right' });
  doc.save(`Eagle-Mart-Bill-${input.orderId}.pdf`);
}

async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function App() {
  return window.location.pathname === '/admin' ? <AdminApp /> : <CustomerApp />;
}

function CustomerApp() {
  const [token, setToken] = useState(() => localStorage.getItem('freshmart-customer-token'));
  const [customer, setCustomer] = useState<UserAccount | null>(() => JSON.parse(localStorage.getItem('freshmart-customer-user') || 'null'));
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [brand, setBrand] = useState('All');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(2000);
  const [ratingFilter, setRatingFilter] = useState('0');
  const [discountFilter, setDiscountFilter] = useState('0');
  const [sort, setSort] = useState('featured');
  const [visibleProducts, setVisibleProducts] = useState(12);
  const [locationLabel, setLocationLabel] = useState(() => localStorage.getItem('freshmart-location') || 'Select location');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('address');
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2500);
  };

  const fetchHome = async () => {
    const home = await api<{ banners: Banner[]; categories: Category[]; featured: Product[]; bestSellers: Product[]; settings: StoreSettings }>('/public/home');
    setBanners(home.banners || []);
    setCategories(home.categories || []);
    setFeatured(home.featured || []);
    setBestSellers(home.bestSellers || []);
    setSettings(home.settings || null);
  };
  const fetchProducts = async () => {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (category !== 'All') params.set('category', category);
    if (brand !== 'All') params.set('brand', brand);
    if (minPrice > 0) params.set('minPrice', String(minPrice));
    if (maxPrice < 2000) params.set('maxPrice', String(maxPrice));
    if (ratingFilter !== '0') params.set('rating', ratingFilter);
    if (discountFilter !== '0') params.set('discount', discountFilter);
    const data = await api<{ products: Product[] }>(`/products?${params.toString()}`);
    let next = data.products || [];
    if (sort === 'price-low') next = [...next].sort((a, b) => Number(a.sellingPrice) - Number(b.sellingPrice));
    if (sort === 'price-high') next = [...next].sort((a, b) => Number(b.sellingPrice) - Number(a.sellingPrice));
    if (sort === 'rating') next = [...next].sort((a, b) => Number(b.rating) - Number(a.rating));
    if (sort === 'discount') next = [...next].sort((a, b) => b.discount - a.discount);
    setProducts(next);
  };
  const fetchCart = async () => token && setCart((await api<{ cart: { items: CartLine[] } }>('/cart', {}, token)).cart.items || []);
  const fetchWishlist = async () => token && setWishlist(((await api<{ wishlist: { items: Array<{ productId: string }> } }>('/wishlist', {}, token)).wishlist.items || []).map((item) => item.productId));
  const fetchOrders = async () => {
    if (!token) return;
    const data = await api<{ orders: Order[] }>('/orders', {}, token);
    setOrders((data.orders || []).filter((order) => order.orderStatus !== 'Cancelled' && order.paymentStatus !== 'Failed'));
  };

  useEffect(() => { fetchHome().catch(() => undefined); }, []);
  useEffect(() => { fetchProducts().catch(() => undefined); }, [query, category, brand, minPrice, maxPrice, ratingFilter, discountFilter, sort]);
  useEffect(() => {
    if (!token) {
      setCart([]);
      setWishlist([]);
      setOrders([]);
      return;
    }
    api<{ user: UserAccount }>('/auth/me', {}, token).then((data) => {
      setCustomer(data.user);
      localStorage.setItem('freshmart-customer-user', JSON.stringify(data.user));
      fetchCart().catch(() => undefined);
      fetchWishlist().catch(() => undefined);
      fetchOrders().catch(() => undefined);
    }).catch(() => logout());
  }, [token]);

  useEffect(() => {
    const hasOpenOverlay = cartOpen || wishlistOpen || profileOpen || authOpen || checkoutOpen || Boolean(selectedProduct);
    if (!hasOpenOverlay) return;
    const scrollY = window.scrollY;
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = previousBodyStyle.position;
      document.body.style.top = previousBodyStyle.top;
      document.body.style.left = previousBodyStyle.left;
      document.body.style.right = previousBodyStyle.right;
      document.body.style.width = previousBodyStyle.width;
      document.body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [cartOpen, wishlistOpen, profileOpen, authOpen, checkoutOpen, selectedProduct]);

  const brands = useMemo(() => ['All', ...Array.from(new Set(products.map((item) => item.brand)))], [products]);
  const visibleProductList = products.slice(0, visibleProducts);
  const wishlistProducts = useMemo(() => {
    const merged = new Map<string, Product>();
    [...products, ...featured, ...bestSellers].forEach((item) => merged.set(item.id, item));
    return wishlist.map((id) => merged.get(id)).filter(Boolean) as Product[];
  }, [wishlist, products, featured, bestSellers]);
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.product.sellingPrice) * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const saveSession = (session: { token: string; user: UserAccount }) => {
    if (session.user.role !== 'CUSTOMER') throw new Error('Use customer account on storefront');
    setToken(session.token);
    setCustomer(session.user);
    localStorage.setItem('freshmart-customer-token', session.token);
    localStorage.setItem('freshmart-customer-user', JSON.stringify(session.user));
    setAuthOpen(false);
    showToast(`Welcome, ${session.user.name}`);
  };
  const logout = () => {
    setToken(null);
    setCustomer(null);
    setCart([]);
    setWishlist([]);
    setOrders([]);
    localStorage.removeItem('freshmart-customer-token');
    localStorage.removeItem('freshmart-customer-user');
  };
  const requireCustomer = (next?: () => void) => {
    if (token && customer) {
      next?.();
      return true;
    }
    setAuthMode('login');
    setAuthOpen(true);
    return false;
  };
  const addToCart = async (product: Product, openCart = true) => {
    if (!requireCustomer()) return false;
    try {
      await api('/cart/items', { method: 'POST', body: JSON.stringify({ productId: product.id, quantity: 1 }) }, token);
      await fetchCart();
      if (openCart) setCartOpen(true);
      showToast(`${product.name} added to cart`);
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Add to cart failed', 'error');
      return false;
    }
  };
  const updateQty = async (productId: string, quantity: number) => {
    if (!token) return;
    try {
      if (quantity <= 0) await api(`/cart/items/${productId}`, { method: 'DELETE' }, token);
      else await api(`/cart/items/${productId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }, token);
      await fetchCart();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cart update failed', 'error');
      await fetchCart();
    }
  };
  const toggleWishlist = async (productId: string) => {
    if (!requireCustomer()) return;
    try {
      if (wishlist.includes(productId)) await api(`/wishlist/${productId}`, { method: 'DELETE' }, token);
      else await api('/wishlist', { method: 'POST', body: JSON.stringify({ productId }) }, token);
      await fetchWishlist();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Wishlist update failed', 'error');
    }
  };
  const buyNow = async (product: Product) => {
    if (await addToCart(product, false)) {
      setCheckoutOpen(true);
      setCheckoutStep('address');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand eagle-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><img src="/eagle_logo.png" alt="Eagle Mart" /></button>
        <button className="location-pill location-button" onClick={() => { const next = prompt('Enter delivery location', locationLabel === 'Select location' ? '' : locationLabel); if (next) { setLocationLabel(next); localStorage.setItem('freshmart-location', next); } }}><MapPin size={18} /><span>{locationLabel}</span><strong>{locationLabel === 'Select location' ? 'Set' : 'Change'}</strong></button>
        <div className="search-wrap"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Eagle Mart products..." /></div>
        <button className="icon-button wishlist-nav" onClick={() => requireCustomer(() => setWishlistOpen(true))}><Heart size={19} />{wishlist.length > 0 && <span>{wishlist.length}</span>}</button>
        {customer ? <button className="account-pill" onClick={() => setProfileOpen(true)}><User size={18} /><span>{customer.name.split(' ')[0]}</span></button> : <button className="account-pill" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}><LogIn size={18} /><span>Login</span></button>}
        <button className="cart-button" onClick={() => requireCustomer(() => setCartOpen(true))}><ShoppingBag size={19} /><span>Cart</span>{cartCount > 0 && <strong>{cartCount}</strong>}</button>
      </header>
      <main>
        <section className="hero reveal">
          <div className="hero-copy hero-card-large"><div><span className="eyebrow"><Sparkles size={16} /> Eagle Mart premium grocery</span><h1>Luxury grocery shopping with a golden Eagle Mart edge.</h1><p>Razorpay checkout, COD, saved wishlist, cart, addresses, and order tracking.</p></div><div className="hero-actions"><button className="primary" onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>Start shopping</button><button className="secondary" onClick={() => requireCustomer(() => setProfileOpen(true))}>My orders</button></div></div>
          <div className="hero-visual"><img src={banners[0]?.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85'} alt="Eagle Mart grocery banner" /></div>
          <div className="hero-side-card"><span className="eyebrow">Store settings</span><h2>Free delivery above {money(settings?.freeDeliveryAbove || 799)}</h2><p>Minimum order value {money(settings?.minOrderValue || 149)}.</p></div>
        </section>
        <OfferBanners banners={banners} />
        <CategoryStrip categories={categories} selected={category} setSelected={setCategory} total={products.length} />
        <section id="shop" className="shop-layout">
          <aside className="filters"><div className="filter-top"><h3><SlidersHorizontal size={18} /> Refine</h3></div><label className="filter-field"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="All">All categories</option>{categories.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></label><label className="filter-field"><span>Brand</span><select value={brand} onChange={(e) => setBrand(e.target.value)}>{brands.map((item) => <option key={item}>{item}</option>)}</select></label><div className="filter-field range-field"><span>Budget limit</span><strong>{money(minPrice)} - {money(maxPrice)}</strong><div className="dual-range"><input type="range" min="0" max="2000" step="10" value={minPrice} onChange={(e) => setMinPrice(Math.min(Number(e.target.value), maxPrice - 10))} /><input type="range" min="0" max="2000" step="10" value={maxPrice} onChange={(e) => setMaxPrice(Math.max(Number(e.target.value), minPrice + 10))} /></div></div><label className="filter-field"><span>Rating</span><select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}><option value="0">Any rating</option><option value="4">4 stars and above</option><option value="4.3">4.3 stars and above</option><option value="4.5">4.5 stars and above</option></select></label><label className="filter-field"><span>Discount</span><select value={discountFilter} onChange={(e) => setDiscountFilter(e.target.value)}><option value="0">Any discount</option><option value="10">10% or more</option><option value="20">20% or more</option><option value="30">30% or more</option></select></label><button className="filter-reset full" onClick={() => { setCategory('All'); setBrand('All'); setMinPrice(0); setMaxPrice(2000); setRatingFilter('0'); setDiscountFilter('0'); }}>Reset filters</button></aside>
          <section className="products-area">
            <div className="market-head reveal"><div><span className="eyebrow">Live marketplace</span><h2>{category === 'All' ? 'Shop Eagle Mart products' : categories.find((item) => item.slug === category)?.name}</h2><p>{products.length} products in this collection</p></div><label className="sort-control"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price low to high</option><option value="price-high">Price high to low</option><option value="rating">Top rated</option><option value="discount">Best discount</option></select></label></div>
            <div className="product-grid">{visibleProductList.map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} buyNow={buyNow} setSelectedProduct={setSelectedProduct} wishlist={wishlist} toggleWishlist={toggleWishlist} />)}</div>
            {products.length > visibleProducts && <div className="product-explorer-footer"><button className="primary" onClick={() => setVisibleProducts((count) => count + 12)}>Load 12 more</button></div>}
          </section>
        </section>
        <ProductRail title="Golden Picks for You" products={featured} addToCart={addToCart} buyNow={buyNow} setSelectedProduct={setSelectedProduct} wishlist={wishlist} toggleWishlist={toggleWishlist} />
        <ProductRail title="Most Loved This Week" products={bestSellers} addToCart={addToCart} buyNow={buyNow} setSelectedProduct={setSelectedProduct} wishlist={wishlist} toggleWishlist={toggleWishlist} />
        <ExperienceSections />
      </main>
      <MobileNav cartCount={cartCount} wishlistCount={wishlist.length} openCart={() => requireCustomer(() => setCartOpen(true))} openWishlist={() => requireCustomer(() => setWishlistOpen(true))} openProfile={() => requireCustomer(() => setProfileOpen(true))} openAuth={() => { setAuthMode('login'); setAuthOpen(true); }} loggedIn={Boolean(customer)} />
      {cartOpen && <CartDrawer cart={cart} updateQty={updateQty} close={() => setCartOpen(false)} checkout={() => { setCartOpen(false); setCheckoutOpen(true); setCheckoutStep('address'); }} cartTotal={cartTotal} />}
      {wishlistOpen && <WishlistModal products={wishlistProducts} wishlistCount={wishlist.length} close={() => setWishlistOpen(false)} addToCart={addToCart} buyNow={buyNow} toggleWishlist={toggleWishlist} setSelectedProduct={setSelectedProduct} />}
      {checkoutOpen && token && customer && <CheckoutModal token={token} customer={customer} updateCustomer={(user) => { setCustomer(user); localStorage.setItem('freshmart-customer-user', JSON.stringify(user)); }} step={checkoutStep} setStep={setCheckoutStep} cart={cart} total={cartTotal} settings={settings} close={() => setCheckoutOpen(false)} refreshCart={fetchCart} refreshOrders={fetchOrders} setSuccessOrder={setSuccessOrder} setCart={setCart} showToast={showToast} successOrder={successOrder} />}
      {selectedProduct && <ProductModal product={selectedProduct} close={() => setSelectedProduct(null)} addToCart={addToCart} buyNow={buyNow} wishlist={wishlist} toggleWishlist={toggleWishlist} />}
      {profileOpen && customer && <ProfileModal close={() => setProfileOpen(false)} customer={customer} orders={orders} refreshOrders={fetchOrders} token={token} logout={logout} showToast={showToast} updateCustomer={(user) => { setCustomer(user); localStorage.setItem('freshmart-customer-user', JSON.stringify(user)); }} />}
      {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} close={() => setAuthOpen(false)} saveSession={saveSession} />}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function ProductCard({ product, addToCart, buyNow, setSelectedProduct, wishlist, toggleWishlist }: { product: Product; addToCart: (p: Product) => void; buyNow: (p: Product) => void; setSelectedProduct: (p: Product) => void; wishlist: string[]; toggleWishlist: (id: string) => void }) {
  const liked = wishlist.includes(product.id);
  return <article className="product-card clickable-card" onClick={() => setSelectedProduct(product)}><button className={liked ? 'wish active' : 'wish'} onClick={(event) => { event.stopPropagation(); toggleWishlist(product.id); }}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /></button><button className="image-button" onClick={(event) => { event.stopPropagation(); setSelectedProduct(product); }}><img src={productImage(product)} onError={handleProductImageError(product)} alt={product.name} /></button><div className="product-info"><span className="deal">{product.discount}% off</span><h3>{product.name}</h3><p>{product.brand} | {product.unit}</p><div className="rating"><Star size={15} fill="currentColor" /> {Number(product.rating).toFixed(1)} <small>{product.stock > 0 ? `${product.stock} left` : 'Out'}</small></div><div className="price-row"><strong>{money(product.sellingPrice)}</strong><span>{money(product.mrp)}</span></div><div className="card-actions"><button className="secondary small" disabled={!product.stock} onClick={(event) => { event.stopPropagation(); addToCart(product); }}>Add</button><button className="primary small" disabled={!product.stock} onClick={(event) => { event.stopPropagation(); buyNow(product); }}>Buy now</button></div></div></article>;
}

function ProductRail(props: { title: string; products: Product[]; addToCart: (p: Product) => void; buyNow: (p: Product) => void; setSelectedProduct: (p: Product) => void; wishlist: string[]; toggleWishlist: (id: string) => void }) {
  if (!props.products.length) return null;
  return <section className="rail reveal"><div className="section-head compact"><h2>{props.title}</h2></div><div className="rail-scroll">{props.products.map((product) => <ProductCard key={product.id} product={product} {...props} />)}</div></section>;
}

function OfferBanners({ banners }: { banners: Banner[] }) {
  const [first, second] = banners;
  return <section className="offer-grid reveal"><div className="offer-card" style={{ backgroundImage: first?.image ? `linear-gradient(135deg, rgba(12,10,7,.88), rgba(118,82,25,.7)), url(${first.image})` : undefined }}><span>Golden banner</span><h2>{first?.title || 'Eagle Mart live offers'}</h2><p>{first?.subtitle || 'Premium grocery delivery'}</p></div><div className="offer-card accent" style={{ backgroundImage: second?.image ? `linear-gradient(135deg, rgba(255,244,219,.92), rgba(198,143,42,.76)), url(${second.image})` : undefined }}><span>Dynamic offer</span><h2>{second?.title || 'Weekend pantry edit'}</h2><p>{second?.subtitle || 'Save on gourmet essentials'}</p></div></section>;
}

function CategoryStrip({ categories, selected, setSelected, total }: { categories: Category[]; selected: string; setSelected: (v: string) => void; total: number }) {
  return <section className="category-strip reveal"><div className="category-hero-card"><span>Shop by category</span><h2>{selected === 'All' ? 'Choose your Eagle Mart aisle' : categories.find((c) => c.slug === selected)?.name}</h2></div><div className="category-pills"><button className={selected === 'All' ? 'active' : ''} onClick={() => setSelected('All')}>All Items <small>{total}</small></button>{categories.map((item) => <button key={item.id} className={selected === item.slug ? 'active' : ''} onClick={() => setSelected(item.slug)}>{item.name}</button>)}</div></section>;
}

function CartDrawer({ cart, updateQty, close, checkout, cartTotal }: { cart: CartLine[]; updateQty: (id: string, qty: number) => void; close: () => void; checkout: () => void; cartTotal: number }) {
  return <div className="overlay"><aside className="drawer"><div className="drawer-head"><h2>Your cart</h2><button className="icon-button" onClick={close}><X size={20} /></button></div><div className="cart-list">{cart.length === 0 && <div className="empty-state"><ShoppingBag size={36} /><p>Your cart is empty.</p></div>}{cart.map((item) => <div className="cart-item" key={item.product.id}><img src={productImage(item.product)} onError={handleProductImageError(item.product)} alt="" /><div><strong>{item.product.name}</strong><small>{item.product.unit}</small></div><div className="qty"><button onClick={() => updateQty(item.product.id, item.quantity - 1)}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQty(item.product.id, item.quantity + 1)}><Plus size={14} /></button></div></div>)}</div><div className="total-card"><span>Subtotal</span><strong>{money(cartTotal)}</strong></div><button className="primary full" disabled={!cart.length} onClick={checkout}>Checkout</button></aside></div>;
}

function CheckoutModal({ token, customer, updateCustomer, step, setStep, cart, total, settings, close, refreshCart, refreshOrders, setSuccessOrder, setCart, showToast, successOrder }: { token: string; customer: UserAccount; updateCustomer: (user: UserAccount) => void; step: CheckoutStep; setStep: (s: CheckoutStep) => void; cart: CartLine[]; total: number; settings: StoreSettings | null; close: () => void; refreshCart: () => Promise<void>; refreshOrders: () => Promise<void>; setSuccessOrder: (o: Order | null) => void; setCart: (c: CartLine[]) => void; showToast: (m: string, t?: Toast['type']) => void; successOrder: Order | null }) {
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('RAZORPAY');
  const defaultAddress = customer.addresses?.find((item) => item.isDefault) || customer.addresses?.[0];
  const blankAddress: SavedAddress = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: true };
  const [address, setAddress] = useState<SavedAddress>(defaultAddress || blankAddress);
  const [addingAddress, setAddingAddress] = useState(!defaultAddress);
  const [payable, setPayable] = useState(total);
  const [failureReason, setFailureReason] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<CartLine[]>(cart);
  const deliveryFee = Number(settings?.deliveryFee || 0);
  const estimatedMins = Number(settings?.estimatedDeliveryMins || 20);
  const finalTotal = Number(payable || total || 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const saveCheckoutAddress = async () => { const error = validateAddress(address); if (error) return showToast(error, 'error'); try { const data = await api<{ address: SavedAddress }>('/auth/me/addresses', { method: 'POST', body: JSON.stringify({ ...address, phone: phoneOnly(address.phone || ''), isDefault: true }) }, token); updateCustomer({ ...customer, addresses: [data.address, ...(customer.addresses || []).map((item) => ({ ...item, isDefault: false }))] }); setAddress(data.address); setAddingAddress(false); showToast('Address saved', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Address save failed', 'error'); } };
  const applyCoupon = async () => { try { const data = await api<{ totals: { total: number } }>('/coupons/apply', { method: 'POST', body: JSON.stringify({ code: couponCode }) }, token); setPayable(Number(data.totals.total)); showToast('Coupon applied'); } catch (err) { showToast(err instanceof Error ? err.message : 'Coupon failed', 'error'); } };
  const loadRazorpayCheckout = () => new Promise<void>((resolve, reject) => { if (window.Razorpay) return resolve(); const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error('Razorpay checkout failed to load')); document.body.appendChild(script); });
  const openRazorpayPayment = async (order: Order) => { const razorpayOrder = await api<RazorpayOrderPayload>('/payments/create-order', { method: 'POST', body: JSON.stringify({ orderId: order.orderId }) }, token); if (!razorpayOrder.keyId || razorpayOrder.keyId.includes('replace')) { await api('/payments/verify', { method: 'POST', body: JSON.stringify({ orderId: order.orderId, providerOrderId: razorpayOrder.providerOrderId, providerPaymentId: `demo_pay_${Date.now()}`, providerSignature: 'demo_signature' }) }, token); return; } await loadRazorpayCheckout(); await new Promise<void>((resolve, reject) => { const checkout = new window.Razorpay!({ key: razorpayOrder.keyId, amount: razorpayOrder.amount, currency: razorpayOrder.currency, name: 'Eagle Mart', description: `Order ${order.orderId}`, order_id: razorpayOrder.providerOrderId, prefill: { name: address.name, email: customer.email, contact: address.phone }, theme: { color: '#c8952d' }, handler: async (response: unknown) => { try { const result = response as RazorpaySuccess; await api('/payments/verify', { method: 'POST', body: JSON.stringify({ orderId: order.orderId, providerOrderId: result.razorpay_order_id, providerPaymentId: result.razorpay_payment_id, providerSignature: result.razorpay_signature }) }, token); resolve(); } catch (err) { reject(err); } }, modal: { ondismiss: () => reject(new Error('Razorpay payment was cancelled')) } }); checkout.on('payment.failed', (response) => reject(new Error((response as { error?: { description?: string } }).error?.description || 'Razorpay payment failed'))); checkout.open(); }); };
  const placeOrder = async () => { const error = validateAddress(address); if (error) { showToast(error, 'error'); return; } let createdOrder: Order | null = null; try { const data = await api<{ order: Order }>('/orders', { method: 'POST', body: JSON.stringify({ address: { ...address, phone: phoneOnly(address.phone || '') }, paymentMethod, couponCode: couponCode || undefined }) }, token); createdOrder = data.order; if (paymentMethod === 'RAZORPAY') await openRazorpayPayment(data.order); const paidOrder = paymentMethod === 'COD' ? data.order : { ...data.order, paymentStatus: 'Paid' }; setInvoiceItems(cart); setSuccessOrder(paidOrder); setStep('success'); setCart([]); await refreshCart(); await refreshOrders(); } catch (err) { if (createdOrder && paymentMethod === 'RAZORPAY') api('/payments/failure', { method: 'POST', body: JSON.stringify({ orderId: createdOrder.orderId, reason: err instanceof Error ? err.message : 'Razorpay payment failed' }) }, token).catch(() => undefined); setFailureReason(err instanceof Error ? err.message : 'Payment or order failed'); setStep('failure'); showToast(err instanceof Error ? err.message : 'Payment or order failed', 'error'); } };
  const downloadInvoicePdf = async () => { if (!successOrder) return; await generateInvoicePdf({ orderId: successOrder.orderId, customerName: address.name || customer.name, email: customer.email, phone: address.phone, address, items: invoiceItems.map((item) => ({ name: item.product.name, quantity: item.quantity, unitPrice: Number(item.product.sellingPrice), total: Number(item.product.sellingPrice) * item.quantity })), total: Number(successOrder.total || finalTotal), paymentStatus: successOrder.paymentStatus, paymentMethod: paymentMethod === 'COD' ? 'Cash on Delivery' : 'Razorpay / Online', orderStatus: successOrder.orderStatus, createdAt: successOrder.createdAt }); };
  return <div className="overlay"><div className="checkout modal-panel secure-checkout"><button className="icon-button checkout-close" onClick={close}><X size={20} /></button><div className="checkout-header"><div><span className="eyebrow"><ShieldCheck size={15} /> Secure checkout</span><h2>{step === 'success' ? 'Order placed successfully' : step === 'failure' ? 'Payment could not be completed' : 'Complete your Eagle Mart order'}</h2><p>{step === 'success' ? 'Download your bill and track the order from here.' : step === 'failure' ? 'Please continue shopping or try again later.' : 'Enter details and pay securely.'}</p></div></div>{step === 'failure' && <section className="checkout-success-page failure-page"><X size={70} /><h2>Payment failed</h2><p>{failureReason}</p><button className="primary" onClick={close}>Continue shopping</button></section>}{step === 'address' && <section className="checkout-panel animate-in"><div className="checkout-panel-head"><div><h3>Customer and delivery details</h3></div><button className="secondary small" onClick={() => { setAddress(blankAddress); setAddingAddress(true); }}><Plus size={16} /> Add new</button></div><div className="checkout-contact-grid"><input required value={address.name || ''} onChange={(e) => setAddress({ ...address, name: e.target.value })} placeholder="Customer full name" /><input required value={address.phone || ''} onChange={(e) => setAddress({ ...address, phone: phoneOnly(e.target.value) })} placeholder="10-digit mobile number" inputMode="numeric" maxLength={10} /></div>{customer.addresses && customer.addresses.length > 0 && <div className="checkout-address-options">{customer.addresses.map((item) => <button key={item.id || item.line1} className="checkout-address-option" onClick={() => { setAddress(item); setAddingAddress(false); }}><strong>{item.label || 'Address'}</strong><p>{item.line1}, {item.city} - {item.pincode}</p></button>)}</div>}{addingAddress && <div className="checkout-form-card"><div className="form-grid checkout-address-grid">{(['label', 'line1', 'line2', 'city', 'state', 'pincode'] as Array<keyof SavedAddress>).map((key) => <input required key={key} value={String(address[key] || '')} onChange={(e) => setAddress({ ...address, [key]: key === 'pincode' ? phoneOnly(e.target.value).slice(0, 6) : e.target.value })} placeholder={String(key)} inputMode={key === 'pincode' ? 'numeric' : undefined} maxLength={key === 'pincode' ? 6 : undefined} />)}</div><button className="secondary" onClick={saveCheckoutAddress}>Save and use address</button></div>}<button className="primary full checkout-next" onClick={() => { const error = validateAddress(address); if (error) { showToast(error, 'error'); return; } const minOrder = Number(settings?.minOrderValue || 0); if (total < minOrder) { showToast(`Minimum order value is ${money(minOrder)}`, 'error'); return; } setStep('payment'); }}>Continue to payment</button></section>}{step === 'payment' && <section className="checkout-panel animate-in"><div className="checkout-panel-head"><div><h3>Payment</h3><p>Select Razorpay or Cash on Delivery.</p></div><button className="secondary small" onClick={() => setStep('address')}>Change address</button></div><div className="coupon-box"><div><TicketPercent size={18} /><strong>Apply offer code</strong></div><div className="coupon-row"><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Try FRESH10" /><button onClick={applyCoupon}>Apply</button></div></div><div className="payment-methods focused-payment-methods"><button className={paymentMethod === 'RAZORPAY' ? 'active-pay' : ''} onClick={() => setPaymentMethod('RAZORPAY')}><ShieldCheck size={22} /><strong>Pay via Razorpay</strong><span>Card, UPI, net banking, wallet, and QR on Razorpay</span></button><button className={paymentMethod === 'COD' ? 'active-pay' : ''} onClick={() => setPaymentMethod('COD')}><Truck size={22} /><strong>Cash on Delivery</strong><span>Pay when groceries arrive</span></button></div><button className="primary full place-order-btn" onClick={placeOrder}>{paymentMethod === 'COD' ? 'Place COD order' : 'Proceed to Razorpay'}</button></section>}{step === 'success' && <section className="checkout-success-page"><CheckCircle2 size={82} /><h2>Order confirmed</h2><p>{successOrder?.orderId}</p><div className="invoice-panel"><h3>Bill summary</h3><p>{address.name} | {address.phone}</p><strong>{money(successOrder?.total || finalTotal)}</strong></div><div className="checkout-actions"><button className="secondary" onClick={downloadInvoicePdf}>Download bill PDF</button><button className="secondary" onClick={() => setStep('tracking')}>Track order</button><button className="primary" onClick={close}>Continue shopping</button></div></section>}{step === 'tracking' && <section className="checkout-success-page checkout-tracking-page"><TrackingCard order={successOrder} /><button className="primary" onClick={close}>Done</button></section>}<aside className="checkout-summary"><div className="summary-card"><h3>Order summary</h3><div className="summary-lines"><span><small>Items</small><strong>{itemCount}</strong></span><span><small>Subtotal</small><strong>{money(total)}</strong></span><span><small>Delivery</small><strong>{deliveryFee ? money(deliveryFee) : 'Free'}</strong></span><span><small>Estimated delivery</small><strong>{estimatedMins} min</strong></span></div><div className="summary-total"><span>Total payable</span><strong>{money(finalTotal)}</strong></div></div></aside></div></div>;
}

function TrackingCard({ order }: { order?: Order | null }) {
  const status = order?.orderStatus === 'OutForDelivery' ? 'Out for Delivery' : order?.orderStatus || 'Pending';
  return <div className="profile-card tracking-card"><h3>Track order</h3>{order ? <><div className="tracking-pill"><Truck size={18} /><span>{status}</span></div><p>{order.orderId}</p><div className="tracking-steps">{['Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'].map((step) => <span className={step === status ? 'active' : ''} key={step}>{step}</span>)}</div></> : <div className="profile-empty"><Package size={28} /><span>Select an order to track</span></div>}</div>;
}

function ProductModal({ product, close, addToCart, buyNow, wishlist, toggleWishlist }: { product: Product; close: () => void; addToCart: (p: Product) => void; buyNow: (p: Product) => void; wishlist: string[]; toggleWishlist: (id: string) => void }) {
  const liked = wishlist.includes(product.id);
  return <div className="overlay product-detail-overlay"><div className="product-modal modal-panel premium-product-modal"><button className="icon-button close-floating product-close" onClick={close}><X size={21} /></button><div className="product-detail-media"><span className="deal media-deal">{product.discount}% off</span><img src={productImage(product)} onError={handleProductImageError(product)} alt={product.name} /></div><div className="product-detail-content"><span className="eyebrow">Premium grocery detail</span><h2>{product.name}</h2><p>{product.brand} | {product.unit}</p><div className="rating large"><Star size={18} fill="currentColor" /> {Number(product.rating).toFixed(1)} <small>{product.reviewCount} reviews</small></div><div className="price-row big product-detail-price"><strong>{money(product.sellingPrice)}</strong><span>{money(product.mrp)}</span></div><p className="detail-copy">{product.description}</p><div className="product-detail-actions"><button className="secondary" onClick={() => toggleWishlist(product.id)}><Heart size={18} fill={liked ? 'currentColor' : 'none'} />{liked ? 'Saved' : 'Wishlist'}</button><button className="secondary" disabled={!product.stock} onClick={() => addToCart(product)}>Add to cart</button><button className="primary" disabled={!product.stock} onClick={() => buyNow(product)}>Buy now</button></div></div></div></div>;
}

function WishlistModal({ products, wishlistCount, close, addToCart, buyNow, toggleWishlist, setSelectedProduct }: { products: Product[]; wishlistCount: number; close: () => void; addToCart: (p: Product) => void; buyNow: (p: Product) => void; toggleWishlist: (id: string) => void; setSelectedProduct: (p: Product) => void }) {
  return <div className="overlay"><div className="wishlist-modal modal-panel"><div className="wishlist-hero"><div><span className="eyebrow"><Heart size={16} /> Saved favourites</span><h2>My Wishlist</h2><p>{wishlistCount} products saved.</p></div><button className="icon-button close-floating" onClick={close}><X size={20} /></button></div>{products.length === 0 ? <div className="empty-state wishlist-empty"><Heart size={44} /><h3>Your wishlist is empty</h3><button className="primary" onClick={close}>Continue shopping</button></div> : <div className="wishlist-grid">{products.map((product) => <article className="wishlist-item" key={product.id}><button className="wishlist-image" onClick={() => setSelectedProduct(product)}><img src={productImage(product)} onError={handleProductImageError(product)} alt={product.name} /></button><div className="wishlist-info"><h3>{product.name}</h3><p>{product.brand} | {product.unit}</p><div className="price-row"><strong>{money(product.sellingPrice)}</strong><span>{money(product.mrp)}</span></div><div className="wishlist-actions"><button className="secondary small" onClick={() => toggleWishlist(product.id)}>Remove</button><button className="secondary small" disabled={!product.stock} onClick={() => addToCart(product)}>Add to cart</button><button className="primary small" disabled={!product.stock} onClick={() => buyNow(product)}>Buy now</button></div></div></article>)}</div>}</div></div>;
}

function AuthModal({ mode, setMode, close, saveSession }: { mode: 'login' | 'signup'; setMode: (m: 'login' | 'signup') => void; close: () => void; saveSession: (s: { token: string; user: UserAccount }) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (!required(password) || password.length < 6) return setError('Password must be at least 6 characters.');
    if (mode === 'signup') {
      if (!required(name)) return setError('Full name is required.');
      if (!isPhone(phone)) return setError('Phone number must be exactly 10 digits.');
    }
    try {
      const data = await api<{ token: string; user: UserAccount }>(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(mode === 'login' ? { email: email.trim(), password } : { name: name.trim(), email: email.trim(), phone, password }) });
      saveSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };
  return <div className="overlay auth-overlay"><div className={`auth-modal modal-panel ${mode === 'signup' ? 'show-signup' : ''}`}><button className="icon-button close-floating" onClick={close}><X size={20} /></button><div className="auth-visual"><img className="auth-logo" src="/eagle_logo.png" alt="Eagle Mart" /><div><span className="eyebrow">Eagle Mart account</span><h2>Shop faster with your saved cart.</h2></div></div><div className="auth-flip-wrap"><div className="auth-face"><span className="eyebrow">{mode === 'login' ? 'Customer login' : 'New customer'}</span><h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>{mode === 'signup' && <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />}<input required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" type="email" />{mode === 'signup' && <input required value={phone} onChange={(e) => setPhone(phoneOnly(e.target.value))} placeholder="10-digit phone number" inputMode="numeric" maxLength={10} />}<div className="password-field"><input required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" minLength={6} type={showPassword ? 'text' : 'password'} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>{error && <small className="error">{error}</small>}<button className="primary full" onClick={submit}>{mode === 'login' ? 'Login' : 'Create account'}</button><button className="link-button auth-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create account' : 'Already have an account? Login'}</button></div></div></div></div>;
}

function ProfileModal({ close, customer, orders, refreshOrders, token, logout, showToast, updateCustomer }: { close: () => void; customer: UserAccount; orders: Order[]; refreshOrders: () => Promise<void>; token: string | null; logout: () => void; showToast: (m: string, t?: Toast['type']) => void; updateCustomer: (user: UserAccount) => void }) {
  const emptyAddress: SavedAddress = { label: 'Home', name: customer.name, phone: customer.phone || '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false };
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.orderId || '');
  const [profileForm, setProfileForm] = useState({ name: customer.name, email: customer.email, phone: customer.phone || '' });
  const [addresses, setAddresses] = useState<SavedAddress[]>(customer.addresses || []);
  const [addressForm, setAddressForm] = useState<SavedAddress>(emptyAddress);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const trackedOrder = orders.find((order) => order.orderId === selectedOrderId) || orders[0];

  useEffect(() => {
    setAddresses(customer.addresses || []);
  }, [customer.addresses]);

  useEffect(() => {
    if (!orders.length) setSelectedOrderId('');
    else if (!selectedOrderId || !orders.some((order) => order.orderId === selectedOrderId)) setSelectedOrderId(orders[0].orderId);
  }, [orders, selectedOrderId]);

  const normalizedStatus = (order?: Order | null) => order?.orderStatus === 'OutForDelivery' ? 'Out for Delivery' : order?.orderStatus || 'Pending';
  const canCancel = (order: Order) => !['Out for Delivery', 'OutForDelivery', 'Delivered', 'Cancelled'].includes(order.orderStatus);
  const canRefund = (order: Order) => normalizedStatus(order) === 'Delivered' && order.paymentStatus === 'Paid';
  const canDownloadBill = (order: Order) => order.paymentStatus !== 'Failed';
  const syncCustomer = async () => {
    if (!token) return;
    const data = await api<{ user: UserAccount }>('/auth/me', {}, token);
    updateCustomer(data.user);
    setAddresses(data.user.addresses || []);
  };
  const saveProfile = async () => {
    if (!token) return;
    if (!required(profileForm.name)) return showToast('Full name is required.', 'error');
    if (!isPhone(profileForm.phone)) return showToast('Phone number must be exactly 10 digits.', 'error');
    try {
      const data = await api<{ user: UserAccount }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name: profileForm.name.trim(), phone: phoneOnly(profileForm.phone) }) }, token);
      updateCustomer(data.user);
      showToast('Profile updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Profile update failed', 'error');
    }
  };
  const openAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm({ ...emptyAddress, isDefault: addresses.length === 0 });
    setAddressFormOpen(true);
  };
  const openEditAddress = (address: SavedAddress) => {
    setEditingAddressId(address.id || null);
    setAddressForm({ ...emptyAddress, ...address });
    setAddressFormOpen(true);
  };
  const saveAddress = async () => {
    if (!token) return;
    const error = validateAddress(addressForm);
    if (error) return showToast(error, 'error');
    try {
      const body = JSON.stringify({ ...addressForm, name: addressForm.name || profileForm.name, phone: phoneOnly(addressForm.phone || profileForm.phone) });
      if (editingAddressId) await api(`/auth/me/addresses/${editingAddressId}`, { method: 'PATCH', body }, token);
      else await api('/auth/me/addresses', { method: 'POST', body }, token);
      await syncCustomer();
      setAddressFormOpen(false);
      setEditingAddressId(null);
      showToast(editingAddressId ? 'Address updated' : 'Address added');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Address save failed', 'error');
    }
  };
  const setDefaultAddress = async (address: SavedAddress) => {
    if (!token || !address.id) return;
    try {
      await api(`/auth/me/addresses/${address.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }, token);
      await syncCustomer();
      showToast('Default address updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Default address failed', 'error');
    }
  };
  const deleteAddress = async (address: SavedAddress) => {
    if (!token || !address.id || !window.confirm('Delete this address?')) return;
    try {
      await api(`/auth/me/addresses/${address.id}`, { method: 'DELETE' }, token);
      await syncCustomer();
      showToast('Address deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Address delete failed', 'error');
    }
  };
  const cancelOrder = async (orderId: string) => {
    if (!token || !window.confirm('Cancel this order? It will be removed from your order history.')) return;
    try {
      const data = await api<{ message?: string }>(`/orders/${orderId}/cancel`, { method: 'POST' }, token);
      showToast(data.message || 'Order cancelled', 'success');
      if (selectedOrderId === orderId) setSelectedOrderId('');
      await refreshOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Order cancel failed', 'error');
    }
  };
  const refundOrder = async (orderId: string) => {
    if (!token || !window.confirm('Request refund for this delivered order?')) return;
    try {
      const data = await api<{ message?: string }>(`/orders/${orderId}/refund`, { method: 'POST' }, token);
      showToast(data.message || 'Refund request approved', 'success');
      await refreshOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Refund request failed', 'error');
    }
  };
  const reorder = async (orderId: string) => {
    if (!token) return;
    await api(`/orders/${orderId}/reorder`, { method: 'POST' }, token);
    showToast('Previous order added to cart');
  };
  const downloadOrderBill = async (order: Order) => {
    const defaultAddress = addresses.find((item) => item.isDefault) || addresses[0];
    await generateInvoicePdf({
      orderId: order.orderId,
      customerName: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: defaultAddress,
      items: order.items?.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: Number(item.price || 0) || undefined, total: Number(item.total || 0) || undefined })) || [],
      total: Number(order.total),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentStatus === 'Paid' ? 'Razorpay / Online' : 'Cash on Delivery',
      orderStatus: normalizedStatus(order),
      createdAt: order.createdAt,
    });
  };

  return <div className="overlay"><div className="profile-modal modal-panel"><button className="icon-button close-floating" onClick={close}><X size={20} /></button><div className="profile-hero"><div className="profile-avatar">{customer.name.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow"><User size={15} /> Eagle Mart account</span><h2>{customer.name}</h2><p>{customer.email}{customer.phone ? ` | ${customer.phone}` : ''}</p></div><button className="secondary small" onClick={logout}><LogOut size={16} /> Logout</button></div><div className="profile-stats compact-profile-stats single-profile-stat"><div><ShoppingBag size={18} /><span>Total orders</span><strong>{orders.length}</strong></div></div><div className="profile-dashboard refined-profile-dashboard"><div className="profile-left-column"><section className="profile-card edit-profile-card"><div className="profile-card-head"><div><span className="eyebrow">Personal details</span><h3>Edit profile</h3></div><button className="primary small" onClick={saveProfile}>Save</button></div><div className="profile-form-grid"><label>Full name<input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></label><label>Email address<input value={profileForm.email} disabled /></label><label>Phone number<input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></label></div></section><section className="profile-card address-manager-card"><div className="profile-card-head"><div><span className="eyebrow">Delivery book</span><h3>Saved addresses</h3></div><button className="primary small" onClick={openAddAddress}><Plus size={16} /> Add new</button></div>{addresses.length === 0 ? <div className="profile-empty"><MapPin size={28} /><span>No saved address yet</span></div> : <div className="saved-address-list">{addresses.map((address) => <article className={`address-card ${address.isDefault ? 'default' : ''}`} key={address.id || address.line1} onClick={() => setDefaultAddress(address)}><button className="default-radio" aria-label="Set default address"><span /></button><div><strong>{address.label || 'Address'}</strong>{address.isDefault && <em>Default</em>}</div><p>{address.name || customer.name} | {address.phone || customer.phone}</p><p>{address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} - {address.pincode}</p><div className="address-actions"><button className="secondary small" onClick={(event) => { event.stopPropagation(); openEditAddress(address); }}>Edit</button><button className="secondary small danger-lite" onClick={(event) => { event.stopPropagation(); deleteAddress(address); }}>Delete</button></div></article>)}</div>}{addressFormOpen && <div className="address-form-card"><div className="profile-card-head"><div><h3>{editingAddressId ? 'Edit address' : 'Add address'}</h3></div><button className="secondary small" onClick={() => setAddressFormOpen(false)}>Close</button></div><div className="address-form-grid">{(['label', 'name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'] as Array<keyof SavedAddress>).map((key) => <label key={key}>{String(key)}<input value={String(addressForm[key] || '')} onChange={(event) => setAddressForm({ ...addressForm, [key]: event.target.value })} /></label>)}</div><label className="check-row"><input type="checkbox" checked={Boolean(addressForm.isDefault)} onChange={(event) => setAddressForm({ ...addressForm, isDefault: event.target.checked })} /> Use as default address</label><button className="primary full" onClick={saveAddress}>Save address</button></div>}</section></div><div className="profile-right-column"><TrackingCard order={trackedOrder} /><section className="profile-card order-history-card"><div className="profile-card-head"><div><span className="eyebrow">Purchases</span><h3>Order history</h3></div><button className="secondary small" onClick={refreshOrders}>Refresh</button></div>{orders.length === 0 ? <div className="profile-empty"><ShoppingBag size={28} /><span>No orders yet</span></div> : orders.map((order) => <div className={`profile-order enhanced-order ${trackedOrder?.orderId === order.orderId ? 'selected-order' : ''}`} key={order.orderId} onClick={() => setSelectedOrderId(order.orderId)}><div className="order-info"><strong>{order.orderId}</strong><span>{normalizedStatus(order)} | {money(order.total)}</span><small>Payment: {order.paymentStatus}</small></div><div className="order-actions">{canDownloadBill(order) && <button className="order-action-btn bill" onClick={(event) => { event.stopPropagation(); downloadOrderBill(order); }}><TicketPercent size={15} /> Bill</button>}<button className="order-action-btn track" onClick={(event) => { event.stopPropagation(); setSelectedOrderId(order.orderId); }}><Truck size={15} /> Track</button><button className="order-action-btn reorder" onClick={(event) => { event.stopPropagation(); reorder(order.orderId); }}><ShoppingBag size={15} /> Reorder</button><button className="order-action-btn cancel" disabled={!canCancel(order)} onClick={(event) => { event.stopPropagation(); cancelOrder(order.orderId); }}><X size={15} /> Cancel</button><button className="order-action-btn refund" disabled={!canRefund(order)} onClick={(event) => { event.stopPropagation(); refundOrder(order.orderId); }}><ShieldCheck size={15} /> Refund</button></div></div>)}</section></div></div></div></div>;
}

function ExperienceSections() {
  const [contact, setContact] = useState({ name: '', email: '', phone: '', subject: 'Product enquiry', message: '' });
  const [sent, setSent] = useState('');
  const submitContact = async () => {
    if (!required(contact.name)) return setSent('Full name is required.');
    if (!isEmail(contact.email)) return setSent('Enter a valid email address.');
    if (!isPhone(contact.phone)) return setSent('Phone number must be exactly 10 digits.');
    if (!required(contact.subject)) return setSent('Please select an enquiry type.');
    if (contact.message.trim().length < 8) return setSent('Please write a proper enquiry message.');
    try {
      await api('/contact/enquiries', { method: 'POST', body: JSON.stringify({ ...contact, email: contact.email.trim(), phone: phoneOnly(contact.phone) }) });
      setSent('Your enquiry has been sent to Eagle Mart support.');
      setContact({ name: '', email: '', phone: '', subject: 'Product enquiry', message: '' });
    } catch (err) {
      setSent(err instanceof Error ? err.message : 'Enquiry failed');
    }
  };
  const faqs = [
    ['How fast is Eagle Mart delivery?', 'Most orders are prepared for quick local delivery based on store settings and available slots.'],
    ['Can I save products for later?', 'Yes. Login first, then use the heart icon to save wishlist items permanently in your account.'],
    ['How do I track my order?', 'Open Profile, choose an order from order history, and the tracking card will show the selected order status.'],
    ['Can I cancel an order?', 'Orders can be cancelled before dispatch. After out-for-delivery, cancellation is disabled.'],
    ['When can I request a refund?', 'Refund can be requested only after successful delivery and inside the allowed return window.'],
  ];
  return <><section className="why reveal">{[['Golden experience', 'Premium Eagle Mart shopping.'], ['Secure payment', 'Razorpay and COD checkout.'], ['Order tracking', 'Track selected orders.'], ['Protected account', 'Cart, wishlist and orders are saved.']].map(([title, copy]) => <div className="why-card" key={title}><ShieldCheck /><h3>{title}</h3><p>{copy}</p></div>)}</section><section className="faq-news reveal restored-support-section"><div className="faq-card"><span className="eyebrow">Help center</span><h2>Questions before checkout?</h2><div className="faq-list">{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{answer}</p></details>)}</div></div><div className="contact-card"><span className="eyebrow">Contact us</span><h2>Send an enquiry</h2><div className="contact-form"><div className="form-grid"><input required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Full name" /><input required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="Email address" type="email" /><input required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: phoneOnly(e.target.value) })} placeholder="10-digit phone number" inputMode="numeric" maxLength={10} /><select required value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })}><option>Product enquiry</option><option>Delivery support</option><option>Payment issue</option><option>Order help</option></select></div><textarea required value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} placeholder="Tell us what you need help with" /><button className="primary full" onClick={submitContact}>Send enquiry</button>{sent && <small>{sent}</small>}</div></div></section><PremiumFooter /></>;
}
function PremiumFooter() {
  const [policy, setPolicy] = useState<{ title: string; body: string } | null>(null);
  const openPolicy = (title: string, body: string) => setPolicy({ title, body });
  return <>
    <footer className="premium-footer original-footer eagle-footer">
      <div className="footer-main">
        <div className="footer-brand-block">
          <img src="/eagle_logo.png" alt="Eagle Mart" />
          <span className="eyebrow">Luxury grocery club</span>
          <strong>Eagle Mart</strong>
          <p>Premium grocery delivery with secure checkout, saved cart, wishlist, and live order tracking.</p>
          <div className="footer-trust-row"><span>Secure checkout</span><span>Saved cart</span><span>Razorpay ready</span></div>
        </div>
        <div className="footer-column">
          <h3>Shop</h3>
          <button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>All products</button>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Fresh aisles</button>
          <button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>Golden offers</button>
          <button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}>Best sellers</button>
        </div>
        <div className="footer-column">
          <h3>Support</h3>
          <button onClick={() => openPolicy('Contact enquiry', 'Need help with a product, delivery, payment, refund, or account issue? Send an enquiry from the contact section with your name, phone number, email, and message. Eagle Mart support will review your request and contact you using the details provided.')}>Contact enquiry</button>
          <button onClick={() => openPolicy('Order tracking', 'After placing an order, open your profile and select the order you want to track. Eagle Mart shows the latest status such as Pending, Confirmed, Packed, Out for Delivery, or Delivered.')}>Order tracking</button>
          <button onClick={() => openPolicy('Returns and refunds', 'You can request a refund only after the order has been delivered successfully and within the eligible return window. Refunds may be reviewed for damaged, missing, incorrect, or quality-related items. Orders cannot be cancelled after dispatch.')}>Returns help</button>
          <button onClick={() => openPolicy('Store information', 'Delivery fee, minimum order value, free delivery threshold, estimated delivery time, offers, and product availability may change based on Eagle Mart store operations and your selected delivery location.')}>Store settings</button>
        </div>
        <div className="footer-column">
          <h3>Policies</h3>
          <button onClick={() => openPolicy('Privacy policy', 'Eagle Mart uses your account details, phone number, saved addresses, cart, wishlist, orders, and enquiry messages only to provide shopping, delivery, support, and account services. We do not ask for card PINs or banking passwords. Payment processing is handled through secure payment providers.')}>Privacy policy</button>
          <button onClick={() => openPolicy('Cancellation policy', 'You may cancel an order while it is Pending, Confirmed, or Packed. Once the order is Out for Delivery or Delivered, cancellation is not available. If there is a problem after delivery, you can request refund support where eligible.')}>Cancellation policy</button>
          <button onClick={() => openPolicy('Payment security', 'Eagle Mart supports Cash on Delivery and secure online payment through Razorpay. For online payments, card, UPI, wallet, and net banking details are processed by the payment provider. Eagle Mart does not store your full card details or banking credentials.')}>Payment security</button>
          <button onClick={() => openPolicy('Delivery policy', 'Delivery is available for serviceable locations only. Delivery fee, free delivery eligibility, minimum order value, and estimated delivery time are shown during checkout. Some products may become unavailable if stock changes before order confirmation.')}>Delivery policy</button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Eagle Mart. All rights reserved.</span>
        <button onClick={() => openPolicy('Privacy policy', 'Eagle Mart uses your account details, phone number, saved addresses, cart, wishlist, orders, and enquiry messages only to provide shopping, delivery, support, and account services. We do not ask for card PINs or banking passwords. Payment processing is handled through secure payment providers.')}>Privacy policy</button>
      </div>
    </footer>
    {policy && <div className="overlay footer-policy-overlay"><div className="footer-policy"><button className="icon-button close-floating" onClick={() => setPolicy(null)}><X size={20} /></button><span className="eyebrow">Eagle Mart support</span><h2>{policy.title}</h2><p>{policy.body}</p><button className="primary full" onClick={() => setPolicy(null)}>Done</button></div></div>}
  </>;
}
function MobileNav({ cartCount, wishlistCount, openCart, openWishlist, openProfile, openAuth, loggedIn }: { cartCount: number; wishlistCount: number; openCart: () => void; openWishlist: () => void; openProfile: () => void; openAuth: () => void; loggedIn: boolean }) { return <nav className="mobile-nav"><button><Home size={19} />Home</button><button onClick={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })}><Search size={19} />Shop</button><button onClick={openWishlist}><Heart size={19} />Wishlist{wishlistCount > 0 ? ` ${wishlistCount}` : ''}</button><button onClick={openCart}><ShoppingBag size={19} />Cart{cartCount > 0 ? ` ${cartCount}` : ''}</button><button onClick={loggedIn ? openProfile : openAuth}><User size={19} />{loggedIn ? 'Profile' : 'Login'}</button></nav>; }
function AdminApp() {
  type AdminDashboardData = { revenue: number; orders: number; customers: number; lowStock: number };
  type InventoryRow = { product: Product; stock: number };
  type AdminCustomer = { id: string; name: string; email: string; phone?: string; isActive?: boolean; _count?: { orders?: number } | number };
  type AdminCoupon = { id: string; code: string; description?: string; type?: string; value: number | string; minOrderValue?: number | string; isActive?: boolean };
  type AdminSettings = Partial<StoreSettings> & { storeName?: string; isStoreOpen?: boolean; supportEmail?: string; supportPhone?: string };
  type AdminEnquiry = { id: string; name: string; email: string; phone: string; subject: string; message: string; status: string; createdAt: string };
  type ProductForm = { id?: string; name: string; brand: string; categoryId: string; description: string; image: string; mrp: string; sellingPrice: string; discount: string; unit: string; stock: string; lowStockThreshold: string; isFeatured: boolean; isBestSeller: boolean; isActive: boolean };
  type CouponForm = { id?: string; code: string; description: string; type: string; value: string; minOrderValue: string; isActive: boolean };
  type SettingsForm = { storeName: string; supportEmail: string; supportPhone: string; minOrderValue: string; freeDeliveryAbove: string; deliveryFee: string; taxPercent: string; estimatedDeliveryMins: string; isStoreOpen: boolean };
  const emptyProductForm: ProductForm = { name: '', brand: '', categoryId: '', description: '', image: '', mrp: '', sellingPrice: '', discount: '0', unit: '', stock: '', lowStockThreshold: '5', isFeatured: false, isBestSeller: false, isActive: true };
  const emptyCouponForm: CouponForm = { code: '', description: '', type: 'FIXED', value: '', minOrderValue: '0', isActive: true };
  const emptySettingsForm: SettingsForm = { storeName: 'Eagle Mart', supportEmail: 'support@eaglemart.com', supportPhone: '+91 90000 11111', minOrderValue: '149', freeDeliveryAbove: '799', deliveryFee: '39', taxPercent: '5', estimatedDeliveryMins: '20', isStoreOpen: true };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState<UserAccount | null>(() => JSON.parse(localStorage.getItem('freshmart-admin-user') || 'null'));
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('freshmart-admin-token'));
  const [adminTab, setAdminTab] = useState('Dashboard');
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [dashboard, setDashboard] = useState<AdminDashboardData>({ revenue: 0, orders: 0, customers: 0, lowStock: 0 });
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [adminInventory, setAdminInventory] = useState<InventoryRow[]>([]);
  const [inventoryDrafts, setInventoryDrafts] = useState<Record<string, { stock: string; lowStockThreshold: string }>>({});
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(10);
  const [savingInventoryId, setSavingInventoryId] = useState('');
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPageSize, setCustomerPageSize] = useState(8);
  const [savingCustomerId, setSavingCustomerId] = useState('');
  const [adminCoupons, setAdminCoupons] = useState<AdminCoupon[]>([]);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCouponForm);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [couponEditorOpen, setCouponEditorOpen] = useState(false);
  const [couponSearch, setCouponSearch] = useState('');
  const [couponPage, setCouponPage] = useState(1);
  const [couponPageSize, setCouponPageSize] = useState(8);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(emptySettingsForm);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [adminEnquiries, setAdminEnquiries] = useState<AdminEnquiry[]>([]);
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productMessage, setProductMessage] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(10);
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [orderMessage, setOrderMessage] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(8);

  const revenueBars = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString(undefined, { weekday: 'short' }), total: 0 };
    });
    adminOrders.forEach((order) => {
      if (order.paymentStatus === 'Failed') return;
      const key = new Date(order.createdAt).toISOString().slice(0, 10);
      const day = days.find((item) => item.key === key);
      if (day) day.total += Number(order.total || 0);
    });
    const max = Math.max(...days.map((item) => item.total), 1);
    return days.map((item) => ({ ...item, height: Math.max(8, Math.round((item.total / max) * 130)) }));
  }, [adminOrders]);

  const lowStockItems = useMemo(() => adminInventory.filter((item) => item.stock <= Number(item.product.lowStockThreshold || 10)).slice(0, 5), [adminInventory]);
  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    if (!term) return adminInventory;
    return adminInventory.filter((item) => [item.product.name, item.product.brand, item.product.category?.name].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [adminInventory, inventorySearch]);
  const filteredCoupons = useMemo(() => {
    const term = couponSearch.trim().toLowerCase();
    if (!term) return adminCoupons;
    return adminCoupons.filter((coupon) => [coupon.code, coupon.description, coupon.type].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [adminCoupons, couponSearch]);
  const couponTotalPages = Math.max(1, Math.ceil(filteredCoupons.length / couponPageSize));
  const paginatedCoupons = useMemo(() => {
    const start = (couponPage - 1) * couponPageSize;
    return filteredCoupons.slice(start, start + couponPageSize);
  }, [filteredCoupons, couponPage, couponPageSize]);
  const inventoryTotalPages = Math.max(1, Math.ceil(filteredInventory.length / inventoryPageSize));
  const paginatedInventory = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return filteredInventory.slice(start, start + inventoryPageSize);
  }, [filteredInventory, inventoryPage, inventoryPageSize]);
  const lowInventoryCount = adminInventory.filter((item) => item.stock <= Number(item.product.lowStockThreshold || 10)).length;
  const outOfStockCount = adminInventory.filter((item) => item.stock <= 0).length;
  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return adminCustomers;
    return adminCustomers.filter((customer) => [customer.name, customer.email, customer.phone].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [adminCustomers, customerSearch]);
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / customerPageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (customerPage - 1) * customerPageSize;
    return filteredCustomers.slice(start, start + customerPageSize);
  }, [filteredCustomers, customerPage, customerPageSize]);
  const activeCustomerCount = adminCustomers.filter((customer) => customer.isActive !== false).length;
  const blockedCustomerCount = adminCustomers.length - activeCustomerCount;
  const pendingOrders = adminOrders.filter((order) => ['Pending', 'Confirmed', 'Packed'].includes(order.orderStatus)).length;
  const deliveredOrders = adminOrders.filter((order) => order.orderStatus === 'Delivered').length;
  const cancelledOrders = adminOrders.filter((order) => order.orderStatus === 'Cancelled').length;
  const orderRevenue = adminOrders.filter((order) => order.paymentStatus !== 'Failed' && order.orderStatus !== 'Cancelled').reduce((sum, order) => sum + Number(order.total || 0), 0);
  const orderTotalPages = Math.max(1, Math.ceil(adminOrders.length / orderPageSize));
  const paginatedAdminOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return adminOrders.slice(start, start + orderPageSize);
  }, [adminOrders, orderPage, orderPageSize]);
  const filteredAdminProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return adminProducts;
    return adminProducts.filter((product) => [product.name, product.brand, product.category?.name, product.unit].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [adminProducts, productSearch]);
  const productTotalPages = Math.max(1, Math.ceil(filteredAdminProducts.length / productPageSize));
  const activeProductCount = adminProducts.filter((product) => product.isActive).length;
  const inactiveProductCount = adminProducts.length - activeProductCount;
  const paginatedAdminProducts = useMemo(() => {
    const start = (productPage - 1) * productPageSize;
    return filteredAdminProducts.slice(start, start + productPageSize);
  }, [filteredAdminProducts, productPage, productPageSize]);

  useEffect(() => {
    if (productPage > productTotalPages) setProductPage(productTotalPages);
  }, [productPage, productTotalPages]);

  useEffect(() => {
    if (orderPage > orderTotalPages) setOrderPage(orderTotalPages);
  }, [orderPage, orderTotalPages]);

  useEffect(() => {
    if (inventoryPage > inventoryTotalPages) setInventoryPage(inventoryTotalPages);
  }, [inventoryPage, inventoryTotalPages]);

  useEffect(() => {
    if (couponPage > couponTotalPages) setCouponPage(couponTotalPages);
  }, [couponPage, couponTotalPages]);

  useEffect(() => {
    if (customerPage > customerTotalPages) setCustomerPage(customerTotalPages);
  }, [customerPage, customerTotalPages]);

  const fetchAdminData = async (tokenValue = adminToken) => {
    if (!tokenValue) return;
    setLoadingAdmin(true);
    setAdminError('');
    try {
      const [dash, ordersData, productsData, inventoryData, customersData, couponsData, settingsData, categoriesData, enquiriesData] = await Promise.all([
        api<AdminDashboardData>('/admin/dashboard', {}, tokenValue),
        api<{ orders: Order[] }>('/orders/admin/all', {}, tokenValue),
        api<{ products: Product[] }>('/products/admin/all', {}, tokenValue),
        api<{ inventory: InventoryRow[] }>('/admin/inventory', {}, tokenValue),
        api<{ customers: AdminCustomer[] }>('/admin/customers', {}, tokenValue),
        api<{ coupons: AdminCoupon[] }>('/admin/coupons', {}, tokenValue),
        api<{ settings: AdminSettings }>('/admin/settings', {}, tokenValue),
        api<{ categories: Category[] }>('/categories', {}, tokenValue),
        api<{ enquiries: AdminEnquiry[] }>('/admin/enquiries', {}, tokenValue),
      ]);
      setDashboard(dash);
      setAdminOrders(ordersData.orders || []);
      setAdminProducts(productsData.products || []);
      setAdminInventory(inventoryData.inventory || []);
      setAdminCustomers(customersData.customers || []);
      setAdminCoupons(couponsData.coupons || []);
      setAdminSettings(settingsData.settings || null);
      setAdminCategories(categoriesData.categories || []);
      setAdminEnquiries(enquiriesData.enquiries || []);
      setProductForm((current) => current.categoryId ? current : { ...current, categoryId: categoriesData.categories?.[0]?.id || '' });
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Admin data failed to load');
    } finally {
      setLoadingAdmin(false);
    }
  };

  useEffect(() => {
    if (admin?.role === 'ADMIN' && adminToken) fetchAdminData(adminToken);
  }, [admin?.role, adminToken]);

  useEffect(() => {
    setInventoryDrafts(Object.fromEntries(adminInventory.map((item) => [item.product.id, { stock: String(item.stock), lowStockThreshold: String(item.product.lowStockThreshold || 10) }])));
  }, [adminInventory]);

  useEffect(() => {
    if (!adminSettings) return;
    setSettingsForm({
      storeName: adminSettings.storeName || 'Eagle Mart',
      supportEmail: adminSettings.supportEmail || 'support@eaglemart.com',
      supportPhone: adminSettings.supportPhone || '+91 90000 11111',
      minOrderValue: String(adminSettings.minOrderValue ?? 149),
      freeDeliveryAbove: String(adminSettings.freeDeliveryAbove ?? 799),
      deliveryFee: String(adminSettings.deliveryFee ?? 39),
      taxPercent: String(adminSettings.taxPercent ?? 5),
      estimatedDeliveryMins: String(adminSettings.estimatedDeliveryMins ?? 20),
      isStoreOpen: adminSettings.isStoreOpen !== false,
    });
  }, [adminSettings]);

  const submitAdmin = async () => {
    setError('');
    if (!isEmail(email)) return setError('Enter a valid admin email address.');
    if (!required(password) || password.length < 6) return setError('Password must be at least 6 characters.');
    try {
      const data = await api<{ token: string; user: UserAccount }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      if (data.user.role !== 'ADMIN') return setError('Only admin users can access this panel.');
      localStorage.setItem('freshmart-admin-token', data.token);
      localStorage.setItem('freshmart-admin-user', JSON.stringify(data.user));
      setAdminToken(data.token);
      setAdmin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
    }
  };

  const logoutAdmin = () => {
    localStorage.removeItem('freshmart-admin-token');
    localStorage.removeItem('freshmart-admin-user');
    setAdminToken(null);
    setAdmin(null);
  };

  const customerOrderCount = (customer: AdminCustomer) => typeof customer._count === 'number' ? customer._count : customer._count?.orders || 0;
  const toggleAdminCustomerStatus = async (customer: AdminCustomer) => {
    if (!adminToken) return;
    setSavingCustomerId(customer.id);
    try {
      await api(`/admin/customers/${customer.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: customer.isActive === false }) }, adminToken);
      await fetchAdminData(adminToken);
    } finally {
      setSavingCustomerId('');
    }
  };
  const deleteAdminCustomer = async (customer: AdminCustomer) => {
    if (!adminToken || !window.confirm(`Delete ${customer.name || customer.email} permanently from database? This removes the customer account and related records.`)) return;
    setSavingCustomerId(customer.id);
    try {
      await api(`/admin/customers/${customer.id}`, { method: 'DELETE' }, adminToken);
      await fetchAdminData(adminToken);
    } finally {
      setSavingCustomerId('');
    }
  };
  const orderStatuses = ['Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];
  const updateAdminOrderStatus = async (order: Order, status: string) => {
    if (!adminToken || order.orderStatus === status) return;
    setOrderMessage('');
    setUpdatingOrderId(order.orderId);
    try {
      await api(`/orders/${order.orderId}/status`, { method: 'PATCH', body: JSON.stringify({ orderStatus: status }) }, adminToken);
      await fetchAdminData(adminToken);
    } catch (err) {
      setOrderMessage(err instanceof Error ? err.message : 'Order status update failed');
    } finally {
      setUpdatingOrderId('');
    }
  };
  const startAddProduct = () => { setProductForm({ ...emptyProductForm, categoryId: adminCategories[0]?.id || '' }); setProductMessage(''); setProductEditorOpen(true); };
  const startEditProduct = (product: Product) => { setProductForm({ id: product.id, name: product.name, brand: product.brand, categoryId: product.categoryId || product.category?.id || adminCategories[0]?.id || '', description: product.description, image: product.images?.[0] || '', mrp: String(product.mrp), sellingPrice: String(product.sellingPrice), discount: String(product.discount), unit: product.unit, stock: String(product.stock), lowStockThreshold: String(product.lowStockThreshold || 5), isFeatured: product.isFeatured, isBestSeller: product.isBestSeller, isActive: product.isActive }); setProductMessage(''); setProductEditorOpen(true); };
  const resetProductForm = () => { setProductForm({ ...emptyProductForm, categoryId: adminCategories[0]?.id || '' }); setProductMessage(''); };
  const uploadProductImage = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setProductMessage('Please upload a valid image file.');
    const reader = new FileReader();
    reader.onload = () => setProductForm((current) => ({ ...current, image: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };
  const productPayload = () => ({
    name: productForm.name.trim(),
    brand: productForm.brand.trim(),
    categoryId: productForm.categoryId,
    description: productForm.description.trim(),
    images: productForm.image.trim() || groceryImages[imageIndex(productForm.name || productForm.brand)],
    mrp: Number(productForm.mrp),
    sellingPrice: Number(productForm.sellingPrice),
    discount: Number(productForm.discount || 0),
    unit: productForm.unit.trim(),
    stock: Number(productForm.stock),
    lowStockThreshold: Number(productForm.lowStockThreshold || 5),
    isFeatured: productForm.isFeatured,
    isBestSeller: productForm.isBestSeller,
    isActive: productForm.isActive,
  });
  const saveAdminProduct = async () => {
    if (!adminToken) return;
    setProductMessage('');
    const payload = productPayload();
    if (!payload.name || !payload.brand || !payload.categoryId || !payload.description || !payload.unit) return setProductMessage('All product details are mandatory.');
    if (payload.mrp <= 0 || payload.sellingPrice <= 0 || payload.stock < 0 || payload.discount < 0) return setProductMessage('Enter valid price, discount, and stock values.');
    setSavingProduct(true);
    try {
      if (productForm.id) await api(`/products/${productForm.id}`, { method: 'PUT', body: JSON.stringify(payload) }, adminToken);
      else await api('/products', { method: 'POST', body: JSON.stringify(payload) }, adminToken);
      setProductMessage(productForm.id ? 'Product updated successfully.' : 'Product added successfully.');
      resetProductForm();
      setProductEditorOpen(false);
      await fetchAdminData(adminToken);
    } catch (err) {
      setProductMessage(err instanceof Error ? err.message : 'Product save failed');
    } finally {
      setSavingProduct(false);
    }
  };
  const deleteAdminProduct = async (product: Product) => {
    if (!adminToken || !window.confirm(`Delete ${product.name} permanently from database?`)) return;
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' }, adminToken);
      setProductMessage('Product permanently deleted from database.');
      await fetchAdminData(adminToken);
    } catch (err) {
      setProductMessage(err instanceof Error ? err.message : 'Product delete failed');
    }
  };
  const toggleAdminProductStatus = async (product: Product) => {
    if (!adminToken) return;
    const nextActive = !product.isActive;
    setProductMessage('');
    try {
      await api(`/products/${product.id}`, { method: 'PUT', body: JSON.stringify({ isActive: nextActive }) }, adminToken);
      
      await fetchAdminData(adminToken);
    } catch (err) {
      setProductMessage(err instanceof Error ? err.message : 'Product status update failed');
    }
  };
  const saveInventoryItem = async (item: InventoryRow) => {
    if (!adminToken) return;
    const draft = inventoryDrafts[item.product.id] || { stock: String(item.stock), lowStockThreshold: String(item.product.lowStockThreshold || 10) };
    const stock = Number(draft.stock);
    const lowStockThreshold = Number(draft.lowStockThreshold);
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) return;
    setSavingInventoryId(item.product.id);
    try {
      await api(`/admin/inventory/${item.product.id}`, { method: 'PATCH', body: JSON.stringify({ stock, lowStockThreshold }) }, adminToken);
      await fetchAdminData(adminToken);
    } finally {
      setSavingInventoryId('');
    }
  };
  const resetCouponForm = () => setCouponForm(emptyCouponForm);
  const startAddCoupon = () => { resetCouponForm(); setCouponEditorOpen(true); };
  const startEditCoupon = (coupon: AdminCoupon) => { setCouponForm({ id: coupon.id, code: coupon.code, description: coupon.description || 'Eagle Mart coupon', type: coupon.type || 'FIXED', value: String(coupon.value || 0), minOrderValue: String(coupon.minOrderValue || 0), isActive: coupon.isActive !== false }); setCouponEditorOpen(true); };
  const saveAdminCoupon = async () => {
    if (!adminToken) return;
    if (!couponForm.code.trim() || !couponForm.type || couponForm.value === '') return;
    setSavingCoupon(true);
    const payload = { code: couponForm.code.trim().toUpperCase(), description: couponForm.description.trim() || 'Eagle Mart coupon', type: couponForm.type, value: Number(couponForm.value || 0), minOrderValue: Number(couponForm.minOrderValue || 0), isActive: couponForm.isActive };
    try {
      if (couponForm.id) await api(`/admin/coupons/${couponForm.id}`, { method: 'PUT', body: JSON.stringify(payload) }, adminToken);
      else await api('/admin/coupons', { method: 'POST', body: JSON.stringify(payload) }, adminToken);
      resetCouponForm();
      setCouponEditorOpen(false);
      await fetchAdminData(adminToken);
    } finally {
      setSavingCoupon(false);
    }
  };
  const deleteAdminCoupon = async (coupon: AdminCoupon) => {
    if (!adminToken || !window.confirm(`Delete coupon ${coupon.code} permanently?`)) return;
    await api(`/admin/coupons/${coupon.id}`, { method: 'DELETE' }, adminToken);
    if (couponForm.id === coupon.id) resetCouponForm();
    await fetchAdminData(adminToken);
  };
  const updateAdminCouponStatus = async (coupon: AdminCoupon, isActive: boolean) => {
    if (!adminToken || (coupon.isActive !== false) === isActive) return;
    await api(`/admin/coupons/${coupon.id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }, adminToken);
    await fetchAdminData(adminToken);
  };
  const saveAdminSettings = async () => {
    if (!adminToken) return;
    setSettingsMessage('');
    if (!settingsForm.storeName.trim()) return setSettingsMessage('Store name is required.');
    if (!isEmail(settingsForm.supportEmail)) return setSettingsMessage('Enter a valid support email.');
    const payload = {
      storeName: settingsForm.storeName.trim(),
      supportEmail: settingsForm.supportEmail.trim(),
      supportPhone: settingsForm.supportPhone.trim(),
      minOrderValue: Number(settingsForm.minOrderValue || 0),
      freeDeliveryAbove: Number(settingsForm.freeDeliveryAbove || 0),
      deliveryFee: Number(settingsForm.deliveryFee || 0),
      taxPercent: Number(settingsForm.taxPercent || 0),
      estimatedDeliveryMins: Number(settingsForm.estimatedDeliveryMins || 0),
      isStoreOpen: settingsForm.isStoreOpen,
    };
    if (payload.minOrderValue < 0 || payload.freeDeliveryAbove < 0 || payload.deliveryFee < 0 || payload.taxPercent < 0 || payload.estimatedDeliveryMins < 1) return setSettingsMessage('Enter valid positive store values.');
    setSavingSettings(true);
    try {
      const data = await api<{ settings: AdminSettings }>('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }, adminToken);
      setAdminSettings(data.settings);
      setSettingsMessage('Store settings saved. Customer homepage and checkout will use the updated values.');
      await fetchAdminData(adminToken);
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : 'Settings save failed');
    } finally {
      setSavingSettings(false);
    }
  };
  const updateAdminEnquiryStatus = async (enquiry: AdminEnquiry, status: string) => {
    if (!adminToken || enquiry.status === status) return;
    await api(`/admin/enquiries/${enquiry.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, adminToken);
    await fetchAdminData(adminToken);
  };
  const renderAdminRows = (headers: string[], rows: Array<Array<string | number>>) => <div className="admin-data-table" style={{ ['--admin-cols' as string]: headers.length }}>{headers.map((header) => <span className="admin-data-head" key={header}>{header}</span>)}{rows.length ? rows.map((row, rowIndex) => row.map((cell, cellIndex) => <span className="admin-data-cell" key={`${rowIndex}-${cellIndex}`}>{cell}</span>)) : <span className="admin-empty-row">No backend records found</span>}</div>;
  const renderAdminTab = () => {
    if (adminTab === 'Dashboard') return <><section className="admin-stats"><div className="admin-stat"><span>Total revenue</span><strong>{money(dashboard.revenue)}</strong><small>From backend orders</small></div><div className="admin-stat"><span>Orders</span><strong>{dashboard.orders}</strong><small>{pendingOrders} active</small></div><div className="admin-stat"><span>Products</span><strong>{adminProducts.length}</strong><small>{dashboard.lowStock} low stock</small></div><div className="admin-stat"><span>Customers</span><strong>{dashboard.customers}</strong><small>Active accounts</small></div></section><section className="admin-grid"><div className="admin-panel admin-growth-panel"><div className="admin-table-head"><div><h3>Revenue growth</h3><p>Last 7 days from real orders</p></div></div><div className="admin-chart">{revenueBars.map((bar) => <div className="admin-chart-bar" key={bar.key}><span style={{ height: `${bar.height}px` }} /><small>{bar.label}</small><b>{money(bar.total)}</b></div>)}</div></div><div className="admin-panel"><div className="admin-table-head"><div><h3>Inventory alerts</h3><p>Products that need attention</p></div></div><div className="admin-alert-list">{lowStockItems.length ? lowStockItems.map((item) => <div key={item.product.id}><Package size={18} /><span>{item.product.name}</span><strong>{item.stock} left</strong></div>) : <div><CheckCircle2 size={18} /><span>All products have healthy stock</span><strong>OK</strong></div>}</div></div><div className="admin-panel admin-wide-panel"><div className="admin-table-head"><div><h3>Recent orders</h3><p>Latest customer activity</p></div></div>{renderAdminRows(['Order', 'Status', 'Payment', 'Total'], adminOrders.slice(0, 8).map((order) => [order.orderId, order.orderStatus, order.paymentStatus, money(order.total)]))}</div></section></>;
    if (adminTab === 'Products') return <><section className="admin-panel admin-products-page"><div className="admin-table-head admin-products-hero"><div><span className="eyebrow">Product control</span><h3>Manage Eagle Mart products</h3><div className="admin-product-counts"><span><b>{activeProductCount}</b> Active products</span><span><b>{inactiveProductCount}</b> Inactive products</span></div></div><button className="primary" onClick={startAddProduct}>+ Add new product</button></div><div className="admin-product-toolbar"><label><Search size={18} /><input className="admin-product-search" value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Search by product, brand, category, or unit" /></label><label className="admin-page-size"><span>Show</span><select value={productPageSize} onChange={(e) => { setProductPageSize(Number(e.target.value)); setProductPage(1); }}><option value={8}>8</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option></select></label><button className="secondary" onClick={() => fetchAdminData(adminToken || undefined)} disabled={loadingAdmin}>Refresh</button></div><div className="admin-product-table"><div className="admin-product-table-head"><span>Product</span><span>Category</span><span>Price</span><span>Stock</span><span>Status</span><span>Actions</span></div>{filteredAdminProducts.length ? paginatedAdminProducts.map((product) => <article className="admin-product-row" key={product.id}><div className="admin-product-main"><img src={productImage(product)} onError={handleProductImageError(product)} alt={product.name} /><div><strong>{product.name}</strong><span>{product.brand} | {product.unit}</span></div></div><span>{product.category?.name || 'Category'}</span><span><b>{money(product.sellingPrice)}</b><small>MRP {money(product.mrp)}</small></span><span><b>{product.stock}</b><small>{Number(product.stock) <= Number(product.lowStockThreshold || 10) ? 'Low stock' : 'Available'}</small></span><span><select className={`admin-status-select ${product.isActive ? 'active' : 'inactive'}`} value={product.isActive ? 'active' : 'inactive'} onChange={() => toggleAdminProductStatus(product)}><option value="active">Active</option><option value="inactive">Inactive</option></select></span><div className="admin-product-actions"><button className="secondary small" onClick={() => startEditProduct(product)}>Edit</button><button className="secondary small danger-lite" onClick={() => deleteAdminProduct(product)}>Delete</button></div></article>) : <div className="admin-empty-row">No products match your search.</div>}</div><div className="admin-product-pagination"><span>Showing {filteredAdminProducts.length ? ((productPage - 1) * productPageSize) + 1 : 0}-{Math.min(productPage * productPageSize, filteredAdminProducts.length)} of {filteredAdminProducts.length} products</span><div><button className="secondary small" disabled={productPage <= 1} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>Previous</button><strong>Page {productPage} / {productTotalPages}</strong><button className="secondary small" disabled={productPage >= productTotalPages} onClick={() => setProductPage((page) => Math.min(productTotalPages, page + 1))}>Next</button></div></div></section>{productEditorOpen && <div className="overlay admin-product-modal"><div className="admin-product-editor"><button className="icon-button close-floating" onClick={() => setProductEditorOpen(false)}><X size={20} /></button><div className="admin-table-head"><div><span className="eyebrow">{productForm.id ? 'Edit product' : 'New product'}</span><h3>{productForm.id ? 'Update product details' : 'Add new product'}</h3><p>Fill every important product field. Changes sync with customer storefront after save.</p></div></div><div className="product-form-grid"><label>Product name<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Premium product name" /></label><label>Brand<input value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="Brand name" /></label><label>Category<select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}>{adminCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label><label>Unit<input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} placeholder="1 kg / 500 g / 1 L" /></label><label className="wide-field">Description<textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} placeholder="Product details" /></label><label>Image URL<input value={productForm.image} onChange={(e) => setProductForm({ ...productForm, image: e.target.value })} placeholder="https://... or uploaded image data" /></label><label className="admin-upload-field">Upload image<input type="file" accept="image/*" onChange={(e) => uploadProductImage(e.target.files?.[0])} /></label>{productForm.image && <div className="admin-product-preview"><img src={productForm.image} onError={(event) => { event.currentTarget.src = groceryImages[0]; }} alt="Product preview" /><span>Image preview</span></div>}<label>MRP<input value={productForm.mrp} onChange={(e) => setProductForm({ ...productForm, mrp: phoneOnly(e.target.value).slice(0, 6) })} inputMode="numeric" /></label><label>Selling price<input value={productForm.sellingPrice} onChange={(e) => setProductForm({ ...productForm, sellingPrice: phoneOnly(e.target.value).slice(0, 6) })} inputMode="numeric" /></label><label>Discount<input value={productForm.discount} onChange={(e) => setProductForm({ ...productForm, discount: phoneOnly(e.target.value).slice(0, 2) })} inputMode="numeric" /></label><label>Stock<input value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: phoneOnly(e.target.value).slice(0, 5) })} inputMode="numeric" /></label><label>Low stock alert<input value={productForm.lowStockThreshold} onChange={(e) => setProductForm({ ...productForm, lowStockThreshold: phoneOnly(e.target.value).slice(0, 4) })} inputMode="numeric" /></label><div className="product-checks"><label className={productForm.isFeatured ? "selected" : ""}><input type="checkbox" checked={productForm.isFeatured} onChange={(e) => setProductForm({ ...productForm, isFeatured: e.target.checked })} /><span>Featured</span><b>{productForm.isFeatured ? "Selected" : "Select"}</b></label><label className={productForm.isBestSeller ? "selected" : ""}><input type="checkbox" checked={productForm.isBestSeller} onChange={(e) => setProductForm({ ...productForm, isBestSeller: e.target.checked })} /><span>Best seller</span><b>{productForm.isBestSeller ? "Selected" : "Select"}</b></label><label className={productForm.isActive ? "selected" : ""}><input type="checkbox" checked={productForm.isActive} onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })} /><span>Active</span><b>{productForm.isActive ? "Selected" : "Select"}</b></label></div></div>{productMessage && <small className="admin-form-message">{productMessage}</small>}<div className="admin-editor-actions"><button className="secondary" onClick={() => setProductEditorOpen(false)}>Cancel</button><button className="primary" onClick={saveAdminProduct} disabled={savingProduct}>{savingProduct ? 'Saving...' : productForm.id ? 'Update product' : 'Add product'}</button></div></div></div>}</>;
    if (adminTab === 'Orders') return <section className="admin-panel admin-orders-panel"><div className="admin-table-head admin-orders-hero"><div><span className="eyebrow">Order control</span><h3>Manage customer orders</h3><p>Update delivery progress, monitor payments, and keep customer tracking in sync.</p></div><div className="admin-order-tools"><label>Show<select value={orderPageSize} onChange={(e) => { setOrderPageSize(Number(e.target.value)); setOrderPage(1); }}><option value={6}>6</option><option value={8}>8</option><option value={12}>12</option><option value={20}>20</option></select></label><button className="secondary" onClick={() => fetchAdminData(adminToken || undefined)} disabled={loadingAdmin}>Refresh orders</button></div></div><div className="admin-order-summary"><span><small>Total orders</small><b>{adminOrders.length}</b></span><span><small>Active orders</small><b>{pendingOrders}</b></span><span><small>Delivered</small><b>{deliveredOrders}</b></span><span><small>Cancelled</small><b>{cancelledOrders}</b></span><span><small>Order value</small><b>{money(orderRevenue)}</b></span></div><div className="admin-order-board">{adminOrders.length ? paginatedAdminOrders.map((order) => { const statusClass = order.orderStatus.toLowerCase().replace(/\s+/g, '-'); const customerLabel = order.customerName || order.customer?.name || order.email || 'Eagle Mart customer'; return <article className="admin-order-card" key={order.orderId}><div className="admin-order-id"><div><small>Order ID</small><strong>{order.orderId}</strong><span>{new Date(order.createdAt).toLocaleString()}</span></div><em className={`admin-status-pill ${statusClass}`}>{order.orderStatus}</em></div><div className="admin-order-info-grid"><span><small>Customer</small><b>{customerLabel}</b></span><span><small>Payment</small><b>{order.paymentStatus}</b>{order.paymentMethod && <em>{order.paymentMethod}</em>}</span><span><small>Total</small><b>{money(order.total)}</b></span><span><small>Items</small><b>{order.items?.length || 0}</b></span></div><div className="admin-order-control-row compact"><label><span>Order status</span><select value={order.orderStatus} disabled={updatingOrderId === order.orderId} onChange={(event) => updateAdminOrderStatus(order, event.target.value)}>{orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></article>; }) : <div className="admin-empty-row">No backend orders found</div>}</div><div className="admin-order-pagination"><span>Showing {adminOrders.length ? ((orderPage - 1) * orderPageSize) + 1 : 0}-{Math.min(orderPage * orderPageSize, adminOrders.length)} of {adminOrders.length} orders</span><div><button className="secondary small" disabled={orderPage <= 1} onClick={() => setOrderPage((page) => Math.max(1, page - 1))}>Previous</button><strong>Page {orderPage} / {orderTotalPages}</strong><button className="secondary small" disabled={orderPage >= orderTotalPages} onClick={() => setOrderPage((page) => Math.min(orderTotalPages, page + 1))}>Next</button></div></div></section>;
    if (adminTab === 'Inventory') return <section className="admin-panel admin-inventory-page"><div className="admin-table-head admin-inventory-hero"><div><span className="eyebrow">Stock control</span><h3>Inventory management</h3><div className="admin-product-counts"><span><b>{adminInventory.length}</b> Products</span><span><b>{lowInventoryCount}</b> Low stock</span><span><b>{outOfStockCount}</b> Out of stock</span></div></div><div className="admin-order-tools"><label>Show<select value={inventoryPageSize} onChange={(e) => { setInventoryPageSize(Number(e.target.value)); setInventoryPage(1); }}><option value={8}>8</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option></select></label><button className="secondary" onClick={() => fetchAdminData(adminToken || undefined)} disabled={loadingAdmin}>Refresh inventory</button></div></div><div className="admin-product-toolbar"><label><Search size={18} /><input value={inventorySearch} onChange={(e) => { setInventorySearch(e.target.value); setInventoryPage(1); }} placeholder="Search inventory by product, brand, or category" /></label></div><div className="admin-inventory-table"><div className="admin-inventory-head"><span>Product</span><span>Stock</span><span>Low stock alert</span><span>Status</span><span>Action</span></div>{filteredInventory.length ? paginatedInventory.map((item) => { const draft = inventoryDrafts[item.product.id] || { stock: String(item.stock), lowStockThreshold: String(item.product.lowStockThreshold || 10) }; const stockValue = Number(draft.stock || 0); const thresholdValue = Number(draft.lowStockThreshold || 0); const isLow = stockValue <= thresholdValue; const isOut = stockValue <= 0; return <article className="admin-inventory-row" key={item.product.id}><div className="admin-inventory-product"><img src={productImage(item.product)} onError={handleProductImageError(item.product)} alt={item.product.name} /><div><strong>{item.product.name}</strong><span>{item.product.brand} | {item.product.category?.name || 'Category'}</span></div></div><label><span>Stock</span><input value={draft.stock} inputMode="numeric" onChange={(e) => setInventoryDrafts((current) => ({ ...current, [item.product.id]: { ...draft, stock: phoneOnly(e.target.value).slice(0, 5) } }))} /></label><label><span>Alert below</span><input value={draft.lowStockThreshold} inputMode="numeric" onChange={(e) => setInventoryDrafts((current) => ({ ...current, [item.product.id]: { ...draft, lowStockThreshold: phoneOnly(e.target.value).slice(0, 4) } }))} /></label><em className={`inventory-status ${isOut ? 'out' : isLow ? 'low' : 'healthy'}`}>{isOut ? 'Out of stock' : isLow ? 'Low stock' : 'Healthy'}</em><button className="primary small" disabled={savingInventoryId === item.product.id} onClick={() => saveInventoryItem(item)}>{savingInventoryId === item.product.id ? 'Saving...' : 'Save'}</button></article>; }) : <div className="admin-empty-row">No inventory products found.</div>}</div><div className="admin-product-pagination"><span>Showing {filteredInventory.length ? ((inventoryPage - 1) * inventoryPageSize) + 1 : 0}-{Math.min(inventoryPage * inventoryPageSize, filteredInventory.length)} of {filteredInventory.length} inventory records</span><div><button className="secondary small" disabled={inventoryPage <= 1} onClick={() => setInventoryPage((page) => Math.max(1, page - 1))}>Previous</button><strong>Page {inventoryPage} / {inventoryTotalPages}</strong><button className="secondary small" disabled={inventoryPage >= inventoryTotalPages} onClick={() => setInventoryPage((page) => Math.min(inventoryTotalPages, page + 1))}>Next</button></div></div></section>;
    if (adminTab === 'Coupons') return <><section className="admin-panel admin-coupons-page"><div className="admin-table-head admin-coupons-hero"><div><span className="eyebrow">Offer control</span><h3>Coupon management</h3><div className="admin-product-counts"><span><b>{adminCoupons.length}</b> Coupons</span><span><b>{adminCoupons.filter((coupon) => coupon.isActive !== false).length}</b> Active</span><span><b>{adminCoupons.filter((coupon) => coupon.isActive === false).length}</b> Inactive</span></div></div><button className="primary" onClick={startAddCoupon}>+ Add new coupon</button></div><div className="admin-product-toolbar"><label><Search size={18} /><input value={couponSearch} onChange={(e) => { setCouponSearch(e.target.value); setCouponPage(1); }} placeholder="Search coupon by code, type, or description" /></label><label className="admin-page-size"><span>Show</span><select value={couponPageSize} onChange={(e) => { setCouponPageSize(Number(e.target.value)); setCouponPage(1); }}><option value={8}>8</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option></select></label></div><div className="admin-coupon-list"><div className="admin-coupon-head"><span>Coupon</span><span>Type</span><span>Value</span><span>Minimum</span><span>Status</span><span>Actions</span></div>{filteredCoupons.length ? paginatedCoupons.map((coupon) => <article className="admin-coupon-row" key={coupon.id}><div><strong>{coupon.code}</strong><small>{coupon.description || 'Eagle Mart coupon'}</small></div><span>{coupon.type || 'Offer'}</span><span>{coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : coupon.type === 'FREE_DELIVERY' ? 'Free delivery' : money(coupon.value)}</span><span>{money(coupon.minOrderValue || 0)}</span><select className={`admin-status-select ${coupon.isActive === false ? 'inactive' : 'active'}`} value={coupon.isActive === false ? 'inactive' : 'active'} onChange={(e) => updateAdminCouponStatus(coupon, e.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select><div className="admin-product-actions"><button className="secondary small" onClick={() => startEditCoupon(coupon)}>Edit</button><button className="secondary small danger-lite" onClick={() => deleteAdminCoupon(coupon)}>Delete</button></div></article>) : <div className="admin-empty-row">No coupons found.</div>}</div><div className="admin-product-pagination"><span>Showing {filteredCoupons.length ? ((couponPage - 1) * couponPageSize) + 1 : 0}-{Math.min(couponPage * couponPageSize, filteredCoupons.length)} of {filteredCoupons.length} coupons</span><div><button className="secondary small" disabled={couponPage <= 1} onClick={() => setCouponPage((page) => Math.max(1, page - 1))}>Previous</button><strong>Page {couponPage} / {couponTotalPages}</strong><button className="secondary small" disabled={couponPage >= couponTotalPages} onClick={() => setCouponPage((page) => Math.min(couponTotalPages, page + 1))}>Next</button></div></div></section>{couponEditorOpen && <div className="overlay admin-product-modal"><div className="admin-product-editor admin-coupon-editor"><button className="icon-button close-floating" onClick={() => setCouponEditorOpen(false)}><X size={20} /></button><div className="admin-table-head"><div><span className="eyebrow">{couponForm.id ? 'Edit coupon' : 'New coupon'}</span><h3>{couponForm.id ? 'Update coupon details' : 'Add new coupon'}</h3><p>Coupon changes sync with checkout immediately after save.</p></div></div><div className="admin-coupon-form modal-form"><label>Code<input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="SAVE100" /></label><label>Description<input value={couponForm.description} onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })} placeholder="Short coupon note" /></label><label>Type<select value={couponForm.type} onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value })}><option value="FIXED">Fixed amount</option><option value="PERCENTAGE">Percentage</option><option value="FREE_DELIVERY">Free delivery</option></select></label><label>Value<input value={couponForm.value} inputMode="numeric" onChange={(e) => setCouponForm({ ...couponForm, value: phoneOnly(e.target.value).slice(0, 5) })} placeholder="50" /></label><label>Minimum order<input value={couponForm.minOrderValue} inputMode="numeric" onChange={(e) => setCouponForm({ ...couponForm, minOrderValue: phoneOnly(e.target.value).slice(0, 6) })} placeholder="499" /></label><label>Status<select value={couponForm.isActive ? 'active' : 'inactive'} onChange={(e) => setCouponForm({ ...couponForm, isActive: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><div className="admin-editor-actions"><button className="secondary" onClick={() => setCouponEditorOpen(false)}>Cancel</button><button className="primary" onClick={saveAdminCoupon} disabled={savingCoupon}>{savingCoupon ? 'Saving...' : couponForm.id ? 'Update coupon' : 'Add coupon'}</button></div></div></div>}</>;
    if (adminTab === 'Customers') return <section className="admin-panel admin-customers-page"><div className="admin-table-head admin-customers-hero"><div><span className="eyebrow">Customer access</span><h3>Customer management</h3><div className="admin-product-counts"><span><b>{adminCustomers.length}</b> Customers</span><span><b>{activeCustomerCount}</b> Active</span><span><b>{blockedCustomerCount}</b> Blocked</span></div></div><button className="secondary" onClick={() => fetchAdminData(adminToken || undefined)} disabled={loadingAdmin}>Refresh customers</button></div><div className="admin-product-toolbar"><label><Search size={18} /><input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setCustomerPage(1); }} placeholder="Search customers by name, email, or phone" /></label><label className="admin-page-size"><span>Show</span><select value={customerPageSize} onChange={(e) => { setCustomerPageSize(Number(e.target.value)); setCustomerPage(1); }}><option value={6}>6</option><option value={8}>8</option><option value={12}>12</option><option value={20}>20</option></select></label></div><div className="admin-customer-list"><div className="admin-customer-head"><span>Customer</span><span>Contact</span><span>Orders</span><span>Status</span><span>Actions</span></div>{filteredCustomers.length ? paginatedCustomers.map((customer) => { const blocked = customer.isActive === false; return <article className="admin-customer-row" key={customer.id}><div className="admin-customer-main"><span>{(customer.name || customer.email || 'C').slice(0, 1).toUpperCase()}</span><div><strong>{customer.name || 'Eagle Mart Customer'}</strong><small>{customer.email}</small></div></div><span><b>{customer.phone || 'No phone'}</b><small>{customer.email}</small></span><span><b>{customerOrderCount(customer)}</b><small>{customerOrderCount(customer) === 1 ? 'Order' : 'Orders'}</small></span><em className={blocked ? 'admin-blocked-pill' : 'admin-live-pill'}>{blocked ? 'Blocked' : 'Active'}</em><div className="admin-product-actions"><button className="secondary small" disabled={savingCustomerId === customer.id} onClick={() => toggleAdminCustomerStatus(customer)}>{blocked ? 'Unblock' : 'Block'}</button><button className="secondary small danger-lite" disabled={savingCustomerId === customer.id} onClick={() => deleteAdminCustomer(customer)}>Delete</button></div></article>; }) : <div className="admin-empty-row">No customers match your search.</div>}</div><div className="admin-product-pagination"><span>Showing {filteredCustomers.length ? ((customerPage - 1) * customerPageSize) + 1 : 0}-{Math.min(customerPage * customerPageSize, filteredCustomers.length)} of {filteredCustomers.length} customers</span><div><button className="secondary small" disabled={customerPage <= 1} onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}>Previous</button><strong>Page {customerPage} / {customerTotalPages}</strong><button className="secondary small" disabled={customerPage >= customerTotalPages} onClick={() => setCustomerPage((page) => Math.min(customerTotalPages, page + 1))}>Next</button></div></div></section>;
    if (adminTab === 'Enquiries') return <section className="admin-panel admin-enquiries-page"><div className="admin-table-head admin-customers-hero"><div><span className="eyebrow">Customer messages</span><h3>Contact enquiries</h3><div className="admin-product-counts"><span><b>{adminEnquiries.length}</b> Total</span><span><b>{adminEnquiries.filter((item) => item.status === 'New').length}</b> New</span><span><b>{adminEnquiries.filter((item) => item.status === 'Closed').length}</b> Closed</span></div></div><button className="secondary" onClick={() => fetchAdminData(adminToken || undefined)} disabled={loadingAdmin}>Refresh enquiries</button></div><div className="admin-enquiry-list">{adminEnquiries.length ? adminEnquiries.map((enquiry) => <article className="admin-enquiry-card" key={enquiry.id}><div><span className="eyebrow">{enquiry.subject}</span><h3>{enquiry.name}</h3><p>{enquiry.message}</p><small>{enquiry.email} | {enquiry.phone} | {new Date(enquiry.createdAt).toLocaleString()}</small></div><select className={`admin-status-select ${enquiry.status === 'Closed' ? 'inactive' : 'active'}`} value={enquiry.status} onChange={(e) => updateAdminEnquiryStatus(enquiry, e.target.value)}><option value="New">New</option><option value="Contacted">Contacted</option><option value="Closed">Closed</option></select></article>) : <div className="admin-empty-row">No contact enquiries yet.</div>}</div></section>;
    if (adminTab === 'Settings') return <section className="admin-panel admin-settings-page"><div className="admin-table-head admin-settings-hero"><div><span className="eyebrow">Store control</span><h3>Store settings</h3><div className="admin-product-counts"><span><b>{settingsForm.isStoreOpen ? 'Open' : 'Closed'}</b> Store status</span><span><b>{money(settingsForm.deliveryFee || 0)}</b> Delivery fee</span><span><b>{settingsForm.estimatedDeliveryMins || 0} min</b> ETA</span></div></div><button className="primary" onClick={saveAdminSettings} disabled={savingSettings}>{savingSettings ? 'Saving...' : 'Save settings'}</button></div><div className="admin-settings-layout"><div className="admin-settings-card"><h4>Brand and support</h4><div className="admin-settings-form"><label>Store name<input value={settingsForm.storeName} onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })} placeholder="Eagle Mart" /></label><label>Support email<input value={settingsForm.supportEmail} onChange={(e) => setSettingsForm({ ...settingsForm, supportEmail: e.target.value })} placeholder="support@eaglemart.com" type="email" /></label><label>Support phone<input value={settingsForm.supportPhone} onChange={(e) => setSettingsForm({ ...settingsForm, supportPhone: e.target.value })} placeholder="+91 90000 11111" /></label><label>Status<select value={settingsForm.isStoreOpen ? 'open' : 'closed'} onChange={(e) => setSettingsForm({ ...settingsForm, isStoreOpen: e.target.value === 'open' })}><option value="open">Open for orders</option><option value="closed">Closed for orders</option></select></label></div></div><div className="admin-settings-card"><h4>Checkout rules</h4><div className="admin-settings-form"><label>Minimum order<input value={settingsForm.minOrderValue} inputMode="numeric" onChange={(e) => setSettingsForm({ ...settingsForm, minOrderValue: phoneOnly(e.target.value).slice(0, 6) })} placeholder="149" /></label><label>Free delivery above<input value={settingsForm.freeDeliveryAbove} inputMode="numeric" onChange={(e) => setSettingsForm({ ...settingsForm, freeDeliveryAbove: phoneOnly(e.target.value).slice(0, 6) })} placeholder="799" /></label><label>Delivery fee<input value={settingsForm.deliveryFee} inputMode="numeric" onChange={(e) => setSettingsForm({ ...settingsForm, deliveryFee: phoneOnly(e.target.value).slice(0, 5) })} placeholder="39" /></label><label>Tax percent<input value={settingsForm.taxPercent} inputMode="numeric" onChange={(e) => setSettingsForm({ ...settingsForm, taxPercent: phoneOnly(e.target.value).slice(0, 3) })} placeholder="5" /></label><label>Estimated delivery<input value={settingsForm.estimatedDeliveryMins} inputMode="numeric" onChange={(e) => setSettingsForm({ ...settingsForm, estimatedDeliveryMins: phoneOnly(e.target.value).slice(0, 3) })} placeholder="20" /></label></div></div></div>{settingsMessage && <small className="admin-form-message">{settingsMessage}</small>}<div className="admin-settings-preview"><span><small>Customer homepage</small><b>Free delivery above {money(settingsForm.freeDeliveryAbove || 0)}</b></span><span><small>Checkout validation</small><b>Minimum order {money(settingsForm.minOrderValue || 0)}</b></span><span><small>Order pricing</small><b>{money(settingsForm.deliveryFee || 0)} delivery + {settingsForm.taxPercent || 0}% tax</b></span><span><small>Ordering status</small><b>{settingsForm.isStoreOpen ? 'Customers can place orders' : 'Orders are blocked'}</b></span></div></section>;
    return <section className="admin-panel"><div className="admin-table-head"><div><h3>Admin workspace</h3><p>Select a section from the sidebar.</p></div></div></section>;
  };

  if (admin?.role === 'ADMIN') return <div className="admin-shell eagle-admin-dashboard"><aside className="admin-sidebar"><button className="brand admin-brand"><img src="/eagle_logo.png" alt="Eagle Mart" /></button>{['Dashboard', 'Products', 'Orders', 'Inventory', 'Coupons', 'Customers', 'Enquiries', 'Settings'].map((item) => <button key={item} className={adminTab === item ? 'active' : ''} onClick={() => setAdminTab(item)}>{item === 'Dashboard' && <Home size={18} />}{item === 'Products' && <Package size={18} />}{item === 'Orders' && <ShoppingBag size={18} />}{item === 'Inventory' && <SlidersHorizontal size={18} />}{item === 'Coupons' && <TicketPercent size={18} />}{item === 'Customers' && <User size={18} />}{item === 'Enquiries' && <Search size={18} />}{item === 'Settings' && <ShieldCheck size={18} />}{item}</button>)}<button className="admin-logout-btn" onClick={logoutAdmin}><LogOut size={18} /> Logout</button></aside><main className="admin-main admin-main-compact">{adminError && <div className="admin-panel admin-error">{adminError}</div>}{renderAdminTab()}</main></div>;
  return <div className="admin-login"><div className="login-card glass-panel admin-access-card"><div className="admin-logo-stage"><img className="admin-login-logo" src="/eagle_logo.png" alt="Eagle Mart" /></div><span className="admin-login-badge"><ShieldCheck size={15} /> Protected admin access</span><h1>Eagle Mart Admin</h1><p>Sign in to manage products, orders, inventory, coupons, and store operations.</p><input required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email address" type="email" /><div className="password-field"><input required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" minLength={6} type={showPassword ? 'text' : 'password'} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{error && <small className="error">{error}</small>}<button className="primary full" onClick={submitAdmin}>Login securely</button></div></div>;
}

export default App;



















