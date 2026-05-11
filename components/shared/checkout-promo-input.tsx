'use client';

import axios from 'axios';
import { Ticket, X } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';
import toast from 'react-hot-toast';

import { Api } from '@/services/api-client';
import type { ValidatedPromo } from '@/services/promo';
import { CheckoutFormValues } from '@/constants';
import { cn } from '@/lib/utils';

import { Button, Input } from '../ui';
import { WhiteBlock } from './white-block';

interface Props {
  appliedPromo: ValidatedPromo | null;
  onApply: (promo: ValidatedPromo) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}

export const CheckoutPromoInput: React.FC<Props> = ({
  appliedPromo,
  onApply,
  onClear,
  disabled,
  className,
}) => {
  const { setValue, watch } = useFormContext<CheckoutFormValues>();
  const promoCode = watch('promoCode') ?? '';
  const [loading, setLoading] = React.useState(false);

  const apply = async () => {
    const trimmed = promoCode.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Введите промокод');
      return;
    }
    try {
      setLoading(true);
      const promo = await Api.promo.validate(trimmed);
      setValue('promoCode', promo.code);
      onApply(promo);
      toast.success(`Промокод ${promo.code} применён`);
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? (err.response.data.message as string)
          : 'Не удалось применить промокод';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setValue('promoCode', '');
    onClear();
  };

  return (
    <WhiteBlock title='Промокод' className={cn(className)}>
      {appliedPromo ? (
        <div className='flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4'>
          <div className='flex items-center gap-3'>
            <Ticket className='h-5 w-5 text-emerald-600' />
            <div>
              <div className='font-semibold text-emerald-700'>
                {appliedPromo.code}
              </div>
              <div className='text-sm text-emerald-700/80'>
                {appliedPromo.freeDelivery
                  ? 'Бесплатная доставка'
                  : `Скидка ${appliedPromo.appliedAmount} ₽`}
                {appliedPromo.description ? ` · ${appliedPromo.description}` : ''}
              </div>
            </div>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={clear}
            disabled={disabled || loading}
          >
            <X className='h-4 w-4 mr-1' />
            Убрать
          </Button>
        </div>
      ) : (
        <div className='flex gap-3'>
          <Input
            placeholder='Введите промокод'
            value={promoCode}
            onChange={(event) =>
              setValue('promoCode', event.target.value.toUpperCase())
            }
            disabled={disabled || loading}
            className='uppercase tracking-wider'
          />
          <Button
            type='button'
            onClick={apply}
            disabled={disabled || loading || promoCode.trim().length === 0}
            loading={loading}
          >
            Применить
          </Button>
        </div>
      )}
    </WhiteBlock>
  );
};
