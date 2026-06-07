import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

const finalizePaidOrder = async (orderId: string, userId: string) =>
  prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { orderId, customerId: userId }, include: { items: true, payment: true } });
    if (!order || !order.payment) throw new ApiError(404, 'Order not found');
    if (order.paymentStatus !== 'Paid') {
      for (const item of order.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId }, select: { name: true, stock: true, isActive: true } });
        if (!product || !product.isActive) throw new ApiError(400, `${item.name} is unavailable`);
        if (product.stock < item.quantity) throw new ApiError(400, `${item.name} has only ${product.stock} in stock`);
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity }, inventory: { update: { stock: { decrement: item.quantity } } } },
        });
      }
      if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { usedCount: { increment: 1 } } });
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'Paid' } });
    return order;
  });

router.post('/create-order', asyncHandler(async (req: AuthedRequest, res) => {
  const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
  const order = await prisma.order.findFirst({ where: { orderId, customerId: req.user!.id }, include: { payment: true } });
  if (!order || !order.payment) throw new ApiError(404, 'Order not found');
  const hasRealKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && !env.RAZORPAY_KEY_ID.includes('replace') && !env.RAZORPAY_KEY_SECRET.includes('replace'));
  let providerOrderId = `demo_rzp_${Date.now()}`;
  const amount = Math.round(Number(order.total) * 100);
  if (hasRealKeys) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'INR', receipt: order.orderId, notes: { localOrderId: order.orderId } }),
    });
    const razorpayOrder = await response.json() as { id?: string; error?: { description?: string } };
    if (!response.ok || !razorpayOrder.id) throw new ApiError(400, razorpayOrder.error?.description || 'Razorpay order creation failed');
    providerOrderId = razorpayOrder.id;
  }
  await prisma.payment.update({ where: { orderId: order.id }, data: { providerOrderId } });
  res.json({ provider: hasRealKeys ? 'RAZORPAY' : 'RAZORPAY_DEMO', keyId: env.RAZORPAY_KEY_ID, providerOrderId, amount, currency: 'INR' });
}));

router.post('/verify', asyncHandler(async (req: AuthedRequest, res) => {
  const data = z.object({
    orderId: z.string(),
    providerOrderId: z.string(),
    providerPaymentId: z.string(),
    providerSignature: z.string(),
  }).parse(req.body);
  const order = await prisma.order.findFirst({ where: { orderId: data.orderId, customerId: req.user!.id }, include: { payment: true } });
  if (!order || !order.payment) throw new ApiError(404, 'Order not found');

  let verified = data.providerOrderId.startsWith('demo_rzp_');
  if (!verified && env.RAZORPAY_KEY_SECRET) {
    const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${data.providerOrderId}|${data.providerPaymentId}`).digest('hex');
    verified = expected === data.providerSignature;
  }
  if (!verified) throw new ApiError(400, 'Payment verification failed');

  await finalizePaidOrder(order.orderId, req.user!.id);
  const payment = await prisma.payment.update({
    where: { orderId: order.id },
    data: { status: 'Paid', providerOrderId: data.providerOrderId, providerPaymentId: data.providerPaymentId, providerSignature: data.providerSignature },
  });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'Paid' } });
  res.json({ payment });
}));

router.post('/demo-success', asyncHandler(async (req: AuthedRequest, res) => {
  const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
  const order = await prisma.order.findFirst({ where: { orderId, customerId: req.user!.id } });
  if (!order) throw new ApiError(404, 'Order not found');
  await finalizePaidOrder(order.orderId, req.user!.id);
  const payment = await prisma.payment.update({ where: { orderId: order.id }, data: { status: 'Paid', providerPaymentId: `demo_${Date.now()}` } });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'Paid' } });
  res.json({ payment });
}));

router.post('/failure', asyncHandler(async (req: AuthedRequest, res) => {
  const { orderId, reason } = z.object({ orderId: z.string(), reason: z.string().optional() }).parse(req.body);
  const order = await prisma.order.findFirst({ where: { orderId, customerId: req.user!.id } });
  if (!order) throw new ApiError(404, 'Order not found');
  const payment = await prisma.payment.update({ where: { orderId: order.id }, data: { status: 'Failed', failureReason: reason } });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'Failed' } });
  res.json({ payment });
}));

export default router;
