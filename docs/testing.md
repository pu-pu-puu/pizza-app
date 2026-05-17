# Testing

This repo has two independent test layers:

1. **API integration tests** — `tests/**/*.test.ts`, run by [Vitest](https://vitest.dev/).
   They invoke `app/api/**` route handlers directly, with Prisma, NextAuth,
   Sentry, `next/headers` cookies, and a handful of helper modules under
   `@/lib` mocked. No database is needed.
2. **End-to-end smoke** — `e2e/**/*.spec.ts`, run by Playwright against the
   live Vercel preview deployment. See `playwright.config.ts` and the
   `e2e.yml` GitHub workflow.

This document covers (1). For Playwright, see the existing `e2e/` folder.

## Running

```bash
npm test           # one-shot run (CI mode)
npm run test:watch # interactive watcher, re-runs on file changes
```

The CI job runs `npm test` between `lint` and `build` in
`.github/workflows/ci.yml`, so failing tests block merges.

## Layout

```
tests/
  setup.ts                       global mocks (prisma, next-auth, sentry, ...)
  helpers/
    request.ts                   buildJsonRequest()
    session.ts                   mockSession()
  api/
    checkout/callback.test.ts    YooKassa payment + refund webhooks
    cart/cart.test.ts            GET + POST direct invocation
    cart/cart-supertest.test.ts  HTTP round-trip via supertest
    promo/validate.test.ts       promo code validation
    auth/otp/verify.test.ts      OTP verification (attach phone to user)
```

Mirror the route's path under `tests/api/` and name files after the
endpoint (not the file system path); e.g. tests for
`app/api/checkout/callback/route.ts` live in
`tests/api/checkout/callback.test.ts`.

## Pattern: direct handler invocation

The default pattern. We import the route handler, build a `Request` (or
`NextRequest` when cookies are involved), and call it as a plain async
function:

```ts
import { POST } from '@/app/api/checkout/callback/route';
import { buildJsonRequest } from '../../helpers/request';

it('returns 404 when the order is unknown', async () => {
  vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

  const res = await POST(buildJsonRequest('POST', URL, payload) as unknown as NextRequest);

  expect(res.status).toBe(404);
});
```

The handlers are typed as `(req: NextRequest)` but the cast above is safe
when the handler only reads `req.json()` / `req.headers`. For routes that
read `req.cookies.get(...)` (e.g. `/api/cart`), construct a real
`NextRequest` with a `cookie` header instead:

```ts
const req = new NextRequest(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: 'cartToken=abc' },
  body: JSON.stringify(body),
});
```

This pattern does **not** run `middleware.ts`. The middleware injects
`x-request-id`, but for unit-style tests we don't assert on that. If you
need it, set the header manually via the `extraHeaders` argument of
`buildJsonRequest`.

## Pattern: HTTP round-trip via supertest

For the small number of cases where we want to verify the real HTTP
shape (status code on the wire, response headers, JSON body
serialization, cookie forwarding), we wrap the handler in a minimal
`http.Server` and use [supertest](https://github.com/ladjs/supertest)
against it. See `tests/api/cart/cart-supertest.test.ts` for an example.
This is intentionally **lighter than booting `next start`**: it skips
middleware, page rendering, and asset routing, but gives a real HTTP
socket.

If a test truly needs the full Next.js stack (middleware running,
asset routing, etc.), it should be added to the Playwright suite under
`e2e/` instead, where it runs against an actual deployment.

## Mocking conventions

All cross-cutting boundaries are mocked once in `tests/setup.ts`:

- `@/prisma/prisma-client` — a flat object of `vi.fn()`s. Per-test, do
  `vi.mocked(prisma.cart.findFirst).mockResolvedValue(...)`.
- `next-auth` `getServerSession` — use `mockSession({ id, role })` or
  `mockSession(null)`. This also stubs `getUserSession()` (the thin
  wrapper used by route handlers).
- `next/headers` `cookies()` — replaced with a stub `cookieStore` exposed
  by `tests/setup.ts`. Tests that read `cookies()` (currently only
  `/api/promo/validate`) configure it via
  `vi.mocked(cookieStore.get).mockReturnValue({ value: '...' })`.
- `@sentry/nextjs` — `addBreadcrumb`, `setTag`, `captureException`,
  `flush` are all `vi.fn()`s.
- `@/lib/logger` — silenced. Logs are not asserted on by default.
- Lib helpers used by handlers — `getPayment`, `sendEmail`,
  `applyPaymentStatus`, `applyRefundFromCallback`, `validatePromo`,
  `verifyOtpCore`, `findOrCreateCart`, `updateCartTotalAmount` — are
  mocked at the helper boundary rather than at Prisma level, since each
  encapsulates a multi-step DB / IO sequence that has its own unit tests.

Per-test cleanup: `afterEach` in `tests/setup.ts` calls
`vi.clearAllMocks()`. Per-fixture state (like `prisma.cart.findFirst`
returning two different values across two calls) should use
`mockResolvedValueOnce` to be explicit about ordering.

## When to write a test here vs in `e2e/`

- API behaviour, validation, auth checks, business invariants → here.
- UI flows, page rendering, real database state → `e2e/`.
- Things that change rarely and are expensive to verify (Sentry source
  maps, deployment-protection bypass, real YooKassa webhook signature
  verification) → manual, with a checklist in the relevant PR.

## Known limits of this layer

- **No middleware execution.** Tests don't see `x-request-id` injected
  by `middleware.ts` (unless they set it manually). Middleware is
  covered by the e2e smoke and the supertest adapter doesn't run it
  either.
- **No real DB.** Constraint violations, foreign-key cascades, and
  Prisma-level type coercions are not exercised. If a handler relies
  on a unique index or check constraint, the test mocks that branch
  explicitly. A future addition could spin up a Neon branch per CI run
  for a small set of "really integration" tests.
- **No outbound network.** YooKassa, email, and any other outbound IO
  is replaced with `vi.fn()`s at the helper boundary. Tests that need
  to assert on the outbound payload do so by inspecting `vi.mocked(...)`
  call arguments.
