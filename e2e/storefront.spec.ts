import { test, expect, type Page } from '@playwright/test';

/**
 * Storefront smoke. Five happy-path scenarios — no real checkout submit so we
 * don't hit YooKassa or persist garbage orders against the live Neon DB.
 */

// Helper: open the first pizza card on the landing page and follow the link to
// its product page. Pizzas are rendered as <a href="/product/<id>"> wrappers
// around <img alt="<product name>">. We return the product name so individual
// tests can assert against it.
const openFirstProduct = async (page: Page): Promise<string> => {
  await page.goto('/');

  const firstProductLink = page.locator('a[href^="/product/"]').first();
  await expect(firstProductLink).toBeVisible();

  const name = (await firstProductLink.locator('img').first().getAttribute('alt')) ?? '';
  expect(name.length).toBeGreaterThan(0);

  await firstProductLink.click();
  await page.waitForURL(/\/product\/\d+/);
  return name;
};

test.describe('storefront smoke', () => {
  test('homepage renders the pizza grid', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Все пиццы' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Next Pizza/i })).toBeVisible();

    const productLinks = page.locator('a[href^="/product/"]');
    await expect.poll(() => productLinks.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('product detail page loads with add-to-cart button', async ({ page }) => {
    const productName = await openFirstProduct(page);

    await expect(page.getByRole('heading', { name: productName })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Добавить в корзину/ }),
    ).toBeVisible();
  });

  test('adding a product increments the cart counter', async ({ page }) => {
    await openFirstProduct(page);

    // Cart button shows the item count next to the shopping-cart icon.
    // Before any add the storefront renders "0 ₽" / count 0.
    const addButton = page.getByRole('button', { name: /Добавить в корзину/ });
    await addButton.click();

    // The cart store posts to /api/cart and updates totalAmount + items.
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/cart') && resp.request().method() !== 'GET',
      { timeout: 20_000 },
    );

    // The "0 ₽" badge in the header should now show a non-zero amount.
    const cartAmount = page.locator('header').getByText(/\d+\s*₽/).first();
    await expect(cartAmount).not.toHaveText(/^0\s*₽$/);
  });

  test('cart drawer opens and shows the added product', async ({ page }) => {
    const productName = await openFirstProduct(page);

    await page.getByRole('button', { name: /Добавить в корзину/ }).click();
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/cart') && resp.request().method() !== 'GET',
      { timeout: 20_000 },
    );

    // The cart trigger is the header button containing the totalAmount. Opening
    // it pops a Radix Sheet (role="dialog") with cart items.
    const cartTrigger = page.locator('header button').filter({ hasText: /₽/ }).first();
    await cartTrigger.click();

    // Scope assertions to the drawer dialog so we don't false-match the
    // product name shown in the underlying page content.
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/В корзине/)).toBeVisible();
    await expect(drawer.getByText(productName).first()).toBeVisible();
    await expect(
      drawer.getByRole('link', { name: /Оформить заказ/ }),
    ).toBeVisible();
  });

  test('checkout page renders the order form', async ({ page }) => {
    // Seed an item into the cart first so the page is not in the empty state.
    await openFirstProduct(page);
    await page.getByRole('button', { name: /Добавить в корзину/ }).click();
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/cart') && resp.request().method() !== 'GET',
      { timeout: 20_000 },
    );

    await page.goto('/checkout');

    await expect(
      page.getByRole('heading', { name: 'Оформление заказа' }),
    ).toBeVisible();

    // CheckoutPersonalForm uses placeholders (no <label> element) for the
    // first/last name / email / phone inputs.
    await expect(page.getByPlaceholder('Имя')).toBeVisible();
    await expect(page.getByPlaceholder('Фамилия')).toBeVisible();
    await expect(page.getByPlaceholder('E-Mail')).toBeVisible();
    await expect(page.getByPlaceholder('Телефон')).toBeVisible();
  });
});
