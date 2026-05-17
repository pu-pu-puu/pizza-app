import { PromoKind } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/promo/validate/route';
import { validatePromo } from '@/lib/calc-promo';
import { prisma } from '@/prisma/prisma-client';
import { cookieStore } from '../../setup';
import { buildJsonRequest } from '../../helpers/request';
import { mockSession } from '../../helpers/session';

const URL = 'http://localhost/api/promo/validate';

const setCartCookie = (value: string | undefined) => {
  vi.mocked(cookieStore.get).mockReturnValue(
    value === undefined ? undefined : ({ value } as unknown as { value: string }),
  );
};

describe('POST /api/promo/validate', () => {
  it('returns 400 when the body fails zod validation (empty code)', async () => {
    setCartCookie('tok-abc');
    mockSession(null);

    const res = await POST(buildJsonRequest('POST', URL, { code: '' }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Введите промокод/);
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when there is no cartToken cookie', async () => {
    setCartCookie(undefined);
    mockSession(null);

    const res = await POST(buildJsonRequest('POST', URL, { code: 'PIZZA10' }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Корзина пуста/);
    expect(validatePromo).not.toHaveBeenCalled();
  });

  it('returns 400 when the cart is empty (totalAmount === 0)', async () => {
    setCartCookie('tok-abc');
    mockSession(null);
    vi.mocked(prisma.cart.findFirst).mockResolvedValue({
      id: 1,
      totalAmount: 0,
    } as unknown as Awaited<ReturnType<typeof prisma.cart.findFirst>>);

    const res = await POST(buildJsonRequest('POST', URL, { code: 'PIZZA10' }));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Корзина пуста/);
    expect(validatePromo).not.toHaveBeenCalled();
  });

  it('propagates the error status from validatePromo when the promo is invalid', async () => {
    setCartCookie('tok-abc');
    mockSession(null);
    vi.mocked(prisma.cart.findFirst).mockResolvedValue({
      id: 1,
      totalAmount: 1500,
    } as unknown as Awaited<ReturnType<typeof prisma.cart.findFirst>>);
    vi.mocked(validatePromo).mockResolvedValue({
      ok: false,
      status: 404,
      message: 'Промокод не найден',
    });

    const res = await POST(buildJsonRequest('POST', URL, { code: 'GHOST' }));

    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Промокод не найден');
    // Guest user — userId must be passed as null to the promo validator.
    expect(validatePromo).toHaveBeenCalledWith('GHOST', {
      subtotal: 1500,
      userId: null,
    });
  });

  it('returns the applied discount when the promo is valid for the cart', async () => {
    setCartCookie('tok-abc');
    mockSession({ id: 9, role: 'USER' });
    vi.mocked(prisma.cart.findFirst).mockResolvedValue({
      id: 1,
      totalAmount: 1500,
    } as unknown as Awaited<ReturnType<typeof prisma.cart.findFirst>>);
    vi.mocked(validatePromo).mockResolvedValue({
      ok: true,
      promo: {
        id: 1,
        code: 'PIZZA10',
        kind: PromoKind.PERCENT,
        description: '−10% на заказ',
      } as unknown as Parameters<typeof validatePromo>[0] extends unknown
        ? Awaited<ReturnType<typeof validatePromo>>
        : never extends infer T
          ? T
          : never,
      appliedAmount: 150,
      freeDelivery: false,
    } as Awaited<ReturnType<typeof validatePromo>>);

    const res = await POST(buildJsonRequest('POST', URL, { code: 'PIZZA10' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: 'PIZZA10',
      kind: PromoKind.PERCENT,
      description: '−10% на заказ',
      appliedAmount: 150,
      freeDelivery: false,
      subtotal: 1500,
    });
    // Authenticated user — userId is forwarded from the session.
    expect(validatePromo).toHaveBeenCalledWith('PIZZA10', {
      subtotal: 1500,
      userId: 9,
    });
  });
});
