const { afterEach, describe, expect, it, vi } = globalThis;
import { readRoute } from '../src/app/routes.ts';

afterEach(() => vi.unstubAllGlobals());

describe('customer and application route resolution', () => {
  it('returns a not-found route for unknown paths without dropping the query context', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/duong-dan-khong-ton-tai', search: '?from=booking' },
    });

    const route = readRoute();

    expect(route.screen).toBe('notFound');
    expect(route.params.get('from')).toBe('booking');
  });

  it('returns a not-found route for malformed encoded paths instead of throwing', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/trang-phuc/%E0%A4%A', search: '' },
    });

    expect(readRoute().screen).toBe('notFound');
  });

  it('keeps a known product detail route and decodes its identifier', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/trang-phuc/ao-dai-lina', search: '?size=M' },
    });

    const route = readRoute();

    expect(route.screen).toBe('detail');
    expect(route.params.get('id')).toBe('ao-dai-lina');
    expect(route.params.get('size')).toBe('M');
  });
});
