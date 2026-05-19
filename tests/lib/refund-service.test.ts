import { RefundStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOrderSucceededOrPendingRefundsTotal,
  mapYookassaRefundStatus,
} from '@/lib/refund-service';
import { prisma } from '@/prisma/prisma-client';

describe('mapYookassaRefundStatus', () => {
  it('maps "succeeded" → SUCCEEDED', () => {
    expect(mapYookassaRefundStatus('succeeded')).toBe(RefundStatus.SUCCEEDED);
  });

  it('maps both spellings of cancelled → CANCELLED', () => {
    expect(mapYookassaRefundStatus('canceled')).toBe(RefundStatus.CANCELLED);
    expect(mapYookassaRefundStatus('cancelled')).toBe(RefundStatus.CANCELLED);
  });

  it('falls back to PENDING for unknown statuses', () => {
    expect(mapYookassaRefundStatus('pending')).toBe(RefundStatus.PENDING);
    expect(mapYookassaRefundStatus('weird-new-status')).toBe(
      RefundStatus.PENDING,
    );
  });
});

describe('getOrderSucceededOrPendingRefundsTotal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when prisma.refund.aggregate has no rows', async () => {
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { amount: null },
    } as unknown as Awaited<ReturnType<typeof prisma.refund.aggregate>>);

    expect(await getOrderSucceededOrPendingRefundsTotal(1)).toBe(0);
    expect(prisma.refund.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: 1,
          status: { in: [RefundStatus.PENDING, RefundStatus.SUCCEEDED] },
        }),
      }),
    );
  });

  it('returns the aggregated sum when rows exist', async () => {
    vi.mocked(prisma.refund.aggregate).mockResolvedValue({
      _sum: { amount: 750 },
    } as unknown as Awaited<ReturnType<typeof prisma.refund.aggregate>>);

    expect(await getOrderSucceededOrPendingRefundsTotal(2)).toBe(750);
  });
});
