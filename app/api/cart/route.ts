import { prisma } from '@/prisma/prisma-client';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { findOrCreateCart } from '@/lib/find-or-create-cart';
import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import { CreateCartItemValues } from '@/services/dto/cart.dto';
import { updateCartTotalAmount } from '@/lib/update-cart-total-amount';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const token = req.cookies.get('cartToken')?.value;

      if (!token) {
        return NextResponse.json({ totalAmount: 0, items: [] });
      }

      const userCart = await prisma.cart.findFirst({
        where: {
          OR: [
            {
              token,
            },
          ],
        },
        include: {
          items: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              productItem: {
                include: {
                  product: true,
                },
              },
              ingredients: true,
            },
          },
        },
      });

      return NextResponse.json(userCart);
    } catch (error) {
      logger.error('cart_get_failed', error);
      return NextResponse.json(
        { message: 'Не удалось получить корзину' },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      let token = req.cookies.get('cartToken')?.value;

      if (!token) {
        token = crypto.randomUUID();
      }

      const userCart = await findOrCreateCart(token);

      const data = (await req.json()) as CreateCartItemValues;
      const ingredientIds = data.ingredients ?? [];

      const productItem = await prisma.productItem.findUnique({
        where: { id: data.productItemId },
        include: { product: { select: { active: true, stopUntil: true, name: true } } },
      });

      if (!productItem) {
        return NextResponse.json(
          { message: 'Товар не найден' },
          { status: 404 }
        );
      }

      if (!productItem.product.active) {
        return NextResponse.json(
          { message: 'Товар недоступен' },
          { status: 409 }
        );
      }

      if (productItem.product.stopUntil && productItem.product.stopUntil > new Date()) {
        return NextResponse.json(
          { message: 'Товар временно недоступен' },
          { status: 409 }
        );
      }

      const findCartItem = await prisma.cartItem.findFirst({
        where: {
          cartId: userCart.id,
          productItemId: data.productItemId,
          ingredients: {
            every: {
              id: { in: ingredientIds },
            },
          },
        },
      });

      // Если товар был найден, делаем +1
      if (findCartItem) {
        await prisma.cartItem.update({
          where: {
            id: findCartItem.id,
          },
          data: {
            quantity: findCartItem.quantity + 1,
          },
        });
      } else {
        // Split the create + M2M ingredient connect: the Neon HTTP driver
        // adapter does not support interactive transactions, which Prisma
        // would otherwise wrap around a nested-relation write.
        const created = await prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productItemId: data.productItemId,
            quantity: 1,
          },
        });

        for (const ingredientId of ingredientIds) {
          await prisma.$executeRaw`INSERT INTO "_CartItemToIngredient" ("A", "B") VALUES (${created.id}, ${ingredientId})`;
        }
      }

      const updatedUserCart = await updateCartTotalAmount(token);

      const resp = NextResponse.json(updatedUserCart);
      resp.cookies.set('cartToken', token, {
        sameSite: 'lax',
        path: '/',
      });
      return resp;
    } catch (error) {
      logger.error('cart_post_failed', error);
      return NextResponse.json(
        { message: 'Не удалось создать корзину' },
        { status: 500 }
      );
    }
  });
}
