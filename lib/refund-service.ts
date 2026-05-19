import { RefundStatus } from '@prisma/client';

import { prisma } from '@/prisma/prisma-client';

/**
 * Maps a raw YooKassa refund status string to our enum. Treats both
 * 'canceled' (YooKassa spelling) and 'cancelled' as CANCELLED. Unknown
 * statuses fall back to PENDING so the reconciliation cron will keep
 * polling instead of silently dropping the row.
 */
export const mapYookassaRefundStatus = (raw: string): RefundStatus => {
  if (raw === 'succeeded') return RefundStatus.SUCCEEDED;
  if (raw === 'canceled' || raw === 'cancelled') return RefundStatus.CANCELLED;
  return RefundStatus.PENDING;
};

/**
 * Sum of refund amounts that count toward the order total. CANCELLED
 * refunds are excluded because YooKassa already reversed them; PENDING
 * refunds *are* included because YooKassa accepted them and they will
 * almost always finalize. If a PENDING refund later flips to CANCELLED
 * the reconciliation cron will decrement it via `applyRefundOutcome`.
 */
export const getOrderSucceededOrPendingRefundsTotal = async (
  orderId: number,
): Promise<number> => {
  const aggregate = await prisma.refund.aggregate({
    where: {
      orderId,
      status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] },
    },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? 0;
};
