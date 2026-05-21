import type { MetadataRoute } from 'next';

const getSiteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pizza-app-s1aw3n.vercel.app';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/checkout', '/profile', '/not-auth'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
