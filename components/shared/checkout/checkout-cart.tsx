import React from 'react';
import { WhiteBlock } from '../white-block';
import { CheckoutItem } from '../checkout-item';
import { getCartItemDetails } from '@/lib/get-cart-item-details';
import { PizzaSize, PizzaType } from '@/constants/pizza';
import { CartStateItem } from '@/lib/get-cart-details';
import { CheckoutItemSkeleton } from '../checkout-item-skeleton';
import Link from 'next/link';

interface Props {
  items: CartStateItem[];
  onClickCountButton: (
    id: number,
    quantity: number,
    type: 'plus' | 'minus'
  ) => void;
  removeCartItem: (id: number) => void;
  loading?: boolean;
  className?: string;
}

export const CheckoutCart: React.FC<Props> = ({
  items,
  onClickCountButton,
  removeCartItem,
  loading,
  className,
}) => {
  return (
    <WhiteBlock title='1. Корзина' className={className}>
      <div className='flex flex-col gap-5'>
        {loading ? (
          [...Array(items.length)].map((_, index) => (
            <CheckoutItemSkeleton key={index} />
          ))
        ) : items.length > 0 ? (
          items.map((item) => (
            <CheckoutItem
              key={item.id}
              id={item.id}
              imageUrl={item.imageUrl}
              details={getCartItemDetails(
                item.ingredients,
                item.pizzaType as PizzaType,
                item.pizzaSize as PizzaSize
              )}
              name={item.name}
              price={item.price}
              quantity={item.quantity}
              disabled={item.disabled}
              onClickCountButton={(type) =>
                onClickCountButton(item.id, item.quantity, type)
              }
              onClickRemove={() => removeCartItem(item.id)}
            />
          ))
        ) : (
          <div className='rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center'>
            <p className='text-lg font-semibold'>Корзина пуста</p>
            <p className='mt-2 text-sm text-gray-500'>
              Добавьте товары из меню, чтобы перейти к оплате.
            </p>
            <Link
              href='/'
              className='mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 font-bold text-white transition-colors hover:bg-primary/90'
            >
              Вернуться в меню
            </Link>
          </div>
        )}
      </div>
    </WhiteBlock>
  );
};
