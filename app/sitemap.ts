import type { MetadataRoute } from 'next';

import { prisma } from '@/prisma/prisma-client';

export const revalidate = 3600;

const getSiteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pizza-app-s1aw3n.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const products = process.env.POSTGRES_URL
    ? await prisma.product.findMany({
        where: { active: true },
        select: { id: true, updatedAt: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      })
    : [];

  return [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...products.map((product) => ({
      url: `${baseUrl}/product/${product.id}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
