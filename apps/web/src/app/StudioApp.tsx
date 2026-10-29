import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon } from '../components/ui';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { SiteFooter, type SiteBranchContact } from '../components/SiteFooter';
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
import {
  actorGroupFromRoleCode,
  actorGroupFromRoles,
  canActorAccessScreen,
  canActorUsePath,
  defaultPathForActor,
  pathFor,
  portalAreaForPath,
  readRoute,
  type ActorGroup,
  type Navigate,
  type Screen,
} from './routes';

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
  { screen: 'dashboard', label: 'Bảng việc', roles: ['SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'orders', label: 'Đơn thuê', roles: ['SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'counter', label: 'Tạo tại quầy', roles: ['SALES_STAFF'] },
  { screen: 'active', label: 'Đang thuê', roles: ['SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'inventory', label: 'Kho', roles: ['SALES_STAFF', 'INVENTORY_STAFF'] },
  { screen: 'transfers', label: 'Điều chuyển', roles: ['INVENTORY_STAFF'] },
  { screen: 'crm', label: 'Khách hàng', roles: ['SALES_STAFF'] },
  { screen: 'staffReports', label: 'Báo cáo', roles: ['SALES_STAFF'] },
];
const adminNav: { screen: Screen; label: string; roles: DemoRole[] }[] = [
  { screen: 'reports', label: 'Tổng quan', roles: ['ADMIN'] },
  { screen: 'adminCatalog', label: 'Danh mục', roles: ['ADMIN'] },
  { screen: 'employees', label: 'Nhân viên', roles: ['ADMIN'] },
  { screen: 'roles', label: 'Vai trò', roles: ['ADMIN'] },
  { screen: 'branches', label: 'Chi nhánh', roles: ['ADMIN'] },
  { screen: 'policies', label: 'Chính sách', roles: ['ADMIN'] },
];
const staffNavGroups: { id: string; label: string; screens: Screen[] }[] = [
  { id: 'overview', label: 'Tổng quan', screens: ['dashboard'] },
  { id: 'operations', label: 'Vận hành', screens: ['orders', 'counter', 'active'] },
  { id: 'inventory', label: 'Kho', screens: ['inventory', 'transfers'] },
  { id: 'customers', label: 'Khách hàng', screens: ['crm'] },
  { id: 'reports', label: 'Báo cáo', screens: ['staffReports'] },
];
const adminNavGroups: { id: string; label: string; screens: Screen[] }[] = [
  { id: 'overview', label: 'Tổng quan', screens: ['reports'] },
  { id: 'catalog', label: 'Danh mục', screens: ['adminCatalog'] },
  { id: 'organization', label: 'Tổ chức', screens: ['employees', 'roles', 'branches'] },
  { id: 'policies', label: 'Chính sách', screens: ['policies'] },
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
    'notFound',
  ].includes(screen);
function resolveAuthAudience(params: URLSearchParams): ActorGroup {
  const portal = params.get('portal')?.toUpperCase();
  if (portal === 'ADMIN' || portal === 'STAFF') return portal;
  const next = params.get('next');
  if (next) {
    try {
      const area = portalAreaForPath(new URL(next, window.location.origin).pathname);
      if (area === 'ADMIN' || area === 'STAFF') return area;
    } catch {
      // An invalid return path must not change the login audience.
    }
  }
  return 'CUSTOMER';
}
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
  reports: ['reports.read.all', 'reports.read.branch'],
  staffReports: ['reports.read.all', 'reports.read.branch'],
};

export default function StudioApp() {
  const [route, setRoute] = useState(readRoute);
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [role, setRole] = useState<DemoRole>('ADMIN');
  const [apiIdentity, setApiIdentity] = useState<ApiIdentity>();
  const [apiSessionReady, setApiSessionReady] = useState(!apiEnabled || import.meta.env.DEV);
  const [apiBranchIds, setApiBranchIds] = useState<Record<string, string>>({});
  const [publicBranchContacts, setPublicBranchContacts] = useState<SiteBranchContact[]>([]);
  const [apiBranchesReady, setApiBranchesReady] = useState(!apiEnabled || import.meta.env.DEV);
  const [apiBranchesFailed, setApiBranchesFailed] = useState(false);
  const [branchRetryRevision, setBranchRetryRevision] = useState(0);
  const [branch, setBranch] = useState('Chi nhánh Quận 1');
  const [customerCode, setCustomerCode] = useState('KH-001');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileStaffNav, setMobileStaffNav] = useState(
    () => window.matchMedia('(max-width: 1199px)').matches,
  );
  const [signingOut, setSigningOut] = useState(false);
  const [expandedStaffGroup, setExpandedStaffGroup] = useState<string | null>(
    () =>
      [...staffNavGroups, ...adminNavGroups].find((group) => group.screens.includes(route.screen))
        ?.id ?? null,
  );
  const [demoControlsOpen, setDemoControlsOpen] = useState(false);
  const [, setAccessRevision] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocusRef = useRef(false);
  const sectionNavRef = useRef<HTMLElement>(null);
  const previousRouteRef = useRef(route);
  useEffect(() => {
    if (previousRouteRef.current === route) return;
    previousRouteRef.current = route;
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  const closeStaffMenu = useCallback((restoreFocus: boolean) => {
    restoreMenuFocusRef.current = restoreFocus;
    setMenuOpen(false);
  }, []);
  const syncRoute = useCallback((nextRoute: ReturnType<typeof readRoute>) => {
    setRoute(nextRoute);
    const activeGroup = [...staffNavGroups, ...adminNavGroups].find((group) =>
      group.screens.includes(nextRoute.screen),
    );
    if (activeGroup) setExpandedStaffGroup(activeGroup.id);
  }, []);
  useEffect(() => {
    const onPop = () => {
      syncRoute(readRoute());
      closeStaffMenu(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncRoute, closeStaffMenu]);
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
        if (active) {
          setApiBranchIds(Object.fromEntries(items.map((item) => [item.name, item.id])));
          setPublicBranchContacts(
            items
              .filter((item) => item.status !== 'INACTIVE')
              .map(({ name, address, phone }) => ({ name, address: address ?? '', phone })),
          );
        }
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
    const media = window.matchMedia('(max-width: 1199px)');
    const update = () => setMobileStaffNav(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    sectionNavRef.current
      ?.querySelector<HTMLElement>('a.active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [route.screen, role, branch, apiIdentity, apiBranchIds]);
  useEffect(() => {
    if (!menuOpen || !isStaff(route.screen)) return;
    sectionNavRef.current?.querySelector<HTMLElement>('.staff-nav-heading')?.focus();
  }, [menuOpen, route.screen]);
  const go: Navigate = (screen, params) => {
    window.history.pushState(null, '', pathFor(screen, params));
    syncRoute(readRoute());
    closeStaffMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const finishAuthentication = async (next?: string) => {
    const identity = await currentUser();
    setApiIdentity(identity);
    setApiSessionReady(true);
    window.dispatchEvent(new Event('api-session-changed'));
    const actorGroup = actorGroupFromRoles(identity.roles);
    let destination = defaultPathForActor(actorGroup);
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
          !isAuthPath &&
          canActorUsePath(actorGroup, requested.pathname)
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
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // The API client clears the local token even when the network request fails.
    } finally {
      setApiIdentity(undefined);
      setApiSessionReady(true);
      window.dispatchEvent(new Event('api-session-changed'));
      go('catalog');
      setSigningOut(false);
    }
  };
  const activeRole: DemoRole =
    (apiIdentity?.roles.find((entry) => entry.actorGroup === actorGroupFromRoles(apiIdentity.roles))
      ?.roleCode as DemoRole | undefined) ?? role;
  const actorGroup: ActorGroup = apiIdentity
    ? actorGroupFromRoles(apiIdentity.roles)
    : actorGroupFromRoleCode(activeRole);
  const staff = isStaff(route.screen);
  const mobileDrawerOpen = staff && menuOpen && mobileStaffNav;
  const previousMobileDrawerOpenRef = useRef(false);
  useEffect(() => {
    if (mobileDrawerOpen) {
      previousMobileDrawerOpenRef.current = true;
      return;
    }
    if (!previousMobileDrawerOpenRef.current) return;
    previousMobileDrawerOpenRef.current = false;
    if (!restoreMenuFocusRef.current) return;
    restoreMenuFocusRef.current = false;
    const opener = menuButtonRef.current;
    if (opener && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  }, [mobileDrawerOpen]);
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen]);
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const navigation = sectionNavRef.current;
    if (!navigation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeStaffMenu(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        navigation.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileDrawerOpen, closeStaffMenu]);
  const actorHomeScreen: Screen =
    actorGroup === 'ADMIN'
      ? 'reports'
      : actorGroup === 'STAFF'
        ? 'dashboard'
        : actorGroup === 'CUSTOMER'
          ? 'catalog'
          : 'account';
  const brandHomeScreen = apiIdentity ? actorHomeScreen : staff ? actorHomeScreen : 'catalog';
  useEffect(() => {
    if (!apiIdentity || !apiSessionReady || canActorAccessScreen(actorGroup, route.screen)) return;
    const destination = defaultPathForActor(actorGroup);
    if (window.location.pathname !== destination || window.location.search) {
      window.location.replace(destination);
    }
  }, [actorGroup, apiIdentity, apiSessionReady, route.screen]);
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
    if (screen === 'reports' || screen === 'staffReports')
      return (
        effectivePermissions.includes('reports.read.all') ||
        effectivePermissions.includes('reports.read.branch')
      );
    if (apiIdentity) {
      const permissions = requiredPermissions[screen];
      return permissions?.some((permission) => effectivePermissions.includes(permission)) ?? false;
    }
    if (screen === 'policies') return activeRole === 'ADMIN';
    const item = [...staffNav, ...adminNav].find((value) => value.screen === screen);
    if (!item?.roles.includes(activeRole)) return false;
    const permissions = requiredPermissions[screen];
    return (
      !permissions || permissions.some((permission) => effectivePermissions.includes(permission))
    );
  };
  const authScreen = ['login', 'register', 'forgotPassword'].includes(route.screen);
  const nav =
    authScreen || (apiIdentity && !canActorAccessScreen(actorGroup, route.screen))
      ? []
      : staff
        ? (actorGroup === 'ADMIN' ? adminNav : actorGroup === 'STAFF' ? staffNav : []).filter(
            (item) => canOpen(item.screen),
          )
        : customerNav;
  const navGroups = actorGroup === 'ADMIN' ? adminNavGroups : staffNavGroups;
  const shellActorGroup = apiIdentity || staff ? actorGroup : 'CUSTOMER';
  const actorLabel =
    shellActorGroup === 'ADMIN'
      ? 'Quản trị'
      : shellActorGroup === 'STAFF'
        ? 'Nhân viên'
        : shellActorGroup === 'CUSTOMER'
          ? 'Khách hàng'
          : 'Chưa được phân quyền';
  const productionApiMode = apiEnabled && !import.meta.env.DEV;
  const requiresCustomerSession =
    route.screen === 'booking' || route.screen === 'myRentals' || route.screen === 'myRentalDetail';
  const requiresSession = productionApiMode && (staff || requiresCustomerSession);
  const sessionPending =
    requiresSession && (!apiSessionReady || (!!apiIdentity && !apiBranchesReady));
  const sessionMissing = requiresSession && apiSessionReady && !apiIdentity;
  const wrongPortal = Boolean(apiIdentity && !canActorAccessScreen(actorGroup, route.screen));
  const protectedArea =
    (staff && !canOpen(route.screen)) || sessionPending || sessionMissing || wrongPortal;
  const productionConfigurationMissing = !apiEnabled && !import.meta.env.DEV;
  const showFixtureControls = import.meta.env.DEV && !apiIdentity;
  const p = route.params;
  const authAudienceGroup = resolveAuthAudience(p);
  const portalClass =
    shellActorGroup === 'ADMIN'
      ? 'app-admin'
      : shellActorGroup === 'STAFF'
        ? 'app-employee'
        : 'app-customer-portal';
  const authHeaderTarget =
    route.screen === 'register' || route.screen === 'forgotPassword' ? 'login' : 'register';
  const authHeaderParams = {
    ...(p.get('next') ? { next: p.get('next')! } : {}),
    ...(p.get('portal') ? { portal: p.get('portal')! } : {}),
  };
  return (
    <div
      className={`app ${staff ? 'app-staff' : 'app-customer'} ${staff && menuOpen ? 'nav-open' : ''} ${portalClass}`}
    >
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <header
        className={`site-header ${authScreen ? 'site-header-auth' : ''} ${!apiIdentity ? 'site-header-signed-out' : ''}`}
        inert={mobileDrawerOpen}
      >
        <div className="header-inner">
          <a
            href={pathFor(brandHomeScreen)}
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go(brandHomeScreen);
            }}
            aria-label={`Studio Trang Phục, về ${actorLabel.toLowerCase()}`}
          >
            <BrandLogoMark className="brand-mark" />
            <span>
              STUDIO<span className="brand-period">.</span>
              <small>TRANG PHỤC</small>
            </span>
          </a>
          {staff && (
            <button
              ref={menuButtonRef}
              type="button"
              className="icon-button staff-menu-toggle"
              aria-label={menuOpen ? 'Đóng menu chức năng' : 'Mở menu chức năng'}
              aria-expanded={menuOpen}
              aria-controls="staff-navigation"
              onClick={() => {
                if (menuOpen) closeStaffMenu(true);
                else {
                  restoreMenuFocusRef.current = false;
                  setMenuOpen(true);
                }
              }}
            >
              <Icon name="menu" />
            </button>
          )}
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
            </nav>
          )}
          <div className="header-actions">
            {authScreen ? (
              route.screen === 'login' && authAudienceGroup !== 'CUSTOMER' ? (
                <span className="auth-portal-label">
                  {authAudienceGroup === 'ADMIN' ? 'Cổng quản trị' : 'Cổng nhân viên'}
                </span>
              ) : (
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
              )
            ) : apiIdentity ? (
              actorGroup === 'CUSTOMER' ? (
                <>
                  <a
                    className="header-account"
                    href={pathFor('account')}
                    onClick={(event) => {
                      event.preventDefault();
                      go('account');
                    }}
                  >
                    {apiIdentity.displayName || 'Tài khoản'}
                  </a>
                  <button
                    type="button"
                    className="button button-secondary header-logout"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                  >
                    {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                  </button>
                </>
              ) : null
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
            {!staff && (
              <button
                ref={menuButtonRef}
                className="icon-button mobile-menu"
                aria-label={menuOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
                aria-expanded={menuOpen}
                aria-controls="main-navigation"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Icon name="menu" />
              </button>
            )}
          </div>
        </div>
      </header>
      {staff && (
        <>
          <aside
            ref={sectionNavRef}
            id="staff-navigation"
            className={`section-nav ${menuOpen ? 'open' : ''}`}
            role={mobileDrawerOpen ? 'dialog' : undefined}
            aria-modal={mobileDrawerOpen ? true : undefined}
            aria-label="Điều hướng khu vận hành"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                closeStaffMenu(true);
              }
            }}
          >
            <nav aria-label={actorGroup === 'ADMIN' ? 'Chức năng quản trị' : 'Chức năng vận hành'}>
              {navGroups.map((group) => {
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
            {apiIdentity && activeRole !== 'CUSTOMER' && (
              <section className="staff-menu-account" aria-label="Tài khoản và chi nhánh">
                <label className="sidebar-branch">
                  <span>Chi nhánh làm việc</span>
                  <select
                    id="sidebar-branch-select"
                    aria-label="Chi nhánh làm việc"
                    value={activeBranch}
                    onChange={(event) => setBranch(event.target.value)}
                    disabled={
                      !apiBranchesReady || apiBranchesFailed || apiBranchOptions.length === 0
                    }
                  >
                    {!apiBranchesReady ? (
                      <option value="">Đang tải danh sách chi nhánh…</option>
                    ) : apiBranchesFailed ? (
                      <option value="">Không tải được danh sách chi nhánh</option>
                    ) : apiBranchOptions.length === 0 ? (
                      <option value="">Không có chi nhánh được gán</option>
                    ) : (
                      apiBranchOptions.map((name) => (
                        <option value={name} key={name}>
                          {name}
                        </option>
                      ))
                    )}
                  </select>
                  {apiBranchesFailed && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setBranchRetryRevision((value) => value + 1)}
                    >
                      Thử tải lại chi nhánh
                    </button>
                  )}
                </label>
                <div className="staff-menu-account-row">
                  <div
                    className="staff-menu-identity"
                    aria-label={`${actorLabel}: ${apiIdentity.displayName}`}
                  >
                    <span className="header-identity-role">{actorLabel}</span>
                    <strong>{apiIdentity.displayName || 'Tài khoản'}</strong>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary staff-menu-logout"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                  >
                    {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                  </button>
                </div>
              </section>
            )}
          </aside>
          {menuOpen && (
            <button
              type="button"
              className="staff-nav-backdrop"
              aria-label="Đóng menu điều hướng"
              tabIndex={-1}
              onClick={() => {
                closeStaffMenu(true);
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
        inert={mobileDrawerOpen}
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
            ) : wrongPortal ? (
              <div className="feedback feedback-info" role="status">
                <div>
                  <strong>Đang mở không gian {actorLabel.toLowerCase()}</strong>
                  <p>Tài khoản sẽ được chuyển đến khu vực riêng theo vai trò đã được cấp.</p>
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
            {route.screen === 'notFound' && (
              <div className="page not-found-page">
                <section className="not-found-card" aria-labelledby="not-found-title">
                  <p className="eyebrow">KHÔNG TÌM THẤY TRANG</p>
                  <h1 id="not-found-title">Liên kết này không tồn tại</h1>
                  <p>Kiểm tra lại địa chỉ hoặc quay về bộ sưu tập để tiếp tục tìm trang phục.</p>
                  <Button onClick={() => go('catalog')}>
                    Về bộ sưu tập <Icon name="arrow" size={18} />
                  </Button>
                </section>
              </div>
            )}
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
                canConfirm={[
                  'rentals.confirm.branch',
                  'rentals.confirm.all',
                  'rentals.manage.branch',
                  'rentals.manage.all',
                ].some((permission) => effectivePermissions.includes(permission))}
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
            {(route.screen === 'reports' || route.screen === 'staffReports') && (
              <ReportsPage scenario={scenario} branch={activeBranch} />
            )}
          </>
        )}
      </main>
      <SiteFooter branchContacts={publicBranchContacts} compact={staff} />
    </div>
  );
}
