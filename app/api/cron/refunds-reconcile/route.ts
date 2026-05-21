import { timingSafeEqual } from 'crypto';

import {
  OrderEventKind,
  OrderFulfillmentStatus,
  RefundStatus,
} from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { getYookassaRefund } from '@/lib/get-yookassa-refund';
import { logger } from '@/lib/logger';
import {
  getOrderSucceededOrPendingRefundsTotal,
  mapYookassaRefundStatus,
} from '@/lib/refund-service';
import { runWithRequestContext } from '@/lib/request-context';
import { prisma } from '@/prisma/prisma-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Only refunds that have been PENDING for at least this many milliseconds
 * are reconciled. YooKassa usually finalizes refunds within seconds; this
 * grace window prevents the cron from racing the regular webhook path on
 * freshly-created rows.
 */
const PENDING_GRACE_MS = 5 * 60 * 1000;

/**
 * Hard cap on rows reconciled per invocation so a YooKassa outage that
 * piles up thousands of PENDING refunds doesn't blow the Vercel 60s
 * function budget. The cron runs every 15 minutes, so 50 rows / run is
 * enough for any realistic backlog.
 */
const BATCH_LIMIT = 50;

type ReconcileSummary = {
  inspected: number;
  unchanged: number;
  flippedSucceeded: number;
  flippedCancelled: number;
  errors: number;
};

const handleRefundRow = async (
  refund: {
    id: number;
    orderId: number;
    amount: number;
    yookassaRefundId: string;
  },
  summary: ReconcileSummary,
) => {
  const yookassa = await getYookassaRefund(refund.yookassaRefundId);
  const status = mapYookassaRefundStatus(yookassa.status);

  if (status === RefundStatus.PENDING) {
    summary.unchanged += 1;
    return;
  }

  await prisma.refund.update({
    where: { id: refund.id },
    data: { status, webhookReceivedAt: new Date() },
  });

  if (status === RefundStatus.CANCELLED) {
    summary.flippedCancelled += 1;
    await prisma.orderEvent.create({
      data: {
        orderId: refund.orderId,
        kind: OrderEventKind.OTHER,
        payload: {
          kind: 'REFUND_STATUS_CHANGED',
          refundId: refund.yookassaRefundId,
          refundStatus: status,
          amount: refund.amount,
          source: 'yookassa_reconcile_cron',
        },
      },
    });
    return;
  }

  // SUCCEEDED. Re-aggregate and conditionally promote the order.
  summary.flippedSucceeded += 1;
  const order = await prisma.order.findUnique({
    where: { id: refund.orderId },
    select: { fulfillmentStatus: true, totalAmount: true },
  });

  if (!order) {
    logger.warn('refund_reconcile_order_missing', {
      refundId: refund.yookassaRefundId,
      orderId: refund.orderId,
    });
    return;
  }

  const refundedTotal = await getOrderSucceededOrPendingRefundsTotal(
    refund.orderId,
  );
  const shouldFlipOrderToRefunded =
    refundedTotal >= order.totalAmount &&
    order.fulfillmentStatus !== OrderFulfillmentStatus.REFUNDED;

  if (shouldFlipOrderToRefunded) {
    await prisma.order.update({
      where: { id: refund.orderId },
      data: { fulfillmentStatus: OrderFulfillmentStatus.REFUNDED },
    });
  }

  await prisma.orderEvent.create({
    data: {
      orderId: refund.orderId,
      kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
      payload: {
        from: order.fulfillmentStatus,
        to: shouldFlipOrderToRefunded
          ? OrderFulfillmentStatus.REFUNDED
          : order.fulfillmentStatus,
        refundId: refund.yookassaRefundId,
        amount: refund.amount,
        refundStatus: status,
        refundedTotal,
        source: 'yookassa_reconcile_cron',
      },
    },
  });
};

/**
 * Reconciliation cron for YooKassa refunds.
 *
 * Authorization is checked against `CRON_SECRET`. Vercel cron passes the
 * project's CRON_SECRET via the `Authorization: Bearer <secret>` header
 * by default; the same scheme is exposed here so manual reruns (curl)
 * use the same code path.
 *
 * The handler reads up to `BATCH_LIMIT` PENDING refunds older than
 * `PENDING_GRACE_MS`, hits YooKassa for each, and reuses the same
 * idempotent update path as the webhook so partial vs. full refund logic
 * lives in one place. Individual row errors are swallowed (logged + counted)
 * so a single bad refund id never blocks the rest of the batch.
 */
export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      logger.error('refund_reconcile_missing_secret');
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 },
      );
    }

    const authHeader = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    // Length check first to avoid timingSafeEqual's same-length requirement
    // throwing; the early exit here doesn't leak more than the header length,
    // which an attacker already controls.
    let authorized = false;
    if (authHeader.length === expected.length) {
      try {
        authorized = timingSafeEqual(
          Buffer.from(authHeader),
          Buffer.from(expected),
        );
      } catch {
        authorized = false;
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const threshold = new Date(Date.now() - PENDING_GRACE_MS);
    const pending = await prisma.refund.findMany({
      where: {
        status: RefundStatus.PENDING,
        createdAt: { lt: threshold },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        orderId: true,
        amount: true,
        yookassaRefundId: true,
      },
    });

    const summary: ReconcileSummary = {
      inspected: pending.length,
      unchanged: 0,
      flippedSucceeded: 0,
      flippedCancelled: 0,
      errors: 0,
    };

    for (const refund of pending) {
      try {
        await handleRefundRow(refund, summary);
      } catch (err) {
        summary.errors += 1;
        logger.error('refund_reconcile_row_failed', err, {
          refundId: refund.yookassaRefundId,
          orderId: refund.orderId,
        });
      }
    }

    logger.info('refund_reconcile_done', summary);
    return NextResponse.json({ ok: true, ...summary });
  });
}
