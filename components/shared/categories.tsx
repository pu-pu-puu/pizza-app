'use client';

import { cn } from '@/lib/utils';
import { useCategoryStore } from '@/store/category';
import { Category } from '@prisma/client';
import React from 'react';

interface Props {
  items: Category[];
  className?: string;
}

export const Categories: React.FC<Props> = ({ className, items }) => {
  const categoryActiveId = useCategoryStore((state) => state.activeId);
  const setActiveCategoryIdFromClick = useCategoryStore(
    (state) => state.setActiveIdFromClick
  );

  return (
    <div
      className={cn('inline-flex gap-1 bg-gray-50 p-1 rounded-2xl', className)}
    >
      {items.map(({ name, id }) => (
        <a
          className={cn(
            'flex items-center font-bold h-11 rounded-2xl px-5',
            categoryActiveId === id &&
              'bg-white shadow-sm shadow-gray-200 text-primary'
          )}
          key={id}
          href={`/#${name}`}
          onClick={() => setActiveCategoryIdFromClick(id)}
        >
          <span>{name}</span>
        </a>
      ))}
    </div>
  );
};
