import { prisma } from '@/prisma/prisma-client';
import { calcCartItemTotalPrice } from './calc-cart-item-total-price';

const cartWithItems = {
  items: {
    orderBy: {
      createdAt: 'desc' as const,
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
};

export const updateCartTotalAmount = async (token: string) => {
  const userCart = await prisma.cart.findFirst({
    where: {
      token,
    },
    include: cartWithItems,
  });

  if (!userCart) {
    return;
  }

  const totalAmount = userCart.items.reduce((acc, item) => {
    return acc + calcCartItemTotalPrice(item);
  }, 0);

  // Split the update + relation reload: the Neon HTTP driver adapter does
  // not support the implicit transaction that Prisma uses when an `update`
  // is combined with `include`.
  await prisma.cart.update({
    where: {
      id: userCart.id,
    },
    data: {
      totalAmount,
    },
  });

  return await prisma.cart.findFirst({
    where: {
      id: userCart.id,
    },
    include: cartWithItems,
  });
};
