import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/auth/otp/verify/route';
import { verifyOtpCore } from '@/lib/otp';
import { prisma } from '@/prisma/prisma-client';
import { buildJsonRequest } from '../../../helpers/request';
import { mockSession } from '../../../helpers/session';

const URL = 'http://localhost/api/auth/otp/verify';
const post = (body: unknown) =>
  POST(buildJsonRequest('POST', URL, body) as unknown as NextRequest);

describe('POST /api/auth/otp/verify', () => {
  it('returns 401 when there is no NextAuth session', async () => {
    mockSession(null);

    const res = await post({ phone: '+79991234567', code: '0000' });

    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/авторизация/i);
    expect(verifyOtpCore).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid phone (verifyOtpCore reports invalid_phone)', async () => {
    mockSession({ id: 5, role: 'USER' });
    vi.mocked(verifyOtpCore).mockResolvedValue({
      ok: false,
      reason: 'invalid_phone',
    });

    const res = await post({ phone: 'garbage', code: '0000' });

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/корректный номер/i);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 on expired code with the expected human message', async () => {
    mockSession({ id: 5, role: 'USER' });
    vi.mocked(verifyOtpCore).mockResolvedValue({ ok: false, reason: 'expired' });

    const res = await post({ phone: '+79991234567', code: '0000' });

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Код истёк/);
  });

  it('returns 400 on invalid_code with the expected human message', async () => {
    mockSession({ id: 5, role: 'USER' });
    vi.mocked(verifyOtpCore).mockResolvedValue({
      ok: false,
      reason: 'invalid_code',
    });

    const res = await post({ phone: '+79991234567', code: '0000' });

    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Неверный код/);
  });

  it('returns 409 when the verified phone is owned by a different account', async () => {
    mockSession({ id: 5, role: 'USER' });
    vi.mocked(verifyOtpCore).mockResolvedValue({
      ok: true,
      phone: '+79991234567',
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 99,
      phone: '+79991234567',
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const res = await post({ phone: '+79991234567', code: '4321' });

    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/другому аккаунту/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('writes phone + phoneVerified on the happy path (own phone, or no prior owner)', async () => {
    mockSession({ id: 5, role: 'USER' });
    vi.mocked(verifyOtpCore).mockResolvedValue({
      ok: true,
      phone: '+79991234567',
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 5,
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await post({ phone: '+79991234567', code: '4321' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ phone: '+79991234567' }),
      }),
    );
  });
});
