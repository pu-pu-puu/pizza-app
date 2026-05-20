import { afterEach, vi } from 'vitest';

/**
 * Global mocks for API integration tests.
 *
 * The handlers under `app/api/**` reach a few cross-cutting boundaries:
 * Prisma, NextAuth, Sentry, `next/headers` cookies, the structured
 * logger, and a handful of helper modules under `@/lib` (YooKassa,
 * email, OTP, promo validation, cart upserts). We replace each with a
 * deterministic stub so individual tests can configure behaviour
 * per-case via `vi.mocked(...).mockResolvedValueOnce(...)`.
 */

vi.mock('@/prisma/prisma-client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    refund: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    cart: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    cartItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productItem: {
      findUnique: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    promo: {
      findUnique: vi.fn(),
    },
    promoRedemption: {
      count: vi.fn(),
    },
    otpCode: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn((queries) => Promise.all(queries)),
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// `cookies()` is read in `promo/validate` to look up the cartToken. The
// real implementation requires a Next.js request context (AsyncLocalStorage)
// which we don't set up under direct invocation. The mock exposes a single
// `get(name)` that tests override per-case.
const cookieStore = {
  get: vi.fn() as ReturnType<typeof vi.fn>,
};
vi.mock('next/headers', () => ({
  cookies: () => cookieStore,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}));

// Silence pino in tests. We don't assert on log lines, and pino's default
// destination is stdout which makes test output noisy.
vi.mock('@/lib/logger', () => {
  const noop = vi.fn();
  const logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: vi.fn(() => logger),
  };
  return { logger };
});

// Lib-level boundaries the handlers cross. These are mocked at the
// helper boundary rather than at Prisma level because they encapsulate
// multi-step DB+IO sequences (YooKassa calls, multi-row inserts) that
// are tested separately at the unit layer.
vi.mock('@/lib/find-or-create-cart', () => ({
  findOrCreateCart: vi.fn(),
}));

vi.mock('@/lib/update-cart-total-amount', () => ({
  updateCartTotalAmount: vi.fn(),
}));

vi.mock('@/lib/calc-promo', () => ({
  validatePromo: vi.fn(),
  normalizePromoCode: (raw: string) => raw.trim().toUpperCase(),
  DELIVERY_PRICE: 250,
}));

vi.mock('@/lib/otp', () => ({
  verifyOtpCore: vi.fn(),
  findOrCreateUserByPhone: vi.fn(),
}));

// `@/lib` is the barrel; mock the helpers the handlers actually call.
vi.mock('@/lib', () => ({
  getPayment: vi.fn(),
  createPayment: vi.fn(),
  sendEmail: vi.fn(),
  applyPaymentStatus: vi.fn(),
  applyRefundFromCallback: vi.fn(),
  // Re-export everything else as no-op stubs so unrelated imports
  // through the barrel don't explode.
  findOrCreateCart: vi.fn(),
  updateCartTotalAmount: vi.fn(),
  getCartDetails: vi.fn(),
  calcCartItemTotalPrice: vi.fn(() => 0),
  calcTotalPizzaPrice: vi.fn(() => 0),
  getCartItemDetails: vi.fn(() => ''),
  findPizzas: vi.fn(),
  getAvailablePizzaSizes: vi.fn(() => []),
  getPizzaDetails: vi.fn(() => ({ totalPrice: 0, textDetaills: '' })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

export { cookieStore };
