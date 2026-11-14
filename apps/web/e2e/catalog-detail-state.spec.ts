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

test('restores branch and manually entered rental period after reload', async ({ page }) => {
  await page.goto('/trang-phuc/ao-dai-lina?pickup=2028-04-01T09%3A00&returnAt=2028-04-03T09%3A00');
  const branch = page.locator('.feature-filters').getByRole('combobox', { name: 'Chi nhánh' });
  const pickup = page.getByRole('textbox', { name: 'Nhận', exact: true });
  const due = page.getByRole('textbox', { name: 'Trả', exact: true });
  await expect(pickup).toHaveValue('01/04/2028 09:00');

  await branch.selectOption('Chi nhánh Thủ Đức');
  await pickup.fill('05/04/2028 10:15');
  await due.fill('07/04/2028 16:30');
  const params = new URL(page.url()).searchParams;
  expect(params.get('branch')).toBe('Chi nhánh Thủ Đức');
  expect(params.has('pickup')).toBe(false);
  expect(params.has('returnAt')).toBe(false);

  await page.reload();
  await expect(branch).toHaveValue('Chi nhánh Thủ Đức');
  await expect(pickup).toHaveValue('05/04/2028 10:15');
  await expect(due).toHaveValue('07/04/2028 16:30');
  await due.clear();
  await page.reload();
  await expect(due).toHaveValue('');
});
