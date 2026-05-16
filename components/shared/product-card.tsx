import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { Title } from './title';
import { Button } from '../ui';
import { Plus } from 'lucide-react';
import { Ingredient } from '@prisma/client';

interface Props {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  className?: string;
  ingredients: Ingredient[];
}

export const ProductCard: React.FC<Props> = ({
  className,
  id,
  name,
  price,
  imageUrl,
  ingredients,
}) => {
  return (
    <div className={className}>
      <Link href={`/product/${id}`} scroll={false}>
        <div className='flex justify-center p-6 bg-secondary rounded-lg h-[260px]'>
          <Image src={imageUrl} alt={name} width={215} height={215} />
        </div>

        <Title text={name} size='sm' className='font-bold mt-2' />

        <p className='text-sm text-gray-500'>
          {ingredients.map((ingredient) => ingredient.name).join(', ')}
        </p>

        <div className='flex justify-between items-center mt-4'>
          <span className='text-[20px]'>
            от <b>{price} ₽</b>
          </span>

          <Button variant='secondary' className='text-base font-bold'>
            <Plus size={20} className='mr-2' />
            Добавить
          </Button>
        </div>
      </Link>
    </div>
  );
};
