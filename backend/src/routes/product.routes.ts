import { Router } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  brand: z.string().min(2),
  categoryId: z.string(),
  description: z.string().min(5),
  images: z.array(z.string().min(1)).min(1).or(z.string().min(1)),
  mrp: z.coerce.number().positive(),
  sellingPrice: z.coerce.number().positive(),
  discount: z.coerce.number().int().min(0).max(95).default(0),
  unit: z.string().min(1),
  stock: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const includeCategory = { category: { select: { id: true, name: true, slug: true } } };

router.get('/', asyncHandler(async (req, res) => {
  const { search, category, brand, minPrice, maxPrice, rating, discount, sort = 'featured' } = req.query;
  const where: any = { isActive: true };
  if (search) where.OR = [{ name: { contains: String(search) } }, { brand: { contains: String(search) } }];
  if (category) where.category = { slug: String(category) };
  if (brand) where.brand = String(brand);
  if (minPrice || maxPrice) where.sellingPrice = { gte: minPrice ? Number(minPrice) : undefined, lte: maxPrice ? Number(maxPrice) : undefined };
  if (rating) where.rating = { gte: Number(rating) };
  if (discount) where.discount = { gte: Number(discount) };

  const orderBy =
    sort === 'price-low' ? { sellingPrice: 'asc' as const } :
    sort === 'price-high' ? { sellingPrice: 'desc' as const } :
    sort === 'rating' ? { rating: 'desc' as const } :
    sort === 'discount' ? { discount: 'desc' as const } :
    { isFeatured: 'desc' as const };

  const products = await prisma.product.findMany({ where, include: includeCategory, orderBy });
  res.json({ products });
}));

router.get('/admin/all', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const products = await prisma.product.findMany({ include: includeCategory, orderBy: { createdAt: 'desc' } });
  res.json({ products });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '');
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: [{ name: { contains: q } }, { brand: { contains: q } }] },
    include: includeCategory,
    take: 12,
  });
  res.json({ products });
}));

router.get('/:idOrSlug', asyncHandler(async (req, res) => {
  const idOrSlug = String(req.params.idOrSlug);
  const product = await prisma.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], isActive: true },
    include: { ...includeCategory, reviews: { where: { isVisible: true }, include: { user: { select: { name: true } } }, take: 10 } },
  });
  if (!product) throw new ApiError(404, 'Product not found');
  res.json({ product });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const slug = data.slug || slugify(data.name, { lower: true, strict: true });
  const images = Array.isArray(data.images) ? data.images[0] : data.images;
  const product = await prisma.product.create({
    data: { ...data, images, slug, inventory: { create: { stock: data.stock } } },
    include: includeCategory,
  });
  res.status(201).json({ product });
}));

router.put('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = productSchema.partial().parse(req.body);
  const images = Array.isArray(data.images) ? data.images[0] : data.images;
  const product = await prisma.product.update({
    where: { id },
    data: { ...data, images, slug: data.name && !data.slug ? slugify(data.name, { lower: true, strict: true }) : data.slug },
    include: includeCategory,
  });
  res.json({ product });
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { productId: id } });
    await tx.wishlistItem.deleteMany({ where: { productId: id } });
    await tx.review.deleteMany({ where: { productId: id } });
    await tx.inventory.deleteMany({ where: { productId: id } });
    await tx.orderItem.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
  res.status(204).send();
}));

export default router;
