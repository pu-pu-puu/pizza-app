import { Metadata } from 'next';
import { Header } from '@/components/shared/header';
import { Footer } from '@/components/shared/footer';
import { Suspense } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pizza-app-s1aw3n.vercel.app',
  ),
  title: { default: 'Next Pizza — доставка пиццы', template: '%s — Next Pizza' },
  description:
    'Заказать пиццу с доставкой. Большой выбор пиццы, быстрая доставка.',
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
