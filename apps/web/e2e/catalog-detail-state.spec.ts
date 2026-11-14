import { expect, test } from '@playwright/test';

test('keeps the selected variant in the detail URL after reload', async ({ page }) => {
  await page.goto('/trang-phuc/suit-aria?variantCode=SUIT-ARIA-L&category=Suit');
  const variants = page.locator('.variant-pills').getByRole('button');
  const variant = variants.getByText(/^M ·/);
  await expect(variants.getByText(/^L ·/)).toHaveAttribute('aria-pressed', 'true');
  await variant.click();
  await expect(variant).toHaveAttribute('aria-pressed', 'true');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/trang-phuc/suit-aria');
  expect(url.searchParams.get('variantCode')).toBe('SUIT-ARIA-M');
  expect(url.searchParams.get('category')).toBe('Suit');

  await page.reload();
  await expect(variant).toHaveAttribute('aria-pressed', 'true');
});
