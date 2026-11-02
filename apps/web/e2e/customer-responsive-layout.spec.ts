import { expect, test } from '@playwright/test';

const customerRoutes = [
  '/',
  '/dat-thue',
  '/dang-nhap',
  '/dang-ky',
  '/quen-mat-khau',
  '/tai-khoan',
  '/don-cua-toi',
  '/try-on/',
];

const viewportWidths = [320, 360, 375, 390, 414, 768, 1024, 1280, 1440];

test('customer pages do not clip content or overflow at common viewport widths', async ({
  page,
}) => {
  for (const route of customerRoutes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.locator('body').waitFor({ state: 'visible' });

    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const result = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const clippedText = [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            if (!element.textContent?.trim() || element.children.length > 0) return false;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (style.textOverflow === 'ellipsis') return false;
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') return false;
            return element.scrollWidth > element.clientWidth + 2;
          })
          .slice(0, 5)
          .map((element) => ({
            text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80),
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }));

        return { viewportWidth, pageWidth, clippedText };
      });

      expect(
        result.pageWidth,
        `${route} overflows horizontally at ${width}px: ${JSON.stringify(result)}`,
      ).toBeLessThanOrEqual(result.viewportWidth + 1);
      expect(
        result.clippedText,
        `${route} has clipped text at ${width}px: ${JSON.stringify(result.clippedText)}`,
      ).toEqual([]);
    }
  }
});

test('customer navigation menu supports keyboard dismissal and closes on outside interaction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/');

  const menuButton = page.locator('button.mobile-menu');
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });

  await menuButton.click();
  await expect(navigation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

  await menuButton.click();
  await expect(navigation).toBeVisible();
  await page.locator('.header-inner').click({ position: { x: 200, y: 32 } });
  await expect(navigation).toBeHidden();
});

test('does not show guest sign-in links while restoring a customer session', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ status: 401, body: 'unauthorized' });
  });

  await page.goto('/dat-thue', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Đang xác minh phiên đăng nhập…')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tạo tài khoản', exact: true })).toHaveCount(0);

  await expect(page.getByText('Đăng nhập để tiếp tục', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toBeVisible();
});

test('signed-in mobile customer keeps sign-out inside the navigation menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { accessToken: 'e2e-customer-token' } }),
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'e2e-customer',
          displayName: 'Khách thử nghiệm',
          email: 'customer@example.test',
          roles: [
            {
              roleCode: 'CUSTOMER',
              name: 'Khách hàng',
              actorGroup: 'CUSTOMER',
              branchId: null,
              permissions: [],
            },
          ],
        },
      }),
    });
  });

  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const menuButton = page.locator('button.mobile-menu');
  const headerLogout = page.locator('.header-actions .header-logout');

  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
  await expect(headerLogout).toBeHidden();
  await menuButton.click();
  await expect(navigation.getByRole('button', { name: 'Đăng xuất' })).toHaveCount(1);
});
