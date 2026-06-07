import type { Coupon, StoreSettings } from '@prisma/client';

export const toNumber = (value: unknown) => Number(value);

export function calculateCouponDiscount(coupon: Coupon | null, subtotal: number, deliveryFee: number, isFirstOrder: boolean) {
  if (!coupon || !coupon.isActive) return { discount: 0, deliveryDiscount: 0 };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { discount: 0, deliveryDiscount: 0 };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { discount: 0, deliveryDiscount: 0 };
  if (coupon.firstOrderOnly && !isFirstOrder) return { discount: 0, deliveryDiscount: 0 };
  if (subtotal < toNumber(coupon.minOrderValue)) return { discount: 0, deliveryDiscount: 0 };

  if (coupon.type === 'FREE_DELIVERY') return { discount: 0, deliveryDiscount: deliveryFee };

  const raw = coupon.type === 'PERCENTAGE' ? subtotal * (toNumber(coupon.value) / 100) : toNumber(coupon.value);
  const discount = coupon.maxDiscount ? Math.min(raw, toNumber(coupon.maxDiscount)) : raw;
  return { discount: Math.min(discount, subtotal), deliveryDiscount: 0 };
}

export function calculateTotals(subtotal: number, settings: StoreSettings, coupon: Coupon | null, isFirstOrder: boolean) {
  const configuredDelivery = subtotal >= toNumber(settings.freeDeliveryAbove) ? 0 : toNumber(settings.deliveryFee);
  const couponResult = calculateCouponDiscount(coupon, subtotal, configuredDelivery, isFirstOrder);
  const deliveryFee = Math.max(0, configuredDelivery - couponResult.deliveryDiscount);
  const discount = couponResult.discount;
  const tax = Math.round((subtotal - discount) * (toNumber(settings.taxPercent) / 100));
  const total = Math.max(0, subtotal - discount + deliveryFee + tax);
  return { subtotal, discount, deliveryFee, tax, total };
}
