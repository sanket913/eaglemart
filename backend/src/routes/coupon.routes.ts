import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateTotals, toNumber } from '../utils/pricing.js';

const router = Router();

const schema = z.object({
  code: z.string().min(2).transform((v) => v.toUpperCase()),
  description: z.string(),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_DELIVERY']),
  value: z.coerce.number().min(0),
  minOrderValue: z.coerce.number().min(0).default(0),
  maxDiscount: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional(),
  firstOrderOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
  expiresAt: z.coerce.date().optional(),
});

router.post('/apply', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { code } = z.object({ code: z.string().min(2) }).parse(req.body);
  const cart = await prisma.cart.findUnique({
    where: { userId: req.user!.id },
    include: { items: { include: { product: true } } },
  });
  if (!cart || cart.items.length === 0) throw new ApiError(400, 'Cart is empty');

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');

  const settings = await prisma.storeSettings.findFirstOrThrow();
  const orderCount = await prisma.order.count({ where: { customerId: req.user!.id } });
  const subtotal = cart.items.reduce((sum, item) => sum + toNumber(item.product.sellingPrice) * item.quantity, 0);
  const totals = calculateTotals(subtotal, settings, coupon, orderCount === 0);
  res.json({ coupon, totals });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const coupon = await prisma.coupon.create({ data });
  res.status(201).json({ coupon });
}));

router.put('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = schema.partial().parse(req.body);
  const coupon = await prisma.coupon.update({ where: { id }, data });
  res.json({ coupon });
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await prisma.coupon.update({ where: { id }, data: { isActive: false } });
  res.status(204).send();
}));

export default router;
