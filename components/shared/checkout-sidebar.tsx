import React from 'react';
import { WhiteBlock } from './white-block';
import { CheckoutItemDetails } from './checkout-item-details';
import { ArrowRight, Package, Percent, Ticket, Truck } from 'lucide-react';
import { Button, Skeleton } from '../ui';
import { cn } from '@/lib/utils';

const VAT = 15;
const DELIVERY_PRICE = 250;

interface Props {
  totalAmount: number;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  promoCode?: string;
  promoDiscount?: number;
  freeDelivery?: boolean;
}

export const CheckoutSidebar: React.FC<Props> = ({
  totalAmount,
  loading,
  disabled,
  className,
  promoCode,
  promoDiscount = 0,
  freeDelivery = false,
}) => {
  const vatPrice = (totalAmount * VAT) / 100;
  const baseDeliveryPrice = totalAmount > 0 ? DELIVERY_PRICE : 0;
  const deliveryPrice = freeDelivery ? 0 : baseDeliveryPrice;
  const promoSubtotalCut = freeDelivery ? 0 : promoDiscount;
  const totalPrice = Math.max(
    0,
    totalAmount + deliveryPrice + vatPrice - promoSubtotalCut,
  );

  return (
    <WhiteBlock className={cn('p-6 sticky top-4', className)}>
      <div className='flex flex-col gap-1'>
        <span className='text-xl'>Итого:</span>
        {loading ? (
          <Skeleton className='h-11 w-48' />
        ) : (
          <span className='h-11 text-[34px] font-extrabold'>
            {totalPrice} ₽
          </span>
        )}
      </div>

      <CheckoutItemDetails
        title={
          <div className='flex items-center'>
            <Package size={18} className='mr-2 text-gray-400' />
            Стоимость корзины:
          </div>
        }
        value={
          loading ? (
            <Skeleton className='h-6 w-16 rounded-[6px]' />
          ) : (
            `${totalAmount} ₽`
          )
        }
      />
      <CheckoutItemDetails
        title={
          <div className='flex items-center'>
            <Percent size={18} className='mr-2 text-gray-400' />
            Налоги:
          </div>
        }
        value={
          loading ? (
            <Skeleton className='h-6 w-16 rounded-[6px]' />
          ) : (
            `${vatPrice} ₽`
          )
        }
      />
      <CheckoutItemDetails
        title={
          <div className='flex items-center'>
            <Truck size={18} className='mr-2 text-gray-400' />
            Доставка:
          </div>
        }
        value={
          loading ? (
            <Skeleton className='h-6 w-16 rounded-[6px]' />
          ) : freeDelivery ? (
            <span className='text-emerald-600 font-semibold'>
              <span className='line-through text-gray-400 font-normal mr-2'>
                {baseDeliveryPrice} ₽
              </span>
              0 ₽
            </span>
          ) : (
            `${deliveryPrice} ₽`
          )
        }
      />
      {(promoCode && (promoDiscount > 0 || freeDelivery)) && (
        <CheckoutItemDetails
          title={
            <div className='flex items-center'>
              <Ticket size={18} className='mr-2 text-emerald-600' />
              Промокод {promoCode}:
            </div>
          }
          value={
            loading ? (
              <Skeleton className='h-6 w-16 rounded-[6px]' />
            ) : freeDelivery ? (
              <span className='text-emerald-600 font-semibold'>
                −{baseDeliveryPrice} ₽
              </span>
            ) : (
              <span className='text-emerald-600 font-semibold'>
                −{promoDiscount} ₽
              </span>
            )
          }
        />
      )}

      <Button
        loading={loading}
        disabled={disabled}
        type='submit'
        className='w-full h-14 rounded-2xl mt-6 text-base font-bold'
      >
        Перейти к оплате
        <ArrowRight className='w-5 ml-2' />
      </Button>
    </WhiteBlock>
  );
};
