import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import { prisma } from '@/prisma/prisma-client';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      // const code = req.nextUrl.searchParams.get('code');
      const code = '';

      if (!code) {
        return NextResponse.json({ error: 'Неверный код' }, { status: 400 });
      }

      const verificationCode = await prisma.verificationCode.findFirst({
        where: {
          code,
        },
      });

      if (!verificationCode) {
        return NextResponse.json({ error: 'Неверный код' }, { status: 400 });
      }

      await prisma.user.update({
        where: {
          id: verificationCode.userId,
        },
        data: {
          verified: new Date(),
        },
      });

      await prisma.verificationCode.delete({
        where: {
          id: verificationCode.id,
        },
      });

      return NextResponse.redirect(new URL('/?verified', req.url));
    } catch (error) {
      logger.error('verify_get_failed', error);
      return NextResponse.json(
        { error: 'Не удалось подтвердить почту' },
        { status: 500 }
      );
    }
  });
}
