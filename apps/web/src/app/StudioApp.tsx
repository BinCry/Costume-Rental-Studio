import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import {
  apiEnabled,
  currentUser,
  hasAccessToken,
  listBranches,
  logout,
  restoreSession,
} from '../api/client';
import type { DemoScenario } from '../fixtures/types';
import { fixtureCustomers, fixtureEmployees, fixtureRoles } from '../fixtures/studio';
import { CatalogPage } from '../pages/CatalogPage';
import { BookingPage } from '../pages/BookingPage';
import { DashboardPage } from '../pages/DashboardPage';
import { OpsAgentPage } from '../pages/OpsAgentPage';
import { OrdersPage } from '../pages/OrdersPage';
import { OrderDetailShell } from '../pages/OrderDetailShell';
import { AccountPage, CostumeDetailPage, MyRentalsPage } from '../pages/CustomerFeatures';
import { ActiveRentalsPage, CounterRentalPage } from '../pages/StaffFeatures';
import { InventoryPage, TransfersPage } from '../pages/InventoryFeatures';
import { CrmPage } from '../pages/CrmFeatures';
import { AuthPage } from '../pages/AuthPage';
import {
  BranchesPage,
  CatalogAdminPage,
  EmployeesPage,
  PoliciesPage,
  ReportsPage,
  RolesPage,
} from '../pages/AdminFeatures';
import { pathFor, readRoute, type Navigate, type Screen } from './routes';

