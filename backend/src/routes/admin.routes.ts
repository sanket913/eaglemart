import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [revenue, orders, customers, lowStock] = await Promise.all([
    prisma.order.aggregate({ _sum: { total: true } }),
    prisma.order.count(),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.product.count({ where: { stock: { lte: 5 }, isActive: true } }),
  ]);
  res.json({ revenue: revenue._sum.total || 0, orders, customers, lowStock });
}));

router.get('/analytics/revenue', asyncHandler(async (_req, res) => {
  const orders = await prisma.order.findMany({ select: { total: true, createdAt: true, orderStatus: true }, orderBy: { createdAt: 'asc' } });
  res.json({ orders });
}));

router.get('/customers', asyncHandler(async (_req, res) => {
  const customers = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true, _count: { select: { orders: true } } } });
  res.json({ customers });
}));

router.patch('/customers/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = z.object({ isActive: z.boolean() }).parse(req.body);
  const existing = await prisma.user.findFirst({ where: { id, role: 'CUSTOMER' } });
  if (!existing) throw new ApiError(404, 'Customer not found');
  const customer = await prisma.user.update({
    where: { id },
    data: { isActive: data.isActive },
    select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true, _count: { select: { orders: true } } },
  });
  res.json({ customer });
}));

router.delete('/customers/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Customer not found');
  await prisma.$transaction(async (tx) => {
    const customerOrders = await tx.order.findMany({ where: { customerId: id }, select: { id: true } });
    const orderIds = customerOrders.map((order) => order.id);
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.review.deleteMany({ where: { userId: id } });
    if (orderIds.length) await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cart.deleteMany({ where: { userId: id } });
    await tx.wishlist.deleteMany({ where: { userId: id } });
    await tx.address.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });
  res.status(204).send();
}));

router.get('/coupons', asyncHandler(async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ coupons });
}));

const couponSchema = z.object({
  code: z.string().min(2).transform((value) => value.toUpperCase()),
  description: z.string().min(2).default('Eagle Mart coupon'),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_DELIVERY']),
  value: z.coerce.number().min(0),
  minOrderValue: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

router.post('/coupons', asyncHandler(async (req, res) => {
  const data = couponSchema.parse(req.body);
  const coupon = await prisma.coupon.create({ data });
  res.status(201).json({ coupon });
}));

router.put('/coupons/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = couponSchema.partial().parse(req.body);
  const coupon = await prisma.coupon.update({ where: { id }, data });
  res.json({ coupon });
}));

router.delete('/coupons/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await prisma.coupon.delete({ where: { id } });
  res.status(204).send();
}));

router.get('/inventory', asyncHandler(async (_req, res) => {
  const inventory = await prisma.inventory.findMany({ include: { product: { include: { category: true } } }, orderBy: { updatedAt: 'desc' } });
  res.json({ inventory });
}));

router.get('/inventory/low-stock', asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true, stock: { lte: 10 } }, include: { category: true } });
  res.json({ products });
}));

router.patch('/inventory/:productId', asyncHandler(async (req, res) => {
  const productId = String(req.params.productId);
  const { stock, lowStockThreshold } = z.object({ stock: z.coerce.number().int().min(0), lowStockThreshold: z.coerce.number().int().min(0).optional() }).parse(req.body);
  const product = await prisma.product.update({
    where: { id: productId },
    data: { stock, lowStockThreshold, inventory: { upsert: { create: { stock }, update: { stock, lastRestocked: new Date() } } } },
    include: { inventory: true },
  });
  res.json({ product });
}));

router.get('/settings', asyncHandler(async (_req, res) => {
  const settings = await prisma.storeSettings.findFirst();
  res.json({ settings });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const schema = z.object({
    storeName: z.string().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    minOrderValue: z.coerce.number().optional(),
    freeDeliveryAbove: z.coerce.number().optional(),
    deliveryFee: z.coerce.number().optional(),
    taxPercent: z.coerce.number().optional(),
    estimatedDeliveryMins: z.coerce.number().int().optional(),
    isStoreOpen: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const existing = await prisma.storeSettings.findFirst();
  const settings = existing ? await prisma.storeSettings.update({ where: { id: existing.id }, data }) : await prisma.storeSettings.create({ data });
  res.json({ settings });
}));

router.get('/banners', asyncHandler(async (_req, res) => {
  const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ banners });
}));

router.post('/banners', asyncHandler(async (req, res) => {
  const data = z.object({ title: z.string(), subtitle: z.string().optional(), image: z.string().url(), link: z.string().optional(), position: z.string().default('HOME'), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0) }).parse(req.body);
  const banner = await prisma.banner.create({ data });
  res.status(201).json({ banner });
}));

router.put('/banners/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = z.object({ title: z.string().optional(), subtitle: z.string().optional(), image: z.string().url().optional(), link: z.string().optional(), position: z.string().optional(), isActive: z.boolean().optional(), sortOrder: z.coerce.number().int().optional() }).parse(req.body);
  const banner = await prisma.banner.update({ where: { id }, data });
  res.json({ banner });
}));

router.delete('/banners/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await prisma.banner.update({ where: { id }, data: { isActive: false } });
  res.status(204).send();
}));

export default router;
