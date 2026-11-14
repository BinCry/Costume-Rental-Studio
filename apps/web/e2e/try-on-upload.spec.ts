import { expect, test } from '@playwright/test';

// Build the standalone Try-On app into apps/web/public/try-on before running this spec locally.
test('labels the garment upload dialog and categories in Vietnamese', async ({ page }) => {
  await page.goto('/try-on/index.html');
  await page.getByRole('button', { name: 'Tải lên trang phục của bạn' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tải lên trang phục của bạn' });
  await expect(dialog.getByLabel('Ảnh mặt trước')).toBeVisible();
  const category = dialog.getByRole('combobox', { name: 'Loại trang phục' });
  await expect(category.getByRole('option')).toHaveText([
    'Áo dáng dài',
    'Đầm',
    'Áo kiểu',
    'Áo sơ mi',
    'Áo thun',
    'Quần',
    'Đầm dài',
  ]);
  await category.selectOption({ label: 'Quần' });
  await expect(category).toHaveValue('pants');
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(dialog).toBeHidden();
});
