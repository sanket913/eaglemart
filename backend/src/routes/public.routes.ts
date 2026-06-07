import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/home', asyncHandler(async (_req, res) => {
  const [banners, categories, featured, bestSellers, settings] = await Promise.all([
    prisma.banner.findMany({ where: { isActive: true, position: 'HOME' }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.product.findMany({ where: { isActive: true, isFeatured: true }, include: { category: true }, take: 12 }),
    prisma.product.findMany({ where: { isActive: true, isBestSeller: true }, include: { category: true }, take: 12 }),
    prisma.storeSettings.findFirst(),
  ]);
  res.json({ banners, categories, featured, bestSellers, settings });
}));

export default router;
