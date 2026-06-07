import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAdmin, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { calculateTotals, toNumber } from '../utils/pricing.js';
import { firstImage } from '../utils/images.js';

const router = Router();

const addressSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(7),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(4),
});

const placeOrderSchema = z.object({
  address: addressSchema,
  paymentMethod: z.enum(['COD', 'RAZORPAY']),
  couponCode: z.string().optional(),
});

router.post('/', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const data = placeOrderSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const cart = await prisma.cart.findUnique({
    where: { userId: req.user!.id },
    include: { items: { include: { product: true } } },
  });
  if (!cart || cart.items.length === 0) throw new ApiError(400, 'Cart is empty');

  const settings = await prisma.storeSettings.findFirstOrThrow();
  const subtotal = cart.items.reduce((sum, item) => {
    if (!item.product.isActive || item.product.stock <= 0) throw new ApiError(400, `${item.product.name} is out of stock`);
    if (item.quantity > item.product.stock) throw new ApiError(400, `${item.product.name} has only ${item.product.stock} in stock`);
    return sum + toNumber(item.product.sellingPrice) * item.quantity;
  }, 0);
  if (subtotal < toNumber(settings.minOrderValue)) throw new ApiError(400, `Minimum order value is ${settings.minOrderValue}`);

  const coupon = data.couponCode ? await prisma.coupon.findUnique({ where: { code: data.couponCode.toUpperCase() } }) : null;
  const orderCount = await prisma.order.count({ where: { customerId: req.user!.id } });
  const totals = calculateTotals(subtotal, settings, coupon, orderCount === 0);
  const orderId = `FMX${Date.now().toString().slice(-8)}`;
  const paid = 'Pending';
  const reserveNow = data.paymentMethod === 'COD';

  const order = await prisma.$transaction(async (tx) => {
    if (reserveNow) {
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity }, inventory: { update: { stock: { decrement: item.quantity } } } },
        });
      }
      if (coupon) await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
    }

    const created = await tx.order.create({
      data: {
        orderId,
        customerId: req.user!.id,
        customerName: user.name,
        phone: data.address.phone,
        email: user.email,
        address: JSON.stringify(data.address),
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: totals.deliveryFee,
        tax: totals.tax,
        total: totals.total,
        couponCode: coupon?.code,
        paymentMethod: data.paymentMethod,
        paymentStatus: paid,
        orderStatus: 'Pending',
        estimatedDeliveryTime: new Date(Date.now() + settings.estimatedDeliveryMins * 60 * 1000),
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            name: item.product.name,
            image: firstImage(item.product.images),
            unit: item.product.unit,
            quantity: item.quantity,
            price: item.product.sellingPrice,
            total: toNumber(item.product.sellingPrice) * item.quantity,
          })),
        },
        payment: { create: { method: data.paymentMethod, status: paid, amount: totals.total } },
      },
      include: { items: true, payment: true },
    });
    if (reserveNow) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return created;
  });

  res.status(201).json({ order });
}));

router.get('/', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orders = await prisma.order.findMany({ where: { customerId: req.user!.id }, include: { items: true, payment: true }, orderBy: { createdAt: 'desc' } });
  res.json({ orders });
}));

router.get('/admin/all', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const orders = await prisma.order.findMany({ include: { items: true, payment: true, customer: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({ orders });
}));

router.get('/:orderId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orderId = String(req.params.orderId);
  const order = await prisma.order.findFirst({ where: { orderId, OR: [{ customerId: req.user!.id }, ...(req.user!.role === 'ADMIN' ? [{}] : [])] }, include: { items: true, payment: true } });
  if (!order) throw new ApiError(404, 'Order not found');
  res.json({ order });
}));

router.get('/:orderId/track', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orderId = String(req.params.orderId);
  const order = await prisma.order.findFirst({ where: { orderId, OR: [{ customerId: req.user!.id }, ...(req.user!.role === 'ADMIN' ? [{}] : [])] } });
  if (!order) throw new ApiError(404, 'Order not found');
  res.json({ orderId: order.orderId, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, estimatedDeliveryTime: order.estimatedDeliveryTime });
}));

router.post('/:orderId/reorder', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orderId = String(req.params.orderId);
  const order = await prisma.order.findFirstOrThrow({ where: { orderId, customerId: req.user!.id }, include: { items: true } });
  const cart = await prisma.cart.upsert({ where: { userId: req.user!.id }, update: {}, create: { userId: req.user!.id } });
  for (const item of order.items) {
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
      update: { quantity: { increment: item.quantity } },
      create: { cartId: cart.id, productId: item.productId, quantity: item.quantity },
    });
  }
  res.status(201).json({ message: 'Items added to cart' });
}));

router.post('/:orderId/cancel', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orderId = String(req.params.orderId);
  const order = await prisma.order.findFirst({ where: { orderId, customerId: req.user!.id }, include: { items: true, payment: true } });
  if (!order) throw new ApiError(404, 'Order not found');
  if (['Out for Delivery', 'OutForDelivery', 'Delivered', 'Cancelled'].includes(order.orderStatus)) {
    throw new ApiError(400, 'Order cannot be cancelled after dispatch');
  }

  const stockWasReserved = order.paymentMethod === 'COD' || order.paymentStatus === 'Paid';
  await prisma.$transaction(async (tx) => {
    if (stockWasReserved) {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }, inventory: { update: { stock: { increment: item.quantity } } } },
        });
      }
    }
    await tx.order.delete({
      where: { orderId },
    });
  });
  await prisma.notification.create({
    data: {
      userId: order.customerId,
      title: 'Order cancelled',
      message: `Your order ${order.orderId} was cancelled and removed from order history.`,
    },
  });

  res.json({ deleted: true, orderId: order.orderId, message: 'Order cancelled and removed from order history' });
}));

router.post('/:orderId/refund', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const orderId = String(req.params.orderId);
  const order = await prisma.order.findFirst({ where: { orderId, customerId: req.user!.id }, include: { items: true, payment: true } });
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.orderStatus !== 'Delivered') throw new ApiError(400, 'Refund can be requested only after delivery');
  if (order.paymentStatus === 'Refunded') throw new ApiError(400, 'This order is already refunded');
  const deliveredAt = order.updatedAt || order.createdAt;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - deliveredAt.getTime() > sevenDays) throw new ApiError(400, 'Refund window has expired after 7 days of delivery');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: 'Refunded' } });
    return tx.order.update({ where: { orderId }, data: { paymentStatus: 'Refunded' }, include: { items: true, payment: true } });
  });
  await prisma.notification.create({
    data: {
      userId: order.customerId,
      title: 'Refund approved',
      message: `Refund for order ${order.orderId} was approved.`,
    },
  });

  res.json({ order: updated, message: 'Refund request approved' });
}));

router.patch('/:orderId/status', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId);
  const { orderStatus } = z.object({ orderStatus: z.enum(['Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'OutForDelivery', 'Delivered', 'Cancelled']) }).parse(req.body);
  const normalizedStatus = orderStatus === 'OutForDelivery' ? 'Out for Delivery' : orderStatus;
  const order = await prisma.order.update({ where: { orderId }, data: { orderStatus: normalizedStatus }, include: { items: true } });
  await prisma.notification.create({ data: { userId: order.customerId, title: 'Order update', message: `Your order ${order.orderId} is now ${normalizedStatus}` } });
  res.json({ order });
}));

export default router;
