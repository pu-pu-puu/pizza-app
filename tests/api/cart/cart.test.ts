import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cart/route";
import { findOrCreateCart } from "@/lib/find-or-create-cart";
import { updateCartTotalAmount } from "@/lib/update-cart-total-amount";
import { prisma } from "@/prisma/prisma-client";

const URL = "http://localhost/api/cart";

const buildCartGet = (cookie?: string) =>
  new NextRequest(URL, {
    method: "GET",
    headers: cookie ? { cookie: `cartToken=${cookie}` } : {},
  });

const buildCartPost = (body: unknown, cookie?: string) =>
  new NextRequest(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `cartToken=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe("GET /api/cart", () => {
  it("returns an empty cart (no DB hit) when there is no cartToken cookie", async () => {
    const res = await GET(buildCartGet());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalAmount: 0, items: [] });
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it("returns the cart payload when a cartToken cookie is present", async () => {
    const fakeCart = {
      id: 1,
      token: "tok-123",
      totalAmount: 500,
      items: [{ id: 7, quantity: 2 }],
    };
    vi.mocked(prisma.cart.findFirst).mockResolvedValue(
      fakeCart as unknown as Awaited<ReturnType<typeof prisma.cart.findFirst>>,
    );

    const res = await GET(buildCartGet("tok-123"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeCart);
    expect(prisma.cart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ token: "tok-123" }] },
      }),
    );
  });
});

describe("POST /api/cart", () => {
  const productItem = (
    overrides: Partial<{ active: boolean; stopUntil: Date | null }> = {},
  ) => ({
    id: 11,
    productId: 1,
    product: {
      active: overrides.active ?? true,
      stopUntil: overrides.stopUntil ?? null,
      name: "Margherita",
    },
  });

  const stubCart = (token: string) =>
    vi.mocked(findOrCreateCart).mockResolvedValue({
      id: 1,
      token,
      totalAmount: 0,
    } as unknown as Awaited<ReturnType<typeof findOrCreateCart>>);

  it("returns 404 when the requested productItem does not exist", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(null);

    const res = await POST(
      buildCartPost({ productItemId: 999 }, "tok-existing"),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).message).toMatch(/Товар не найден/);
    expect(prisma.cartItem.findMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the underlying product is inactive", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem({ active: false }) as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );

    const res = await POST(
      buildCartPost({ productItemId: 11 }, "tok-existing"),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/Товар недоступен/);
  });

  it("returns 409 when the product is on temporary stop (stopUntil in the future)", async () => {
    stubCart("tok-existing");
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem({ stopUntil: tomorrow }) as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );

    const res = await POST(
      buildCartPost({ productItemId: 11 }, "tok-existing"),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/временно недоступен/);
  });

  it("increments quantity when the same productItem (with matching ingredients) is already in the cart", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem() as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );
    vi.mocked(prisma.cartItem.findMany).mockResolvedValue([
      {
        id: 50,
        cartId: 1,
        productItemId: 11,
        quantity: 1,
        ingredients: [],
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.cartItem.findMany>>);
    vi.mocked(updateCartTotalAmount).mockResolvedValue({
      totalAmount: 1000,
      items: [],
    } as unknown as Awaited<ReturnType<typeof updateCartTotalAmount>>);

    const res = await POST(
      buildCartPost({ productItemId: 11, ingredients: [] }, "tok-existing"),
    );

    expect(res.status).toBe(200);
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { quantity: 2 },
    });
    expect(prisma.cartItem.create).not.toHaveBeenCalled();
  });

  it("creates a new cartItem when the same productItem has no ingredients and the new one has extras", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem() as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );
    vi.mocked(prisma.cartItem.findMany).mockResolvedValue([
      {
        id: 50,
        cartId: 1,
        productItemId: 11,
        quantity: 1,
        ingredients: [],
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.cartItem.findMany>>);
    vi.mocked(prisma.cartItem.create).mockResolvedValue({
      id: 77,
    } as unknown as Awaited<ReturnType<typeof prisma.cartItem.create>>);
    vi.mocked(updateCartTotalAmount).mockResolvedValue({
      totalAmount: 1000,
      items: [],
    } as unknown as Awaited<ReturnType<typeof updateCartTotalAmount>>);

    const res = await POST(
      buildCartPost({ productItemId: 11, ingredients: [2, 3] }, "tok-existing"),
    );

    expect(res.status).toBe(200);
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 1, productItemId: 11, quantity: 1 },
    });
  });

  it("creates a new cartItem when the same productItem only has a subset of ingredients", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem() as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );
    vi.mocked(prisma.cartItem.findMany).mockResolvedValue([
      {
        id: 50,
        cartId: 1,
        productItemId: 11,
        quantity: 1,
        ingredients: [{ id: 2 }],
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.cartItem.findMany>>);
    vi.mocked(prisma.cartItem.create).mockResolvedValue({
      id: 77,
    } as unknown as Awaited<ReturnType<typeof prisma.cartItem.create>>);
    vi.mocked(updateCartTotalAmount).mockResolvedValue({
      totalAmount: 1000,
      items: [],
    } as unknown as Awaited<ReturnType<typeof updateCartTotalAmount>>);

    const res = await POST(
      buildCartPost({ productItemId: 11, ingredients: [2, 3] }, "tok-existing"),
    );

    expect(res.status).toBe(200);
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 1, productItemId: 11, quantity: 1 },
    });
  });

  it("increments quantity when ingredients match regardless of order", async () => {
    stubCart("tok-existing");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem() as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );
    vi.mocked(prisma.cartItem.findMany).mockResolvedValue([
      {
        id: 50,
        cartId: 1,
        productItemId: 11,
        quantity: 1,
        ingredients: [{ id: 3 }, { id: 2 }],
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.cartItem.findMany>>);
    vi.mocked(updateCartTotalAmount).mockResolvedValue({
      totalAmount: 1000,
      items: [],
    } as unknown as Awaited<ReturnType<typeof updateCartTotalAmount>>);

    const res = await POST(
      buildCartPost({ productItemId: 11, ingredients: [2, 3] }, "tok-existing"),
    );

    expect(res.status).toBe(200);
    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { quantity: 2 },
    });
    expect(prisma.cartItem.create).not.toHaveBeenCalled();
  });

  it("creates a new cartItem (and writes the cartToken cookie) when nothing matches", async () => {
    stubCart("tok-fresh");
    vi.mocked(prisma.productItem.findUnique).mockResolvedValue(
      productItem() as unknown as Awaited<
        ReturnType<typeof prisma.productItem.findUnique>
      >,
    );
    vi.mocked(prisma.cartItem.findMany).mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof prisma.cartItem.findMany>>,
    );
    vi.mocked(prisma.cartItem.create).mockResolvedValue({
      id: 77,
    } as unknown as Awaited<ReturnType<typeof prisma.cartItem.create>>);
    vi.mocked(updateCartTotalAmount).mockResolvedValue({
      totalAmount: 1000,
      items: [],
    } as unknown as Awaited<ReturnType<typeof updateCartTotalAmount>>);

    const res = await POST(
      buildCartPost({ productItemId: 11, ingredients: [2, 3] }, "tok-fresh"),
    );

    expect(res.status).toBe(200);
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 1, productItemId: 11, quantity: 1 },
    });
    // Two ingredient join-table inserts.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    // The handler always re-sets the cookie so the client picks up any
    // newly minted token on first POST.
    expect(res.headers.get("set-cookie")).toMatch(/cartToken=tok-fresh/);
  });
});
