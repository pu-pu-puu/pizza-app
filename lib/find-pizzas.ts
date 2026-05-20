import { prisma } from '@/prisma/prisma-client';
import { Prisma } from '@prisma/client';

export interface GetSearchParams {
  query?: string;
  sortBy?: string;
  sizes?: string;
  pizzaTypes?: string;
  ingredients?: string;
  priceFrom?: string;
  priceTo?: string;
  page?: string;
}

export const CATALOG_PAGE_SIZE = 24;

export interface CatalogPaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const DEFAULT_MIN_PRICE = 0;
const FIRST_PAGE = 1;

const parseNumberList = (value?: string) => {
  const values = value
    ?.split(',')
    .map(Number)
    .filter((item) => Number.isFinite(item) && item > 0);

  return values?.length ? values : undefined;
};

const parsePage = (value?: string) => {
  const page = Number(value);

  return Number.isInteger(page) && page > FIRST_PAGE ? page : FIRST_PAGE;
};

const buildProductWhere = (params: GetSearchParams, now: Date) => {
  const sizes = parseNumberList(params.sizes);
  const pizzaTypes = parseNumberList(params.pizzaTypes);
  const ingredients = parseNumberList(params.ingredients);
  const minPrice = Number(params.priceFrom) || DEFAULT_MIN_PRICE;
  const maxPrice = Number(params.priceTo) || undefined;

  const productItemsWhere: Prisma.ProductItemWhereInput = {
    price: {
      gte: minPrice,
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    },
    ...(sizes?.length ? { size: { in: sizes } } : {}),
    ...(pizzaTypes?.length ? { pizzaType: { in: pizzaTypes } } : {}),
  };

  return {
    active: true,
    OR: [{ stopUntil: null }, { stopUntil: { lte: now } }],
    ...(params.query
      ? { name: { contains: params.query, mode: Prisma.QueryMode.insensitive } }
      : {}),
    ...(ingredients?.length
      ? { ingredients: { some: { id: { in: ingredients } } } }
      : {}),
    items: { some: productItemsWhere },
  } satisfies Prisma.ProductWhereInput;
};

const buildProductInclude = (params: GetSearchParams) => {
  const sizes = parseNumberList(params.sizes);
  const pizzaTypes = parseNumberList(params.pizzaTypes);
  const minPrice = Number(params.priceFrom) || DEFAULT_MIN_PRICE;
  const maxPrice = Number(params.priceTo) || undefined;

  return {
    ingredients: true,
    items: {
      where: {
        price: {
          gte: minPrice,
          ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
        },
        ...(sizes?.length ? { size: { in: sizes } } : {}),
        ...(pizzaTypes?.length ? { pizzaType: { in: pizzaTypes } } : {}),
      },
      orderBy: { price: 'asc' },
    },
  } satisfies Prisma.ProductInclude;
};

const buildProductOrderBy = () =>
  [
    { category: { sortOrder: Prisma.SortOrder.asc } },
    { categoryId: Prisma.SortOrder.asc },
    { sortOrder: Prisma.SortOrder.asc },
    { id: Prisma.SortOrder.asc },
  ] satisfies Prisma.ProductOrderByWithRelationInput[];

export const findPizzas = async (params: GetSearchParams) => {
  const now = new Date();
  const page = parsePage(params.page);
  const skip = (page - FIRST_PAGE) * CATALOG_PAGE_SIZE;
  const where = buildProductWhere(params, now);
  const include = buildProductInclude(params);

  // The Neon HTTP adapter does not support transactions of any kind —
  // both $transaction(async tx => …) and $transaction([…]) throw
  // "Transactions are not supported in HTTP mode". Run the three
  // independent queries in parallel with Promise.all instead.
  const [categories, products, totalProducts] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    prisma.product.findMany({
      where,
      include,
      orderBy: buildProductOrderBy(),
      skip,
      take: CATALOG_PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  const productsByCategory = new Map<number, typeof products>();

  for (const product of products) {
    productsByCategory.set(product.categoryId, [
      ...(productsByCategory.get(product.categoryId) ?? []),
      product,
    ]);
  }

  return {
    categories: categories.map((category) => ({
      ...category,
      products: productsByCategory.get(category.id) ?? [],
    })),
    pagination: {
      page,
      pageSize: CATALOG_PAGE_SIZE,
      totalItems: totalProducts,
      totalPages: Math.max(
        FIRST_PAGE,
        Math.ceil(totalProducts / CATALOG_PAGE_SIZE),
      ),
    },
  };
};
