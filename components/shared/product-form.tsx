'use client';

import { ProductWithRelations } from '@/@types/prisma';
import { useCartStore } from '@/store';
import React from 'react';
import toast from 'react-hot-toast';
import { ChoosePizzaForm } from './choose-pizza-form';
import { ChooseProductForm } from './choose-product-form';
import { ProductInfoBlocks } from './product-info-blocks';

interface Props {
  product: ProductWithRelations;
  onSubmit?: VoidFunction;
}

export const ProductForm: React.FC<Props> = ({
  product,
  onSubmit: _onSubmit,
}) => {
  const loading = useCartStore((state) => state.loading);
  const addCartItem = useCartStore((state) => state.addCartItem);
  const firstItem = product.items[0];
  const isPizzaForm = Boolean(firstItem.pizzaType);

  const stopUntil = product.stopUntil ? new Date(product.stopUntil) : null;
  const inStop = stopUntil ? stopUntil.getTime() > Date.now() : false;

  const onSubmit = async (productItemId?: number, ingredients?: number[]) => {
    if (inStop) {
      toast.error('Товар временно недоступен');
      return;
    }

    try {
      const itemId = productItemId ?? firstItem.id;

      await addCartItem({
        productItemId: itemId,
        ingredients,
      });

      toast.success(product.name + ' добавлена в корзину');

      _onSubmit?.();
    } catch (err) {
      toast.error('Не удалось добавить товар в корзину');
      console.error(err);
    }
  };

  return (
    <div className='flex flex-col w-full gap-6'>
      {isPizzaForm ? (
        <ChoosePizzaForm
          imageUrl={product.imageUrl}
          name={product.name}
          ingredients={product.ingredients}
          items={product.items}
          onSubmit={onSubmit}
          loading={loading || inStop}
        />
      ) : (
        <ChooseProductForm
          imageUrl={product.imageUrl}
          name={product.name}
          onSubmit={onSubmit}
          price={firstItem.price}
          loading={loading || inStop}
        />
      )}

      <ProductInfoBlocks product={product} />
    </div>
  );
};
