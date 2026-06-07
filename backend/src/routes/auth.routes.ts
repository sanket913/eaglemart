import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword, signToken, verifyPassword } from '../utils/auth.js';

const router = Router();

const authSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email(),
  phone: z.string().min(7).optional(),
  password: z.string().min(6),
});

const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

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

router.post('/register', asyncHandler(async (req, res) => {
  const data = authSchema.extend({ name: z.string().min(2) }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError(409, 'Email is already registered');

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash: await hashPassword(data.password),
      role: 'CUSTOMER',
      cart: { create: {} },
      wishlist: { create: {} },
    },
    select: publicUser,
  });

  res.status(201).json({ user: { ...user, addresses: [] }, token: signToken({ userId: user.id, role: user.role as 'CUSTOMER' | 'ADMIN' }) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const data = authSchema.pick({ email: true, password: true }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { addresses: true } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  res.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, addresses: user.addresses },
    token: signToken({ userId: user.id, role: user.role as 'CUSTOMER' | 'ADMIN' }),
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { ...publicUser, addresses: true },
  });
  res.json({ user });
}));

router.patch('/me', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const data = z.object({
    name: z.string().min(2),
    phone: z.string().min(7).optional(),
    address: addressSchema.optional(),
  }).parse(req.body);

  if (data.address) {
    const existing = await prisma.address.findFirst({ where: { userId: req.user!.id, isDefault: true } });
    const addressData = {
      label: data.address.label || 'Home',
      name: data.address.name || data.name,
      phone: data.address.phone || data.phone || '',
      line1: data.address.line1,
      line2: data.address.line2 || '',
      city: data.address.city,
      state: data.address.state,
      pincode: data.address.pincode,
      isDefault: true,
    };
    if (existing) await prisma.address.update({ where: { id: existing.id }, data: addressData });
    else await prisma.address.create({ data: { ...addressData, userId: req.user!.id } });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: data.name, phone: data.phone || undefined },
    select: { ...publicUser, addresses: true },
  });

  res.json({ user });
}));

router.get('/me/addresses', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user!.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ addresses });
}));

router.post('/me/addresses', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const data = addressSchema.parse(req.body);
  const shouldDefault = data.isDefault ?? true;
  if (shouldDefault) {
    await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
  }
  const address = await prisma.address.create({
    data: {
      userId: req.user!.id,
      label: data.label || 'Home',
      name: data.name || '',
      phone: data.phone || '',
      line1: data.line1,
      line2: data.line2 || '',
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      isDefault: shouldDefault,
    },
  });
  res.status(201).json({ address });
}));

router.patch('/me/addresses/:addressId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const data = addressSchema.partial().parse(req.body);
  const addressId = String(req.params.addressId);
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId: req.user!.id } });
  if (!existing) throw new ApiError(404, 'Address not found');
  if (data.isDefault) {
    await prisma.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
  }
  const address = await prisma.address.update({
    where: { id: existing.id },
    data: {
      label: data.label ?? existing.label,
      name: data.name ?? existing.name,
      phone: data.phone ?? existing.phone,
      line1: data.line1 ?? existing.line1,
      line2: data.line2 ?? existing.line2,
      city: data.city ?? existing.city,
      state: data.state ?? existing.state,
      pincode: data.pincode ?? existing.pincode,
      isDefault: data.isDefault ?? existing.isDefault,
    },
  });
  res.json({ address });
}));

router.delete('/me/addresses/:addressId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const addressId = String(req.params.addressId);
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId: req.user!.id } });
  if (!existing) throw new ApiError(404, 'Address not found');
  await prisma.address.delete({ where: { id: existing.id } });
  if (existing.isDefault) {
    const nextDefault = await prisma.address.findFirst({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
    if (nextDefault) await prisma.address.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
  }
  res.json({ success: true });
}));

export default router;

