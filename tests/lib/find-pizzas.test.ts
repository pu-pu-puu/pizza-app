import { describe, expect, it, vi } from 'vitest';

import { CATALOG_PAGE_SIZE, findPizzas } from '@/lib/find-pizzas';
import { prisma } from '@/prisma/prisma-client';

describe('findPizzas', () => {
  it('pushes catalog filters and pagination into Prisma queries', async () => {
    const category = {
      id: 1,
      name: 'Пиццы',
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const product = {
      id: 10,
      categoryId: 1,
      name: 'Маргарита',
      imageUrl: '/pizza.png',
      active: true,
      sortOrder: 1,
      description: null,
      composition: null,
      calories: null,
      proteins: null,
      fats: null,
      carbs: null,
      allergens: [],
      badges: [],
      stopUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ingredients: [
        { id: 2, name: 'Оливки', imageUrl: '/olive.png', price: 50 },
      ],
      items: [{ id: 20, productId: 10, price: 450, size: 30, pizzaType: 1 }],
    };

    vi.mocked(prisma.category.findMany).mockResolvedValue([category]);
    vi.mocked(prisma.product.findMany).mockResolvedValue([product]);
    vi.mocked(prisma.product.count).mockResolvedValue(50);

    const result = await findPizzas({
      page: '2',
      sizes: '30',
      pizzaTypes: '1',
      ingredients: '2',
      priceFrom: '300',
      priceTo: '700',
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: CATALOG_PAGE_SIZE,
        take: CATALOG_PAGE_SIZE,
        where: expect.objectContaining({
          active: true,
          ingredients: { some: { id: { in: [2] } } },
          items: {
            some: {
              price: { gte: 300, lte: 700 },
              size: { in: [30] },
              pizzaType: { in: [1] },
            },
          },
        }),
        include: expect.objectContaining({
          items: expect.objectContaining({
            where: {
              price: { gte: 300, lte: 700 },
              size: { in: [30] },
              pizzaType: { in: [1] },
            },
          }),
        }),
      })
    );
    expect(result.categories[0].products).toEqual([product]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: CATALOG_PAGE_SIZE,
      totalItems: 50,
      totalPages: 3,
    });
  });
});
