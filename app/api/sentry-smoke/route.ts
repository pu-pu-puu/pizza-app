import * as Sentry from '@sentry/nextjs';

/**
 * Temporary smoke-test endpoint that intentionally throws so we can
 * verify Sentry is wired up correctly after the initial integration.
 * The route is intended to be removed in a follow-up PR once we've
 * confirmed events arrive on the dashboard.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const message =
    url.searchParams.get('message') ?? 'pizza-app sentry smoke test';
  Sentry.captureMessage(message, 'warning');
  throw new Error(message);
}

export const dynamic = 'force-dynamic';
