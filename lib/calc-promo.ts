import { Promo, PromoKind } from '@prisma/client';

import { prisma } from '@/prisma/prisma-client';

export const DELIVERY_PRICE = 250;

export type PromoValidationContext = {
  subtotal: number;
  userId: number | null;
};

export type PromoValidationOk = {
  ok: true;
  promo: Promo;
  appliedAmount: number;
  freeDelivery: boolean;
};

export type PromoValidationError = {
  ok: false;
  status: number;
  message: string;
};

export type PromoValidationResult = PromoValidationOk | PromoValidationError;

const computeDiscount = (
  promo: Promo,
  subtotal: number,
): { appliedAmount: number; freeDelivery: boolean } => {
  switch (promo.kind) {
    case PromoKind.PERCENT: {
      const raw = Math.floor((subtotal * promo.valueOff) / 100);
      const capped = promo.maxDiscount !== null ? Math.min(raw, promo.maxDiscount) : raw;
      return { appliedAmount: Math.max(0, Math.min(capped, subtotal)), freeDelivery: false };
    }
    case PromoKind.FIXED: {
      return {
        appliedAmount: Math.max(0, Math.min(promo.valueOff, subtotal)),
        freeDelivery: false,
      };
    }
    case PromoKind.FREE_DELIVERY: {
      return { appliedAmount: DELIVERY_PRICE, freeDelivery: true };
    }
    default: {
      return { appliedAmount: 0, freeDelivery: false };
    }
  }
};

export const normalizePromoCode = (raw: string) => raw.trim().toUpperCase();

export const validatePromo = async (
  rawCode: string,
  context: PromoValidationContext,
): Promise<PromoValidationResult> => {
  const code = normalizePromoCode(rawCode);
  if (!code) {
    return { ok: false, status: 400, message: 'Введите промокод' };
  }

  const promo = await prisma.promo.findUnique({ where: { code } });
  if (!promo) {
    return { ok: false, status: 404, message: 'Промокод не найден' };
  }

  if (!promo.active) {
    return { ok: false, status: 400, message: 'Промокод неактивен' };
  }

  const now = new Date();
  if (promo.validFrom && promo.validFrom.getTime() > now.getTime()) {
    return { ok: false, status: 400, message: 'Промокод ещё не начал действовать' };
  }
  if (promo.validUntil && promo.validUntil.getTime() < now.getTime()) {
    return { ok: false, status: 400, message: 'Срок действия промокода истёк' };
  }

  if (promo.minOrderAmount !== null && context.subtotal < promo.minOrderAmount) {
    return {
      ok: false,
      status: 400,
      message: `Минимальная сумма заказа для промокода — ${promo.minOrderAmount} ₽`,
    };
  }

  if (promo.usageLimit !== null) {
    const total = await prisma.promoRedemption.count({ where: { promoId: promo.id } });
    if (total >= promo.usageLimit) {
      return { ok: false, status: 400, message: 'Промокод исчерпан' };
    }
  }

  if (promo.perUserLimit !== null && context.userId !== null) {
    const used = await prisma.promoRedemption.count({
      where: { promoId: promo.id, userId: context.userId },
    });
    if (used >= promo.perUserLimit) {
      return {
        ok: false,
        status: 400,
        message: 'Вы уже использовали этот промокод максимальное количество раз',
      };
    }
  }

  const { appliedAmount, freeDelivery } = computeDiscount(promo, context.subtotal);

  if (appliedAmount <= 0 && !freeDelivery) {
    return { ok: false, status: 400, message: 'Промокод не применим к этой корзине' };
  }

  return { ok: true, promo, appliedAmount, freeDelivery };
};
