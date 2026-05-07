---
name: modal-route-testing
description: Test pizza-app intercepted product modal routes and category-history behavior. Use when changing app/(root)/@modal, product links, category navigation, or choose-product-modal close behavior.
---

# Modal Route Testing

Use this when verifying product modal behavior that depends on Next.js intercepted/parallel routes.

## Devin Secrets Needed

- No external secrets are required for modal/category route testing.
- Local runtime still needs non-secret dev env values such as `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, plus Postgres URLs pointing at a seeded local database. Do not use payment/OAuth/DaData secrets for this flow unless the tested change requires checkout or address autocomplete.

## Local Runtime Setup

1. Use `npm ci` if dependencies are missing.
2. Start or reuse a local Postgres database, then run `npm run prisma:push` and `npm run prisma:seed` if the DB is empty.
3. Start `npm run dev` on `http://localhost:3000` with local `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`.
4. Verify client assets load before trusting modal-route behavior:
   - Open the app in Chrome and confirm it is styled.
   - If product clicks become full page loads instead of modals, check `_next/static/...` assets for 404s.
   - If assets are stale/missing, stop Next, remove `.next`, restart `npm run dev`, and re-test.

## Primary Test Flow

1. Open `http://localhost:3000`.
2. Click category links by visible text: `Пиццы`, `Напитки`, `Закуски`, `Кексы`.
3. Assert the URL ends at `/#Кексы` and no modal is open.
4. Click a visible product from the final category, e.g. `Кексы 3`.
5. Assert an intercepted modal opens at `/product/<id>` and the dialog contains the clicked product name.
6. Click the modal `X` exactly once.
7. Assert the modal disappears, the URL returns to `/` or the last category hash, and the browser does not step through previous category hashes.
8. Wait briefly and assert the modal stays closed.

## Evidence Tips

- Record the browser and annotate: precondition, category hash result, modal open, one-click close, post-wait stability.
- Prefer selector/text-based clicks over fixed coordinates; local layout can shift while images/fonts load.
- Include before/after screenshots: modal open and after one close click.
