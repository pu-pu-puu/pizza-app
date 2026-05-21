import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limitMock = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(() => ({ limit: limitMock })),
    { slidingWindow: vi.fn(() => ({ kind: 'sliding' })) },
  ),
}));

async function loadModule() {
  vi.resetModules();
  return import('@/lib/rate-limit');
}

describe('rate-limit helper (pizza-app)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RATE_LIMIT_FAIL_CLOSED;
    limitMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('checkOtpSendRateLimit no-ops when no env vars are set', async () => {
    const { checkOtpSendRateLimit, isRateLimitConfigured, _resetForTests } = await loadModule();
    _resetForTests();
    expect(isRateLimitConfigured()).toBe(false);
    const result = await checkOtpSendRateLimit('1.2.3.4');
    expect(result.success).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('checkOtpVerifyRateLimit no-ops when no env vars are set', async () => {
    const { checkOtpVerifyRateLimit, _resetForTests } = await loadModule();
    _resetForTests();
    const result = await checkOtpVerifyRateLimit('1.2.3.4');
    expect(result.success).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('hits Upstash when KV_REST_API_* is configured and returns success=false on limit', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });

    const { checkOtpSendRateLimit, _resetForTests } = await loadModule();
    _resetForTests();

    const result = await checkOtpSendRateLimit('1.2.3.4');
    expect(result.success).toBe(false);
    expect(limitMock).toHaveBeenCalledWith('1.2.3.4');
  });

  it('uses KV_REST_API_* when both KV and UPSTASH vars are present (Vercel KV precedence)', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example.com';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
    limitMock.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60_000 });

    const { isRateLimitConfigured, checkOtpVerifyRateLimit, _resetForTests } = await loadModule();
    _resetForTests();
    expect(isRateLimitConfigured()).toBe(true);
    const result = await checkOtpVerifyRateLimit('1.2.3.4');
    expect(result.success).toBe(true);
  });

  it('fails open (success=true) when Upstash throws', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
    limitMock.mockRejectedValue(new Error('upstream down'));

    const { checkOtpSendRateLimit, _resetForTests } = await loadModule();
    _resetForTests();

    const result = await checkOtpSendRateLimit('1.2.3.4');
    expect(result.success).toBe(true);
  });

  it('fails closed (success=false) when Upstash throws and RATE_LIMIT_FAIL_CLOSED=true in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    process.env.RATE_LIMIT_FAIL_CLOSED = 'true';
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
    limitMock.mockRejectedValue(new Error('upstream down'));

    try {
      const { checkOtpSendRateLimit, _resetForTests } = await loadModule();
      _resetForTests();

      const result = await checkOtpSendRateLimit('1.2.3.4');
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reset).toBeGreaterThan(Date.now());
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true });
    }
  });

  it('fails closed (success=false) when Upstash is not configured and RATE_LIMIT_FAIL_CLOSED=true in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    process.env.RATE_LIMIT_FAIL_CLOSED = 'true';

    try {
      const { checkOtpSendRateLimit, _resetForTests } = await loadModule();
      _resetForTests();

      const result = await checkOtpSendRateLimit('1.2.3.4');
      expect(result.success).toBe(false);
      expect(limitMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true });
    }
  });

  it('extractClientIp returns first hop of x-forwarded-for, falls back to x-real-ip, then "unknown"', async () => {
    const { extractClientIp } = await loadModule();

    expect(
      extractClientIp({ headers: new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }) }),
    ).toBe('203.0.113.1');

    expect(
      extractClientIp({ headers: new Headers({ 'x-real-ip': '203.0.113.2' }) }),
    ).toBe('203.0.113.2');

    expect(extractClientIp({ headers: new Headers() })).toBe('unknown');
  });
});
