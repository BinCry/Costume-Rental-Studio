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

test('flags reversed and equal dates at the return field before a public availability request', async ({
  page,
}) => {
  const requests: URL[] = [];
  const respond = (data: unknown) => ({ json: { success: true, data } });
  const modelId = '00000000-0000-4000-8000-000000000001';
  await page.addInitScript(() => {
    sessionStorage.setItem('costume-rental.access-token', 'catalog-test-token');
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      respond({
        id: 'customer-1',
        displayName: 'Khách thử',
        roles: [
          {
            roleCode: 'CUSTOMER',
            name: 'Khách hàng',
            actorGroup: 'CUSTOMER',
            branchId: null,
            permissions: [],
          },
        ],
      }),
    ),
  );
  await page.route('**/api/v1/public/branches**', (route) =>
    route.fulfill(respond({ items: [{ id: 'branch-1', name: 'Chi nhánh Quận 1' }] })),
  );
  await page.route('**/api/v1/public/catalog/variants?**', (route) =>
    route.fulfill(
      respond({
        items: [
          {
            id: 'variant-l',
            modelId,
            variantCode: 'LINA-L',
            sizeCode: 'L',
            colorCode: 'PINK',
            dailyRentalPriceVnd: 320000,
            depositAmountVnd: 500000,
            model: { name: 'Áo dài Lina' },
          },
          {
            id: 'variant-1',
            modelId,
            variantCode: 'LINA-M',
            sizeCode: 'M',
            colorCode: 'PINK',
            dailyRentalPriceVnd: 320000,
            depositAmountVnd: 500000,
            model: { name: 'Áo dài Lina' },
          },
        ],
      }),
    ),
  );
  await page.route('**/api/v1/public/catalog/availability?**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill(respond({ available: true, availableUnits: 1 }));
  });

  await page.goto(
    '/trang-phuc/' + modelId + '?pickup=2028-04-05T10%3A00&returnAt=2028-04-04T10%3A00',
  );
  const sizeL = page.getByRole('button', { name: 'L · PINK', exact: true });
  const sizeM = page.getByRole('button', { name: 'M · PINK', exact: true });
  await expect(sizeL).toHaveAttribute('aria-pressed', 'true');
  await sizeM.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('variantCode')).toBe('LINA-M');
  await page.reload();
  await expect(sizeM).toHaveAttribute('aria-pressed', 'true');
  await expect(sizeL).toHaveAttribute('aria-pressed', 'false');

  const due = page.getByRole('textbox', { name: 'Trả', exact: true });
  await expect(due).toHaveAccessibleDescription('Thời điểm trả phải sau thời điểm nhận.');
  await due.fill('05/04/2028 10:00');
  await expect(due).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Bắt đầu đặt thuê' })).toBeDisabled();
  expect(requests).toHaveLength(0);

  await due.fill('06/04/2028 10:00');
  await expect(due).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByText('Biến thể này đang có bộ khả dụng theo kỳ đã chọn')).toBeVisible();
  expect(requests).toHaveLength(1);
  const query = requests[0].searchParams;
  expect(query.get('variantId')).toBe('variant-1');
  expect(query.get('pickupBranchId')).toBe('branch-1');
  expect(query.get('plannedStartAt')).toBe(new Date('2028-04-05T10:00').toISOString());
  expect(query.get('plannedDueAt')).toBe(new Date('2028-04-06T10:00').toISOString());
  await expect(page.getByRole('button', { name: 'Bắt đầu đặt thuê' })).toBeEnabled();
});

test('catalog also attaches the reversed-range message to the return field', async ({ page }) => {
  await page.goto('/');
  const pickup = page.getByRole('textbox', { name: 'Nhận đồ', exact: true });
  const due = page.getByRole('textbox', { name: 'Trả đồ', exact: true });
  await pickup.fill('05/04/2028 10:00');
  await due.fill('04/04/2028 10:00');
  await expect(due).toHaveAccessibleDescription('Thời điểm trả phải sau thời điểm nhận.');
  await due.fill('06/04/2028 10:00');
  await expect(due).toHaveAttribute('aria-invalid', 'false');
});
