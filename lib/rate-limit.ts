import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from './logger';

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const NOOP_RESULT: RateLimitResult = { success: true, remaining: -1, reset: 0 };

type Window = `${number} ${'s' | 'ms' | 'm' | 'h' | 'd'}`;

function getEnv(primary: string, fallback: string): string | undefined {
  return process.env[primary] || process.env[fallback] || undefined;
}

function createRedis(): Redis | null {
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function createLimiter(prefix: string, limit: number, window: Window): Ratelimit | null {
  const redis = createRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    prefix: `pizza-app:${prefix}`,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
  });
}

const limiters: Record<string, Ratelimit | null | undefined> = {};

function getLimiter(name: string, limit: number, window: Window): Ratelimit | null {
  if (limiters[name] === undefined) {
    limiters[name] = createLimiter(name, limit, window);
  }
  return limiters[name] ?? null;
}

async function check(
  name: string,
  limit: number,
  window: Window,
  key: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, limit, window);
  if (!limiter) return NOOP_RESULT;

  try {
    const result = await limiter.limit(key);
    if (!result.success) {
      logger.info('rate_limit_hit', {
        limiter: name,
        key,
        remaining: result.remaining,
        reset: result.reset,
      });
    }
    return { success: result.success, remaining: result.remaining, reset: result.reset };
  } catch (err) {
    logger.error('rate_limit_error', err, { limiter: name, key });
    return NOOP_RESULT;
  }
}

// IP-based, an extra layer on top of the per-phone DB limit already in
// app/api/auth/otp/send/route.ts. Protects against phone-enumeration
// attacks (rotating phone numbers from a single attacker IP).
export function checkOtpSendRateLimit(ip: string): Promise<RateLimitResult> {
  return check('otp-send', 10, '60 s', ip);
}

// Brute-force defence for the 6-digit code on /api/auth/otp/verify.
// Per-IP, since a single user normally types the code ≤2 times.
export function checkOtpVerifyRateLimit(ip: string): Promise<RateLimitResult> {
  return check('otp-verify', 10, '60 s', ip);
}

export function isRateLimitConfigured(): boolean {
  const url = getEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
  const token = getEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
  return Boolean(url && token);
}

export function extractClientIp(req: { headers: Headers }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

export function _resetForTests(): void {
  for (const k of Object.keys(limiters)) {
    delete limiters[k];
  }
}
