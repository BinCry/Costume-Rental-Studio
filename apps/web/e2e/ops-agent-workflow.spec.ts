import { expect, test } from '@playwright/test';

const branchId = 'branch-1';

function envelope(data: unknown) {
  return { success: true, data };
}

function findingCase(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case-1',
    state: 'NEW',
    message: 'Bộ UNIT-011 có nguy cơ trùng lịch thuê.',
    evidence: [],
    completed: false,
    branchId,
    caseType: 'READINESS',
    origin: 'SCHEDULER',
    ownership: 'UNCLAIMED',
    version: 1,
    finding: {
      findingId: 'finding-1',
      ruleCode: 'UNIT_SCHEDULE_CONFLICT',
      severity: 'HIGH',
      status: 'OPEN',
      evidence: { unit_code: 'UNIT-011', order_code: 'ORD-DEMO-006' },
      firstDetectedAt: '2026-10-21T09:00:00.000Z',
      sourceObservedAt: '2026-10-21T09:00:00.000Z',
    },
    relatedOrders: [],
    relatedUnits: [],
    ...overrides,
  };
}

test('runs the operational case through claim, analysis, proposal, confirmation and monitoring', async ({
  page,
}) => {
  let current: Record<string, unknown> = findingCase();
  const calls: string[] = [];

  await page.addInitScript(() => {
    window.sessionStorage.setItem('costume-rental.access-token', 'e2e-token');
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(data)),
      });

    if (pathname === '/api/v1/auth/me') {
      return respond({
        id: 'staff-1',
        displayName: 'Nhân viên E2E',
        email: 'e2e@example.test',
        roles: [
          {
            roleCode: 'ADMIN',
            name: 'Quản trị',
            actorGroup: 'ADMIN',
            branchId: null,
            permissions: [{ code: 'knowledge.read.all', scope: 'ALL' }],
          },
        ],
      });
    }
    if (pathname === '/api/v1/public/branches') {
      return respond({
        items: [
          { id: branchId, branchCode: 'Q1', name: 'Costume Studio Quận 1', status: 'ACTIVE' },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });
    }
    if (pathname === '/api/v1/agent/cases' && request.method() === 'GET') {
      return respond({ items: [current], nextCursor: null });
    }
    if (pathname === '/api/v1/agent/cases/case-1' && request.method() === 'GET') {
      return respond(current);
    }
    if (pathname.endsWith('/claim')) {
      calls.push('claim');
      current = findingCase({ ownership: 'MINE', version: 2 });
      return respond(current);
    }
    if (pathname.endsWith('/analyze')) {
      calls.push('analyze');
      current = findingCase({
        ownership: 'MINE',
        version: 3,
        state: 'PLAN_READY',
        analysis: {
          analysisId: 'analysis-1',
          status: 'ACTIVE',
          outcome: 'READY',
          riskLevel: 'HIGH',
          reasons: ['Lịch thuê hiện tại bị chồng lấn.'],
          options: [
            {
              optionId: 'option-1',
              optionType: 'REALLOCATE_UNIT',
              feasible: true,
              executable: true,
              rank: 1,
              estimatedMinutes: 15,
              riskLevel: 'LOW',
              reasonCodes: ['AVAILABLE_REPLACEMENT'],
            },
          ],
          recommendedOptionId: 'option-1',
          narrative: {
            summary: 'Có thể đổi sang bộ phù hợp và đang sẵn sàng.',
            rationale: ['Bộ thay thế không có lịch trùng.'],
            risks: ['Cần nhân viên xác nhận trước khi đổi.'],
            nextStep: 'Kiểm tra thay đổi và xác nhận.',
          },
        },
      });
      return respond(current);
    }
    if (pathname.endsWith('/confirmations') && request.method() === 'POST') {
      calls.push('prepare');
      current = {
        ...current,
        state: 'WAITING_CONFIRMATION',
        version: 4,
        pendingConfirmation: {
          confirmationId: 'confirmation-1',
          summary: 'Đổi UNIT-011 sang bộ thay thế đã kiểm tra.',
          expiresAt: '2026-10-21T23:59:00.000Z',
          analysisId: 'analysis-1',
          optionId: 'option-1',
        },
      };
      return respond(current);
    }
    if (pathname.endsWith('/confirmations/confirmation-1/confirm')) {
      calls.push('confirm');
      current = { ...current, state: 'MONITORING', version: 5, pendingConfirmation: null };
      return respond(current);
    }

    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/van-hanh/ops-agent');

  await expect(page.getByRole('heading', { name: 'Cảnh báo vận hành' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhận xử lý' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Phân tích/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Nhận xử lý' }).click();
  await expect(page.getByRole('button', { name: 'Phân tích và lập phương án' })).toBeVisible();

  await page.getByRole('button', { name: 'Phân tích và lập phương án' }).click();
  await expect(page.getByText('Có thể đổi sang bộ phù hợp và đang sẵn sàng.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem thay đổi để xác nhận' })).toBeVisible();

  await page.getByRole('button', { name: 'Xem thay đổi để xác nhận' }).click();
  await expect(page.getByText('ĐANG CHỜ XÁC NHẬN')).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận và thực thi' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận và thực thi' }).click();

  await expect(
    page.getByRole('heading', { name: 'Cập nhật để kiểm tra trạng thái nghiệp vụ mới nhất.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Phân tích/ })).toHaveCount(0);
  expect(calls).toEqual(['claim', 'analyze', 'prepare', 'confirm']);
});
