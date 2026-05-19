import { PaymentCallbackData, RefundCallbackData } from '@/@types/yookassa';
import { prisma } from '@/prisma/prisma-client';
import { OrderSuccessTemplate } from '@/components/shared/email-temapltes/order-success';
import {
  applyPaymentStatus,
  applyRefundFromCallback,
  getPayment,
  sendEmail,
} from '@/lib';
import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import { CartItemDTO } from '@/services/dto/cart.dto';
import { OrderStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const EVENT_STATUS_MAP = {
  'payment.succeeded': OrderStatus.SUCCEEDED,
  'payment.canceled': OrderStatus.CANCELLED,
} as const;

const isSupportedPaymentEvent = (
  event: string
): event is keyof typeof EVENT_STATUS_MAP => event in EVENT_STATUS_MAP;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPaymentCallbackData = (
  payload: unknown
): payload is PaymentCallbackData => {
  if (!isRecord(payload) || !isRecord(payload.object)) {
    return false;
  }

  const { object } = payload;

  return (
    typeof payload.type === 'string' &&
    typeof payload.event === 'string' &&
    typeof object.id === 'string' &&
    typeof object.status === 'string' &&
    isRecord(object.amount) &&
    typeof object.amount.value === 'string' &&
    typeof object.amount.currency === 'string' &&
    isRecord(object.metadata) &&
    typeof object.metadata.order_id === 'string'
  );
};

const isRefundCallbackData = (
  payload: unknown
): payload is RefundCallbackData => {
  if (!isRecord(payload) || !isRecord(payload.object)) {
    return false;
  }

  const { object } = payload;

  return (
    typeof payload.type === 'string' &&
    typeof payload.event === 'string' &&
    typeof object.id === 'string' &&
    typeof object.status === 'string' &&
    typeof object.payment_id === 'string' &&
    isRecord(object.amount) &&
    typeof object.amount.value === 'string' &&
    typeof object.amount.currency === 'string'
  );
};

const parseAmount = (value: string) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
};

// YooKassa documents two terminal refund events; both go through the same
// idempotent upsert flow in applyRefundFromCallback. We map them by the
// event name here rather than the inner object.status so a stray pending
// status on a 'refund.succeeded' notification (which YooKassa promises
// never to send, but still) doesn't slip into the SUCCEEDED branch.
const SUPPORTED_REFUND_EVENTS = {
  'refund.succeeded': 'succeeded',
  'refund.canceled': 'canceled',
} as const;

const isSupportedRefundEvent = (
  event: string,
): event is keyof typeof SUPPORTED_REFUND_EVENTS => event in SUPPORTED_REFUND_EVENTS;

const handleRefundCallback = async (payload: RefundCallbackData) => {
  const refund = payload.object;

  if (!isSupportedRefundEvent(payload.event)) {
    return NextResponse.json(
      { error: 'Unsupported refund event' },
      { status: 400 }
    );
  }

  const expectedStatus = SUPPORTED_REFUND_EVENTS[payload.event];
  if (refund.status !== expectedStatus) {
    return NextResponse.json(
      { error: 'Unsupported refund status' },
      { status: 400 }
    );
  }

  const order = await prisma.order.findFirst({
    where: { paymentId: refund.payment_id },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const amountMinor = parseAmount(refund.amount.value);
  if (amountMinor === null) {
    return NextResponse.json(
      { error: 'Invalid refund amount' },
      { status: 400 }
    );
  }
  const amountRubles = Math.round(amountMinor / 100);

  await applyRefundFromCallback({
    orderId: order.id,
    totalAmount: order.totalAmount,
    previousFulfillmentStatus: order.fulfillmentStatus,
    refundId: refund.id,
    paymentId: refund.payment_id,
    amount: amountRubles,
    rawStatus: refund.status,
    source: 'yookassa_callback',
  });

  return NextResponse.json({ ok: true });
};

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const payload: unknown = await req.json();

      if (
        isRecord(payload) &&
        payload.type === 'notification' &&
        typeof payload.event === 'string' &&
        payload.event.startsWith('refund.')
      ) {
        if (!isRefundCallbackData(payload)) {
          return NextResponse.json(
            { error: 'Invalid refund notification' },
            { status: 400 }
          );
        }
        return await handleRefundCallback(payload);
      }

      if (!isPaymentCallbackData(payload)) {
        return NextResponse.json(
          { error: 'Invalid payment notification' },
          { status: 400 }
        );
      }

      const body = payload;
      const paymentObject = body.object;

      if (
        body.type !== 'notification' ||
        !isSupportedPaymentEvent(body.event) ||
        paymentObject.status !== body.event.replace('payment.', '')
      ) {
        return NextResponse.json(
          { error: 'Unsupported payment notification' },
          { status: 400 }
        );
      }

      const orderId = Number(paymentObject.metadata.order_id);

      if (!Number.isInteger(orderId)) {
        return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
      }

      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
        },
      });

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (order.paymentId !== paymentObject.id) {
        return NextResponse.json({ error: 'Payment mismatch' }, { status: 400 });
      }

      const amount = parseAmount(paymentObject.amount.value);

      if (
        paymentObject.amount.currency !== 'RUB' ||
        amount === null ||
        amount !== order.totalAmount * 100
      ) {
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
      }

      const paymentData = await getPayment(paymentObject.id);
      const verifiedAmount = parseAmount(paymentData.amount.value);

      if (
        paymentData.id !== paymentObject.id ||
        paymentData.status !== paymentObject.status ||
        Number(paymentData.metadata.order_id) !== order.id ||
        paymentData.amount.currency !== 'RUB' ||
        verifiedAmount === null ||
        verifiedAmount !== order.totalAmount * 100
      ) {
        return NextResponse.json(
          { error: 'Payment status mismatch' },
          { status: 400 }
        );
      }

      const nextStatus = EVENT_STATUS_MAP[body.event];
      const shouldSendSuccessEmail =
        nextStatus === OrderStatus.SUCCEEDED &&
        order.status !== OrderStatus.SUCCEEDED;

      await applyPaymentStatus({
        orderId: order.id,
        previousStatus: order.status,
        previousFulfillmentStatus: order.fulfillmentStatus,
        nextStatus,
        paymentId: order.paymentId,
        source: 'yookassa_callback',
      });

      const items = JSON.parse(order?.items as string) as CartItemDTO[];

      if (shouldSendSuccessEmail) {
        await sendEmail(
          order.email,
          'Next Pizza / Ваш заказ успешно оформлен 🎉',
          OrderSuccessTemplate({ orderId: order.id, items })
        );
      } else {
        // Письмо о неуспешной оплате
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error('checkout_callback_failed', error);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  });
}
