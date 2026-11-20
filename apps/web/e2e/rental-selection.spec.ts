import { expect, test } from '@playwright/test';

test('rental costume selection can be removed and selected again', async ({ page }) => {
  await page.goto('/dat-thue');
  await expect(page.getByRole('heading', { name: 'Gửi yêu cầu thuê' })).toBeVisible();

  const selectedCostume = page.locator('.booking-costume[aria-pressed="true"]').first();
  await expect(selectedCostume).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bộ đã chọn · 1' })).toBeVisible();
  const selectedCostumeLabel = await selectedCostume.getAttribute('aria-label');
  const costumeName = selectedCostumeLabel?.replace(/^Bỏ /, '').replace(/ khỏi yêu cầu thuê$/, '');
  expect(costumeName).toBeTruthy();

  await selectedCostume.click();
  const deselectedCostume = page.getByRole('button', {
    name: `Thêm ${costumeName} vào yêu cầu thuê`,
    exact: true,
  });
  await expect(deselectedCostume).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Bộ đã chọn · 0' })).toBeVisible();

  await deselectedCostume.click();
  await expect(
    page.getByRole('button', { name: `Bỏ ${costumeName} khỏi yêu cầu thuê`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Bộ đã chọn · 1' })).toBeVisible();
});

test('catalog shows a short availability label for an available rental period', async ({
  page,
}) => {
  const branch = {
    id: 'branch-1',
    branchCode: 'Q1',
    name: 'Chi nhánh Quận 1',
    address: '123 Nguyễn Huệ',
  };
  const modelId = 'model-1';
  const variantId = 'variant-1';

  await page.addInitScript(() => {
    sessionStorage.setItem('costume-rental.access-token', 'catalog-availability-test-token');
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          id: 'customer-1',
          displayName: 'Khách thử',
          email: 'customer@example.test',
          roles: [
            {
              roleCode: 'CUSTOMER',
              name: 'Khách hàng',
              actorGroup: 'CUSTOMER',
              permissions: [],
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/v1/public/branches**', (route) =>
    route.fulfill({ json: { success: true, data: { items: [branch] } } }),
  );
  await page.route('**/api/v1/public/catalog/variants**', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: variantId,
              modelId,
              variantCode: 'DRESS-M-RED',
              sizeCode: 'M',
              colorCode: 'RED',
              dailyRentalPriceVnd: '100000',
              depositAmountVnd: '200000',
              model: {
                id: modelId,
                name: 'Đầm Dạ Hội',
                category: { id: 'category-1', name: 'Dạ hội' },
                shortDescription: '',
              },
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/v1/public/catalog/availability/batch', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [{ variantId, pickupBranchId: branch.id, available: true, availableUnits: 2 }],
      },
    }),
  );

  const query = new URLSearchParams({
    branch: branch.name,
    pickup: '2028-04-05T10:00',
    returnAt: '2028-04-06T10:00',
  });
  await page.goto(`/?${query}`);

  await expect(page.getByText('Có sẵn', { exact: true })).toBeVisible();
  await expect(page.getByText('Có size/màu phù hợp theo kỳ đã chọn', { exact: true })).toHaveCount(
    0,
  );
});
