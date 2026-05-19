import {
  OrderEventKind,
  OrderFulfillmentStatus,
  OrderStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';

import { prisma } from '@/prisma/prisma-client';
import {
  getOrderSucceededOrPendingRefundsTotal,
  mapYookassaRefundStatus,
} from '@/lib/refund-service';

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

type ApplyRefundFromCallbackInput = {
  orderId: number;
  totalAmount: number;
  previousFulfillmentStatus: OrderFulfillmentStatus;
  refundId: string;
  paymentId: string;
  amount: number;
  /** Raw YooKassa status from the webhook payload ('succeeded' | 'canceled' | ...). */
  rawStatus: string;
  source?: string;
};

/**
 * Idempotent refund record update triggered by a YooKassa webhook.
 *
 * Upserts the Refund row by `yookassaRefundId` so re-delivered webhooks
 * never double-write. Only after the row reaches SUCCEEDED do we check
 * the running refund total — the order is only promoted to REFUNDED
 * when the cumulative SUCCEEDED amount is at least the order total.
 *
 * Returns true if anything in the DB changed (refund row written or
 * order row updated).
 */
export const applyRefundFromCallback = async ({
  orderId,
  totalAmount,
  previousFulfillmentStatus,
  refundId,
  paymentId,
  amount,
  rawStatus,
  source = 'yookassa_callback',
}: ApplyRefundFromCallbackInput): Promise<boolean> => {
  const status = mapYookassaRefundStatus(rawStatus);
  const now = new Date();

  const existing = await prisma.refund.findUnique({
    where: { yookassaRefundId: refundId },
    select: { id: true, status: true },
  });

  if (existing && existing.status === status) {
    // Already in the desired terminal state — webhook re-delivery.
    return false;
  }

  await prisma.refund.upsert({
    where: { yookassaRefundId: refundId },
    create: {
      orderId,
      amount,
      yookassaRefundId: refundId,
      status,
      createdBy: null,
      webhookReceivedAt: now,
    },
    update: {
      status,
      webhookReceivedAt: now,
      // Only refresh the amount on first webhook delivery; if the row
      // was pre-created by the admin POST handler with the canonical
      // amount, we trust that value.
      ...(existing ? {} : { amount }),
    },
  });

  if (status !== RefundStatus.SUCCEEDED) {
    await prisma.orderEvent.create({
      data: {
        orderId,
        kind: OrderEventKind.OTHER,
        payload: {
          kind: 'REFUND_STATUS_CHANGED',
          refundId,
          paymentId,
          amount,
          refundStatus: status,
          source,
        },
      },
    });
    return true;
  }

  const refundedTotal = await getOrderSucceededOrPendingRefundsTotal(orderId);
  const shouldFlipOrderToRefunded =
    refundedTotal >= totalAmount &&
    previousFulfillmentStatus !== OrderFulfillmentStatus.REFUNDED;

  if (shouldFlipOrderToRefunded) {
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: OrderFulfillmentStatus.REFUNDED },
    });
  }

  await prisma.orderEvent.create({
    data: {
      orderId,
      kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
      payload: {
        from: previousFulfillmentStatus,
        to: shouldFlipOrderToRefunded
          ? OrderFulfillmentStatus.REFUNDED
          : previousFulfillmentStatus,
        refundId,
        paymentId,
        amount,
        refundStatus: status,
        refundedTotal,
        source,
      },
    },
  });

  return true;
};
