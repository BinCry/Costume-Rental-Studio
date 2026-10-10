import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { ApiSessionControl } from '../components/ApiSessionControl';
import { apiEnabled, currentUser, hasAccessToken, listBranches } from '../api/client';
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
const isStaff = (screen: Screen) =>
  !['catalog', 'detail', 'booking', 'myRentals', 'myRentalDetail', 'account'].includes(screen);
const requiredPermission: Partial<Record<Screen, string>> = {
  dashboard: 'rentals.read.branch',
  orders: 'rentals.read.branch',
  counter: 'rentals.manage.branch',
  active: 'rentals.read.branch',
  inventory: 'inventory.read.branch',
  transfers: 'transfers.manage.branch',
  crm: 'crm.read.branch',
  adminCatalog: 'catalog.manage.all',
  employees: 'staff.manage.all',
  roles: 'rbac.manage.all',
  branches: 'branches.manage.all',
};

export default function StudioApp() {
  const [route, setRoute] = useState(readRoute);
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [role, setRole] = useState<DemoRole>('ADMIN');
  const [apiIdentity, setApiIdentity] = useState<ApiIdentity>();
  const [apiBranchIds, setApiBranchIds] = useState<Record<string, string>>({});
  const [branch, setBranch] = useState('Chi nhánh Quận 1');
  const [customerCode, setCustomerCode] = useState('KH-001');
  const [menuOpen, setMenuOpen] = useState(false);
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
  useEffect(() => {
    const onPop = () => {
      setRoute(readRoute());
      setMenuOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const refresh = () => setAccessRevision((value) => value + 1);
    window.addEventListener('fixture-access-updated', refresh);
    return () => window.removeEventListener('fixture-access-updated', refresh);
  }, []);
  useEffect(() => {
    if (!apiEnabled) return;
    let active = true;
    const syncIdentity = () => {
      if (!hasAccessToken()) {
        setApiIdentity(undefined);
        return;
      }
      void currentUser()
        .then((identity) => {
          if (active) setApiIdentity(identity);
        })
        .catch(() => {
          if (active) setApiIdentity(undefined);
        });
    };
    syncIdentity();
    void listBranches()
      .then((items) => {
        if (active) setApiBranchIds(Object.fromEntries(items.map((item) => [item.name, item.id])));
      })
      .catch(() => undefined);
    window.addEventListener('api-session-changed', syncIdentity);
    return () => {
      active = false;
      window.removeEventListener('api-session-changed', syncIdentity);
    };
  }, []);
  useEffect(() => {
    sectionNavRef.current
      ?.querySelector<HTMLElement>('a.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [route.screen, role, branch, apiIdentity]);
  const go: Navigate = (screen, params) => {
    window.history.pushState(null, '', pathFor(screen, params));
    setRoute(readRoute());
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const activeRole: DemoRole =
    (apiIdentity?.roles.find((entry) => entry.actorGroup === 'ADMIN' || entry.actorGroup === 'STAFF')
      ?.roleCode as DemoRole | undefined) ??
    (apiIdentity?.roles.find((entry) => entry.actorGroup === 'CUSTOMER')?.roleCode as
      | DemoRole
      | undefined) ??
    role;
  const activeBranchId = apiBranchIds[branch];
  const serverPermissions = Array.from(
    new Set(
      apiIdentity?.roles
        .filter((entry) => entry.branchId === null || entry.branchId === activeBranchId)
        .flatMap((entry) => entry.permissions.map((permission) => permission.code)) ?? [],
    ),
  );
  const staff = isStaff(route.screen);
  const assigned =
    apiIdentity
      ? apiIdentity.roles.length > 0
      : activeRole === 'ADMIN' ||
        activeRole === 'CUSTOMER' ||
        fixtureEmployees.some(
          (employee) =>
            employee.accountStatus === 'ACTIVE' &&
            employee.employmentStatus === 'ACTIVE' &&
            employee.assignments.some(
              (assignment) => assignment.branch === branch && assignment.roleCode === activeRole,
            ),
        );
  const effectivePermissions = apiIdentity
    ? serverPermissions
    : fixtureRoles.find((item) => item.code === activeRole)?.permissions ?? [];
  const canOpen = (screen: Screen) => {
    if (!assigned) return false;
    if (screen === 'handover' || screen === 'return')
      return (
        (activeRole === 'ADMIN' || activeRole === 'SALES_STAFF') &&
        effectivePermissions.includes('rentals.manage.branch')
      );
    const item = staffNav.find((value) => value.screen === screen);
    if (!item?.roles.includes(activeRole)) return false;
    if (screen === 'policies') return activeRole === 'ADMIN';
    if (screen === 'reports')
      return effectivePermissions.includes(
        activeRole === 'ADMIN' ? 'reports.read.all' : 'reports.read.branch',
      );
    const permission = requiredPermission[screen];
    return !permission || effectivePermissions.includes(permission);
  };
  const nav = staff ? staffNav.filter((x) => canOpen(x.screen)) : customerNav;
  const protectedArea = staff && !canOpen(route.screen);
  const p = route.params;
  return (
    <div className={`app ${staff ? 'app-staff' : 'app-customer'}`}>
      <a className="skip-link" href="#main-content">
        Bỏ qua điều hướng
      </a>
      <div className="demo-banner">
        <span className="demo-dot" />{' '}
        {apiEnabled
          ? 'Đã bật API · Đăng nhập để đọc và ghi dữ liệu máy chủ'
          : 'Bản demo giao diện · Dữ liệu fixture, thao tác không lưu lên máy chủ'}
      </div>
      <header className="site-header">
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
          <nav
            id="main-navigation"
            className={`top-nav ${menuOpen ? 'open' : ''}`}
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
            <a
              className="mobile-area-switch"
              href={staff ? '/' : '/van-hanh/tong-quan'}
              onClick={(e) => {
                e.preventDefault();
                go(staff ? 'catalog' : 'dashboard');
              }}
            >
              {staff ? 'Xem khu khách' : 'Khu vận hành'} <Icon name="arrow" size={16} />
            </a>
          </nav>
          <div className="header-actions">
            <a
              className="area-switch"
              href={staff ? '/' : '/van-hanh/tong-quan'}
              onClick={(e) => {
                e.preventDefault();
                go(staff ? 'catalog' : 'dashboard');
              }}
            >
              {staff ? 'Xem khu khách' : 'Khu vận hành'} <Icon name="arrow" size={16} />
            </a>
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
          </div>
        </div>
      </header>
      {apiEnabled && (
        <div className="api-session-bar">
          <div className="api-session-inner">
            <ApiSessionControl />
          </div>
        </div>
      )}
      {staff && (
        <nav ref={sectionNavRef} className="section-nav" aria-label="Khu vận hành và quản trị">
          {nav.map((item) => (
            <a
              key={item.screen}
              href={pathFor(item.screen)}
              className={route.screen === item.screen ? 'active' : ''}
              onClick={(e) => {
                e.preventDefault();
                go(item.screen);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
      {import.meta.env.DEV && (
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
                <select id="demo-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
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
      <main
        id="main-content"
        className="main-content"
        ref={mainRef}
        tabIndex={-1}
        key={`${route.screen}:${branch}:${p.get('order') ?? ''}`}
      >
        {protectedArea ? (
          <div className="page">
            <div className="feedback feedback-danger" role="alert">
              <div>
                <strong>Không có quyền truy cập khu vực này</strong>
                <p>
                  {assigned
                    ? 'Vai trò mẫu không có mã quyền cần thiết.'
                    : `Vai trò mẫu chưa có nhân viên ACTIVE được phân công tại ${branch}.`}{' '}
                  Backend phải xác minh quyền hiệu lực tại chi nhánh cho phiên thật.
                </p>
              </div>
            </div>
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
                onRoleChange={(nextRole) => {
                  if (!apiIdentity) setRole(nextRole);
                }}
              />
            )}
            {route.screen === 'dashboard' && <DashboardPage scenario={scenario} go={go} />}
            {route.screen === 'orders' && (
              <OrdersPage
                scenario={scenario}
                go={go}
                canManage={effectivePermissions.includes('rentals.manage.branch')}
                initialOrderId={p.get('order') ?? undefined}
                initialFilter={p.get('filter') ?? undefined}
                initialBranch={branch}
              />
            )}
            {route.screen === 'handover' && (
              <OrderDetailShell
                scenario={scenario}
                mode="handover"
                go={go}
                initialOrderId={p.get('order') ?? 'RT-1028'}
                initialBranch={branch}
              />
            )}
            {route.screen === 'return' && (
              <OrderDetailShell
                scenario={scenario}
                mode="return"
                go={go}
                initialOrderId={p.get('order') ?? 'RT-1031'}
                initialBranch={branch}
              />
            )}
            {route.screen === 'counter' && (
              <CounterRentalPage
                scenario={scenario}
                go={go}
                branch={branch}
                canConfirm={effectivePermissions.includes('rentals.manage.branch')}
              />
            )}
            {route.screen === 'active' && (
              <ActiveRentalsPage scenario={scenario} go={go} branch={branch} />
            )}
            {route.screen === 'inventory' && (
              <InventoryPage
                scenario={scenario}
                go={go}
                branch={branch}
                canManage={effectivePermissions.includes('inventory.manage.branch')}
              />
            )}
            {route.screen === 'transfers' && <TransfersPage scenario={scenario} branch={branch} />}
            {route.screen === 'crm' && (
              <CrmPage
                scenario={scenario}
                branch={branch}
                canManage={effectivePermissions.includes('crm.manage.branch')}
              />
            )}
            {route.screen === 'adminCatalog' && <CatalogAdminPage scenario={scenario} />}
            {route.screen === 'employees' && <EmployeesPage scenario={scenario} />}
            {route.screen === 'roles' && <RolesPage scenario={scenario} />}
            {route.screen === 'branches' && <BranchesPage scenario={scenario} />}
            {route.screen === 'policies' && <PoliciesPage scenario={scenario} />}
            {route.screen === 'reports' && (
              <ReportsPage scenario={scenario} branch={branch} allBranches={activeRole === 'ADMIN'} />
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>Studio Trang Phục · Prototype UI</span>
        <span>{apiEnabled ? 'Dữ liệu từ API khi đã đăng nhập · Fixture là fallback' : 'Dữ liệu minh họa · Chưa kết nối API nghiệp vụ'}</span>
      </footer>
    </div>
  );
}
