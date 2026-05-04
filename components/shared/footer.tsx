import Image from 'next/image';
import { ChefHat, Instagram, Mail, MessageCircle, Phone, Youtube } from 'lucide-react';
import { Container } from './container';

const footerLinks = [
  {
    title: 'Партнёрам',
    links: ['Франшиза', 'Инвестиции', 'Поставщикам', 'Предложить помещение'],
  },
  {
    title: 'Это интересно',
    links: ['О нас', 'Экскурсии и мастер-классы', 'Почему мы готовим открыто?'],
  },
];

const appBadges = ['AppGallery', 'RuStore', 'Google Play', 'App Store'];

export const Footer: React.FC = () => {
  return (
    <footer className='mt-24 bg-[#181818] text-white'>
      <div className='bg-primary'>
        <Container className='flex min-h-[64px] items-center justify-between gap-6 py-3'>
          <div className='flex items-center gap-4 font-bold'>
            <div className='flex h-11 w-11 items-center justify-center rounded-full bg-white/15'>
              <ChefHat className='h-7 w-7 text-white' />
            </div>
            <span>
              Проверьте нашу кухню и получите додокоины — хватит на две пиццы
            </span>
          </div>

          <a
            href='#'
            className='shrink-0 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-primary transition hover:bg-orange-50'
          >
            Заполнить анкету
          </a>
        </Container>
      </div>

      <Container className='py-10'>
        <div className='grid gap-10 lg:grid-cols-[1.1fr_1.1fr_1fr_1.35fr]'>
          {footerLinks.map((column) => (
            <div key={column.title}>
              <h3 className='mb-4 text-sm font-bold text-white/50'>
                {column.title}
              </h3>
              <ul className='space-y-3'>
                {column.links.map((link) => (
                  <li key={link}>
                    <a
                      href='#'
                      className='font-semibold text-white transition hover:text-primary'
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className='mb-4 text-sm font-bold text-white/50'>Контакты</h3>
            <div className='space-y-3 font-semibold'>
              <a
                href='tel:88003020060'
                className='flex items-center gap-2 transition hover:text-primary'
              >
                <Phone className='h-4 w-4' />
                8 800 302-00-60
              </a>
              <a
                href='mailto:feedback@nextpizza.ru'
                className='flex items-center gap-2 transition hover:text-primary'
              >
                <Mail className='h-4 w-4' />
                feedback@nextpizza.ru
              </a>
            </div>
          </div>

          <div>
            <div className='grid grid-cols-2 gap-3'>
              {appBadges.map((badge) => (
                <a
                  href='#'
                  key={badge}
                  className='flex h-11 items-center justify-center rounded-lg border border-white/25 bg-black px-3 text-sm font-bold transition hover:border-primary hover:text-primary'
                >
                  {badge}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className='mt-12 grid gap-8 sm:grid-cols-2'>
          <div>
            <div className='text-2xl font-black'>1 225 608 234 ₽</div>
            <p className='mt-2 text-sm text-white/55'>
              Выручка сети в этом месяце
              <br />В прошлом — 1 230 939 945 ₽
            </p>
          </div>

          <div>
            <div className='text-2xl font-black'>1468 пиццерий</div>
            <p className='mt-2 text-sm text-white/55'>В 26 странах</p>
          </div>
        </div>

        <div className='mt-12 border-t border-white/15 pt-7'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex flex-col gap-4 text-sm font-semibold text-white/50 sm:flex-row sm:items-center'>
              <div className='flex items-center gap-3 text-white/70'>
                <Image src='/logo.png' alt='Next Pizza' width={24} height={24} />
                NEXT PIZZA © 2026
              </div>
              <a href='#' className='transition hover:text-primary'>
                Правовая информация
              </a>
              <a href='#' className='transition hover:text-primary'>
                Калорийность и состав
              </a>
            </div>

            <div className='flex gap-3'>
              {[
                { label: 'Telegram', icon: MessageCircle },
                { label: 'YouTube', icon: Youtube },
                { label: 'Instagram', icon: Instagram },
              ].map(({ label, icon: Icon }) => (
                <a
                  href='#'
                  key={label}
                  aria-label={label}
                  className='flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-primary hover:text-white'
                >
                  <Icon className='h-5 w-5' />
                </a>
              ))}
            </div>
          </div>

          <p className='mt-6 max-w-xl text-xs leading-5 text-white/35'>
            © 2026 ООО «Некст Пицца». Информация на сайте размещена для
            демонстрации учебного проекта. Все ссылки в футере пока являются
            заглушками.
          </p>
        </div>
      </Container>
    </footer>
  );
};
