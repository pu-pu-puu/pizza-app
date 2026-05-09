import { PaymentCallbackData } from '@/@types/yookassa';
import { prisma } from '@/prisma/prisma-client';
import { OrderSuccessTemplate } from '@/components/shared/email-temapltes/order-success';
import { applyPaymentStatus, getPayment, sendEmail } from '@/lib';
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

const parseAmount = (value: string) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
};

export async function POST(req: NextRequest) {
  try {
    const payload: unknown = await req.json();

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
    console.log('[Checkout Callback] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
