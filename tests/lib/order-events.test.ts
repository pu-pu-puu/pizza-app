import {
  OrderEventKind,
  OrderFulfillmentStatus,
  RefundStatus,
} from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyRefundFromCallback } from '@/lib/order-events';
import { getOrderSucceededOrPendingRefundsTotal } from '@/lib/refund-service';
import { prisma } from '@/prisma/prisma-client';

vi.mock('@/lib/refund-service', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/refund-service')>(
      '@/lib/refund-service',
    );
  return {
    ...actual,
    getOrderSucceededOrPendingRefundsTotal: vi.fn(),
  };
});

const baseInput = {
  orderId: 42,
  totalAmount: 1000,
  previousFulfillmentStatus: OrderFulfillmentStatus.CONFIRMED,
  refundId: 'rfd_x',
  paymentId: 'pmt_x',
  amount: 1000,
  rawStatus: 'succeeded',
  source: 'yookassa_callback' as const,
};

describe('applyRefundFromCallback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('upserts the Refund row on first webhook delivery and flips the order to REFUNDED when fully covered', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(null);
    vi.mocked(getOrderSucceededOrPendingRefundsTotal).mockResolvedValue(1000);

    const changed = await applyRefundFromCallback(baseInput);

    expect(changed).toBe(true);
    expect(prisma.refund.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { yookassaRefundId: 'rfd_x' },
        create: expect.objectContaining({
          orderId: 42,
          amount: 1000,
          yookassaRefundId: 'rfd_x',
          status: RefundStatus.SUCCEEDED,
          createdBy: null,
        }),
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: { fulfillmentStatus: OrderFulfillmentStatus.REFUNDED },
      }),
    );
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 42,
          kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
          payload: expect.objectContaining({
            refundStatus: RefundStatus.SUCCEEDED,
            to: OrderFulfillmentStatus.REFUNDED,
          }),
        }),
      }),
    );
  });

  it('does NOT flip the order when SUCCEEDED refund only partially covers the total', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(null);
    vi.mocked(getOrderSucceededOrPendingRefundsTotal).mockResolvedValue(400);

    const changed = await applyRefundFromCallback({
      ...baseInput,
      amount: 400,
    });

    expect(changed).toBe(true);
    expect(prisma.refund.upsert).toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
          payload: expect.objectContaining({
            to: OrderFulfillmentStatus.CONFIRMED,
            refundStatus: RefundStatus.SUCCEEDED,
          }),
        }),
      }),
    );
  });

  it('writes a non-fulfillment event and skips the order update on CANCELLED', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue({
      id: 1,
      status: RefundStatus.PENDING,
    } as unknown as Awaited<ReturnType<typeof prisma.refund.findUnique>>);

    const changed = await applyRefundFromCallback({
      ...baseInput,
      rawStatus: 'canceled',
    });

    expect(changed).toBe(true);
    expect(prisma.refund.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: RefundStatus.CANCELLED }),
      }),
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: OrderEventKind.OTHER,
        }),
      }),
    );
  });

  it('is a no-op when the Refund row already matches the target status (webhook re-delivery)', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue({
      id: 1,
      status: RefundStatus.SUCCEEDED,
    } as unknown as Awaited<ReturnType<typeof prisma.refund.findUnique>>);

    const changed = await applyRefundFromCallback(baseInput);

    expect(changed).toBe(false);
    expect(prisma.refund.upsert).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  it('preserves existing amount on update path (does not overwrite admin-recorded amount)', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue({
      id: 1,
      status: RefundStatus.PENDING,
    } as unknown as Awaited<ReturnType<typeof prisma.refund.findUnique>>);
    vi.mocked(getOrderSucceededOrPendingRefundsTotal).mockResolvedValue(700);

    await applyRefundFromCallback({ ...baseInput, amount: 999 });

    const upsertCall = vi.mocked(prisma.refund.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update).not.toHaveProperty('amount');
  });
});
