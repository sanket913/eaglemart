import { Router } from 'express';
import { z } from 'zod';
import slugify from 'slugify';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  image: z.string().url().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

router.get('/', asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ categories });
}));

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const category = await prisma.category.create({
    data: { ...data, slug: data.slug || slugify(data.name, { lower: true, strict: true }) },
  });
  res.status(201).json({ category });
}));

router.put('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const data = schema.partial().parse(req.body);
  const category = await prisma.category.update({
    where: { id },
    data: { ...data, slug: data.name && !data.slug ? slugify(data.name, { lower: true, strict: true }) : data.slug },
  });
  res.json({ category });
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  await prisma.category.update({ where: { id }, data: { isActive: false } });
  res.status(204).send();
}));

export default router;
