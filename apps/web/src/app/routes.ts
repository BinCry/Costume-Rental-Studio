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
  | 'opsAgent'
  | 'notFound';
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
  opsAgent: '/van-hanh/ops-agent',
  notFound: '/khong-tim-thay-trang',
};
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
