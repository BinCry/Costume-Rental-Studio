const { afterEach, describe, expect, it, vi } = globalThis;
import {
  actorGroupFromRoles,
  canActorAccessScreen,
  canActorUsePath,
  defaultPathForActor,
  pathFor,
  portalAreaForPath,
  readRoute,
} from '../src/app/routes.ts';

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

describe('role-specific portal routing', () => {
  it('sends each account type to its own home page', () => {
    expect(defaultPathForActor('ADMIN')).toBe('/quan-tri/bao-cao');
    expect(defaultPathForActor('STAFF')).toBe('/van-hanh/tong-quan');
    expect(defaultPathForActor('CUSTOMER')).toBe('/don-cua-toi');
  });

  it('uses the most privileged actor group when an identity has multiple groups', () => {
    expect(actorGroupFromRoles([{ actorGroup: 'CUSTOMER' }, { actorGroup: 'STAFF' }])).toBe(
      'STAFF',
    );
    expect(
      actorGroupFromRoles([
        { actorGroup: 'STAFF' },
        { actorGroup: 'CUSTOMER' },
        { actorGroup: 'ADMIN' },
      ]),
    ).toBe('ADMIN');
    expect(actorGroupFromRoles([])).toBe('UNASSIGNED');
  });

  it('does not let a customer resume a staff/admin URL or cross staff and admin portals', () => {
    expect(canActorUsePath('CUSTOMER', '/van-hanh/don-thue')).toBe(false);
    expect(canActorUsePath('CUSTOMER', '/quan-tri/nhan-vien')).toBe(false);
    expect(canActorUsePath('STAFF', '/quan-tri/nhan-vien')).toBe(false);
    expect(canActorUsePath('ADMIN', '/van-hanh/don-thue')).toBe(false);
    expect(canActorUsePath('CUSTOMER', '/don-cua-toi')).toBe(true);
    expect(canActorUsePath('CUSTOMER', '/don-cua-toi/RT-2026-001')).toBe(true);
    expect(canActorUsePath('STAFF', '/van-hanh/don-thue')).toBe(true);
    expect(canActorUsePath('ADMIN', '/quan-tri/nhan-vien')).toBe(true);
  });

  it('keeps reporting available in separate staff and admin routes', () => {
    expect(pathFor('staffReports')).toBe('/van-hanh/bao-cao');
    expect(canActorAccessScreen('STAFF', 'staffReports')).toBe(true);
    expect(canActorAccessScreen('STAFF', 'reports')).toBe(false);
    expect(canActorAccessScreen('ADMIN', 'reports')).toBe(true);
    expect(portalAreaForPath('/don-cua-toi/RT-2026-001')).toBe('CUSTOMER');
  });
});
