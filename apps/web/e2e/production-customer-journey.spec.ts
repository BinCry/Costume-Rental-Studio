import { expect, test } from '@playwright/test';

test('guest discovers a costume and opens its detail page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Studio Trang Phục/i);
  await expect(page.getByRole('heading', { name: 'Bộ sưu tập trang phục' })).toBeVisible();

  const firstCostume = page.getByRole('button', { name: 'Xem nhanh' }).first();
  await expect(firstCostume).toBeVisible();
  await firstCostume.click();
  const preview = page.locator('section[aria-label^="Chi tiết "]');
  await expect(preview).toBeVisible();

  await preview.getByRole('button', { name: 'Xem đầy đủ' }).click();
  await expect(page).toHaveURL(/\/trang-phuc\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chọn size / màu' })).toBeVisible();
});

test('public catalog stays usable at phone width without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bộ sưu tập trang phục' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.getByRole('button', { name: 'Xem nhanh' }).first()).toBeVisible();
});

test('guest can open the rental estimate before account access', async ({
  page,
}) => {
  await page.goto('/dat-thue');
  await expect(page.getByRole('heading', { name: 'Gửi yêu cầu thuê' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chọn bộ, lịch & báo giá' })).toBeVisible();
  await expect(page.getByText('Đăng nhập để tiếp tục')).toHaveCount(0);
});
