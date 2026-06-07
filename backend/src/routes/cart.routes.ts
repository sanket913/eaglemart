import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({ productId: z.string(), quantity: z.coerce.number().int().min(1) });

const getCart = (userId: string) =>
  prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: { include: { product: { include: { category: true } } }, orderBy: { createdAt: 'desc' } } },
  });

router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  res.json({ cart: await getCart(req.user!.id) });
}));

router.post('/items', asyncHandler(async (req: AuthedRequest, res) => {
  const data = itemSchema.parse(req.body);
  const product = await prisma.product.findUnique({ where: { id: data.productId } });
  if (!product || !product.isActive) throw new ApiError(404, 'Product not found');
  if (product.stock <= 0) throw new ApiError(400, 'Product is out of stock');
  if (data.quantity > product.stock) throw new ApiError(400, 'Quantity exceeds available stock');

  const cart = await prisma.cart.upsert({ where: { userId: req.user!.id }, update: {}, create: { userId: req.user!.id } });
  const existing = await prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: data.productId } } });
  const nextQuantity = (existing?.quantity || 0) + data.quantity;
  if (nextQuantity > product.stock) throw new ApiError(400, 'Quantity exceeds available stock');

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: data.productId } },
    update: { quantity: nextQuantity },
    create: { cartId: cart.id, productId: data.productId, quantity: data.quantity },
  });
  res.status(201).json({ cart: await getCart(req.user!.id) });
}));

router.patch('/items/:productId', asyncHandler(async (req: AuthedRequest, res) => {
  const productId = String(req.params.productId);
  const { quantity } = z.object({ quantity: z.coerce.number().int().min(1) }).parse(req.body);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || quantity > product.stock) throw new ApiError(400, 'Invalid quantity');
  const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: req.user!.id } });
  await prisma.cartItem.update({ where: { cartId_productId: { cartId: cart.id, productId } }, data: { quantity } });
  res.json({ cart: await getCart(req.user!.id) });
}));

router.delete('/items/:productId', asyncHandler(async (req: AuthedRequest, res) => {
  const productId = String(req.params.productId);
  const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: req.user!.id } });
  await prisma.cartItem.delete({ where: { cartId_productId: { cartId: cart.id, productId } } });
  res.status(204).send();
}));

router.delete('/', asyncHandler(async (req: AuthedRequest, res) => {
  const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.status(204).send();
}));

export default router;
