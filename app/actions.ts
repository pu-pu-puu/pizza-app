'use server';

import { prisma } from '@/prisma/prisma-client';
import { VerificationUserTemplate } from '@/components/shared/email-temapltes/verification-user';
import { CheckoutFormValues } from '@/constants';
import { createPayment, getPayment, sendEmail } from '@/lib';
import { OrderStatus, Prisma } from '@prisma/client';
import { hashSync } from 'bcrypt';
import { cookies, headers } from 'next/headers';
import { PayOrderTemplate } from '@/components/shared';
import { getUserSession } from '@/lib/get-user-session';

const PENDING_PAYMENT_LOOKBACK_HOURS = 24;

async function syncOrderPaymentStatus(orderId: number, paymentId: string) {
  const paymentData = await getPayment(paymentId);
  const paymentUrl = paymentData.confirmation?.confirmation_url;

  if (paymentData.status === 'succeeded') {
    await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: OrderStatus.SUCCEEDED,
      },
    });
  }

  if (paymentData.status === 'canceled') {
    await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });
  }

  return {
    status: paymentData.status,
    paymentUrl,
  };
}

function getRequestOrigin() {
  const requestHeaders = headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');

  if (host) {
    const protocol =
      requestHeaders.get('x-forwarded-proto') ??
      (host.startsWith('localhost') ? 'http' : 'https');

    return `${protocol}://${host}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  }

  throw new Error('App origin not found');
}

function getPaymentReturnUrl(orderId: number) {
  return `${getRequestOrigin()}/checkout/payment-pending?orderId=${orderId}`;
}

export async function createOrder(data: CheckoutFormValues) {
  try {
    const cookieStore = cookies();
    const cartToken = cookieStore.get('cartToken')?.value;

    if (!cartToken) {
      throw new Error('Cart token not found');
    }

    /* Требуем подтверждённый телефон у текущего юзера */
    const sessionUser = await getUserSession();
    if (!sessionUser) {
      throw new Error('Не авторизован');
    }
    const fullUser = await prisma.user.findUnique({
      where: { id: Number(sessionUser.id) },
    });
    if (!fullUser?.phoneVerified) {
      throw new Error('Телефон не подтверждён');
    }

    /* Находим корзину по токену */
    const userCart = await prisma.cart.findFirst({
      include: {
        user: true,
        items: {
          include: {
            ingredients: true,
            productItem: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      where: {
        token: cartToken,
      },
    });

    /* Если корзина не найдена возращаем ошибку */
    if (!userCart) {
      throw new Error('Cart not found');
    }

    /* Если корзина пустая возращаем ошибку */
    if (userCart.items.length === 0 || userCart.totalAmount <= 0) {
      throw new Error('Cart is empty');
    }

    const pendingOrder = await prisma.order.findFirst({
      where: {
        userId: fullUser.id,
        status: OrderStatus.PENDING,
        paymentId: {
          not: null,
        },
        createdAt: {
          gte: new Date(
            Date.now() - PENDING_PAYMENT_LOOKBACK_HOURS * 60 * 60 * 1000
          ),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (pendingOrder?.paymentId) {
      const paymentStatus = await syncOrderPaymentStatus(
        pendingOrder.id,
        pendingOrder.paymentId
      );

      if (paymentStatus.status === 'pending' && paymentStatus.paymentUrl) {
        return {
          orderId: pendingOrder.id,
          paymentUrl: paymentStatus.paymentUrl,
          recovered: true,
        };
      }
    }

    const order = await prisma.order.create({
      data: {
        token: cartToken,
        userId: fullUser.id,
        fullName: data.firstName + ' ' + data.lastName,
        email: data.email,
        phone: fullUser.phone ?? data.phone,
        address: data.address,
        comment: data.comment,
        totalAmount: userCart.totalAmount,
        status: OrderStatus.PENDING,
        items: JSON.stringify(userCart.items),
      },
    });

    const paymentData = await createPayment({
      amount: order.totalAmount,
      idempotenceKey: `order-${order.id}`,
      orderId: order.id,
      description: 'Оплата заказа #' + order.id,
      returnUrl: getPaymentReturnUrl(order.id),
    });

    if (!paymentData) {
      throw new Error('Payment data not found');
    }

    await prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        paymentId: paymentData.id,
      },
    });

    /* Очищаем корзину */
    await prisma.cart.update({
      where: {
        id: userCart.id,
      },
      data: {
        totalAmount: 0,
      },
    });

    await prisma.cartItem.deleteMany({
      where: {
        cartId: userCart.id,
      },
    });

    const paymentUrl = paymentData.confirmation.confirmation_url;

    // The receipt email is a nice-to-have, not a payment-blocker. If Resend
    // refuses the send (e.g. free `onboarding@resend.dev` from-address can
    // only deliver to the API-key owner's own inbox, or the configured
    // domain is not yet verified) we still want the user to reach YooKassa.
    try {
      await sendEmail(
        data.email,
        'Next Pizza / Оплатите заказ #' + order.id,
        PayOrderTemplate({
          orderId: order.id,
          totalAmount: order.totalAmount,
          paymentUrl,
        })
      );
    } catch (emailErr) {
      console.log('[CreateOrder] sendEmail failed (non-fatal)', emailErr);
    }

    return {
      orderId: order.id,
      paymentUrl,
      recovered: false,
    };
  } catch (err) {
    console.log('[CreateOrder] Server error', err);
    throw err;
  }
}

export async function getPendingPaymentOrder(orderId?: number) {
  try {
    const sessionUser = await getUserSession();

    if (!sessionUser) {
      throw new Error('Не авторизован');
    }

    const where: Prisma.OrderWhereInput = {
      userId: Number(sessionUser.id),
      status: OrderStatus.PENDING,
      paymentId: {
        not: null,
      },
    };

    if (orderId) {
      where.id = orderId;
    }

    const order = await prisma.order.findFirst({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!order?.paymentId) {
      return null;
    }

    const paymentStatus = await syncOrderPaymentStatus(
      order.id,
      order.paymentId
    );

    if (paymentStatus.status !== 'pending' || !paymentStatus.paymentUrl) {
      return null;
    }

    return {
      id: order.id,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      paymentUrl: paymentStatus.paymentUrl,
    };
  } catch (err) {
    console.log('[GetPendingPaymentOrder] Server error', err);
    return null;
  }
}

export async function updateUserInfo(body: Prisma.UserUpdateInput) {
  try {
    const currentUser = await getUserSession();

    if (!currentUser) {
      throw new Error('Пользователь не найден');
    }

    const findUser = await prisma.user.findFirst({
      where: {
        id: Number(currentUser.id),
      },
    });

    await prisma.user.update({
      where: {
        id: Number(currentUser.id),
      },
      data: {
        fullName: body.fullName,
        email: body.email,
        password: body.password
          ? hashSync(body.password as string, 10)
          : findUser?.password,
      },
    });
  } catch (err) {
    console.log('Error [UPDATE_USER]', err);
    throw err;
  }
}

export async function registerUser(body: Prisma.UserCreateInput) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        email: body.email,
      },
    });

    if (user) {
      if (!user.verified) {
        throw new Error('Почта не подтверждена');
      }

      throw new Error('Пользователь уже существует');
    }

    const createdUser = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        password: hashSync(body.password, 10),
      },
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.verificationCode.create({
      data: {
        code,
        userId: createdUser.id,
      },
    });

    await sendEmail(
      createdUser.email,
      'Next Pizza / 📝 Подтверждение регистрации',
      VerificationUserTemplate({
        code,
      })
    );
  } catch (err) {
    console.log('Error [CREATE_USER]', err);
    throw err;
  }
}
