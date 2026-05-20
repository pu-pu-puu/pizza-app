import { Metadata } from 'next';
import { Header } from '@/components/shared/header';
import { Footer } from '@/components/shared/footer';
import { Suspense } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pizza-app-s1aw3n.vercel.app',
  ),
  title: {
    default: 'Next Pizza — доставка пиццы',
    template: '%s — Next Pizza',
  },
  description:
    'Закажите пиццу, закуски и напитки с доставкой в демонстрационном интернет-магазине Next Pizza.',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Next Pizza',
    images: [{ url: '/logo.png', width: 300, height: 300 }],
  },
  twitter: {
    card: 'summary',
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default function HomeLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <main className='min-h-screen'>
      <Suspense>
        <Header />
      </Suspense>
      {children}
      <Footer />
      {modal}
    </main>
  );
}
