import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/prisma/prisma-client';
import { getUserSession } from '@/lib/get-user-session';
import { verifyOtpCore } from '@/lib/otp';

/**
 * Attach a freshly OTP-verified phone number to the *currently logged-in*
 * user. Used when an email/Google/GitHub user fills in a phone at checkout
 * for the first time.
 *
 * Guests (no NextAuth session) must use signIn('phone-otp', {...}) instead —
 * that path goes through the NextAuth Credentials provider and creates a
 * session for a new phone-only user.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json(
        { message: 'Требуется авторизация' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as { phone?: unknown; code?: unknown };
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const code = typeof body.code === 'string' ? body.code : '';

    const result = await verifyOtpCore(phone, code);
    if (!result.ok) {
      const message =
        result.reason === 'invalid_phone'
          ? 'Введите корректный номер телефона'
          : result.reason === 'expired'
          ? 'Код истёк, запросите новый'
          : 'Неверный код';
      return NextResponse.json({ message }, { status: 400 });
    }

    const phoneOwner = await prisma.user.findUnique({
      where: { phone: result.phone },
    });

    if (phoneOwner && phoneOwner.id !== Number(session.id)) {
      return NextResponse.json(
        { message: 'Этот телефон привязан к другому аккаунту' },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: Number(session.id) },
      data: {
        phone: result.phone,
        phoneVerified: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.log('[OTP_VERIFY] Server error', err);
    return NextResponse.json(
      { message: 'Не удалось проверить код' },
      { status: 500 }
    );
  }
}
