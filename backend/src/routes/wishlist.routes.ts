import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

const getWishlist = (userId: string) =>
  prisma.wishlist.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: { include: { product: { include: { category: true } } }, orderBy: { createdAt: 'desc' } } },
  });

router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  res.json({ wishlist: await getWishlist(req.user!.id) });
}));

router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const { productId } = z.object({ productId: z.string() }).parse(req.body);
  const wishlist = await prisma.wishlist.upsert({ where: { userId: req.user!.id }, update: {}, create: { userId: req.user!.id } });
  await prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    update: {},
    create: { wishlistId: wishlist.id, productId },
  });
  res.status(201).json({ wishlist: await getWishlist(req.user!.id) });
}));

router.delete('/:productId', asyncHandler(async (req: AuthedRequest, res) => {
  const productId = String(req.params.productId);
  const wishlist = await prisma.wishlist.findUniqueOrThrow({ where: { userId: req.user!.id } });
  await prisma.wishlistItem.delete({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId } } });
  res.status(204).send();
}));

export default router;
