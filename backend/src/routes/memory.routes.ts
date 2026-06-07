import { Router, type Request } from 'express';
import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../utils/auth.js';

type Address = { id: string; label: string; name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; isDefault: boolean };
type User = { id: string; name: string; email: string; phone?: string; role: 'CUSTOMER' | 'ADMIN'; passwordHash: string; addresses?: Address[]; isActive?: boolean };
type Category = { id: string; name: string; slug: string; isActive: boolean; sortOrder: number };
type Product = { id: string; name: string; slug: string; brand: string; categoryId: string; category?: Category; description: string; images: string[]; mrp: number; sellingPrice: number; discount: number; unit: string; stock: number; lowStockThreshold: number; rating: number; reviewCount: number; isFeatured: boolean; isBestSeller: boolean; isActive: boolean };
type CartItem = { productId: string; quantity: number };
type Order = { id: string; orderId: string; customerId: string; customerName: string; phone: string; email: string; address: unknown; items: Array<{ productId: string; name: string; quantity: number; price: number; total: number }>; subtotal: number; discount: number; deliveryFee: number; tax: number; total: number; couponCode?: string; paymentMethod: string; paymentStatus: string; orderStatus: string; estimatedDeliveryTime: Date; createdAt: Date; updatedAt?: Date };
type Enquiry = { id: string; name: string; email: string; phone: string; subject: string; message: string; status: 'New' | 'Contacted' | 'Closed'; createdAt: Date };

const router = Router();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const settings = { minOrderValue: 149, freeDeliveryAbove: 799, deliveryFee: 39, taxPercent: 5, isStoreOpen: true, estimatedDeliveryMins: 20 };

