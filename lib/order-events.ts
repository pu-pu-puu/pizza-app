import {
  OrderEventKind,
  OrderFulfillmentStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '@/prisma/prisma-client';

type ApplyPaymentStatusInput = {
  orderId: number;
  previousStatus: OrderStatus;
  previousFulfillmentStatus: OrderFulfillmentStatus;
  nextStatus: OrderStatus;
  paymentId: string | null;
  source?: string;
};

const FULFILLMENT_BUMP_BY_PAYMENT: Partial<
  Record<OrderStatus, OrderFulfillmentStatus>
> = {
  [OrderStatus.SUCCEEDED]: OrderFulfillmentStatus.CONFIRMED,
  [OrderStatus.CANCELLED]: OrderFulfillmentStatus.CANCELLED,
};

/**
 * Updates the order's payment status and writes a corresponding OrderEvent
 * audit record. When the payment transitions to SUCCEEDED and fulfillment
 * is still NEW, the order is automatically promoted to CONFIRMED so the
 * admin operator queue picks it up.
 *
 * Returns true if the database row was actually changed.
 */
export const applyPaymentStatus = async ({
  orderId,
  previousStatus,
  previousFulfillmentStatus,
  nextStatus,
  paymentId,
  source = 'yookassa',
}: ApplyPaymentStatusInput): Promise<boolean> => {
  if (previousStatus === nextStatus) {
    return false;
  }

  const data: Prisma.OrderUpdateInput = { status: nextStatus };

  let nextFulfillment: OrderFulfillmentStatus | null = null;
  const fulfillmentTarget = FULFILLMENT_BUMP_BY_PAYMENT[nextStatus];

  if (
    fulfillmentTarget &&
    previousFulfillmentStatus === OrderFulfillmentStatus.NEW
  ) {
    nextFulfillment = fulfillmentTarget;
    data.fulfillmentStatus = fulfillmentTarget;
  }

  await prisma.order.update({
    where: { id: orderId },
    data,
  });

  await prisma.orderEvent.create({
    data: {
      orderId,
      kind: OrderEventKind.PAYMENT_STATUS_CHANGED,
      payload: {
        from: previousStatus,
        to: nextStatus,
        paymentId,
        source,
      },
    },
  });

  if (nextFulfillment) {
    await prisma.orderEvent.create({
      data: {
        orderId,
        kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
        payload: {
          from: previousFulfillmentStatus,
          to: nextFulfillment,
          source,
          reason: 'auto_on_payment',
        },
      },
    });
  }

  return true;
};
