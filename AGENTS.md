# pizza-app

Customer-facing storefront for a Dodo-Pizza-style pizzeria, written in Next.js 14 (App Router) with TypeScript. Companion to the separate admin panel at https://github.com/cloudd3r/pizza-admin (same DB).

## Stack
- Next.js 14, React 18, TypeScript 5
- Prisma 5 + Neon (Postgres) — pooled `POSTGRES_URL`, direct `POSTGRES_URL_NON_POOLING`
- NextAuth v4: Credentials, GitHub, Google providers
- Zustand for client state (cart, category)
- Tailwind + Radix UI primitives + `lucide-react`
- React Hook Form + Zod for forms
- YooKassa for payments (Russian payment provider, NOT Stripe)
- Resend for transactional email (registration verification, order receipts)
- `react-dadata` for Russian address autocomplete

## Layout
- `app/(root)/` — public storefront (landing, product detail, profile, checkout)
- `app/(checkout)/` — checkout flow with its own layout (no header)
- `app/api/` — REST endpoints (cart, products, ingredients, stories, auth, checkout callback, users)
- `app/actions.ts` — server actions (`createOrder`, `registerUser`, etc.)
- `services/` — API client wrappers consumed by Zustand stores
- `services/dto/` — DTO types
- `store/` — Zustand stores (cart, category)
- `lib/` — pure helpers (price calc, cart enrichment, payment creation, email send)
- `prisma/` — `schema.prisma`, `seed.ts`, `prisma-client.ts` (basic singleton, NOT the HTTP-adapter version used in pizza-admin)
- `constants/` — auth options, checkout schema, pizza option catalogs
- `components/` — `ui/` (shadcn primitives), `shared/` (app-specific)
- `@types/` — ambient TS declarations (e.g. YooKassa callback shape)

## Domain model (`prisma/schema.prisma`)
- `User` (role: USER/ADMIN, has Cart, has Orders, optional VerificationCode)
- `Category` → `Product[]`
- `Product` → many `ProductItem` (size+pizzaType variants with own price), many `Ingredient`
- `Cart` (per user OR per anonymous `token` cookie) → `CartItem[]` → one `ProductItem` + extra `Ingredient[]`
- `Order` (snapshot — items stored as JSON, not relational), status: PENDING/SUCCEEDED/CANCELLED, optional `paymentId` from YooKassa
- `VerificationCode` for email verification
- `Story` + `StoryItem` for the Instagram-style stories carousel on the landing

## Commands
- `npm run dev` — Next.js dev on http://localhost:3000
- `npm run build` — production build (statically prerenders `/api/ingredients` and `/api/stories`, so DB must be reachable)
- `npm run lint`
- `npm run prisma:push` — apply `schema.prisma` to the DB without generating migration files (no `migrations/` folder is committed)
- `npm run prisma:studio` — Prisma Studio on :5555
- `npm run prisma:seed` — populate categories/ingredients/products/test users (`user@test.ru` / `admin@test.ru`, password `111111`)

## Environment variables
Local dev expects a `.env` at the repo root (gitignored). Required keys:
- `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` (Neon)
- `NEXT_PUBLIC_API_URL` (e.g. `/api`)
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `RESEND_API_KEY`
- `YOOKASSA_STORE_ID`, `YOOKASSA_API_KEY`, `YOOKASSA_CALLBACK_URL`
- `GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_DADATA_TOKEN` (public DaData suggestions token; configure domain restrictions in DaData)
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (image uploads — used by admin, mirrored here for parity)

## Conventions
- Server-side DB access goes through `prisma` from `@/prisma/prisma-client`. Never instantiate `PrismaClient` ad-hoc.
- All forms use React Hook Form + Zod schemas in `constants/` or `components/shared/`. Validation errors render via the shadcn `<FormMessage>` slot.
- API routes return `NextResponse.json(...)`. Errors are 4xx/5xx with `{ message }`-style bodies.
- Imports use the `@/...` alias (configured in `tsconfig.json`).
- Russian text is fine in UI, code identifiers and comments stay in English.

## Notes for AI assistants
- Do **not** modify `prisma/schema.prisma` without the user's explicit go-ahead — schema changes affect both repos and the live Neon DB.
- The seed script and Prisma version differ between this repo and pizza-admin (Prisma 5 here, Prisma 6 there with HTTP Neon adapter). Don't blindly copy `prisma-client.ts` between them.
- Payments are YooKassa, NOT Stripe — don't suggest Stripe-specific patterns.
- `react-dadata` is Russia-only address autocomplete; not relevant for non-RU UX work.
- `app/api/checkout/callback/route.ts` is the YooKassa webhook — its body shape lives in `@types/yookassa.d.ts`.