const categoryNames = ['Fresh Fruits', 'Vegetables', 'Dairy', 'Bakery', 'Snacks', 'Beverages', 'Daily Essentials', 'Household', 'Organic', 'Pet Care'];
const categories: Category[] = categoryNames.map((name, index) => ({ id: id('cat'), name, slug: slug(name), isActive: true, sortOrder: index + 1 }));
const productNames = [
  'Alphonso Mangoes', 'Royal Gala Apples', 'Sweet Bananas', 'Kiwi Gold Pack', 'Dragon Fruit', 'English Cucumber', 'Cherry Tomatoes', 'Baby Spinach', 'Broccoli Crown', 'Carrot Bundle',
  'A2 Cow Milk', 'Greek Yogurt', 'Farm Butter', 'Paneer Cubes', 'Cheddar Slices', 'Sourdough Loaf', 'Butter Croissants', 'Multigrain Bread', 'Blueberry Muffins', 'Pita Pockets',
  'Sea Salt Chips', 'Trail Mix Jar', 'Dark Chocolate', 'Roasted Almonds', 'Masala Crackers', 'Cold Brew Coffee', 'Orange Juice', 'Sparkling Water', 'Kombucha Berry', 'Green Tea Box',
  'Basmati Rice', 'Whole Wheat Atta', 'Cold Pressed Oil', 'Organic Sugar', 'Free Range Eggs', 'Laundry Liquid', 'Dishwash Gel', 'Kitchen Towels', 'Floor Cleaner', 'Scented Candles',
  'Organic Quinoa', 'Organic Honey', 'Organic Lentils', 'Organic Muesli', 'Organic Tofu', 'Premium Pet Kibble', 'Tuna Cat Treats', 'Pet Shampoo', 'Paw Wipes', 'Chicken Pet Bites',
];
const brands = ['Harvest & Co', 'Golden Spoon', 'Farmcrest', 'Urban Pantry', 'Milko', 'Eagle Mart'];
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
const products: Product[] = productNames.map((name, index) => {
  const category = categories[index % categories.length];
  const sellingPrice = 79 + ((index * 37) % 520);
  const discount = [8, 12, 16, 20, 24, 30][index % 6];
  return {
    id: id('prod'), name, slug: slug(name), brand: brands[index % brands.length], categoryId: category.id, category,
    description: `${name} quality checked and packed fresh by Eagle Mart.`,
    images: [groceryImages[index % groceryImages.length]],
    mrp: Math.round(sellingPrice / (1 - discount / 100)), sellingPrice, discount, unit: ['1 kg', '500 g', '1 L', '4 pcs'][index % 4],
    stock: 20 + ((index * 11) % 70), lowStockThreshold: 8, rating: Number((4.1 + ((index % 9) * 0.1)).toFixed(1)), reviewCount: 20 + index,
    isFeatured: index % 4 === 0, isBestSeller: index % 5 === 0, isActive: true,
  };
});
const banners = [
  { id: id('ban'), title: 'Eagle Mart premium grocery delivery', subtitle: 'Golden baskets in 20 minutes', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', isActive: true },
  { id: id('ban'), title: 'Weekend pantry edit', subtitle: 'Save on gourmet essentials', image: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=1200&q=80', isActive: true },
];
const coupons = [
  { id: id('coup'), code: 'FRESH10', type: 'PERCENTAGE', value: 10, minOrderValue: 0, isActive: true },
  { id: id('coup'), code: 'FREEDEL', type: 'FREE_DELIVERY', value: 0, minOrderValue: 0, isActive: true },
  { id: id('coup'), code: 'SAVE50', type: 'FIXED', value: 50, minOrderValue: 499, isActive: true },
  { id: id('coup'), code: 'WELCOME20', type: 'PERCENTAGE', value: 20, minOrderValue: 0, isActive: true },
  { id: id('coup'), code: 'BIGSAVE', type: 'FIXED', value: 100, minOrderValue: 999, isActive: true },
];
const users: User[] = [];
const carts = new Map<string, CartItem[]>();
const wishlists = new Map<string, string[]>();
const orders: Order[] = [];
const enquiries: Enquiry[] = [];
const memoryDbPath = path.resolve(process.cwd(), 'data', 'eagle-mart-memory-db.json');

type PersistedMemory = {
  users: User[];
  carts: Array<[string, CartItem[]]>;
  wishlists: Array<[string, string[]]>;
  orders: Order[];
  enquiries: Enquiry[];
  categories: Category[];
  products: Product[];
  banners: typeof banners;
  coupons: typeof coupons;
  settings: typeof settings;
};

function reviveOrder(order: Order) {
  return {
    ...order,
    createdAt: new Date(order.createdAt),
    updatedAt: order.updatedAt ? new Date(order.updatedAt) : undefined,
    estimatedDeliveryTime: new Date(order.estimatedDeliveryTime),
  };
}

async function loadMemory() {
  try {
    const raw = await readFile(memoryDbPath, 'utf8');
    const data = JSON.parse(raw) as PersistedMemory;
    users.splice(0, users.length, ...(data.users || []).map((user) => ({ ...user, isActive: user.isActive !== false })));
    carts.clear();
    (data.carts || []).forEach(([userId, items]) => carts.set(userId, items));
    wishlists.clear();
    (data.wishlists || []).forEach(([userId, items]) => wishlists.set(userId, items));
    orders.splice(0, orders.length, ...(data.orders || []).map(reviveOrder));
    enquiries.splice(0, enquiries.length, ...(data.enquiries || []).map((item) => ({ ...item, createdAt: new Date(item.createdAt) })));
    categories.splice(0, categories.length, ...(data.categories || categories));
    products.splice(0, products.length, ...(data.products || products));
    banners.splice(0, banners.length, ...(data.banners || banners));
    coupons.splice(0, coupons.length, ...(data.coupons || coupons));
    Object.assign(settings, data.settings || {});
    return true;
  } catch {
    return false;
  }
}

async function saveMemory() {
  await mkdir(path.dirname(memoryDbPath), { recursive: true });
  const data: PersistedMemory = {
    users,
    carts: Array.from(carts.entries()),
    wishlists: Array.from(wishlists.entries()),
    orders,
    enquiries,
    categories,
    products,
    banners,
    coupons,
    settings,
  };
  await writeFile(memoryDbPath, JSON.stringify(data, null, 2), 'utf8');
}

async function seedUsers() {
  if (await loadMemory()) return;
  if (users.length) return;
  users.push({ id: id('user'), name: 'Eagle Mart Admin', email: 'admin@freshmart.com', phone: '+91 90000 00001', role: 'ADMIN', passwordHash: await hashPassword('admin123'), isActive: true });
  const customer = { id: id('user'), name: 'Eagle Mart Customer', email: 'customer@freshmart.com', phone: '+91 90000 00002', role: 'CUSTOMER' as const, passwordHash: await hashPassword('customer123'), addresses: [{ id: id('addr'), label: 'Home', name: 'Eagle Mart Customer', phone: '+91 90000 00002', line1: 'Flat 1201, Premium Heights', line2: '', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', isDefault: true }], isActive: true };
  users.push(customer);
  carts.set(customer.id, []);
  wishlists.set(customer.id, []);
  await saveMemory();
}
const memoryReady = seedUsers();

router.use(asyncHandler(async (_req, _res, next) => {
  await memoryReady;
  next();
}));

router.use((req, res, next) => {
  res.on('finish', () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
      void saveMemory();
    }
  });
  next();
});

function auth(req: Request) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError(401, 'Authentication token is required');
  const payload = verifyToken(token);
  const user = users.find((item) => item.id === payload.userId);
  if (!user) throw new ApiError(401, 'Invalid user');
  if (user.isActive === false) throw new ApiError(403, 'Account is blocked');
  return user;
}
const admin = (req: Request) => {
  const user = auth(req);
  if (user.role !== 'ADMIN') throw new ApiError(403, 'Admin access required');
  return user;
};
const addressSchema = z.object({
  label: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  line1: z.string().min(2),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(4),
  isDefault: z.boolean().optional(),
});
const serializeProduct = (product: Product) => ({ ...product, category: categories.find((item) => item.id === product.categoryId) });
const cartResponse = (userId: string) => ({
  id: `cart_${userId}`,
  items: (carts.get(userId) || [])
    .map((item) => {
      const product = products.find((p) => p.id === item.productId && p.isActive);
      return product ? { ...item, product: serializeProduct(product) } : null;
    })
    .filter(Boolean),
});
const totals = (items: CartItem[], couponCode?: string) => {
  const subtotal = items.reduce((sum, item) => sum + (products.find((p) => p.id === item.productId)?.sellingPrice || 0) * item.quantity, 0);
  const coupon = coupons.find((item) => item.code === couponCode?.toUpperCase() && item.isActive);
  let discount = 0;
  let deliveryFee = subtotal >= settings.freeDeliveryAbove ? 0 : settings.deliveryFee;
  if (coupon && subtotal >= coupon.minOrderValue) {
    if (coupon.type === 'PERCENTAGE') discount = Math.round(subtotal * coupon.value / 100);
    if (coupon.type === 'FIXED') discount = coupon.value;
    if (coupon.type === 'FREE_DELIVERY') deliveryFee = 0;
  }
  const tax = Math.round((subtotal - discount) * settings.taxPercent / 100);
  return { subtotal, discount, deliveryFee, tax, total: subtotal - discount + deliveryFee + tax };
};

router.post('/auth/register', asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string(), email: z.string().email(), phone: z.string().optional(), password: z.string().min(6) }).parse(req.body);
  if (users.some((user) => user.email === data.email)) throw new ApiError(409, 'Email is already registered');
  const user: User = { id: id('user'), name: data.name, email: data.email, phone: data.phone, role: 'CUSTOMER', passwordHash: await hashPassword(data.password), addresses: [], isActive: true };
  users.push(user); carts.set(user.id, []); wishlists.set(user.id, []);
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, addresses: [] }, token: signToken({ userId: user.id, role: user.role }) });
}));
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = users.find((item) => item.email === email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new ApiError(401, 'Invalid email or password');
  if (user.isActive === false) throw new ApiError(403, 'Account is blocked. Please contact Eagle Mart support.');
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, addresses: user.addresses || [] }, token: signToken({ userId: user.id, role: user.role }) });
}));
router.get('/auth/me', asyncHandler(async (req, res) => {
  const user = auth(req);
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, addresses: user.addresses || [] } });
}));
router.patch('/auth/me', asyncHandler(async (req, res) => {
  const user = auth(req);
  const data = z.object({
    name: z.string().min(2),
    phone: z.string().min(7).optional(),
    address: addressSchema.optional(),
  }).parse(req.body);
  user.name = data.name;
  user.phone = data.phone || undefined;
  if (data.address) {
    const current = user.addresses?.find((item) => item.isDefault) || user.addresses?.[0];
    const nextAddress = { id: current?.id || id('addr'), label: data.address.label || 'Home', name: data.address.name || user.name, phone: data.address.phone || user.phone || '', line1: data.address.line1, line2: data.address.line2 || '', city: data.address.city, state: data.address.state, pincode: data.address.pincode, isDefault: true };
    user.addresses = [nextAddress, ...(user.addresses || []).filter((item) => item.id !== nextAddress.id).map((item) => ({ ...item, isDefault: false }))];
  }
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, addresses: user.addresses || [] } });
}));

