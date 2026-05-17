import {
  OrderFulfillmentStatus,
  OrderStatus,
} from '@prisma/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/checkout/callback/route';
import {
  applyPaymentStatus,
  applyRefundFromCallback,
  getPayment,
  sendEmail,
} from '@/lib';
import { prisma } from '@/prisma/prisma-client';
import { buildJsonRequest } from '../../helpers/request';

const URL = 'http://localhost/api/checkout/callback';

const validOrder = {
  id: 42,
  status: OrderStatus.PENDING,
  fulfillmentStatus: OrderFulfillmentStatus.NEW,
  paymentId: 'pmt_abc',
  totalAmount: 1000,
  email: 'buyer@example.com',
  // The handler calls `OrderSuccessTemplate({ items })` on the happy path
  // which iterates over `items[].productItem.product.name`. An empty array
  // is the smallest fixture that exercises the success branch without
  // tying tests to the email template's data shape.
  items: JSON.stringify([]),
};

const successPayload = {
  type: 'notification',
  event: 'payment.succeeded',
  object: {
    id: 'pmt_abc',
    status: 'succeeded',
    amount: { value: '1000.00', currency: 'RUB' },
    metadata: { order_id: '42' },
  },
};

const refundPayload = {
  type: 'notification',
  event: 'refund.succeeded',
  object: {
    id: 'rfd_zzz',
    status: 'succeeded',
    payment_id: 'pmt_abc',
    amount: { value: '1000.00', currency: 'RUB' },
  },
};

const verifiedPayment = {
  id: 'pmt_abc',
  status: 'succeeded',
  amount: { value: '1000.00', currency: 'RUB' },
  metadata: { order_id: '42' },
};

// The handler's POST signature is `(req: NextRequest)`. Direct invocation
// from tests passes a Web `Request`; cast at the call site keeps the
// helper signature small.
const post = (body: unknown) =>
  POST(buildJsonRequest('POST', URL, body) as unknown as NextRequest);

describe('POST /api/checkout/callback', () => {
  beforeEach(() => {
    vi.mocked(applyPaymentStatus).mockResolvedValue(true);
    vi.mocked(applyRefundFromCallback).mockResolvedValue(true);
    vi.mocked(sendEmail).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on malformed payment payloads (missing fields)', async () => {
    const res = await post({ type: 'notification', event: 'payment.succeeded', object: {} });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid payment notification/i);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when payment status does not match the event name', async () => {
    const res = await post({
      ...successPayload,
      object: { ...successPayload.object, status: 'pending' },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported payment notification/i);
  });

  it('returns 400 when order_id is not an integer', async () => {
    const res = await post({
      ...successPayload,
      object: {
        ...successPayload.object,
        metadata: { order_id: 'not-a-number' },
      },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid order id/i);
  });

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

    const res = await post(successPayload);

    expect(res.status).toBe(404);
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when the order paymentId does not match the callback', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...validOrder,
      paymentId: 'pmt_other',
    } as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>);

    const res = await post(successPayload);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/payment mismatch/i);
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when the callback amount does not match the order total', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      validOrder as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>,
    );

    const res = await post({
      ...successPayload,
      object: {
        ...successPayload.object,
        amount: { value: '500.00', currency: 'RUB' },
      },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/amount mismatch/i);
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('returns 400 when the verified YooKassa payment disagrees with the callback', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      validOrder as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>,
    );
    vi.mocked(getPayment).mockResolvedValue({
      ...verifiedPayment,
      status: 'pending',
    } as unknown as Awaited<ReturnType<typeof getPayment>>);

    const res = await post(successPayload);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/payment status mismatch/i);
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it('promotes the order to SUCCEEDED and sends the confirmation email on happy path', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      validOrder as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>,
    );
    vi.mocked(getPayment).mockResolvedValue(
      verifiedPayment as unknown as Awaited<ReturnType<typeof getPayment>>,
    );

    const res = await post(successPayload);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(applyPaymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 42,
        nextStatus: OrderStatus.SUCCEEDED,
        previousStatus: OrderStatus.PENDING,
        paymentId: 'pmt_abc',
        source: 'yookassa_callback',
      }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      'buyer@example.com',
      expect.stringMatching(/Ваш заказ успешно оформлен/),
      expect.anything(),
    );
  });

  it('does not re-send the email when the order is already SUCCEEDED (idempotency)', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...validOrder,
      status: OrderStatus.SUCCEEDED,
    } as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>);
    vi.mocked(getPayment).mockResolvedValue(
      verifiedPayment as unknown as Awaited<ReturnType<typeof getPayment>>,
    );

    const res = await post(successPayload);

    expect(res.status).toBe(200);
    // Status helper is still invoked (it short-circuits internally), but
    // the email must not go out on a repeated webhook.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('processes a refund.succeeded notification and dispatches the refund helper', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      ...validOrder,
      status: OrderStatus.SUCCEEDED,
      fulfillmentStatus: OrderFulfillmentStatus.CONFIRMED,
    } as unknown as Awaited<ReturnType<typeof prisma.order.findFirst>>);

    const res = await post(refundPayload);

    expect(res.status).toBe(200);
    expect(applyRefundFromCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 42,
        refundId: 'rfd_zzz',
        paymentId: 'pmt_abc',
        amount: 1000,
        previousFulfillmentStatus: OrderFulfillmentStatus.CONFIRMED,
        source: 'yookassa_callback',
      }),
    );
    expect(applyPaymentStatus).not.toHaveBeenCalled();
  });

  it('returns 400 on a refund with non-succeeded status (callback rejected)', async () => {
    const res = await post({
      ...refundPayload,
      object: { ...refundPayload.object, status: 'pending' },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsupported refund status/i);
    expect(applyRefundFromCallback).not.toHaveBeenCalled();
  });
});
