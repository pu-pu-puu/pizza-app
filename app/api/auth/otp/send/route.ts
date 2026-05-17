import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcrypt';
import { prisma } from '@/prisma/prisma-client';
import { logger } from '@/lib/logger';
import { normalizeRuPhone } from '@/lib/phone';
import { runWithRequestContext } from '@/lib/request-context';
import { getSmsSender } from '@/lib/sms/sender';

const CODE_TTL_SECONDS = 5 * 60;
const RATE_LIMIT_PER_MINUTE = 1;
const RATE_LIMIT_PER_HOUR = 5;

function generateCode(): string {
  // 6-digit, leading zeros allowed.
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const body = (await req.json()) as { phone?: unknown };
      const rawPhone = typeof body.phone === 'string' ? body.phone : '';
      const phone = normalizeRuPhone(rawPhone);

      if (!phone) {
        return NextResponse.json(
          { message: 'Введите корректный номер телефона' },
          { status: 400 }
        );
      }

      const now = new Date();
      const oneMinAgo = new Date(now.getTime() - 60_000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60_000);

      const recentMinute = await prisma.otpCode.count({
        where: { phone, createdAt: { gte: oneMinAgo } },
      });
      if (recentMinute >= RATE_LIMIT_PER_MINUTE) {
        return NextResponse.json(
          { message: 'Подождите минуту перед запросом нового кода' },
          { status: 429 }
        );
      }

      const recentHour = await prisma.otpCode.count({
        where: { phone, createdAt: { gte: oneHourAgo } },
      });
      if (recentHour >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json(
          { message: 'Слишком много попыток, попробуйте через час' },
          { status: 429 }
        );
      }

      const code = generateCode();
      const codeHash = await hash(code, 10);
      const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000);

      await prisma.otpCode.create({
        data: { phone, codeHash, expiresAt },
      });

      await getSmsSender().sendCode(phone, code);

      return NextResponse.json({
        ok: true,
        expiresInSec: CODE_TTL_SECONDS,
        // Do NOT echo the code or the masked phone here — the client knows the
        // phone it submitted, and the code stays out of the response in all envs.
      });
    } catch (err) {
      logger.error('otp_send_failed', err);
      return NextResponse.json(
        { message: 'Не удалось отправить код' },
        { status: 500 }
      );
    }
  });
}
