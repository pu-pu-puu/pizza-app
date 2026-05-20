# pizza-app

Customer-facing storefront for a Dodo-Pizza-style pizzeria — Next.js 14 (App Router) + Prisma 6 + Neon Postgres (HTTP adapter) + NextAuth (Credentials + GitHub + Google + Phone OTP) + YooKassa.

Companion to the admin panel [`pizza-admin`](https://github.com/pu-pu-puu/pizza-admin). **Both repos share the same Neon Postgres DB and the same `prisma/schema.prisma`** — any schema change affects both.

See [`AGENTS.md`](./AGENTS.md) for the architecture/conventions cheat sheet (stack, layout, gotchas).

## Quick start

```bash
git clone https://github.com/pu-pu-puu/pizza-app.git
cd pizza-app
npm install            # postinstall runs `prisma generate`
cp .env.example .env   # fill in the variables below
npm run dev            # http://localhost:3000
```

## Environment variables

A local `.env` is required (gitignored). All keys are listed in [`.env.example`](./.env.example):

- `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` — Neon Postgres (same DB as `pizza-admin`)
- `NEXT_PUBLIC_API_URL` — e.g. `/api`
- `NEXTAUTH_SECRET` (random ≥32-byte secret), `NEXTAUTH_URL` (e.g. `http://localhost:3000`)
- `RESEND_API_KEY` — transactional email (registration verification, order receipts)
- `YOOKASSA_STORE_ID`, `YOOKASSA_API_KEY`, `YOOKASSA_CALLBACK_URL` — Russian payment provider (NOT Stripe)
- `GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth providers
- `NEXT_PUBLIC_DADATA_TOKEN` — DaData suggestions token for Russian address autocomplete (configure domain restrictions in DaData dashboard)
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` — image uploads (shared preset with the admin)
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — optional, error monitoring activates only when DSN is set; source maps upload only when auth token is set

## Database

Schema is in [`prisma/schema.prisma`](./prisma/schema.prisma) (shared with `pizza-admin`). No migration files are committed — the schema is pushed directly with `prisma db push`.

```bash
npm run prisma:push      # apply schema.prisma to Neon
npm run prisma:studio    # Prisma Studio on http://localhost:5555
npm run prisma:seed      # categories/ingredients/products/test users
```

Test users created by the seed: `user@test.ru` (USER) and `admin@test.ru` (ADMIN). Default password is `111111`.

### Prisma client

Both repos use **Prisma 6 + the Neon HTTP adapter** (`@prisma/adapter-neon`). The Neon HTTP adapter does **not** support transactions of any kind: both `prisma.$transaction(async tx => …)` and `prisma.$transaction([...])` throw `Transactions are not supported in HTTP mode` at runtime. Issue multiple writes as plain sequential `await prisma.x.update(...)` calls.

[`prisma/prisma-client.ts`](./prisma/prisma-client.ts) wraps the client with a fetch timeout (`NEON_FETCH_TIMEOUT_MS`, default 4s) and a retry-on-transient-error layer (`ECONNRESET`, `fetch failed`, `AbortError`, etc.). Do not bypass it by importing `PrismaClient` directly.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (statically prerenders `/api/ingredients` and `/api/stories`, so DB must be reachable) |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (`next lint`) |
| `npm run prisma:push` | Push `schema.prisma` to Neon |
| `npm run prisma:studio` | Prisma Studio |
| `npm run prisma:seed` | Seed the DB (uses `ts-node`) |
| `npm test` | Vitest unit/integration tests (`vitest run`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright smoke tests |

## Deployment

The app is deployed on [Vercel](https://vercel.com/) at https://pizza-app-s1aw3n.vercel.app. CI runs lint + build + Vitest + a Playwright smoke job on every PR.

Production env vars are set in the Vercel dashboard (Project Settings → Environment Variables). The YooKassa webhook URL must point at `${NEXTAUTH_URL}/api/checkout/callback`. Source maps are uploaded to Sentry on every production build when `SENTRY_AUTH_TOKEN` is set.

## Conventions

- Russian-language UI; code identifiers, comments and PR descriptions stay in English.
- Server-side DB access goes through `prisma` from `@/prisma/prisma-client`. Never instantiate `PrismaClient` ad-hoc.
- All forms use React Hook Form + Zod schemas in `constants/` or `components/shared/`. Validation errors render via the shadcn `<FormMessage>` slot.
- API routes return `NextResponse.json(...)`. Errors are 4xx/5xx with `{ message }`-style bodies.
- Imports use the `@/...` alias.
- Do **not** modify `prisma/schema.prisma` without coordinating with `pizza-admin` (shared DB + shared schema).
- Payments are YooKassa, NOT Stripe. The webhook body shape lives in [`@types/yookassa.d.ts`](./@types/yookassa.d.ts).
