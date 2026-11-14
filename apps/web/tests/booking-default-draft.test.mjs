const { afterEach, beforeEach, describe, expect, it, vi } = globalThis;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key) => (key === 'costume-rental.access-token' ? 'studio-access-token' : null),
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

async function renderBooking(costumeId) {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { BookingPage } = await import('../src/pages/BookingPage.tsx');
  return renderToStaticMarkup(
    React.createElement(BookingPage, {
      scenario: 'normal',
      go: () => undefined,
      costumeId,
      initialContext: new URLSearchParams(),
    }),
  );
}

describe('booking form before a costume is chosen (live API mode)', () => {
  it('does not preselect the sample costume that is not in the catalog', async () => {
    const html = await renderBooking(undefined);

    expect(html).toContain('Chưa chọn trang phục');
    expect(html).not.toContain('Áo dài Lina');
    expect(html).not.toContain('Hồng phấn');
  });
});
