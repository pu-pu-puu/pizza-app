import {
  OrderEventKind,
  OrderFulfillmentStatus,
  RefundStatus,
} from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cron/refunds-reconcile/route';
import { getYookassaRefund } from '@/lib/get-yookassa-refund';
import { getOrderSucceededOrPendingRefundsTotal } from '@/lib/refund-service';
import { prisma } from '@/prisma/prisma-client';

// The cron route imports both modules through their concrete paths
// (not through the barrel), so we mock them directly here. The barrel
// in tests/setup.ts only stubs the public `@/lib` surface.
vi.mock('@/lib/get-yookassa-refund', () => ({
  getYookassaRefund: vi.fn(),
}));

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

const CRON_SECRET = 'cron_test_secret_long_enough';
const URL = 'http://localhost/api/cron/refunds-reconcile';

const buildRequest = (headers: Record<string, string> = {}) =>
  new Request(URL, { method: 'GET', headers }) as unknown as NextRequest;

describe('GET /api/cron/refunds-reconcile', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(500);
    expect(prisma.refund.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header is missing or wrong', async () => {
    const missing = await GET(buildRequest());
    expect(missing.status).toBe(401);

    const wrong = await GET(
      buildRequest({ authorization: 'Bearer wrong-secret' }),
    );
    expect(wrong.status).toBe(401);

    // Same-length wrong header — must still be rejected by the
    // constant-time comparison, not silently accepted because the length
    // matches.
    const sameLengthWrong = `Bearer ${'x'.repeat(CRON_SECRET.length)}`;
    expect(sameLengthWrong.length).toBe(`Bearer ${CRON_SECRET}`.length);
    const wrongSameLength = await GET(
      buildRequest({ authorization: sameLengthWrong }),
    );
    expect(wrongSameLength.status).toBe(401);

    expect(prisma.refund.findMany).not.toHaveBeenCalled();
  });

  it('returns inspected=0 summary when no PENDING refunds are ripe', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([]);

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      inspected: 0,
      unchanged: 0,
      flippedSucceeded: 0,
      flippedCancelled: 0,
      errors: 0,
    });
    expect(getYookassaRefund).not.toHaveBeenCalled();
  });

  it('flips refund row to CANCELLED and writes a non-fulfillment event when YooKassa reports canceled', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        id: 1,
        orderId: 42,
        amount: 500,
        yookassaRefundId: 'rfd_cancel',
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.refund.findMany>>);
    vi.mocked(getYookassaRefund).mockResolvedValue({
      id: 'rfd_cancel',
      status: 'canceled',
      amount: { value: '500.00', currency: 'RUB' },
      payment_id: 'pmt_abc',
    });

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      inspected: 1,
      flippedCancelled: 1,
      flippedSucceeded: 0,
      unchanged: 0,
    });
    expect(prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: RefundStatus.CANCELLED }),
      }),
    );
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 42,
          kind: OrderEventKind.OTHER,
        }),
      }),
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('promotes the order to REFUNDED when the SUCCEEDED refund closes the total', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        id: 2,
        orderId: 7,
        amount: 1000,
        yookassaRefundId: 'rfd_full',
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.refund.findMany>>);
    vi.mocked(getYookassaRefund).mockResolvedValue({
      id: 'rfd_full',
      status: 'succeeded',
      amount: { value: '1000.00', currency: 'RUB' },
      payment_id: 'pmt_abc',
    });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      fulfillmentStatus: OrderFulfillmentStatus.CONFIRMED,
      totalAmount: 1000,
    } as unknown as Awaited<ReturnType<typeof prisma.order.findUnique>>);
    vi.mocked(getOrderSucceededOrPendingRefundsTotal).mockResolvedValue(1000);

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      inspected: 1,
      flippedSucceeded: 1,
    });
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { fulfillmentStatus: OrderFulfillmentStatus.REFUNDED },
      }),
    );
  });

  it('writes a fulfillment event but does NOT flip the order when SUCCEEDED refund only partially covers total', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        id: 3,
        orderId: 9,
        amount: 300,
        yookassaRefundId: 'rfd_partial',
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.refund.findMany>>);
    vi.mocked(getYookassaRefund).mockResolvedValue({
      id: 'rfd_partial',
      status: 'succeeded',
      amount: { value: '300.00', currency: 'RUB' },
      payment_id: 'pmt_abc',
    });
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      fulfillmentStatus: OrderFulfillmentStatus.CONFIRMED,
      totalAmount: 1000,
    } as unknown as Awaited<ReturnType<typeof prisma.order.findUnique>>);
    vi.mocked(getOrderSucceededOrPendingRefundsTotal).mockResolvedValue(300);

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 9,
          kind: OrderEventKind.FULFILLMENT_STATUS_CHANGED,
        }),
      }),
    );
  });

  it('leaves refund alone when YooKassa still reports pending', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        id: 4,
        orderId: 11,
        amount: 200,
        yookassaRefundId: 'rfd_still_pending',
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.refund.findMany>>);
    vi.mocked(getYookassaRefund).mockResolvedValue({
      id: 'rfd_still_pending',
      status: 'pending',
      amount: { value: '200.00', currency: 'RUB' },
      payment_id: 'pmt_abc',
    });

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      inspected: 1,
      unchanged: 1,
    });
    expect(prisma.refund.update).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('continues processing the rest of the batch when a single row throws', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { id: 5, orderId: 1, amount: 100, yookassaRefundId: 'rfd_a' },
      { id: 6, orderId: 2, amount: 100, yookassaRefundId: 'rfd_b' },
    ] as unknown as Awaited<ReturnType<typeof prisma.refund.findMany>>);
    vi.mocked(getYookassaRefund)
      .mockRejectedValueOnce(new Error('yookassa 5xx'))
      .mockResolvedValueOnce({
        id: 'rfd_b',
        status: 'canceled',
        amount: { value: '100.00', currency: 'RUB' },
        payment_id: 'pmt_b',
      });

    const res = await GET(
      buildRequest({ authorization: `Bearer ${CRON_SECRET}` }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      inspected: 2,
      errors: 1,
      flippedCancelled: 1,
    });
    expect(prisma.refund.update).toHaveBeenCalledTimes(1);
  });
});