const scenarios: { value: DemoScenario; label: string }[] = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'loading', label: 'Đang tải' },
  { value: 'empty', label: 'Trống' },
  { value: 'error', label: 'Lỗi mạng' },
  { value: 'conflict', label: 'Xung đột bộ' },
  { value: 'version', label: 'Đơn bị sửa' },
  { value: 'cancelled', label: 'Khách đã hủy' },
  { value: 'permission', label: 'Mất quyền' },
  { value: 'bankPending', label: 'Chuyển khoản chờ đối soát' },
  { value: 'refundFailed', label: 'Hoàn cọc thất bại' },
  { value: 'barcodeMissing', label: 'Không thấy barcode' },
  { value: 'barcodeOtherBranch', label: 'Barcode khác chi nhánh' },
  { value: 'unitBlocked', label: 'Bộ bị block' },
];
type DemoRole = 'CUSTOMER' | 'SALES_STAFF' | 'INVENTORY_STAFF' | 'ADMIN';
type ApiIdentity = Awaited<ReturnType<typeof currentUser>>;
const customerNav: { screen: Screen; label: string }[] = [
  { screen: 'catalog', label: 'Khám phá' },
  { screen: 'booking', label: 'Đặt thuê' },
  { screen: 'myRentals', label: 'Đơn của tôi' },
  { screen: 'account', label: 'Tài khoản' },
];
const staffNav: { screen: Screen; label: string; roles: DemoRole[] }[] = [
  { screen: 'dashboard', label: 'Bảng việc', roles: ['ADMIN', 'SALES_STAFF', 'INVENTORY_STAFF'] },
  {
    screen: 'opsAgent',
    label: 'Trợ lý vận hành',
    roles: ['ADMIN', 'SALES_STAFF', 'INVENTORY_STAFF'],
  },
  { screen: 'orders', label: 'Đơn thuê', roles: ['ADMIN', 'SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'counter', label: 'Tạo tại quầy', roles: ['ADMIN', 'SALES_STAFF'] },
  { screen: 'active', label: 'Đang thuê', roles: ['ADMIN', 'SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'inventory', label: 'Kho', roles: ['ADMIN', 'SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'transfers', label: 'Điều chuyển', roles: ['ADMIN', 'INVENTORY_STAFF'] },
  { screen: 'crm', label: 'Khách hàng', roles: ['ADMIN', 'SALES_STAFF'] },
  { screen: 'adminCatalog', label: 'Danh mục', roles: ['ADMIN'] },
  { screen: 'employees', label: 'Nhân viên', roles: ['ADMIN'] },
  { screen: 'roles', label: 'Vai trò', roles: ['ADMIN'] },
  { screen: 'branches', label: 'Chi nhánh', roles: ['ADMIN'] },
  { screen: 'policies', label: 'Chính sách', roles: ['ADMIN'] },
  { screen: 'reports', label: 'Báo cáo', roles: ['ADMIN', 'SALES_STAFF'] },
];
const staffNavGroups: { id: string; label: string; screens: Screen[] }[] = [
  { id: 'overview', label: 'Tổng quan', screens: ['dashboard'] },
  { id: 'operations', label: 'Vận hành', screens: ['orders', 'counter', 'active', 'opsAgent'] },
  { id: 'inventory', label: 'Kho', screens: ['inventory', 'transfers'] },
  { id: 'customers', label: 'Khách hàng', screens: ['crm'] },
  { id: 'catalog', label: 'Danh mục', screens: ['adminCatalog'] },
  { id: 'organization', label: 'Tổ chức', screens: ['employees', 'roles', 'branches'] },
  { id: 'policies', label: 'Chính sách', screens: ['policies'] },
  { id: 'reports', label: 'Báo cáo', screens: ['reports'] },
];
const isStaff = (screen: Screen) =>
  ![
    'catalog',
    'detail',
    'booking',
    'myRentals',
    'myRentalDetail',
    'account',
    'login',
    'register',
    'forgotPassword',
  ].includes(screen);
const requiredPermissions: Partial<Record<Screen, string[]>> = {
  dashboard: ['rentals.read.branch', 'rentals.read.all'],
  orders: ['rentals.read.branch', 'rentals.read.all'],
  counter: ['rentals.manage.branch', 'rentals.manage.all'],
  active: ['rentals.read.branch', 'rentals.read.all'],
  inventory: ['inventory.read.branch', 'inventory.read.all'],
  transfers: [
    'transfers.read.branch',
    'transfers.read.all',
    'transfers.manage.branch',
    'transfers.manage.all',
  ],
  crm: ['crm.read.branch', 'crm.read.all'],
  adminCatalog: ['catalog.read.all', 'catalog.manage.all'],
  employees: ['staff.read.all', 'staff.manage.all'],
  roles: ['rbac.read.all', 'rbac.manage.all'],
  branches: ['branches.read.all', 'branches.manage.all'],
  policies: ['policies.read.all', 'policies.manage.all'],
  opsAgent: ['rentals.read.branch', 'rentals.read.all'],
};

export default function StudioApp() {
  const [route, setRoute] = useState(readRoute);
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [role, setRole] = useState<DemoRole>('ADMIN');
  const [apiIdentity, setApiIdentity] = useState<ApiIdentity>();
  const [apiSessionReady, setApiSessionReady] = useState(!apiEnabled || import.meta.env.DEV);
  const [apiBranchIds, setApiBranchIds] = useState<Record<string, string>>({});
  const [apiBranchesReady, setApiBranchesReady] = useState(!apiEnabled || import.meta.env.DEV);
  const [apiBranchesFailed, setApiBranchesFailed] = useState(false);
  const [branchRetryRevision, setBranchRetryRevision] = useState(0);
  const [branch, setBranch] = useState('Chi nhánh Quận 1');
  const [customerCode, setCustomerCode] = useState('KH-001');
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedStaffGroup, setExpandedStaffGroup] = useState<string | null>(
    () => staffNavGroups.find((group) => group.screens.includes(route.screen))?.id ?? null,
  );
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);
  const [, setAccessRevision] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const previousRouteRef = useRef(route);
  useEffect(() => {
    if (previousRouteRef.current === route) return;
    previousRouteRef.current = route;
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  const syncRoute = useCallback((nextRoute: ReturnType<typeof readRoute>) => {
    setRoute(nextRoute);
    const activeGroup = staffNavGroups.find((group) => group.screens.includes(nextRoute.screen));
    if (activeGroup) setExpandedStaffGroup(activeGroup.id);
  }, []);
  useEffect(() => {
    const onPop = () => {
      syncRoute(readRoute());
      setMenuOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncRoute]);
  useEffect(() => {
    const refresh = () => setAccessRevision((value) => value + 1);
    window.addEventListener('fixture-access-updated', refresh);
    return () => window.removeEventListener('fixture-access-updated', refresh);
  }, []);
  useEffect(() => {
    if (!apiEnabled) return;
    let active = true;
    const loadBranches = async () => {
      setApiBranchesReady(false);
      setApiBranchesFailed(false);
      setApiBranchIds({});
      try {
        const items = await listBranches();
        if (active) setApiBranchIds(Object.fromEntries(items.map((item) => [item.name, item.id])));
      } catch {
        if (active) setApiBranchesFailed(true);
      } finally {
        if (active) setApiBranchesReady(true);
      }
    };
    const syncIdentity = async () => {
      try {
        const identity = hasAccessToken() ? await currentUser() : await restoreSession();
        if (active) setApiIdentity(identity);
      } catch {
        if (active) setApiIdentity(undefined);
      } finally {
        if (active) setApiSessionReady(true);
      }
    };
    const refreshIdentity = () => {
      void syncIdentity();
    };
    void syncIdentity();
    void loadBranches();
    window.addEventListener('api-session-changed', refreshIdentity);
    return () => {
      active = false;
      window.removeEventListener('api-session-changed', refreshIdentity);
    };
  }, [branchRetryRevision]);
  useEffect(() => {
    sectionNavRef.current
      ?.querySelector<HTMLElement>('a.active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [route.screen, role, branch, apiIdentity, apiBranchIds]);
  useEffect(() => {
    if (!menuOpen || !isStaff(route.screen)) return;
    sectionNavRef.current?.querySelector<HTMLButtonElement>('.staff-nav-close')?.focus();
  }, [menuOpen, route.screen]);
  const go: Navigate = (screen, params) => {
    window.history.pushState(null, '', pathFor(screen, params));
    syncRoute(readRoute());
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const finishAuthentication = async (next?: string) => {
    const identity = await currentUser();
    setApiIdentity(identity);
    setApiSessionReady(true);
    window.dispatchEvent(new Event('api-session-changed'));
    const staffIdentity = identity.roles.some(
      (entry) => entry.actorGroup === 'ADMIN' || entry.actorGroup === 'STAFF',
    );
    let destination = pathFor(staffIdentity ? 'dashboard' : 'account');
    if (next) {
      try {
        const requested = new URL(next, window.location.origin);
        const isAuthPath = [
          '/dang-nhap',
          '/dang-ky',
          '/quen-mat-khau',
          '/auth/google/callback',
        ].includes(requested.pathname);
        if (
          requested.origin === window.location.origin &&
          requested.pathname.startsWith('/') &&
          !requested.pathname.startsWith('//') &&
          !isAuthPath
        ) {
          destination = requested.pathname + requested.search + requested.hash;
        }
      } catch {
        // Ignore malformed or external redirect targets and use the role-based destination.
      }
    }
    window.history.replaceState(null, '', destination);
    syncRoute(readRoute());
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const signOut = async () => {
    try {
      await logout();
    } catch {
      // The API client clears the local token even when the network request fails.
    } finally {
      setApiIdentity(undefined);
      setApiSessionReady(true);
      window.dispatchEvent(new Event('api-session-changed'));
      go('catalog');
    }
  };
  const activeRole: DemoRole =
    (apiIdentity?.roles.find(
      (entry) => entry.actorGroup === 'ADMIN' || entry.actorGroup === 'STAFF',
    )?.roleCode as DemoRole | undefined) ??
    (apiIdentity?.roles.find((entry) => entry.actorGroup === 'CUSTOMER')?.roleCode as
      DemoRole | undefined) ??
    role;
  const staffApiRoles =
    apiIdentity?.roles.filter(
      (entry) => entry.actorGroup === 'ADMIN' || entry.actorGroup === 'STAFF',
    ) ?? [];
  const canSelectEveryApiBranch = staffApiRoles.some(
    (entry) =>
      entry.branchId === null && entry.permissions.some((permission) => permission.scope === 'ALL'),
  );
  const apiBranchOptions = Object.entries(apiBranchIds)
    .filter(
      ([, id]) => canSelectEveryApiBranch || staffApiRoles.some((entry) => entry.branchId === id),
    )
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right, 'vi'));
  const activeBranch =
    apiIdentity && staffApiRoles.length > 0
      ? apiBranchOptions.includes(branch)
        ? branch
        : (apiBranchOptions[0] ?? '')
      : branch;
  const activeBranchId = apiBranchIds[activeBranch];
  const serverPermissions = Array.from(
    new Set(
      apiIdentity?.roles
        .filter((entry) => entry.branchId === null || entry.branchId === activeBranchId)
        .flatMap((entry) => entry.permissions.map((permission) => permission.code)) ?? [],
    ),
  );
  const staff = isStaff(route.screen);
  const assigned = apiIdentity
    ? staffApiRoles.length > 0 && !!activeBranch && apiBranchOptions.includes(activeBranch)
    : activeRole === 'ADMIN' ||
      activeRole === 'CUSTOMER' ||
      fixtureEmployees.some(
        (employee) =>
          employee.accountStatus === 'ACTIVE' &&
          employee.employmentStatus === 'ACTIVE' &&
          employee.assignments.some(
            (assignment) =>
              assignment.branch === activeBranch && assignment.roleCode === activeRole,
          ),
      );
  const effectivePermissions = apiIdentity
    ? serverPermissions
    : (fixtureRoles.find((item) => item.code === activeRole)?.permissions ?? []);
  const canReadPayments =
    !apiIdentity ||
    ['payments.read.branch', 'payments.read.all'].some((permission) =>
      effectivePermissions.includes(permission),
    );
  const canCollectPayments =
    !apiIdentity ||
    (canReadPayments &&
      [
        'payments.collect.branch',
        'payments.collect.all',
        'payments.manage.branch',
        'payments.manage.all',
      ].some((permission) => effectivePermissions.includes(permission)));
  const canReturn =
    !apiIdentity ||
    [
      'rentals.return.branch',
      'rentals.return.all',
      'rentals.manage.branch',
      'rentals.manage.all',
    ].some((permission) => effectivePermissions.includes(permission));
  const canAssessReturn =
    !apiIdentity ||
    [
      'rentals.assessment.branch',
      'rentals.assessment.all',
      'rentals.manage.branch',
      'rentals.manage.all',
    ].some((permission) => effectivePermissions.includes(permission));
  const canPrepareSettlement =
    !apiIdentity ||
    ['payments.manage.branch', 'payments.manage.all'].some((permission) =>
      effectivePermissions.includes(permission),
    );
  const canCompleteSettlement =
    !apiIdentity ||
    [
      'rentals.settlement.branch',
      'rentals.settlement.all',
      'rentals.manage.branch',
      'rentals.manage.all',
    ].some((permission) => effectivePermissions.includes(permission));
  const canOpen = (screen: Screen) => {
    if (!assigned) return false;
    if (screen === 'handover')
      return [
        'rentals.handover.branch',
        'rentals.handover.all',
        'rentals.manage.branch',
        'rentals.manage.all',
      ].some((permission) => effectivePermissions.includes(permission));
    if (screen === 'return') {
      const canReadOrder = ['rentals.read.branch', 'rentals.read.all'].some((permission) =>
        effectivePermissions.includes(permission),
      );
      const canWorkReturn = [
        'rentals.return.branch',
        'rentals.return.all',
        'rentals.manage.branch',
        'rentals.manage.all',
        'rentals.assessment.branch',
        'rentals.assessment.all',
        'payments.manage.branch',
        'payments.manage.all',
        'rentals.settlement.branch',
        'rentals.settlement.all',
        'payments.read.branch',
        'payments.read.all',
      ].some((permission) => effectivePermissions.includes(permission));
      return canReadOrder && canWorkReturn;
    }
    if (screen === 'reports')
      return (
        effectivePermissions.includes('reports.read.all') ||
        effectivePermissions.includes('reports.read.branch')
      );
    if (apiIdentity) {
      const permissions = requiredPermissions[screen];
      return permissions?.some((permission) => effectivePermissions.includes(permission)) ?? false;
    }
    if (screen === 'policies') return activeRole === 'ADMIN';
    const item = staffNav.find((value) => value.screen === screen);
    if (!item?.roles.includes(activeRole)) return false;
    const permissions = requiredPermissions[screen];
    return (
      !permissions || permissions.some((permission) => effectivePermissions.includes(permission))
    );
  };
  const authScreen = ['login', 'register', 'forgotPassword'].includes(route.screen);
  const nav = authScreen ? [] : staff ? staffNav.filter((x) => canOpen(x.screen)) : customerNav;
  const productionApiMode = apiEnabled && !import.meta.env.DEV;
  const requiresCustomerSession =
    route.screen === 'booking' || route.screen === 'myRentals' || route.screen === 'myRentalDetail';
  const requiresSession = productionApiMode && (staff || requiresCustomerSession);
  const sessionPending =
    requiresSession && (!apiSessionReady || (!!apiIdentity && !apiBranchesReady));
  const sessionMissing = requiresSession && apiSessionReady && !apiIdentity;
  const protectedArea = (staff && !canOpen(route.screen)) || sessionPending || sessionMissing;
  const productionConfigurationMissing = !apiEnabled && !import.meta.env.DEV;
  const showFixtureControls = import.meta.env.DEV && !apiIdentity;
  const p = route.params;
  const authHeaderTarget = route.screen === 'login' ? 'register' : 'login';
  const authHeaderParams = p.get('next') ? { next: p.get('next')! } : undefined;
  return (
    <div className={`app ${staff ? 'app-staff' : 'app-customer'}`}>
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <div className="demo-banner">
        <span className="demo-dot" />{' '}
        {import.meta.env.DEV
          ? apiIdentity
            ? 'Môi trường phát triển · Đang kết nối API'
            : apiEnabled
              ? 'Bản demo local · Đang dùng fixture khi chưa đăng nhập API'
              : 'Bản demo giao diện · Dữ liệu fixture, thao tác không lưu lên máy chủ'
          : 'Danh mục công khai · Đăng nhập để đặt thuê hoặc vào khu vận hành'}
      </div>
      <header className={`site-header ${authScreen ? 'site-header-auth' : ''}`}>
        <div className="header-inner">
          <a
            href="/"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go('catalog');
            }}
            aria-label="Studio Trang Phục, về trang khám phá"
          >
            <span className="brand-mark">S</span>
            <span>
              STUDIO<span className="brand-period">.</span>
              <small>TRANG PHỤC</small>
            </span>
          </a>
          {!staff && (
            <nav
              id="main-navigation"
              className={`top-nav ${menuOpen ? 'open' : ''} ${authScreen ? 'auth-nav-hidden' : ''}`}
              aria-label="Điều hướng chính"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setMenuOpen(false);
                  menuButtonRef.current?.focus();
                }
              }}
            >
              {nav.map((item, index) => (
                <a
                  key={item.screen}
                  href={pathFor(item.screen)}
                  className={`${route.screen === item.screen ? 'active' : ''} ${index >= 4 ? 'mobile-extra-nav' : ''}`.trim()}
                  onClick={(e) => {
                    e.preventDefault();
                    go(item.screen);
                  }}
                >
                  {item.label}
                </a>
              ))}
              {!authScreen && !apiIdentity && (
                <>
                  <a
                    className="mobile-auth-entry"
                    href={pathFor('login')}
                    onClick={(event) => {
                      event.preventDefault();
                      go('login');
                    }}
                  >
                    Đăng nhập
                  </a>
                  <a
                    className="mobile-auth-entry mobile-auth-entry-primary"
                    href={pathFor('register')}
                    onClick={(event) => {
                      event.preventDefault();
                      go('register');
                    }}
                  >
                    Tạo tài khoản
                  </a>
                </>
              )}
              {!authScreen && apiIdentity && staffApiRoles.length > 0 && !staff && (
                <a
                  className="mobile-staff-entry"
                  href={pathFor('dashboard')}
                  onClick={(event) => {
                    event.preventDefault();
                    go('dashboard');
                  }}
                >
                  Khu vận hành <Icon name="arrow" size={16} />
                </a>
              )}
            </nav>
          )}
          <div className="header-actions">
            {authScreen ? (
              <a
                className="auth-header-link"
                href={pathFor(authHeaderTarget, authHeaderParams)}
                onClick={(event) => {
                  event.preventDefault();
                  go(authHeaderTarget, authHeaderParams);
                }}
              >
                {route.screen === 'register'
                  ? 'Đã có tài khoản? Đăng nhập'
                  : route.screen === 'login'
                    ? 'Tạo tài khoản'
                    : 'Quay lại đăng nhập'}
              </a>
            ) : apiIdentity ? (
              <>
                {staff && activeRole !== 'CUSTOMER' && (
                  <label className="header-branch">
                    <span>Chi nhánh</span>
                    <select
                      id="header-branch-select"
                      aria-label="Chi nhánh làm việc"
                      value={activeBranch}
                      onChange={(event) => setBranch(event.target.value)}
                      disabled={!apiBranchesReady || apiBranchOptions.length === 0}
                    >
                      {apiBranchOptions.length === 0 ? (
                        <option value="">Không có chi nhánh được gán</option>
                      ) : (
                        apiBranchOptions.map((name) => (
                          <option value={name} key={name}>
                            {name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}
                {staffApiRoles.length > 0 && !staff && (
                  <a
                    className="area-switch"
                    href="/van-hanh/tong-quan"
                    onClick={(event) => {
                      event.preventDefault();
                      go('dashboard');
                    }}
                  >
                    Khu vận hành <Icon name="arrow" size={16} />
                  </a>
                )}
                <a
                  className="header-account"
                  href="/tai-khoan"
                  onClick={(event) => {
                    event.preventDefault();
                    go('account');
                  }}
                >
                  {apiIdentity.displayName || 'Tài khoản'}
                </a>
              </>
            ) : (
              <div className="auth-header-actions">
                <a
                  className="auth-header-link"
                  href="/dang-nhap"
                  onClick={(event) => {
                    event.preventDefault();
                    go('login');
                  }}
                >
                  Đăng nhập
                </a>
                <a
                  className="button button-primary auth-header-register"
                  href="/dang-ky"
                  onClick={(event) => {
                    event.preventDefault();
                    go('register');
                  }}
                >
                  Tạo tài khoản
                </a>
              </div>
            )}
            <button
              ref={menuButtonRef}
              className="icon-button mobile-menu"
              aria-label={menuOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
              aria-expanded={menuOpen}
              aria-controls={staff ? 'staff-navigation' : 'main-navigation'}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </header>
      {staff && (
        <>
          <aside
            ref={sectionNavRef}
            id="staff-navigation"
            className={`section-nav ${menuOpen ? 'open' : ''}`}
            role={menuOpen ? 'dialog' : undefined}
            aria-modal={menuOpen ? true : undefined}
            aria-label="Điều hướng khu vận hành"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              } else if (event.key === 'Tab' && menuOpen) {
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'a[href], button:not(:disabled), select:not(:disabled)',
                  ),
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              type="button"
              className="staff-nav-close"
              onClick={() => {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
            >
              Đóng menu
            </button>
            {apiIdentity && activeRole !== 'CUSTOMER' && (
              <label className="sidebar-branch">
                <span>Chi nhánh làm việc</span>
                <select
                  id="sidebar-branch-select"
                  aria-label="Chi nhánh làm việc"
                  value={activeBranch}
                  onChange={(event) => setBranch(event.target.value)}
                  disabled={!apiBranchesReady || apiBranchOptions.length === 0}
                >
                  {apiBranchOptions.length === 0 ? (
                    <option value="">Không có chi nhánh được gán</option>
                  ) : (
                    apiBranchOptions.map((name) => (
                      <option value={name} key={name}>
                        {name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}
            <nav aria-label="Chức năng khu vận hành">
              {staffNavGroups.map((group) => {
                const groupItems = group.screens.flatMap((screen) => {
                  const item = nav.find((entry) => entry.screen === screen);
                  return item ? [item] : [];
                });
                if (!groupItems.length) return null;
                const expanded = expandedStaffGroup === group.id;
                return (
                  <div className="staff-nav-group" key={group.id}>
                    <button
                      type="button"
                      className="staff-nav-heading"
                      aria-expanded={expanded}
                      aria-controls={`staff-nav-items-${group.id}`}
                      onClick={() =>
                        setExpandedStaffGroup((current) => (current === group.id ? null : group.id))
                      }
                    >
                      <span>{group.label}</span>
                      <span className="staff-nav-chevron" aria-hidden="true">
                        ⌄
                      </span>
                    </button>
                    <div
                      className="staff-nav-items"
                      id={`staff-nav-items-${group.id}`}
                      hidden={!expanded}
                    >
                      {groupItems.map((item) => (
                        <a
                          key={item.screen}
                          href={pathFor(item.screen)}
                          className={route.screen === item.screen ? 'active' : ''}
                          aria-current={route.screen === item.screen ? 'page' : undefined}
                          onClick={(event) => {
                            event.preventDefault();
                            go(item.screen);
                          }}
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>
          {menuOpen && (
            <button
              type="button"
              className="staff-nav-backdrop"
              aria-label="Đóng điều hướng"
              onClick={() => {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
            />
          )}
        </>
      )}
      <main
        id="main-content"
        className="main-content"
        ref={mainRef}
        tabIndex={-1}
        key={`${route.screen}:${activeBranch}:${p.get('order') ?? ''}`}
      >
        {showFixtureControls && (
          <div className="demo-controls">
            <div className="demo-controls-inner">
              <span className="demo-controls-title">Kiểm tra UI fixture</span>
              <button
                type="button"
                className="demo-controls-toggle"
                aria-expanded={demoControlsOpen}
                aria-controls="demo-control-fields"
                onClick={() => setDemoControlsOpen((open) => !open)}
              >
                Kiểm tra UI fixture
                <span aria-hidden="true">{demoControlsOpen ? '−' : '+'}</span>
              </button>
              <div
                id="demo-control-fields"
                className={`demo-control-fields ${demoControlsOpen ? 'open' : ''}`}
              >
                <div className="demo-control demo-control--scenario">
                  <label htmlFor="demo-scenario">Tình huống</label>
                  <select
                    id="demo-scenario"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as DemoScenario)}
                  >
                    {scenarios.map((x) => (
                      <option value={x.value} key={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="demo-control demo-control--role">
                  <label htmlFor="demo-role">Vai trò</label>
                  <select
                    id="demo-role"
                    value={activeRole}
                    onChange={(e) => setRole(e.target.value as DemoRole)}
                    disabled={!!apiIdentity}
                  >
                    <option value="ADMIN">Quản trị</option>
                    <option value="SALES_STAFF">Nhân viên bán hàng</option>
                    <option value="INVENTORY_STAFF">Nhân viên kho</option>
                    <option value="CUSTOMER">Khách</option>
                  </select>
                </div>
                <div className="demo-control demo-control--branch">
                  <label htmlFor="demo-branch">Chi nhánh</label>
                  <select
                    id="demo-branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  >
                    <option>Chi nhánh Quận 1</option>
                    <option>Chi nhánh Thủ Đức</option>
                  </select>
                </div>
                <div className="demo-control demo-control--customer">
                  <label htmlFor="demo-customer">Khách mẫu</label>
                  <select
                    id="demo-customer"
                    value={customerCode}
                    onChange={(e) => setCustomerCode(e.target.value)}
                  >
                    {fixtureCustomers.map((customer) => (
                      <option value={customer.code} key={customer.code}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {productionConfigurationMissing ? (
          <div className="page">
            <div className="feedback feedback-danger" role="alert">
              <div>
                <strong>Website chưa được nối với máy chủ</strong>
                <p>Thiếu cấu hình API khi build. Hãy cấu hình VITE_API_URL rồi triển khai lại.</p>
              </div>
            </div>
          </div>
        ) : protectedArea ? (
          <div className="page">
            {sessionPending ? (
              <div className="feature-skeleton shimmer" role="status">
                Đang xác minh phiên đăng nhập…
              </div>
            ) : sessionMissing ? (
              <div className="feedback feedback-warning" role="status">
                <div>
                  <strong>Đăng nhập để tiếp tục</strong>
                  <p>
                    Đăng nhập bằng tài khoản đã được cấp quyền. Trang sẽ đưa bạn trở lại đúng khu
                    vực sau khi xác thực.
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() =>
                      go('login', { next: window.location.pathname + window.location.search })
                    }
                  >
                    Đến trang đăng nhập
                  </button>
                </div>
              </div>
            ) : apiIdentity && apiBranchesFailed ? (
              <div className="feedback feedback-danger" role="alert">
                <div>
                  <strong>Không tải được danh sách chi nhánh</strong>
                  <p>
                    Chưa thể xác định phạm vi làm việc của tài khoản. Hãy thử tải lại danh sách.
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setBranchRetryRevision((value) => value + 1)}
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            ) : (
              <div className="feedback feedback-danger" role="alert">
                <div>
                  <strong>Không có quyền truy cập khu vực này</strong>
                  <p>
                    {apiIdentity
                      ? apiBranchesFailed
                        ? 'Không tải được danh sách chi nhánh. Hãy tải lại trang để thử lại.'
                        : apiBranchOptions.length === 0 && activeRole !== 'CUSTOMER'
                          ? 'Tài khoản chưa được gán chi nhánh vận hành.'
                          : 'Tài khoản chưa được gán vai trò hoặc quyền cần thiết tại chi nhánh đang chọn.'
                      : assigned
                        ? 'Vai trò mẫu không có mã quyền cần thiết.'
                        : `Vai trò mẫu chưa có nhân viên ACTIVE được phân công tại ${activeBranch}.`}{' '}
                    Backend xác minh quyền trên từng yêu cầu.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {route.screen === 'catalog' && (
              <CatalogPage scenario={scenario} go={go} initialContext={p} />
            )}
            {route.screen === 'detail' && (
              <CostumeDetailPage
                id={p.get('id') ?? ''}
                scenario={scenario}
                go={go}
                initialContext={p}
              />
            )}
            {route.screen === 'booking' && (
              <BookingPage
                scenario={scenario}
                go={go}
                costumeId={p.get('costume') ?? undefined}
                initialContext={p}
                onCustomerCreated={setCustomerCode}
              />
            )}
            {route.screen === 'myRentals' && (
              <MyRentalsPage scenario={scenario} go={go} customerCode={customerCode} />
            )}
            {route.screen === 'myRentalDetail' && (
              <MyRentalsPage
                id={p.get('order') ?? ''}
                scenario={scenario}
                go={go}
                customerCode={customerCode}
              />
            )}
            {route.screen === 'account' && (
              <AccountPage
                scenario={scenario}
                go={go}
                apiIdentity={apiIdentity}
                realApiMode={apiEnabled}
                onSignOut={() => void signOut()}
                onRoleChange={(nextRole) => {
                  if (!apiIdentity) setRole(nextRole);
                }}
              />
            )}
            {(route.screen === 'login' ||
              route.screen === 'register' ||
              route.screen === 'forgotPassword') && (
              <AuthPage
                key={route.screen}
                mode={route.screen}
                params={p}
                apiIdentity={apiIdentity}
                go={go}
                onAuthenticated={finishAuthentication}
              />
            )}
            {route.screen === 'dashboard' && (
              <DashboardPage scenario={scenario} go={go} initialBranch={activeBranch} />
            )}
            {route.screen === 'opsAgent' && (
              <OpsAgentPage scenario={scenario} branch={activeBranch} go={go} />
            )}
            {route.screen === 'orders' && (
              <OrdersPage
                scenario={scenario}
                go={go}
                canManage={
                  !apiIdentity ||
                  effectivePermissions.includes('rentals.manage.branch') ||
                  effectivePermissions.includes('rentals.manage.all')
                }
                canConfirm={[
                  'rentals.confirm.branch',
                  'rentals.confirm.all',
                  'rentals.manage.branch',
                  'rentals.manage.all',
                ].some((permission) => effectivePermissions.includes(permission))}
                canPrepare={[
                  'rentals.prepare.branch',
                  'rentals.prepare.all',
                  'rentals.manage.branch',
                  'rentals.manage.all',
                ].some((permission) => effectivePermissions.includes(permission))}
                canHandover={[
                  'rentals.handover.branch',
                  'rentals.handover.all',
                  'rentals.manage.branch',
                  'rentals.manage.all',
                ].some((permission) => effectivePermissions.includes(permission))}
                canReturn={[
                  'rentals.return.branch',
                  'rentals.return.all',
                  'rentals.manage.branch',
                  'rentals.manage.all',
                ].some((permission) => effectivePermissions.includes(permission))}
                initialOrderId={p.get('order') ?? undefined}
                initialFilter={p.get('filter') ?? undefined}
                initialBranch={activeBranch}
              />
            )}
            {route.screen === 'handover' && (
              <OrderDetailShell
                scenario={scenario}
                mode="handover"
                go={go}
                initialOrderId={p.get('order') ?? 'RT-1028'}
                initialBranch={activeBranch}
                canReadPayments={canReadPayments}
                canCollectPayments={canCollectPayments}
              />
            )}
            {route.screen === 'return' && (
              <OrderDetailShell
                scenario={scenario}
                mode="return"
                go={go}
                initialOrderId={p.get('order') ?? 'RT-1031'}
                initialBranch={activeBranch}
                canReadPayments={canReadPayments}
                canCollectPayments={canCollectPayments}
                canReturn={canReturn}
                canAssessReturn={canAssessReturn}
                canPrepareSettlement={canPrepareSettlement}
                canCompleteSettlement={canCompleteSettlement}
              />
            )}
            {route.screen === 'counter' && (
              <CounterRentalPage
                scenario={scenario}
                go={go}
                branch={activeBranch}
                canConfirm={effectivePermissions.includes('rentals.manage.branch')}
                canCreateCustomer={
                  effectivePermissions.includes('customers.create.branch') ||
                  effectivePermissions.includes('customers.create.all')
                }
              />
            )}
            {route.screen === 'active' && (
              <ActiveRentalsPage scenario={scenario} go={go} branch={activeBranch} />
            )}
            {route.screen === 'inventory' && (
              <InventoryPage
                scenario={scenario}
                go={go}
                branch={activeBranch}
                canManage={
                  !apiIdentity ||
                  effectivePermissions.includes('inventory.manage.branch') ||
                  effectivePermissions.includes('inventory.manage.all')
                }
              />
            )}
            {route.screen === 'transfers' && (
              <TransfersPage
                scenario={scenario}
                branch={activeBranch}
                canManage={
                  !apiIdentity ||
                  effectivePermissions.includes('transfers.manage.branch') ||
                  effectivePermissions.includes('transfers.manage.all')
                }
              />
            )}
            {route.screen === 'crm' && (
              <CrmPage
                scenario={scenario}
                branch={activeBranch}
                canManage={
                  !apiIdentity ||
                  effectivePermissions.includes('crm.manage.branch') ||
                  effectivePermissions.includes('crm.manage.all')
                }
              />
            )}
            {route.screen === 'adminCatalog' && (
              <CatalogAdminPage
                scenario={scenario}
                canManage={!apiIdentity || effectivePermissions.includes('catalog.manage.all')}
              />
            )}
            {route.screen === 'employees' && (
              <EmployeesPage
                scenario={scenario}
                canManage={!apiIdentity || effectivePermissions.includes('staff.manage.all')}
              />
            )}
            {route.screen === 'roles' && (
              <RolesPage
                scenario={scenario}
                canManage={!apiIdentity || effectivePermissions.includes('rbac.manage.all')}
              />
            )}
            {route.screen === 'branches' && (
              <BranchesPage
                scenario={scenario}
                canManage={!apiIdentity || effectivePermissions.includes('branches.manage.all')}
              />
            )}
            {route.screen === 'policies' && (
              <PoliciesPage
                scenario={scenario}
                canManage={!apiIdentity || effectivePermissions.includes('policies.manage.all')}
              />
            )}
            {route.screen === 'reports' && (
              <ReportsPage
                scenario={scenario}
                branch={activeBranch}
                allBranches={effectivePermissions.includes('reports.read.all')}
              />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>Studio Trang Phục</span>
        <span>
          {route.screen === 'opsAgent'
            ? import.meta.env.VITE_OPS_AGENT_MODE === 'api'
              ? 'Trợ lý vận hành · Tra cứu hướng dẫn · Hỗ trợ xử lý yêu cầu'
              : 'Ops Agent · Fixture demo · Không lưu dữ liệu'
            : import.meta.env.DEV
              ? apiIdentity
                ? 'Môi trường phát triển · Dữ liệu API'
                : 'Môi trường phát triển · Fixture demo'
              : 'Dữ liệu vận hành lấy từ API · Cần đăng nhập cho chức năng riêng tư'}
        </span>
      </footer>
    </div>
  );
}
