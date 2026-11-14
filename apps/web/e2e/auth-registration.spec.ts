import { expect, test } from '@playwright/test';

test('shows Vietnamese registration errors at their fields before requesting an OTP', async ({
  page,
}) => {
  let otpRequests = 0;
  await page.route('**/api/v1/auth/register/otp', (route) => {
    otpRequests += 1;
    return route.fulfill({
      json: { success: true, data: { challengeId: 'challenge', retryAfter: 60, expiresIn: 300 } },
    });
  });

  await page.goto('/dang-ky');
  await page.getByLabel('Họ và tên').fill('Nguyễn Minh Anh');
  const email = page.getByLabel('Email', { exact: true });
  const phone = page.getByLabel('Số điện thoại (có thể bổ sung sau)');
  const password = page.getByLabel('Mật khẩu', { exact: true });
  const confirmation = page.getByLabel('Nhập lại mật khẩu');
  await email.fill('khong-hop-le');
  await phone.fill('123');
  await password.fill('ngan');
  await confirmation.fill('khac');

  const submit = page.getByRole('button', { name: 'Gửi mã xác nhận' });
  await submit.click();
  for (const [field, message] of [
    [email, 'Email chưa đúng định dạng.'],
    [phone, /Số điện thoại chưa đúng/],
    [password, 'Mật khẩu cần có từ 12 đến 128 ký tự.'],
    [confirmation, 'Mật khẩu xác nhận chưa khớp.'],
  ] as const) {
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription(message);
  }
  expect(otpRequests).toBe(0);

  await email.fill('khach@example.test');
  await phone.clear();
  await password.fill('mat-khau-hop-le');
  await confirmation.fill('mat-khau-hop-le');
  await expect(confirmation).toHaveAttribute('aria-invalid', 'false');
  await submit.click();
  await expect(page.getByLabel('Mã xác nhận')).toBeVisible();
  expect(otpRequests).toBe(1);
});
