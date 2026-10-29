export type Screen =
  | 'catalog'
  | 'detail'
  | 'booking'
  | 'myRentals'
  | 'myRentalDetail'
  | 'account'
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'dashboard'
  | 'orders'
  | 'handover'
  | 'return'
  | 'counter'
  | 'active'
  | 'inventory'
  | 'transfers'
  | 'crm'
  | 'adminCatalog'
  | 'employees'
  | 'roles'
  | 'branches'
  | 'policies'
  | 'reports'
  | 'staffReports'
  | 'notFound';
export type ActorGroup = 'ADMIN' | 'STAFF' | 'CUSTOMER' | 'UNASSIGNED';
export type PortalArea = 'ADMIN' | 'STAFF' | 'CUSTOMER' | 'AUTH' | 'PUBLIC';
export type Navigate = (screen: Screen, params?: Record<string, string>) => void;
export interface Route {
  screen: Screen;
  params: URLSearchParams;
}
export const paths: Record<Screen, string> = {
  catalog: '/',
  detail: '/trang-phuc/:id',
  booking: '/dat-thue',
  myRentals: '/don-cua-toi',
  myRentalDetail: '/don-cua-toi/:order',
  account: '/tai-khoan',
  login: '/dang-nhap',
  register: '/dang-ky',
  forgotPassword: '/quen-mat-khau',
  dashboard: '/van-hanh/tong-quan',
  orders: '/van-hanh/don-thue',
  handover: '/van-hanh/don-thue/:order/giao',
  return: '/van-hanh/don-thue/:order/tra',
  counter: '/van-hanh/tao-don',
  active: '/van-hanh/dang-thue',
  inventory: '/van-hanh/kho',
  transfers: '/van-hanh/dieu-chuyen',
  crm: '/van-hanh/khach-hang',
  adminCatalog: '/quan-tri/danh-muc',
  employees: '/quan-tri/nhan-vien',
  roles: '/quan-tri/vai-tro',
  branches: '/quan-tri/chi-nhanh',
  policies: '/quan-tri/chinh-sach',
  reports: '/quan-tri/bao-cao',
  staffReports: '/van-hanh/bao-cao',
  notFound: '/khong-tim-thay-trang',
};

export function actorGroupFromRoles(roles: readonly { actorGroup?: string | null }[]): ActorGroup {
  if (roles.some((role) => role.actorGroup === 'ADMIN')) return 'ADMIN';
  if (roles.some((role) => role.actorGroup === 'STAFF')) return 'STAFF';
  if (roles.some((role) => role.actorGroup === 'CUSTOMER')) return 'CUSTOMER';
  return 'UNASSIGNED';
}

export function actorGroupFromRoleCode(roleCode: string): ActorGroup {
  if (roleCode === 'ADMIN') return 'ADMIN';
  if (roleCode === 'CUSTOMER') return 'CUSTOMER';
  return 'STAFF';
}

export function defaultPathForActor(actorGroup: ActorGroup) {
  if (actorGroup === 'ADMIN') return paths.reports;
  if (actorGroup === 'STAFF') return paths.dashboard;
  if (actorGroup === 'CUSTOMER') return paths.myRentals;
  return paths.account;
}

export function portalAreaForScreen(screen: Screen): PortalArea {
  if (['login', 'register', 'forgotPassword'].includes(screen)) return 'AUTH';
  if (['catalog', 'detail', 'booking', 'myRentals', 'myRentalDetail', 'account'].includes(screen))
    return 'CUSTOMER';
  if (['adminCatalog', 'employees', 'roles', 'branches', 'policies', 'reports'].includes(screen))
    return 'ADMIN';
  if (screen === 'notFound') return 'PUBLIC';
  return 'STAFF';
}

export function portalAreaForPath(pathname: string): PortalArea | undefined {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/van-hanh/ops-agent' || path.startsWith('/van-hanh/ops-agent/')) return 'PUBLIC';
  if (
    path === '/' ||
    path.startsWith('/trang-phuc/') ||
    path.startsWith('/don-cua-toi/') ||
    ['/dat-thue', '/don-cua-toi', '/tai-khoan'].includes(path)
  )
    return 'CUSTOMER';
  if (path.startsWith('/quan-tri/')) return 'ADMIN';
  if (path.startsWith('/van-hanh/')) return 'STAFF';
  if (['/dang-nhap', '/dang-ky', '/quen-mat-khau', '/auth/google/callback'].includes(path))
    return 'AUTH';
  return undefined;
}

export function canActorUsePath(actorGroup: ActorGroup, pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const area = portalAreaForPath(path);
  if (actorGroup === 'UNASSIGNED') return area === 'CUSTOMER' && pathname === paths.account;
  return area === actorGroup;
}

export function canActorAccessScreen(actorGroup: ActorGroup, screen: Screen) {
  const area = portalAreaForScreen(screen);
  if (screen === 'notFound') return true;
  if (actorGroup === 'UNASSIGNED') return screen === 'account';
  return area === actorGroup;
}

export function pathFor(screen: Screen, params?: Record<string, string>) {
  let path = paths[screen];
  const search = { ...params };
  for (const key of ['id', 'order'])
    if (path.includes(`:${key}`)) {
      path = path.replace(`:${key}`, encodeURIComponent(search[key] ?? ''));
      delete search[key];
    }
  if (screen === 'orders' && search.order) {
    path += `/${encodeURIComponent(search.order)}`;
    delete search.order;
  }
  const query = new URLSearchParams(search).toString();
  return path + (query ? `?${query}` : '');
}
export function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  let path: string;
  try {
    path = decodeURIComponent(window.location.pathname).replace(/\/$/, '') || '/';
  } catch {
    return { screen: 'notFound', params };
  }
  if (path === '/auth/google/callback') return { screen: 'login', params };
  if (path.startsWith('/don-cua-toi/')) {
    params.set('order', path.split('/')[2] ?? '');
    return { screen: 'myRentalDetail', params };
  }
  if (path.startsWith('/trang-phuc/')) {
    params.set('id', path.split('/')[2] ?? '');
    return { screen: 'detail', params };
  }
  if (path.startsWith('/van-hanh/don-thue/')) {
    const parts = path.split('/');
    params.set('order', parts[3] ?? '');
    return {
      screen: parts[4] === 'giao' ? 'handover' : parts[4] === 'tra' ? 'return' : 'orders',
      params,
    };
  }
  const match = (Object.entries(paths) as [Screen, string][]).find(([, value]) => value === path);
  return { screen: match?.[0] ?? 'notFound', params };
}
