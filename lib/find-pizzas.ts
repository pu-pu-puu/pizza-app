import { prisma } from '@/prisma/prisma-client';
import type { Prisma } from '@prisma/client';

export interface GetSearchParams {
  query?: string;
  sortBy?: string;
  sizes?: string;
  pizzaTypes?: string;
  ingredients?: string;
  priceFrom?: string;
  priceTo?: string;
}

const DEFAULT_MIN_PRICE = 0;
const CATEGORIES_CACHE_DURATION_MS = 15000;

const categoriesQuery = {
  include: {
    products: {
      orderBy: {
        id: 'desc',
      },
      include: {
        ingredients: true,
        items: {
          orderBy: {
            price: 'asc',
          },
        },
      },
    },
  },
  orderBy: {
    id: 'asc',
  },
} satisfies Prisma.CategoryFindManyArgs;

type CategoryWithProducts = Prisma.CategoryGetPayload<typeof categoriesQuery>;

let cachedCategories:
  | {
      data: CategoryWithProducts[];
      expiry: number;
    }
  | undefined;

const getCategories = async () => {
  const now = Date.now();

  if (cachedCategories && cachedCategories.expiry > now) {
    return cachedCategories.data;
  }

  try {
    const data = await prisma.category.findMany(categoriesQuery);
    cachedCategories = {
      data,
      expiry: now + CATEGORIES_CACHE_DURATION_MS,
    };

    return data;
  } catch (error) {
    if (cachedCategories) {
      cachedCategories.expiry = now + 5000;
      return cachedCategories.data;
    }

    throw error;
  }
};

const parseNumberList = (value?: string) => {
  const values = value
    ?.split(',')
    .map(Number)
    .filter((item) => Number.isFinite(item) && item > 0);

  return values?.length ? values : undefined;
};

export const findPizzas = async (params: GetSearchParams) => {
  const sizes = parseNumberList(params.sizes);
  const pizzaTypes = parseNumberList(params.pizzaTypes);
  const ingredientsIdArr = parseNumberList(params.ingredients);

  const minPrice = Number(params.priceFrom) || DEFAULT_MIN_PRICE;
  const maxPrice = Number(params.priceTo) || undefined;

  const categories = await getCategories();

  return categories.map((category) => ({
    ...category,
    products: category.products
      .map((product) => {
        const matchesIngredients =
          !ingredientsIdArr?.length ||
          product.ingredients.some((ingredient) =>
            ingredientsIdArr.includes(ingredient.id),
          );

        return {
          ...product,
          items: matchesIngredients
            ? product.items.filter((item) => {
                const matchesPrice =
                  item.price >= minPrice &&
                  (maxPrice === undefined || item.price <= maxPrice);
                const matchesSize =
                  !sizes?.length ||
                  (item.size !== null && sizes.includes(item.size));
                const matchesPizzaType =
                  !pizzaTypes?.length ||
                  (item.pizzaType !== null &&
                    pizzaTypes.includes(item.pizzaType));

                return matchesPrice && matchesSize && matchesPizzaType;
              })
            : [],
        };
      })
      .filter((product) => product.items.length > 0),
  }));
};
