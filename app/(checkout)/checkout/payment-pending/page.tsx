import { getPaymentOrderResult, getPendingPaymentOrder } from '@/app/actions';
import { Button } from '@/components/ui';
import { OrderStatus } from '@prisma/client';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: {
    orderId?: string;
  };
}

export default async function PaymentPendingPage({ searchParams }: Props) {
  const orderId = searchParams.orderId ? Number(searchParams.orderId) : undefined;

  if (
    typeof orderId !== 'undefined' &&
    (!Number.isInteger(orderId) || orderId <= 0)
  ) {
    redirect('/checkout');
  }

  const order = await getPendingPaymentOrder(orderId);

  if (!order) {
    const orderResult = orderId ? await getPaymentOrderResult(orderId) : null;

    if (orderResult?.status === OrderStatus.SUCCEEDED) {
      return (
        <div className='flex justify-center py-24'>
          <div className='w-full max-w-[620px] rounded-3xl bg-white p-10 text-center'>
            <CheckCircle2 className='mx-auto mb-5 h-16 w-16 text-green-500' />
            <h1 className='mb-3 text-3xl font-extrabold'>
              Заказ #{orderResult.id} оплачен
            </h1>
            <p className='mb-8 text-lg text-gray-500'>
              Мы получили оплату на сумму {orderResult.totalAmount} ₽. Статус
              заказа уже обновлён, скоро начнём готовить.
            </p>
            <div className='flex flex-col justify-center gap-3 sm:flex-row'>
              <Button
                asChild
                className='h-12 rounded-2xl px-8 text-base font-bold'
              >
                <Link href='/profile'>Перейти в профиль</Link>
              </Button>
              <Button
                asChild
                variant='outline'
                className='h-12 rounded-2xl px-8 text-base font-bold'
              >
                <Link href='/'>На главную</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (orderResult?.status === OrderStatus.CANCELLED) {
      return (
        <div className='flex justify-center py-24'>
          <div className='w-full max-w-[620px] rounded-3xl bg-white p-10 text-center'>
            <AlertCircle className='mx-auto mb-5 h-16 w-16 text-primary' />
            <h1 className='mb-3 text-3xl font-extrabold'>
              Оплата заказа #{orderResult.id} отменена
            </h1>
            <p className='mb-8 text-lg text-gray-500'>
              YooKassa не подтвердила оплату. Вы можете оформить новый заказ.
            </p>
            <Button asChild className='h-12 rounded-2xl px-8 text-base font-bold'>
              <Link href='/'>На главную</Link>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className='flex justify-center py-24'>
        <div className='w-full max-w-[620px] rounded-3xl bg-white p-10 text-center'>
          <CheckCircle2 className='mx-auto mb-5 h-16 w-16 text-green-500' />
          <h1 className='mb-3 text-3xl font-extrabold'>Заказ уже обработан</h1>
          <p className='mb-8 text-lg text-gray-500'>
            Мы не нашли активную ссылку на оплату. Проверьте статус заказа в
            профиле или оформите новый заказ.
          </p>
          <Button asChild className='h-12 rounded-2xl px-8 text-base font-bold'>
            <Link href='/'>На главную</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex justify-center py-24'>
      <div className='w-full max-w-[680px] rounded-3xl bg-white p-10'>
        <div className='mb-8 flex items-start gap-5'>
          <AlertCircle className='mt-1 h-12 w-12 shrink-0 text-primary' />
          <div>
            <h1 className='mb-3 text-3xl font-extrabold'>
              Заказ #{order.id} ожидает оплату
            </h1>
            <p className='text-lg text-gray-500'>
              Мы сохранили заказ на сумму {order.totalAmount} ₽. Если вы
              закрыли страницу YooKassa или оплата прервалась, продолжите оплату
              по этой ссылке.
            </p>
          </div>
        </div>

        <div className='mb-8 rounded-2xl bg-[#F4F1EE] p-5 text-sm text-gray-500'>
          После успешной оплаты YooKassa вернёт вас на сайт, а статус заказа
          обновится через callback.
        </div>

        <div className='flex flex-col gap-3 sm:flex-row'>
          <Button asChild className='h-14 flex-1 rounded-2xl text-base font-bold'>
            <a href={order.paymentUrl}>
              Продолжить оплату
              <ArrowRight className='ml-2 h-5 w-5' />
            </a>
          </Button>
          <Button
            asChild
            variant='outline'
            className='h-14 flex-1 rounded-2xl text-base font-bold'
          >
            <Link href='/'>Вернуться на главную</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