router.get('/auth/me/addresses', asyncHandler(async (req, res) => {
  const user = auth(req);
  res.json({ addresses: [...(user.addresses || [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)) });
}));

router.post('/auth/me/addresses', asyncHandler(async (req, res) => {
  const user = auth(req);
  const data = addressSchema.parse(req.body);
  const address: Address = {
    id: id('addr'),
    label: data.label || 'Home',
    name: data.name || user.name,
    phone: data.phone || user.phone || '',
    line1: data.line1,
    line2: data.line2 || '',
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    isDefault: data.isDefault ?? true,
  };
  if (address.isDefault) user.addresses = (user.addresses || []).map((item) => ({ ...item, isDefault: false }));
  user.addresses = [address, ...(user.addresses || [])];
  res.status(201).json({ address });
}));

router.patch('/auth/me/addresses/:addressId', asyncHandler(async (req, res) => {
  const user = auth(req);
  const data = addressSchema.partial().parse(req.body);
  const addresses = user.addresses || [];
  const existing = addresses.find((item) => item.id === req.params.addressId);
  if (!existing) throw new ApiError(404, 'Address not found');
  if (data.isDefault) addresses.forEach((item) => { item.isDefault = false; });
  Object.assign(existing, {
    label: data.label ?? existing.label,
    name: data.name ?? existing.name,
    phone: data.phone ?? existing.phone,
    line1: data.line1 ?? existing.line1,
    line2: data.line2 ?? existing.line2,
    city: data.city ?? existing.city,
    state: data.state ?? existing.state,
    pincode: data.pincode ?? existing.pincode,
    isDefault: data.isDefault ?? existing.isDefault,
  });
  user.addresses = [...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  res.json({ address: existing });
}));

router.delete('/auth/me/addresses/:addressId', asyncHandler(async (req, res) => {
  const user = auth(req);
  const addresses = user.addresses || [];
  const existing = addresses.find((item) => item.id === req.params.addressId);
  if (!existing) throw new ApiError(404, 'Address not found');
  user.addresses = addresses.filter((item) => item.id !== existing.id);
  if (existing.isDefault && user.addresses[0]) user.addresses[0].isDefault = true;
  res.json({ success: true });
}));

router.get('/public/home', (_req, res) => res.json({ banners: banners.filter((item) => item.isActive), categories: categories.filter((item) => item.isActive), featured: products.filter((p) => p.isActive && p.isFeatured).map(serializeProduct), bestSellers: products.filter((p) => p.isActive && p.isBestSeller).map(serializeProduct), settings }));
router.post('/contact/enquiries', asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7),
    subject: z.string().min(2),
    message: z.string().min(8),
  }).parse(req.body);
  const enquiry: Enquiry = { id: id('inq'), ...data, status: 'New', createdAt: new Date() };
  enquiries.unshift(enquiry);
  res.status(201).json({ enquiry });
}));
router.get('/categories', (_req, res) => res.json({ categories: categories.filter((item) => item.isActive) }));
router.post('/categories', asyncHandler(async (req, res) => {
  admin(req);
  const data = z.object({ name: z.string().min(2), isActive: z.boolean().optional() }).parse(req.body);
  const category: Category = { id: id('cat'), name: data.name, slug: slug(data.name), isActive: data.isActive ?? true, sortOrder: categories.length + 1 };
  categories.push(category);
  res.status(201).json({ category });
}));
router.put('/categories/:id', asyncHandler(async (req, res) => {
  admin(req);
  const category = categories.find((item) => item.id === req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');
  if (req.body.name) {
    category.name = String(req.body.name);
    category.slug = slug(category.name);
  }
  if (typeof req.body.isActive === 'boolean') category.isActive = req.body.isActive;
  res.json({ category });
}));
router.delete('/categories/:id', asyncHandler(async (req, res) => {
  admin(req);
  const category = categories.find((item) => item.id === req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');
  category.isActive = false;
  products.filter((item) => item.categoryId === category.id).forEach((product) => { product.isActive = false; });
  res.status(204).send();
}));
router.get('/products', (req, res) => {
  let result = products.filter((item) => item.isActive);
  const q = String(req.query.search || '').toLowerCase();
  if (q) result = result.filter((item) => item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q));
  if (req.query.category) result = result.filter((item) => categories.find((cat) => cat.id === item.categoryId)?.slug === req.query.category);
  if (req.query.brand) result = result.filter((item) => item.brand === req.query.brand);
  if (req.query.minPrice) result = result.filter((item) => item.sellingPrice >= Number(req.query.minPrice));
  if (req.query.maxPrice) result = result.filter((item) => item.sellingPrice <= Number(req.query.maxPrice));
  if (req.query.rating) result = result.filter((item) => item.rating >= Number(req.query.rating));
  if (req.query.discount) result = result.filter((item) => item.discount >= Number(req.query.discount));
  if (req.query.sort === 'price-low') result.sort((a, b) => a.sellingPrice - b.sellingPrice);
  if (req.query.sort === 'price-high') result.sort((a, b) => b.sellingPrice - a.sellingPrice);
  if (req.query.sort === 'rating') result.sort((a, b) => b.rating - a.rating);
  res.json({ products: result.map(serializeProduct) });
});
router.get('/products/admin/all', asyncHandler(async (req, res) => {
  admin(req);
  res.json({ products: products.map(serializeProduct) });
}));
router.get('/products/search', (req, res) => res.json({ products: products.filter((p) => p.isActive && p.name.toLowerCase().includes(String(req.query.q || '').toLowerCase())).map(serializeProduct) }));
router.get('/products/:idOrSlug', (req, res) => {
  const product = products.find((item) => item.isActive && (item.id === req.params.idOrSlug || item.slug === req.params.idOrSlug));
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product: serializeProduct(product) });
});
router.post('/products', asyncHandler(async (req, res) => {
  admin(req);
  const data = req.body;
  const category = categories.find((item) => item.id === data.categoryId) || categories[0];
  const images = Array.isArray(data.images) ? data.images : [data.images || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'];
  const product: Product = { id: id('prod'), name: data.name, slug: slug(data.name), brand: data.brand || 'FreshMart', categoryId: category.id, description: data.description || 'Fresh product', images, mrp: Number(data.mrp || 299), sellingPrice: Number(data.sellingPrice || 249), discount: Number(data.discount || 0), unit: data.unit || '1 pc', stock: Number(data.stock || 10), lowStockThreshold: Number(data.lowStockThreshold || 5), rating: 4.5, reviewCount: 0, isFeatured: Boolean(data.isFeatured), isBestSeller: Boolean(data.isBestSeller), isActive: data.isActive !== false };
  products.unshift(product);
  await saveMemory();
  res.status(201).json({ product: serializeProduct(product) });
}));
router.put('/products/:id', asyncHandler(async (req, res) => {
  admin(req);
  const product = products.find((item) => item.id === req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');
  const fields = ['name', 'brand', 'categoryId', 'description', 'unit'] as const;
  fields.forEach((field) => { if (req.body[field] !== undefined) product[field] = String(req.body[field]); });
  if (req.body.name) product.slug = slug(product.name);
  if (req.body.images !== undefined) product.images = Array.isArray(req.body.images) ? req.body.images : [String(req.body.images)];
  ['mrp', 'sellingPrice', 'discount', 'stock', 'lowStockThreshold', 'rating', 'reviewCount'].forEach((field) => {
    if (req.body[field] !== undefined) (product as unknown as Record<string, number>)[field] = Number(req.body[field]);
  });
  ['isFeatured', 'isBestSeller', 'isActive'].forEach((field) => {
    if (req.body[field] !== undefined) (product as unknown as Record<string, boolean>)[field] = Boolean(req.body[field]);
  });
  await saveMemory();
  res.json({ product: serializeProduct(product) });
}));
router.delete('/products/:id', asyncHandler(async (req, res) => {
  admin(req);
  const productIndex = products.findIndex((item) => item.id === req.params.id);
  if (productIndex === -1) throw new ApiError(404, 'Product not found');
  products.splice(productIndex, 1);
  carts.forEach((items, userId) => carts.set(userId, items.filter((item) => item.productId !== req.params.id)));
  wishlists.forEach((items, userId) => wishlists.set(userId, items.filter((productId) => productId !== req.params.id)));
  await saveMemory();
  res.status(204).send();
}));

router.get('/cart', asyncHandler(async (req, res) => res.json({ cart: cartResponse(auth(req).id) })));
router.post('/cart/items', asyncHandler(async (req, res) => {
  const user = auth(req);
  const { productId, quantity } = z.object({ productId: z.string(), quantity: z.number().int().min(1) }).parse(req.body);
  const product = products.find((item) => item.id === productId);
  if (!product || !product.isActive || product.stock < quantity) throw new ApiError(400, 'Product is unavailable or out of stock');
  const items = carts.get(user.id) || [];
  const existing = items.find((item) => item.productId === productId);
  if (existing) existing.quantity = Math.min(product.stock, existing.quantity + quantity); else items.push({ productId, quantity });
  carts.set(user.id, items);
  res.status(201).json({ cart: cartResponse(user.id) });
}));
router.patch('/cart/items/:productId', asyncHandler(async (req, res) => {
  const user = auth(req);
  const { quantity } = z.object({ quantity: z.number().int().min(1) }).parse(req.body);
  const product = products.find((item) => item.id === req.params.productId && item.isActive);
  if (!product) throw new ApiError(404, 'Product not found');
  if (quantity > product.stock) throw new ApiError(400, `${product.name} has only ${product.stock} in stock`);
  const items = carts.get(user.id) || [];
  const item = items.find((line) => line.productId === req.params.productId);
  if (item) item.quantity = quantity;
  res.json({ cart: cartResponse(user.id) });
}));
router.delete('/cart/items/:productId', asyncHandler(async (req, res) => {
  const user = auth(req);
  carts.set(user.id, (carts.get(user.id) || []).filter((item) => item.productId !== req.params.productId));
  res.status(204).send();
}));

router.get('/wishlist', asyncHandler(async (req, res) => res.json({ wishlist: { items: (wishlists.get(auth(req).id) || []).map((productId) => ({ productId })) } })));
router.post('/wishlist', asyncHandler(async (req, res) => {
  const user = auth(req); const { productId } = z.object({ productId: z.string() }).parse(req.body);
  const product = products.find((item) => item.id === productId && item.isActive);
  if (!product) throw new ApiError(404, 'Product not found');
  wishlists.set(user.id, Array.from(new Set([...(wishlists.get(user.id) || []), productId])));
  res.status(201).json({ wishlist: { items: wishlists.get(user.id)!.map((id) => ({ productId: id })) } });
}));
router.delete('/wishlist/:productId', asyncHandler(async (req, res) => { const user = auth(req); wishlists.set(user.id, (wishlists.get(user.id) || []).filter((id) => id !== req.params.productId)); res.status(204).send(); }));

router.post('/coupons/apply', asyncHandler(async (req, res) => { const user = auth(req); const code = String(req.body.code || '').toUpperCase(); const coupon = coupons.find((item) => item.code === code); if (!coupon) throw new ApiError(404, 'Invalid coupon code'); res.json({ coupon, totals: totals(carts.get(user.id) || [], code) }); }));

function finalizeMemoryPaidOrder(order: Order) {
  if (order.paymentStatus === 'Paid') return;
  for (const item of order.items) {
    const product = products.find((p) => p.id === item.productId && p.isActive);
    if (!product) throw new ApiError(400, `${item.name} is unavailable`);
    if (product.stock < item.quantity) throw new ApiError(400, `${item.name} has only ${product.stock} in stock`);
  }
  order.items.forEach((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    product.stock -= item.quantity;
  });
  carts.set(order.customerId, []);
  order.paymentStatus = 'Paid';
  order.updatedAt = new Date();
}

router.post('/orders', asyncHandler(async (req, res) => {
  const user = auth(req); const items = carts.get(user.id) || []; if (!items.length) throw new ApiError(400, 'Cart is empty');
  if (!settings.isStoreOpen) throw new ApiError(400, 'Store is currently closed');
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId && p.isActive);
    if (!product) throw new ApiError(400, 'One or more cart items are unavailable');
    if (item.quantity > product.stock) throw new ApiError(400, `${product.name} has only ${product.stock} in stock`);
  }
  const total = totals(items, req.body.couponCode);
  if (total.subtotal < settings.minOrderValue) throw new ApiError(400, `Minimum order value is Rs ${settings.minOrderValue}`);
  const order: Order = { id: id('ord'), orderId: `FMX${Date.now().toString().slice(-8)}`, customerId: user.id, customerName: user.name, phone: req.body.address?.phone || user.phone || '', email: user.email, address: req.body.address, items: items.map((item) => { const product = products.find((p) => p.id === item.productId)!; if (req.body.paymentMethod === 'COD') product.stock -= item.quantity; return { productId: product.id, name: product.name, quantity: item.quantity, price: product.sellingPrice, total: product.sellingPrice * item.quantity }; }), ...total, couponCode: req.body.couponCode, paymentMethod: req.body.paymentMethod, paymentStatus: 'Pending', orderStatus: 'Pending', estimatedDeliveryTime: new Date(Date.now() + 20 * 60000), createdAt: new Date(), updatedAt: new Date() };
  orders.unshift(order); if (req.body.paymentMethod === 'COD') carts.set(user.id, []); await saveMemory(); res.status(201).json({ order });
}));
router.get('/orders', asyncHandler(async (req, res) => res.json({ orders: orders.filter((order) => order.customerId === auth(req).id) })));
router.get('/orders/admin/all', asyncHandler(async (req, res) => { admin(req); res.json({ orders }); }));
router.post('/orders/:orderId/cancel', asyncHandler(async (req, res) => {
  const user = auth(req);
  const orderIndex = orders.findIndex((item) => item.orderId === req.params.orderId && item.customerId === user.id);
  const order = orders[orderIndex];
  if (!order) throw new ApiError(404, 'Order not found');
  if (['Out for Delivery', 'OutForDelivery', 'Delivered', 'Cancelled'].includes(order.orderStatus)) throw new ApiError(400, 'Order cannot be cancelled after dispatch');
  if (order.paymentMethod === 'COD' || order.paymentStatus === 'Paid') order.items.forEach((item) => { const product = products.find((p) => p.id === item.productId); if (product) product.stock += item.quantity; });
  orders.splice(orderIndex, 1);
  await saveMemory();
  res.json({ deleted: true, orderId: order.orderId, message: 'Order cancelled and removed from order history' });
}));
router.post('/orders/:orderId/refund', asyncHandler(async (req, res) => {
  const user = auth(req);
  const order = orders.find((item) => item.orderId === req.params.orderId && item.customerId === user.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.orderStatus !== 'Delivered') throw new ApiError(400, 'Refund can be requested only after delivery');
  if (order.paymentStatus === 'Refunded') throw new ApiError(400, 'This order is already refunded');
  const deliveredAt = order.updatedAt || order.createdAt;
  if (Date.now() - deliveredAt.getTime() > 7 * 24 * 60 * 60 * 1000) throw new ApiError(400, 'Refund window has expired after 7 days of delivery');
  order.paymentStatus = 'Refunded';
  order.updatedAt = new Date();
  await saveMemory();
  res.json({ order, message: 'Refund request approved' });
}));
router.patch('/orders/:orderId/status', asyncHandler(async (req, res) => {
  admin(req);
  const order = orders.find((item) => item.orderId === req.params.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  order.orderStatus = String(req.body.orderStatus || order.orderStatus);
  if (req.body.paymentStatus) order.paymentStatus = String(req.body.paymentStatus);
  order.updatedAt = new Date();
  await saveMemory();
  res.json({ order });
}));
router.get('/orders/:orderId/track', asyncHandler(async (req, res) => { const user = auth(req); const order = orders.find((item) => item.orderId === req.params.orderId && (item.customerId === user.id || user.role === 'ADMIN')); if (!order) throw new ApiError(404, 'Order not found'); res.json(order); }));
router.post('/orders/:orderId/reorder', asyncHandler(async (req, res) => { const user = auth(req); const order = orders.find((item) => item.orderId === req.params.orderId && item.customerId === user.id); if (!order) throw new ApiError(404, 'Order not found'); carts.set(user.id, order.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))); res.status(201).json({ cart: cartResponse(user.id) }); }));

