'use server';

import { prisma } from '@/prisma/prisma-client';
import { VerificationUserTemplate } from '@/components/shared/email-temapltes/verification-user';
import { CheckoutFormValues } from '@/constants';
import { applyPaymentStatus, createPayment, getPayment, sendEmail } from '@/lib';
import { validatePromo } from '@/lib/calc-promo';
import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import { OrderStatus, Prisma } from '@prisma/client';
import { hashSync } from 'bcrypt';
import { cookies, headers } from 'next/headers';
import { PayOrderTemplate } from '@/components/shared';
import { getUserSession } from '@/lib/get-user-session';

function withRequestContext<T>(handler: () => Promise<T>): Promise<T> {
  return runWithRequestContext({ headers: headers() }, handler);
}

const PENDING_PAYMENT_LOOKBACK_HOURS = 24;

async function syncOrderPaymentStatus(orderId: number, paymentId: string) {
  const paymentData = await getPayment(paymentId);
  const paymentUrl = paymentData.confirmation?.confirmation_url;
  let orderStatus: OrderStatus | null = null;

  const nextStatus =
    paymentData.status === 'succeeded'
      ? OrderStatus.SUCCEEDED
      : paymentData.status === 'canceled'
      ? OrderStatus.CANCELLED
      : null;

  if (nextStatus) {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, fulfillmentStatus: true, paymentId: true },
    });

    if (existing) {
      await applyPaymentStatus({
        orderId,
        previousStatus: existing.status,
        previousFulfillmentStatus: existing.fulfillmentStatus,
        nextStatus,
        paymentId: existing.paymentId ?? paymentId,
        source: 'sync_pending_payment',
      });
      orderStatus = nextStatus;
    }
  }

  return {
    status: paymentData.status,
    orderStatus,
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
  return withRequestContext(async () => {
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
      if (fullUser.blacklisted) {
        throw new Error(
          'Заказ не может быть оформлен. Свяжитесь с поддержкой.',
        );
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

      /* Применяем промокод, если указан */
      let appliedPromoId: number | null = null;
      let appliedPromoCode: string | null = null;
      let appliedDiscount = 0;
      let appliedFreeDelivery = false;

      if (data.promoCode && data.promoCode.trim()) {
        const promoResult = await validatePromo(data.promoCode, {
          subtotal: userCart.totalAmount,
          userId: fullUser.id,
        });
        if (!promoResult.ok) {
          throw new Error(promoResult.message);
        }
        appliedPromoId = promoResult.promo.id;
        appliedPromoCode = promoResult.promo.code;
        appliedDiscount = promoResult.appliedAmount;
        appliedFreeDelivery = promoResult.freeDelivery;
      }

      // Existing flow stores cart subtotal as `order.totalAmount` (delivery
      // and VAT are display-only fields in the checkout sidebar). Apply the
      // promo discount to that same subtotal so YooKassa charge stays
      // consistent with what's shown to the user as "со скидкой". For
      // FREE_DELIVERY the saving is on the (display-only) delivery line, so
      // the subtotal stays unchanged.
      const subtotalCut = appliedFreeDelivery ? 0 : appliedDiscount;
      const orderTotal = Math.max(0, userCart.totalAmount - subtotalCut);

      const order = await prisma.order.create({
        data: {
          token: cartToken,
          userId: fullUser.id,
          fullName: data.firstName + ' ' + data.lastName,
          email: data.email,
          phone: fullUser.phone ?? data.phone,
          address: data.address,
          comment: data.comment,
          totalAmount: orderTotal,
          discountAmount: appliedDiscount,
          promoId: appliedPromoId,
          promoCode: appliedPromoCode,
          status: OrderStatus.PENDING,
          items: JSON.stringify(userCart.items),
        },
      });

      if (appliedPromoId && appliedPromoCode) {
        try {
          await prisma.promoRedemption.create({
            data: {
              promoId: appliedPromoId,
              orderId: order.id,
              userId: fullUser.id,
              appliedAmount: appliedDiscount,
              code: appliedPromoCode,
            },
          });
        } catch (redemptionErr) {
          logger.error('create_order_promo_redemption_failed', redemptionErr);
        }
      }

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
        logger.warn('create_order_send_email_failed', { err: emailErr });
      }

      return {
        orderId: order.id,
        paymentUrl,
        recovered: false,
      };
    } catch (err) {
      logger.error('create_order_failed', err);
      throw err;
    }
  });
}

export async function getPendingPaymentOrder(orderId?: number) {
  return withRequestContext(async () => {
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
      logger.error('get_pending_payment_order_failed', err);
      return null;
    }
  });
}

export async function getPaymentOrderResult(orderId: number) {
  return withRequestContext(async () => {
    try {
      const sessionUser = await getUserSession();

      if (!sessionUser) {
        throw new Error('Не авторизован');
      }

      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: Number(sessionUser.id),
        },
      });

      if (!order) {
        return null;
      }

      if (order.status === OrderStatus.PENDING && order.paymentId) {
        const paymentStatus = await syncOrderPaymentStatus(
          order.id,
          order.paymentId
        );

        if (paymentStatus.orderStatus) {
          return {
            id: order.id,
            totalAmount: order.totalAmount,
            status: paymentStatus.orderStatus,
          };
        }
      }

      return {
        id: order.id,
        totalAmount: order.totalAmount,
        status: order.status,
      };
    } catch (err) {
      logger.error('get_payment_order_result_failed', err);
      return null;
    }
  });
}

export async function updateUserInfo(body: Prisma.UserUpdateInput) {
  return withRequestContext(async () => {
    try {
      const currentUser = await getUserSession();

      if (!currentUser) {
        throw new Error('Пользователь не найден');
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
      logger.error('update_user_failed', err);
      throw err;
    }
  });
}

export async function registerUser(body: Prisma.UserCreateInput) {
  return withRequestContext(async () => {
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
          origin: getRequestOrigin(),
        })
      );
    } catch (err) {
      logger.error('register_user_failed', err);
      throw err;
    }
  });
}
