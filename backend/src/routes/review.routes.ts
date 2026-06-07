import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/product/:productId', asyncHandler(async (req, res) => {
  const productId = String(req.params.productId);
  const reviews = await prisma.review.findMany({
    where: { productId, isVisible: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ reviews });
}));

router.post('/product/:productId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const productId = String(req.params.productId);
  const data = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().optional() }).parse(req.body);
  const review = await prisma.review.upsert({
    where: { userId_productId: { userId: req.user!.id, productId } },
    update: data,
    create: { ...data, userId: req.user!.id, productId },
  });
  const aggregate = await prisma.review.aggregate({ where: { productId, isVisible: true }, _avg: { rating: true }, _count: { _all: true } });
  await prisma.product.update({ where: { id: productId }, data: { rating: aggregate._avg.rating || 0, reviewCount: aggregate._count._all } });
  res.status(201).json({ review });
}));

export default router;
