'use client';

import { cn } from '@/lib/utils';
import { Api } from '@/services/api-client';
import { Product } from '@prisma/client';
import { Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { useDebounce } from 'react-use';

interface Props {
  className?: string;
}

export const SearchInput: React.FC<Props> = ({ className }) => {
  const [focused, setFocused] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [products, setProducts] = React.useState<Product[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const fetchProducts = React.useCallback((query: string) => {
    Api.products.search(query).then((items) => setProducts(items));
  }, []);

  useDebounce(
    () => {
      fetchProducts(searchQuery);
    },
    300,
    [fetchProducts, searchQuery]
  );

  const openSearch = () => {
    setFocused(true);
    fetchProducts(searchQuery);
  };

  const onClickItem = () => {
    setFocused(false);
    setSearchQuery('');
    setProducts([]);
    inputRef.current?.blur();
  };

  return (
    <>
      {focused && (
        <div
          className={cn(
            'fixed top-0 left-0 right-0 bottom-0 bg-black/50 z-30',
            className
          )}
          onClick={() => setFocused(false)}
        />
      )}

      <div
        className={cn('flex rounded-2xl flex-1 relative h-11 z-30', className)}
      >
        <Search className='absolute top-1/2 left-3 translate-y-[-50%] text-gray-400' />
        <input
          ref={inputRef}
          className='rounded-2xl outline-none w-full bg-gray-100 pl-11'
          type='text'
          placeholder='Найти пиццу...'
          onFocus={openSearch}
          onClick={openSearch}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {products.length > 0 && (
          <div
            className={cn(
              'absolute w-full bg-white rounded-xl py-2 top-14 shadow-md transition-all duration-500 invisible opacity-0 z-30',
              focused && 'visible opacity-100 top-12'
            )}
          >
            {products.map((product) => (
              <Link
                onClick={onClickItem}
                className='flex items-center gap-3 w-full px-3 py-2 hover:bg-primary/10'
                href={`/product/${product.id}`}
                scroll={false}
                key={product.id}
              >
                <Image
                  className='rounded-sm h-8 w-8'
                  src={product.imageUrl}
                  alt={product.name}
                  width={32}
                  height={32}
                />
                <span>{product.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
