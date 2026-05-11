'use client';

import {
  Order,
  OrderFulfillmentStatus,
  OrderStatus,
} from '@prisma/client';
import Link from 'next/link';
import React from 'react';

import { CartItemDTO } from '@/services/dto/cart.dto';
import { calcCartItemTotalPrice } from '@/lib/calc-cart-item-total-price';

import { Title } from './title';

type ProfileOrder = Pick<
  Order,
  | 'id'
  | 'totalAmount'
  | 'status'
  | 'fulfillmentStatus'
  | 'paymentId'
  | 'createdAt'
  | 'fullName'
  | 'phone'
  | 'address'
  | 'comment'
> & {
  items: string;
};

interface Props {
  orders: ProfileOrder[];
}

const PAYMENT_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Ожидает оплаты',
  SUCCEEDED: 'Оплачен',
  CANCELLED: 'Отменён',
};

const PAYMENT_STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
};

const FULFILLMENT_STATUS_LABEL: Record<OrderFulfillmentStatus, string> = {
  NEW: 'Новый',
  CONFIRMED: 'Подтверждён',
  COOKING: 'Готовится',
  READY: 'Готов',
  DELIVERING: 'В доставке',
  DELIVERED: 'Доставлен',
  CANCELLED: 'Отменён',
  REFUNDED: 'Возврат',
};

const FULFILLMENT_STATUS_CLASS: Record<OrderFulfillmentStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  COOKING: 'bg-orange-100 text-orange-800',
  READY: 'bg-indigo-100 text-indigo-800',
  DELIVERING: 'bg-cyan-100 text-cyan-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
  REFUNDED: 'bg-fuchsia-100 text-fuchsia-800',
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const parseOrderItems = (raw: string): CartItemDTO[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItemDTO[]) : [];
  } catch {
    return [];
  }
};

export const ProfileOrders: React.FC<Props> = ({ orders }) => {
  if (orders.length === 0) {
    return (
      <div className='mt-12'>
        <Title text='Мои заказы' size='md' className='font-bold' />
        <p className='mt-4 text-gray-500'>
          Здесь появятся ваши заказы после первой покупки.
        </p>
      </div>
    );
  }

  return (
    <div className='mt-12'>
      <Title text='Мои заказы' size='md' className='font-bold' />

      <ul className='mt-6 flex flex-col gap-4'>
        {orders.map((order) => {
          const items = parseOrderItems(order.items);
          const canResume =
            order.status === OrderStatus.PENDING && Boolean(order.paymentId);

          return (
            <li
              key={order.id}
              className='rounded-2xl border border-gray-200 bg-white p-5'
            >
              <details className='group'>
                <summary className='flex cursor-pointer list-none flex-wrap items-center gap-3'>
                  <div className='flex-1 min-w-[180px]'>
                    <div className='text-lg font-semibold'>
                      Заказ #{order.id}
                    </div>
                    <div className='text-sm text-gray-500'>
                      {formatDate(new Date(order.createdAt))}
                    </div>
                  </div>

                  <div className='flex flex-wrap items-center gap-2'>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${PAYMENT_STATUS_CLASS[order.status]}`}
                    >
                      {PAYMENT_STATUS_LABEL[order.status]}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${FULFILLMENT_STATUS_CLASS[order.fulfillmentStatus]}`}
                    >
                      {FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]}
                    </span>
                  </div>

                  <div className='ml-2 text-xl font-bold'>
                    {order.totalAmount} ₽
                  </div>

                  <span className='text-sm text-gray-400 group-open:hidden'>
                    Подробнее
                  </span>
                  <span className='hidden text-sm text-gray-400 group-open:inline'>
                    Скрыть
                  </span>
                </summary>

                <div className='mt-5 flex flex-col gap-5 border-t border-gray-100 pt-5'>
                  {items.length > 0 ? (
                    <ul className='flex flex-col gap-2'>
                      {items.map((item) => {
                        const lineTotal = calcCartItemTotalPrice(item) * item.quantity;
                        return (
                          <li
                            key={item.id}
                            className='flex items-start justify-between gap-3 text-sm'
                          >
                            <span>
                              {item.productItem.product.name}
                              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                              {item.ingredients.length > 0 ? (
                                <span className='text-gray-500'>
                                  {' '}
                                  ({item.ingredients
                                    .map((ing) => ing.name)
                                    .join(', ')})
                                </span>
                              ) : null}
                            </span>
                            <span className='whitespace-nowrap text-gray-600'>
                              {lineTotal} ₽
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className='text-sm text-gray-500'>
                      Не удалось прочитать состав заказа.
                    </p>
                  )}

                  <dl className='grid grid-cols-1 gap-2 text-sm md:grid-cols-2'>
                    <div>
                      <dt className='text-gray-500'>Получатель</dt>
                      <dd>{order.fullName}</dd>
                    </div>
                    <div>
                      <dt className='text-gray-500'>Телефон</dt>
                      <dd>{order.phone}</dd>
                    </div>
                    <div className='md:col-span-2'>
                      <dt className='text-gray-500'>Адрес</dt>
                      <dd>{order.address}</dd>
                    </div>
                    {order.comment ? (
                      <div className='md:col-span-2'>
                        <dt className='text-gray-500'>Комментарий</dt>
                        <dd>{order.comment}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {canResume ? (
                    <Link
                      href={`/checkout/payment-pending?orderId=${order.id}`}
                      className='inline-flex w-fit items-center rounded-2xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90'
                    >
                      Продолжить оплату
                    </Link>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
