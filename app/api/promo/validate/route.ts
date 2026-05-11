import { NextResponse } from 'next/server';
import { z } from 'zod';

import { validatePromo } from '@/lib/calc-promo';
import { getUserSession } from '@/lib/get-user-session';
import { prisma } from '@/prisma/prisma-client';
import { cookies } from 'next/headers';

const bodySchema = z.object({
  code: z.string().min(1, 'Введите промокод'),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Введите промокод' },
        { status: 400 },
      );
    }

    const cartToken = cookies().get('cartToken')?.value;
    if (!cartToken) {
      return NextResponse.json(
        { message: 'Корзина пуста' },
        { status: 400 },
      );
    }

    const cart = await prisma.cart.findFirst({
      where: { token: cartToken },
      select: { id: true, totalAmount: true },
    });

    if (!cart || cart.totalAmount <= 0) {
      return NextResponse.json(
        { message: 'Корзина пуста' },
        { status: 400 },
      );
    }

    const session = await getUserSession();

    const result = await validatePromo(parsed.data.code, {
      subtotal: cart.totalAmount,
      userId: session ? Number(session.id) : null,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      code: result.promo.code,
      kind: result.promo.kind,
      description: result.promo.description,
      appliedAmount: result.appliedAmount,
      freeDelivery: result.freeDelivery,
      subtotal: cart.totalAmount,
    });
  } catch (err) {
    console.log('[PROMO_VALIDATE]', err);
    return NextResponse.json(
      { message: 'Не удалось проверить промокод' },
      { status: 500 },
    );
  }
}
