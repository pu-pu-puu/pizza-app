---
name: cart-testing
description: How to test pizza-app's cart flow end-to-end and the Neon HTTP adapter pitfalls that silently break Prisma writes. Use this when changing any code under app/api/cart, lib/update-cart-total-amount.ts, store/cart.ts, components/shared/product-form.tsx, or anything that does Prisma writes with nested relations / `include` clauses.
---

# pizza-app cart testing & Neon HTTP adapter pitfalls

## Neon HTTP adapter — what it silently breaks

`prisma/prisma-client.ts` uses `PrismaNeonHTTP` (the HTTP driver adapter, NOT the WebSocket one). The HTTP adapter **does not support interactive transactions**. Prisma silently uses interactive transactions to wrap several common write patterns, and those calls fail at runtime with:

```
prisma:error Transactions are not supported in HTTP mode
```

The known-bad patterns in this codebase:

1. **Nested-relation writes inside `create`/`update`:**
   ```ts
   prisma.cartItem.create({ data: { ..., ingredients: { connect: [{ id: 1 }] } } })  // BAD
   ```
   Workaround: split into a plain `create` followed by raw `INSERT`s into the implicit join table:
   ```ts
   const created = await prisma.cartItem.create({ data: { cartId, productItemId, quantity: 1 } });
   for (const id of ingredientIds) {
     await prisma.$executeRaw`INSERT INTO "_CartItemToIngredient" ("A", "B") VALUES (${created.id}, ${id})`;
   }
   ```
   The implicit M2M join table for `CartItem`↔`Ingredient` is `_CartItemToIngredient` with columns `A`=`CartItem.id`, `B`=`Ingredient.id` (Prisma default convention; verified against `pg_tables`).

2. **`update` or `create` combined with `include`:**
   ```ts
   prisma.cart.update({ where: ..., data: ..., include: { items: { ... } } })  // BAD
   ```
   Workaround: split into the mutation, then a separate `findFirst` with the same `include`.

3. **`prisma.$transaction(async tx => …)` interactive callbacks:** Always fail. Use the batch-array form `prisma.$transaction([op1, op2])` instead, but verify each individual op in the batch is itself single-statement (no `include`, no nested writes) — otherwise you hit pattern 1 or 2 inside the batch.

**Audit checklist when reviewing a new Prisma write in this repo:**
- `grep -rE 'prisma\.\w+\.(create|update|upsert)\(' --include='*.ts' --include='*.tsx'` — for each hit, check whether the `data` block has a nested-relation write (`{ relation: { connect } }`, `{ relation: { create } }`) or whether the call has an `include`/`select` with relations.
- `grep -rE 'prisma\.\$transaction\(' --include='*.ts'` — confirm any callback form is replaced with batch arrays.

Note: the storefront-side `AGENTS.md` file is stale on this point (says "Prisma 5 + default TCP"); the repo upgraded to Prisma 6 + Neon HTTP in PR #3. Believe the code, not the doc.

## Anonymous cart smoke test (no login required)

The cart is keyed off the `cartToken` cookie that `POST /api/cart` sets on first call. Auth is not required — you can exercise the full add-to-cart path with curl or in an incognito window.

```bash
cd /tmp && rm -f cookies.txt
# 1. Simple product (no ingredients) — exercises the basic insert path
curl -sc cookies.txt -X POST http://localhost:3000/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"productItemId":1}' -w '\nHTTP %{http_code}\n' -o /dev/null

# 2. Same product again — exercises the increment-quantity path (`cartItem.update`)
curl -sb cookies.txt -sc cookies.txt -X POST http://localhost:3000/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"productItemId":1}' -w '\nHTTP %{http_code}\n' -o /dev/null

# 3. Pizza with ingredient — exercises the M2M write path (the one most likely to break)
curl -sb cookies.txt -sc cookies.txt -X POST http://localhost:3000/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"productItemId":2,"ingredients":[2]}' -w '\nHTTP %{http_code}\n' -o /dev/null

# 4. Read it back
curl -sb cookies.txt http://localhost:3000/api/cart | jq '.totalAmount, (.items[] | {id, quantity, name: .productItem.product.name, ings: [.ingredients[].name]})'
```

All four should return `HTTP 200`. If `Test 3` returns 500 with `Transactions are not supported in HTTP mode`, the M2M write regression is back.

**Stable seed IDs** (from `prisma/seed.ts`):
- `productItem.id=1` — "Классика" (no pizza variant, no required ingredients) — best for the simple-product test
- `productItem.id=2` — "Пицца 1" small/традиционная — best for the pizza+ingredient test
- `ingredient.id=2` — "Оливки" (50 ₽) — the only ingredient guaranteed to exist after fresh seed

## Browser smoke test (recordable)

The full UX flow:

1. Open `http://localhost:3000` — confirm cart button (top right) reads `0 ₽` / `0` items. This is the empty precondition.
2. Click any non-pizza product card (e.g. "Классика") → `(.)product/[id]` intercepting route opens `ChooseProductModal` → click "Добавить в корзину за <price> ₽".
   - **Pass criterion:** cart button updates to `<price> ₽` / `1`. The success toast (Sonner, ~4 s) is hard to capture in screenshots — use the cart button as the canonical assertion.
3. Click any pizza card → `ChoosePizzaForm` → pick size/type → toggle one ingredient → click "Добавить в корзину за <price> ₽".
   - **Pass criterion:** cart button updates to `<sum> ₽` / `2`. The 450 ₽ figure (small + традиционная + Оливки) is the canonical sum if you used Пицца 1 default size/type.
   - **Known UX glitch unrelated to cart writes:** the modal sometimes does not auto-close via `router.back()` after submit; click the `×` button if it doesn't. Cart write itself succeeded if the cart button updated.
4. Click the cart button → drawer opens.
   - **Pass criterion:** drawer header reads "В корзине 2 товара" (NOT the empty-state "Корзина пустая"). Pizza row shows the chosen ingredient name in its details line. Footer "Итого" matches the cart button amount.

## Why the toast alone is not enough as an assertion

The cart store's `addCartItem` historically swallowed errors silently, so a 500 from the API would still trigger `toast.success` in `ProductForm`. After the PR #4 fix it re-throws, but anyone re-introducing the swallow would see the same false-positive again. Always assert on the cart-button amount or the drawer contents, not just the toast.