router.post('/payments/create-order', asyncHandler(async (req, res) => {
  const user = auth(req);
  const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
  const order = orders.find((item) => item.orderId === orderId && item.customerId === user.id);
  if (!order) throw new ApiError(404, 'Order not found');
  const hasRealKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && !env.RAZORPAY_KEY_ID.includes('replace') && !env.RAZORPAY_KEY_SECRET.includes('replace'));
  const amount = Math.round(order.total * 100);
  let providerOrderId = `demo_rzp_${Date.now()}`;
  if (hasRealKeys) {
    const basicAuth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'INR', receipt: order.orderId, notes: { localOrderId: order.orderId } }),
    });
    const razorpayOrder = await response.json() as { id?: string; error?: { description?: string } };
    if (!response.ok || !razorpayOrder.id) throw new ApiError(400, razorpayOrder.error?.description || 'Razorpay order creation failed');
    providerOrderId = razorpayOrder.id;
  }
  res.json({ provider: hasRealKeys ? 'RAZORPAY' : 'RAZORPAY_DEMO', keyId: env.RAZORPAY_KEY_ID, providerOrderId, amount, currency: 'INR' });
}));
router.post('/payments/demo-success', asyncHandler(async (req, res) => { const user = auth(req); const order = orders.find((item) => item.orderId === req.body.orderId && item.customerId === user.id); if (!order) throw new ApiError(404, 'Order not found'); finalizeMemoryPaidOrder(order); await saveMemory(); res.json({ payment: { status: 'Paid' } }); }));
router.post('/payments/verify', asyncHandler(async (req, res) => {
  const user = auth(req);
  const data = z.object({ orderId: z.string(), providerOrderId: z.string(), providerPaymentId: z.string(), providerSignature: z.string() }).parse(req.body);
  const order = orders.find((item) => item.orderId === data.orderId && item.customerId === user.id);
  if (!order) throw new ApiError(404, 'Order not found');
  let verified = data.providerOrderId.startsWith('demo_rzp_');
  if (!verified && env.RAZORPAY_KEY_SECRET) {
    const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${data.providerOrderId}|${data.providerPaymentId}`).digest('hex');
    verified = expected === data.providerSignature;
  }
  if (!verified) throw new ApiError(400, 'Payment verification failed');
  finalizeMemoryPaidOrder(order);
  await saveMemory();
  res.json({ payment: { status: 'Paid', providerOrderId: data.providerOrderId, providerPaymentId: data.providerPaymentId } });
}));
router.post('/payments/failure', asyncHandler(async (req, res) => { const user = auth(req); const order = orders.find((item) => item.orderId === req.body.orderId && item.customerId === user.id); if (order) { order.paymentStatus = 'Failed'; order.updatedAt = new Date(); await saveMemory(); } res.json({ payment: { status: 'Failed' } }); }));

router.get('/admin/dashboard', asyncHandler(async (req, res) => { admin(req); res.json({ revenue: orders.reduce((sum, order) => sum + order.total, 0), orders: orders.length, customers: users.filter((u) => u.role === 'CUSTOMER').length, lowStock: products.filter((p) => p.stock <= p.lowStockThreshold).length }); }));
router.get('/admin/customers', asyncHandler(async (req, res) => { admin(req); res.json({ customers: users.filter((u) => u.role === 'CUSTOMER').map((u) => ({ ...u, isActive: u.isActive !== false, passwordHash: undefined, _count: { orders: orders.filter((o) => o.customerId === u.id).length } })) }); }));
router.patch('/admin/customers/:id', asyncHandler(async (req, res) => {
  admin(req);
  const customer = users.find((u) => u.id === req.params.id && u.role === 'CUSTOMER');
  if (!customer) throw new ApiError(404, 'Customer not found');
  const data = z.object({ isActive: z.boolean() }).parse(req.body);
  customer.isActive = data.isActive;
  await saveMemory();
  res.json({ customer: { ...customer, passwordHash: undefined, _count: { orders: orders.filter((o) => o.customerId === customer.id).length } } });
}));
router.delete('/admin/customers/:id', asyncHandler(async (req, res) => {
  admin(req);
  const index = users.findIndex((u) => u.id === req.params.id && u.role === 'CUSTOMER');
  if (index < 0) throw new ApiError(404, 'Customer not found');
  const customerId = users[index].id;
  users.splice(index, 1);
  carts.delete(customerId);
  wishlists.delete(customerId);
  for (let orderIndex = orders.length - 1; orderIndex >= 0; orderIndex -= 1) {
    if (orders[orderIndex].customerId === customerId) orders.splice(orderIndex, 1);
  }
  await saveMemory();
  res.status(204).send();
}));
router.get('/admin/inventory', asyncHandler(async (req, res) => { admin(req); res.json({ inventory: products.map((product) => ({ product, stock: product.stock })) }); }));
router.get('/admin/coupons', asyncHandler(async (req, res) => { admin(req); res.json({ coupons }); }));
router.get('/admin/banners', asyncHandler(async (req, res) => { admin(req); res.json({ banners }); }));
router.get('/admin/settings', asyncHandler(async (req, res) => { admin(req); res.json({ settings }); }));
router.get('/admin/analytics/revenue', asyncHandler(async (req, res) => { admin(req); res.json({ orders }); }));
router.get('/admin/enquiries', asyncHandler(async (req, res) => { admin(req); res.json({ enquiries }); }));
router.patch('/admin/enquiries/:id', asyncHandler(async (req, res) => {
  admin(req);
  const enquiry = enquiries.find((item) => item.id === req.params.id);
  if (!enquiry) throw new ApiError(404, 'Enquiry not found');
  enquiry.status = req.body.status || enquiry.status;
  res.json({ enquiry });
}));
router.patch('/admin/inventory/:productId', asyncHandler(async (req, res) => {
  admin(req);
  const product = products.find((item) => item.id === req.params.productId);
  if (!product) throw new ApiError(404, 'Product not found');
  product.stock = Number(req.body.stock ?? product.stock);
  product.lowStockThreshold = Number(req.body.lowStockThreshold ?? product.lowStockThreshold);
  await saveMemory();
  res.json({ product: serializeProduct(product) });
}));
router.post('/admin/coupons', asyncHandler(async (req, res) => {
  admin(req);
  const coupon = { id: id('coup'), code: String(req.body.code).toUpperCase(), description: String(req.body.description || 'Eagle Mart coupon'), type: req.body.type || 'FIXED', value: Number(req.body.value || 0), minOrderValue: Number(req.body.minOrderValue || 0), isActive: req.body.isActive ?? true };
  coupons.push(coupon);
  await saveMemory();
  res.status(201).json({ coupon });
}));
router.put('/admin/coupons/:id', asyncHandler(async (req, res) => {
  admin(req);
  const coupon = coupons.find((item) => item.id === req.params.id);
  if (!coupon) throw new ApiError(404, 'Coupon not found');
  Object.assign(coupon, { ...req.body, code: req.body.code ? String(req.body.code).toUpperCase() : coupon.code, value: req.body.value !== undefined ? Number(req.body.value) : coupon.value, minOrderValue: req.body.minOrderValue !== undefined ? Number(req.body.minOrderValue) : coupon.minOrderValue });
  await saveMemory();
  res.json({ coupon });
}));
router.delete('/admin/coupons/:id', asyncHandler(async (req, res) => {
  admin(req);
  const couponIndex = coupons.findIndex((item) => item.id === req.params.id);
  if (couponIndex === -1) throw new ApiError(404, 'Coupon not found');
  coupons.splice(couponIndex, 1);
  await saveMemory();
  res.status(204).send();
}));
router.post('/admin/banners', asyncHandler(async (req, res) => {
  admin(req);
  const banner = { id: id('ban'), title: String(req.body.title || 'FreshMart Express'), subtitle: String(req.body.subtitle || 'Premium grocery delivery'), image: String(req.body.image || banners[0].image), isActive: req.body.isActive ?? true };
  banners.push(banner);
  res.status(201).json({ banner });
}));
router.put('/admin/banners/:id', asyncHandler(async (req, res) => {
  admin(req);
  const banner = banners.find((item) => item.id === req.params.id);
  if (!banner) throw new ApiError(404, 'Banner not found');
  Object.assign(banner, req.body);
  res.json({ banner });
}));
router.delete('/admin/banners/:id', asyncHandler(async (req, res) => {
  admin(req);
  const banner = banners.find((item) => item.id === req.params.id);
  if (!banner) throw new ApiError(404, 'Banner not found');
  banner.isActive = false;
  res.status(204).send();
}));
router.put('/admin/settings', asyncHandler(async (req, res) => {
  admin(req);
  const data = z.object({
    minOrderValue: z.coerce.number().min(0).optional(),
    freeDeliveryAbove: z.coerce.number().min(0).optional(),
    deliveryFee: z.coerce.number().min(0).optional(),
    taxPercent: z.coerce.number().min(0).max(50).optional(),
    estimatedDeliveryMins: z.coerce.number().int().min(1).max(240).optional(),
    isStoreOpen: z.boolean().optional(),
  }).parse(req.body);
  Object.assign(settings, data);
  await saveMemory();
  res.json({ settings });
}));

export default router;

