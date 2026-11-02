import { expect, test, type Page, type Route } from '@playwright/test';

const branchId = 'e2e-branch-q1';
const variantId = 'e2e-variant-m-red';
const branchName = 'Costume Studio Quận 1';

const staffIdentity = {
  id: 'e2e-staff-user',
  displayName: 'Nhân viên thử nghiệm',
  email: 'staff@example.test',
  roles: [
    {
      roleCode: 'SALES_STAFF',
      name: 'Nhân viên bán hàng',
      actorGroup: 'STAFF',
      branchId,
      permissions: [
        { code: 'rentals.read.branch', scope: 'BRANCH' },
        { code: 'rentals.manage.branch', scope: 'BRANCH' },
        { code: 'inventory.read.branch', scope: 'BRANCH' },
        { code: 'crm.read.branch', scope: 'BRANCH' },
        { code: 'reports.read.branch', scope: 'BRANCH' },
        { code: 'catalog.read.all', scope: 'ALL' },
      ],
    },
  ],
};

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data }),
  });
}

async function mockStaffSession(page: Page) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    fulfillJson(route, { accessToken: 'e2e-staff-session' }),
  );
  await page.route('**/api/v1/auth/me', (route) => fulfillJson(route, staffIdentity));
  await page.route('**/api/v1/public/branches**', (route) =>
    fulfillJson(route, {
      items: [{ id: branchId, name: branchName, branchCode: 'Q1', status: 'ACTIVE' }],
    }),
  );
}

test('staff navigation does not expose the default admin menu during session restore', async ({
  page,
}) => {
  let releaseRefresh!: () => void;
  const refreshBarrier = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await refreshBarrier;
    await fulfillJson(route, { accessToken: 'e2e-staff-session' });
  });
  await page.route('**/api/v1/auth/me', (route) => fulfillJson(route, staffIdentity));
  await page.route('**/api/v1/public/branches**', (route) =>
    fulfillJson(route, {
      items: [{ id: branchId, name: branchName, branchCode: 'Q1', status: 'ACTIVE' }],
    }),
  );

  await page.goto('/van-hanh/tong-quan', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Đang xác minh phiên đăng nhập…')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Chức năng quản trị' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /về quản trị/i })).toHaveCount(0);

  releaseRefresh();
  const staffNavigation = page.getByRole('navigation', { name: 'Chức năng vận hành' });
  await expect(staffNavigation).toBeVisible();
  await page.getByRole('button', { name: 'Vận hành' }).click();
  await expect(staffNavigation.getByRole('link', { name: 'Tạo tại quầy' })).toBeVisible();
});

test('counter quote uses a real catalog variant and checks availability without creating an order', async ({
  page,
}) => {
  await mockStaffSession(page);
  await page.route('**/api/v1/customers**', (route) =>
    fulfillJson(route, {
      items: [
        {
          userId: 'e2e-customer-user',
          customerCode: 'KH-001',
          displayName: 'Khách thử nghiệm',
          phone: '0900000000',
          email: 'customer@example.test',
          preferredBranchId: branchId,
        },
      ],
    }),
  );
  await page.route('**/api/v1/public/catalog/variants**', (route) =>
    fulfillJson(route, {
      items: [
        {
          id: variantId,
          modelId: 'e2e-model-ao-dai',
          variantCode: 'AD-LOTUS-M-RED',
          sizeCode: 'M',
          colorCode: 'RED',
          dailyRentalPriceVnd: 120000,
          depositAmountVnd: 250000,
          model: {
            id: 'e2e-model-ao-dai',
            name: 'Áo dài Sen Việt',
            category: { name: 'Áo dài' },
          },
        },
      ],
    }),
  );

  let quotedVariantId: string | undefined;
  let availabilityVariantId: string | null = null;
  await page.route('**/api/v1/rentals/quotes', async (route) => {
    const payload = JSON.parse(route.request().postData() ?? '{}') as {
      items?: { variantId?: string }[];
    };
    quotedVariantId = payload.items?.[0]?.variantId;
    await fulfillJson(route, {
      quoteExpiresAt: '2026-11-04T09:00:00.000Z',
      policy: { versionCode: 'E2E', billingDayMode: 'ROLLING_24_HOURS' },
      period: {
        billableDays: 2,
        plannedStartAt: '2026-11-04T09:00:00.000Z',
        plannedDueAt: '2026-11-06T09:00:00.000Z',
      },
      items: [
        {
          variantId,
          dailyRentalPriceVnd: 120000,
          depositAmountVnd: 250000,
          rentalAmountVnd: 240000,
          availableUnits: 1,
        },
      ],
      subtotalVnd: 240000,
      discountVnd: 0,
      rentalAmountVnd: 240000,
      depositVnd: 250000,
      totalDueVnd: 490000,
      available: true,
    });
  });
  await page.route('**/api/v1/rentals/availability**', async (route) => {
    availabilityVariantId = new URL(route.request().url()).searchParams.get('variantId');
    await fulfillJson(route, {
      available: true,
      units: [{ id: 'e2e-unit', unitCode: 'E2E-UNIT-01', conditionGrade: 'GOOD' }],
    });
  });

  await page.goto('/van-hanh/tao-don');
  await expect(page.getByRole('heading', { name: 'Tạo đơn thuê tại quầy' })).toBeVisible();
  await expect(page.getByLabel('Biến thể')).toHaveValue(variantId);
  await page.getByRole('button', { name: 'Kiểm tra khả dụng & báo giá' }).click();

  const quotePanel = page.getByRole('region', { name: 'Báo giá và xác nhận đơn tại quầy' });
  await expect(quotePanel).toContainText('Báo giá hệ thống hết hạn');
  await expect(quotePanel).toContainText('E2E-UNIT-01');
  expect(quotedVariantId).toBe(variantId);
  expect(availabilityVariantId).toBe(variantId);
  await expect(page.getByRole('button', { name: 'Chỉ tạo yêu cầu chờ' })).toBeVisible();
});

test('staff reports use operations wording and load branch-scoped metrics', async ({ page }) => {
  await mockStaffSession(page);
  await page.route('**/api/v1/reports/overview**', (route) =>
    fulfillJson(route, {
      from: '2026-10-05T00:00:00.000Z',
      to: '2026-11-04T00:00:00.000Z',
      branchId,
      ordersCreated: 1,
      overdueOrders: 0,
      rentalRevenueVnd: 120000,
      depositsHeldVnd: 250000,
      completedRefundVnd: 0,
    }),
  );
  await page.route('**/api/v1/reports/rentals**', (route) =>
    fulfillJson(route, { totalOrders: 1, overdueOrders: 0 }),
  );
  await page.route('**/api/v1/reports/payments**', (route) =>
    fulfillJson(route, { byStatus: [], byMethod: [] }),
  );
  await page.route('**/api/v1/reports/revenue**', (route) =>
    fulfillJson(route, { totalRevenueVnd: 120000, periods: [] }),
  );
  await page.route('**/api/v1/reports/inventory**', (route) =>
    fulfillJson(route, { totalUnits: 1, byOperationalStatus: [], byConditionGrade: [] }),
  );

  await page.goto('/van-hanh/bao-cao');
  await expect(page.getByRole('heading', { name: 'Báo cáo vận hành' })).toBeVisible();
  await expect(page.getByText('VẬN HÀNH / BÁO CÁO', { exact: true })).toBeVisible();
  await expect(page.getByText('QUẢN TRỊ / BÁO CÁO', { exact: true })).toHaveCount(0);
  await expect(page.getByText(branchName, { exact: true }).first()).toBeVisible();
});
