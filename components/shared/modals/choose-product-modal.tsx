'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import React from 'react';
import { useRouter } from 'next/navigation';
import { ProductWithRelations } from '@/@types/prisma';
import { ProductForm } from '../product-form';

interface Props {
  product: ProductWithRelations;
  className?: string;
}

export const ChooseProductModal: React.FC<Props> = ({ product, className }) => {
  const router = useRouter();
  const handleClose = React.useCallback(() => {
    router.replace('/', { scroll: false });
  }, [router]);

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className={cn(
          'p-0 w-[1060px] max-w-[1060px] min-h-[500px] bg-white overflow-hidden',
          className
        )}
      >
        <DialogTitle className='sr-only'>Выбор продукта</DialogTitle>
        <DialogDescription className='sr-only'>
          Настройте параметры продукта перед добавлением в корзину.
        </DialogDescription>
        <ProductForm product={product} onSubmit={handleClose} />
      </DialogContent>
    </Dialog>
  );
};
