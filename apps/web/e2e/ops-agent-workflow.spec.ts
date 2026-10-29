import { expect, test } from '@playwright/test';

test('does not expose the disabled Ops Agent through its legacy URL', async ({ page }) => {
  await page.goto('/van-hanh/ops-agent');

  await expect(page.getByRole('heading', { name: 'Liên kết này không tồn tại' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trợ lý vận hành' })).toHaveCount(0);
});
