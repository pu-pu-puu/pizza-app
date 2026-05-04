'use client';

import React from 'react';
import { Title } from './title';
import { Input } from '../ui';
import { RangeSlider } from './range-slider';
import { CheckboxFiltersGroup } from './checkbox-filters-group';
import { useFilters, useIngredients, useQueryFilters } from '@/hooks';

interface Props {
  className?: string;
}

export const Filters: React.FC<Props> = ({ className }) => {
  const { ingredients, loading } = useIngredients();
  const filters = useFilters();

  useQueryFilters(filters);

  const items = ingredients.map((item) => ({
    value: String(item.id),
    text: item.name,
  }));

  const updatePrices = (prices: number[]) => {
    filters.setPrices('priceFrom', prices[0]);
    filters.setPrices('priceTo', prices[1]);
  };

  return (
    <div className={className}>
      <Title text='Фильтры' size='sm' className='font-extrabold mb-5' />

      <CheckboxFiltersGroup
        title='Тип теста'
        name='pizzaTypes'
        className='mb-5'
        onClickChange={filters.setPizzaTypes}
        selectedIds={filters.pizzaTypes}
        items={[
          { text: 'Тонкое', value: '1' },
          { text: 'Традиционное', value: '2' },
        ]}
      />

      <CheckboxFiltersGroup
        title='Размеры'
        name='sizes'
        className='mb-5'
        onClickChange={filters.setPizzaSizes}
        selectedIds={filters.sizes}
        items={[
          { text: '20 см', value: '20' },
          { text: '30 см', value: '30' },
          { text: '40 см', value: '40' },
        ]}
      />

      <div className='flex flex-col gap-5 mt-5 border-y border-y-neutral-100 py-6 pb-7'>
        <p className='font-bold'>Цена от и до:</p>
        <div className='flex gap-3'>
          <Input
            type='number'
            placeholder='0'
            min={0}
            max={1000}
            value={filters.prices.priceFrom ?? ''}
            onChange={(e) =>
              filters.setPrices('priceFrom', Number(e.target.value))
            }
          />
          <Input
            type='number'
            min={100}
            max={1000}
            placeholder='1000'
            value={filters.prices.priceTo ?? ''}
            onChange={(e) =>
              filters.setPrices('priceTo', Number(e.target.value))
            }
          />
        </div>

        <RangeSlider
          min={0}
          max={1000}
          step={10}
          value={[
            filters.prices.priceFrom || 0,
            filters.prices.priceTo || 1000,
          ]}
          onValueChange={updatePrices}
        />

        <CheckboxFiltersGroup
          title='Ингредиенты'
          limit={5}
          items={items}
          defaultItems={items.slice(0, 5)}
          loading={loading}
          onClickChange={filters.setIngredients}
          selectedIds={filters.selectedIngredients}
          name='ingredients'
        />
      </div>
    </div>
  );
};
