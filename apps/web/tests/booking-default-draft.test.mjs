const { afterEach, beforeEach, describe, expect, it, vi } = globalThis;
let pendingOrder;

beforeEach(() => {
  pendingOrder = null;
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key) =>
        key === 'costume-rental.access-token'
          ? 'studio-access-token'
          : key === 'costume-rental.pending-order.v1'
            ? pendingOrder
            : null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    location: { pathname: '/dat-thue', search: '' },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => undefined)),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function renderBooking(costumeId, customerAuthenticated = false) {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { BookingPage } = await import('../src/pages/BookingPage.tsx');
  return renderToStaticMarkup(
    React.createElement(BookingPage, {
      scenario: 'normal',
      go: () => undefined,
      costumeId,
      initialContext: new URLSearchParams(),
      customerAuthenticated,
    }),
  );
}

describe('booking form before a costume is chosen (live API mode)', () => {
  it('does not preselect the sample costume that is not in the catalog', async () => {
    const html = await renderBooking(undefined);

    expect(html).toContain('Chưa chọn mẫu');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Xem báo giá/);
    expect(html).not.toContain('Áo dài Lina');
    expect(html).not.toContain('Hồng phấn');
  });

  it('pauses the form when an earlier submission has an unknown outcome', async () => {
    pendingOrder = JSON.stringify({
      clientRequestId: '10000000-0000-4000-8000-000000000008',
      customerUserId: '10000000-0000-4000-8000-000000000001',
      body: '{}',
      summary: {
        branch: 'Chi nhánh 1',
        pickup: '2026-12-01T10:00',
        returnAt: '2026-12-03T10:00',
        quantity: 1,
      },
    });
    const html = await renderBooking(undefined, true);
    expect(html).toContain('Kiểm tra yêu cầu vừa gửi');
    expect(html).toContain('Kiểm tra và tiếp tục lần gửi trước');
    expect(html).not.toContain('Xem báo giá');
  });
});
