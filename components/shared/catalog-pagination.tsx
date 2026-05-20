'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../ui';
import { cn } from '@/lib/utils';
import type { CatalogPaginationState } from '@/lib/find-pizzas';

interface Props {
  pagination: CatalogPaginationState;
  className?: string;
}

const PAGE_WINDOW_SIZE = 7;

const getVisiblePages = (currentPage: number, totalPages: number) => {
  const halfWindow = Math.floor(PAGE_WINDOW_SIZE / 2);
  const start = Math.max(
    1,
    Math.min(currentPage - halfWindow, totalPages - PAGE_WINDOW_SIZE + 1)
  );
  const end = Math.min(totalPages, start + PAGE_WINDOW_SIZE - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

export const CatalogPagination: React.FC<Props> = ({
  pagination,
  className,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { page, totalPages, totalItems, pageSize } = pagination;

  if (totalPages <= 1) return null;

  const navigateToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextPage <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(nextPage));
    }

    router.push(params.size ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
  };

  const visiblePages = getVisiblePages(page, totalPages);
  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label='Пагинация каталога'
      className={cn('mt-12 flex flex-col items-center gap-4', className)}
    >
      <p className='text-sm text-gray-500'>
        Показаны {firstItem}–{lastItem} из {totalItems} товаров
      </p>

      <div className='flex flex-wrap justify-center gap-2'>
        <Button
          variant='outline'
          disabled={page === 1}
          onClick={() => navigateToPage(page - 1)}
        >
          Назад
        </Button>

        {visiblePages[0] > 1 && (
          <>
            <Button variant='ghost' onClick={() => navigateToPage(1)}>
              1
            </Button>
            {visiblePages[0] > 2 && (
              <span className='flex h-10 items-center px-2 text-gray-400'>
                …
              </span>
            )}
          </>
        )}

        {visiblePages.map((item) => (
          <Button
            key={item}
            variant={item === page ? 'default' : 'ghost'}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => navigateToPage(item)}
          >
            {item}
          </Button>
        ))}

        {visiblePages[visiblePages.length - 1] < totalPages && (
          <>
            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
              <span className='flex h-10 items-center px-2 text-gray-400'>
                …
              </span>
            )}
            <Button variant='ghost' onClick={() => navigateToPage(totalPages)}>
              {totalPages}
            </Button>
          </>
        )}

        <Button
          variant='outline'
          disabled={page === totalPages}
          onClick={() => navigateToPage(page + 1)}
        >
          Вперёд
        </Button>
      </div>
    </nav>
  );
};
