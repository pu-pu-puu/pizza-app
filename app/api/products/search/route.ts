import { prisma } from '@/prisma/prisma-client';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query') || '';

  const now = new Date();
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [{ stopUntil: null }, { stopUntil: { lte: now } }],
      name: {
        contains: query,
        mode: 'insensitive',
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 5,
  });

  return NextResponse.json(products);
}
