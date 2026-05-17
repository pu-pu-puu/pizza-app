import { getUserSession } from '@/lib/get-user-session';
import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/request-context';
import { prisma } from '@/prisma/prisma-client';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const user = await getUserSession();

      if (!user) {
        return NextResponse.json(
          { message: '[USER_GET] Unauthorized' },
          { status: 401 }
        );
      }

      const data = await prisma.user.findUnique({
        where: {
          id: Number(user.id),
        },
        select: {
          fullName: true,
          email: true,
          phone: true,
          phoneVerified: true,
          password: false,
        },
      });

      return NextResponse.json(data);
    } catch (error) {
      logger.error('user_get_failed', error);
      return NextResponse.json(
        { message: '[USER_GET] Server error' },
        { status: 500 }
      );
    }
  });
}
