import { compare } from 'bcrypt';
import { prisma } from '@/prisma/prisma-client';
import { normalizeRuPhone } from './phone';

const MAX_ATTEMPTS = 5;

export type VerifyOtpResult =
  | { ok: true; phone: string }
  | { ok: false; reason: 'invalid_phone' | 'expired' | 'invalid_code' };

/**
 * Validate a phone+code pair against the latest active OtpCode row.
 *
 * On success the code row is marked consumed=true so it cannot be reused.
 * On a wrong code the row's `attempts` counter is incremented; after
 * MAX_ATTEMPTS the row is also marked consumed and the caller must request
 * a fresh code.
 *
 * Caller is responsible for any session/user side effects after this returns.
 */
export async function verifyOtpCore(
  rawPhone: string,
  code: string
): Promise<VerifyOtpResult> {
  const phone = normalizeRuPhone(rawPhone);
  if (!phone) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumed: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp || otp.expiresAt < new Date()) {
    return { ok: false, reason: 'expired' };
  }

  const matches = await compare(code, otp.codeHash);

  if (!matches) {
    const nextAttempts = otp.attempts + 1;
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        attempts: nextAttempts,
        consumed: nextAttempts >= MAX_ATTEMPTS,
      },
    });
    return { ok: false, reason: 'invalid_code' };
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { consumed: true },
  });

  return { ok: true, phone };
}

/**
 * Find an existing user by phone, or create a phone-only "guest" user.
 *
 * For phone-only users we still satisfy the schema's required `email` and
 * `password` columns by generating placeholder values. The `verified` field
 * is left null — that flag tracks email verification, which is independent
 * of phone verification.
 */
export async function findOrCreateUserByPhone(phone: string) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.phoneVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { phoneVerified: new Date() },
      });
    }
    return existing;
  }

  const placeholderEmail = `phone-${phone.replace(/\D/g, '')}@phone.local`;
  const placeholderName = `Гость ${phone.slice(-4)}`;
  // bcrypt rejects empty strings, but any non-empty value works as a
  // placeholder — phone-only users authenticate exclusively via OTP and
  // never go through the email+password flow.
  const placeholderPassword =
    'phone-otp-' + Math.random().toString(36).slice(2);

  return prisma.user.create({
    data: {
      fullName: placeholderName,
      email: placeholderEmail,
      password: placeholderPassword,
      phone,
      phoneVerified: new Date(),
    },
  });
}
