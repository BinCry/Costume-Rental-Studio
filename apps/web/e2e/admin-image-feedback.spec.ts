import { expect, test } from '@playwright/test';

test('explains unsupported images at the file input', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('costume-rental.access-token', 'admin-test-token'),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          id: 'admin-1',
          displayName: 'Quản trị',
          roles: [
            {
              roleCode: 'ADMIN',
              actorGroup: 'ADMIN',
              branchId: 'branch-1',
              permissions: [{ code: 'catalog.read.all' }, { code: 'catalog.manage.all' }],
            },
          ],
        },
      },
    }),
  );
  const branches = { items: [{ id: 'branch-1', name: 'Chi nhánh thử', status: 'ACTIVE' }] };
  await page.route('**/api/v1/branches?**', (route) =>
    route.fulfill({ json: { success: true, data: branches } }),
  );
  await page.route('**/api/v1/public/branches**', (route) =>
    route.fulfill({ json: { success: true, data: branches } }),
  );
  const model = { id: 'model-1', modelCode: 'TEST', name: 'Mẫu thử', categoryId: 'category-1' };
  await page.route(/\/api\/v1\/catalog\/models\?/, (route) =>
    route.fulfill({ json: { success: true, data: { items: [model] } } }),
  );
  await page.route(/\/api\/v1\/catalog\/variants\?/, (route) =>
    route.fulfill({ json: { success: true, data: { items: [] } } }),
  );
  await page.route('**/api/v1/catalog/models/model-1/media', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.route('**/api/v1/catalog/categories**', (route) =>
    route.fulfill({
      json: { success: true, data: { items: [{ id: 'category-1', name: 'Trang phục' }] } },
    }),
  );
  await page.route('**/api/v1/catalog/models/model-1/accessories', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.goto('/quan-tri/danh-muc');
  await page.getByRole('button', { name: 'Ảnh sản phẩm' }).click();
  const input = page.getByLabel('Chọn ảnh', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: 'test.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });
  await expect(input).toHaveAccessibleDescription('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  const upload = page.getByRole('button', { name: 'Thêm ảnh', exact: true });
  await expect(upload).toBeDisabled();
  await input.setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from('PNG'),
  });
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  await expect(upload).toBeEnabled();
});
