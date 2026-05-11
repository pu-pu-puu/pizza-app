import { ProductWithRelations } from '@/@types/prisma';
import { cn } from '@/lib/utils';
import React from 'react';

interface Props {
  product: ProductWithRelations;
  className?: string;
}

const formatRemaining = (until: Date) => {
  const diffMs = until.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч`;
  const days = Math.round(hours / 24);
  return `${days} дн`;
};

export const ProductInfoBlocks: React.FC<Props> = ({ product, className }) => {
  const allergens = product.allergens ?? [];
  const badges = product.badges ?? [];
  const stopUntil = product.stopUntil ? new Date(product.stopUntil) : null;
  const inStop = stopUntil ? stopUntil.getTime() > Date.now() : false;
  const remaining = inStop && stopUntil ? formatRemaining(stopUntil) : null;

  const nutrition: Array<{ label: string; value: number | null | undefined }> = [
    { label: 'Калории', value: product.calories },
    { label: 'Белки', value: product.proteins },
    { label: 'Жиры', value: product.fats },
    { label: 'Углеводы', value: product.carbs },
  ];

  const hasNutrition = nutrition.some(
    (item) => item.value !== null && item.value !== undefined,
  );

  const hasContent =
    inStop ||
    badges.length > 0 ||
    Boolean(product.description) ||
    Boolean(product.composition) ||
    hasNutrition ||
    allergens.length > 0;

  if (!hasContent) return null;

  return (
    <section className={cn('space-y-4', className)}>
      {inStop ? (
        <div className='rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 border border-amber-200'>
          Временно недоступно
          {remaining ? ` — ещё ${remaining}` : ''}.
        </div>
      ) : null}

      {badges.length > 0 ? (
        <div className='flex flex-wrap gap-2'>
          {badges.map((badge) => (
            <span
              key={badge}
              className='inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-900'
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}

      {product.description ? (
        <div>
          <h3 className='text-sm font-semibold text-gray-700 mb-1'>Описание</h3>
          <p className='text-sm text-gray-600 whitespace-pre-line'>
            {product.description}
          </p>
        </div>
      ) : null}

      {product.composition ? (
        <div>
          <h3 className='text-sm font-semibold text-gray-700 mb-1'>Состав</h3>
          <p className='text-sm text-gray-600 whitespace-pre-line'>
            {product.composition}
          </p>
        </div>
      ) : null}

      {hasNutrition ? (
        <div>
          <h3 className='text-sm font-semibold text-gray-700 mb-2'>
            Пищевая ценность (на порцию)
          </h3>
          <dl className='grid grid-cols-4 gap-2 text-center'>
            {nutrition.map(({ label, value }) => (
              <div
                key={label}
                className='rounded-md bg-gray-50 p-2 text-xs text-gray-700'
              >
                <dt className='text-[11px] text-gray-500'>{label}</dt>
                <dd className='mt-1 font-semibold text-gray-900'>
                  {value === null || value === undefined ? '—' : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {allergens.length > 0 ? (
        <div>
          <h3 className='text-sm font-semibold text-gray-700 mb-1'>
            Аллергены
          </h3>
          <p className='text-sm text-gray-600'>{allergens.join(', ')}</p>
        </div>
      ) : null}
    </section>
  );
};
