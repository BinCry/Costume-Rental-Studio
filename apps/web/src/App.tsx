import { useEffect, useState } from 'react';
import { Icon } from './components/ui';
import type { DemoScenario } from './fixtures/types';
import { CatalogPage } from './pages/CatalogPage';
import { BookingPage } from './pages/BookingPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailShell } from './pages/OrderDetailShell';

export type Screen = 'catalog' | 'booking' | 'dashboard' | 'orders' | 'handover' | 'return';
export type Navigate = (screen: Screen, params?: Record<string, string>) => void;
const scenarioOptions: { value: DemoScenario; label: string }[] = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'loading', label: 'Đang tải' },
  { value: 'empty', label: 'Trống' },
  { value: 'error', label: 'Lỗi mạng' },
  { value: 'conflict', label: 'Xung đột khả dụng' },
  { value: 'version', label: 'Đơn bị sửa' },
  { value: 'cancelled', label: 'Khách đã hủy' },
  { value: 'permission', label: 'Mất quyền' },
  { value: 'bankPending', label: 'Chuyển khoản chờ đối soát' },
  { value: 'refundFailed', label: 'Hoàn cọc thất bại' },
  { value: 'barcodeMissing', label: 'Barcode không tìm thấy' },
  { value: 'barcodeOtherBranch', label: 'Barcode khác chi nhánh' },
  { value: 'unitBlocked', label: 'Bộ đang vệ sinh/sửa' },
];

function getRoute() {
  const raw = window.location.hash.slice(1) || 'catalog';
  const [path, search = ''] = raw.split('?');
  const valid: Screen[] = ['catalog', 'booking', 'dashboard', 'orders', 'handover', 'return'];
  return {
    screen: valid.includes(path as Screen) ? (path as Screen) : 'catalog',
    params: new URLSearchParams(search),
  };
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onRoute = () => {
      setRoute(getRoute());
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onRoute);
    return () => window.removeEventListener('hashchange', onRoute);
  }, []);
  const go: Navigate = (screen, params) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    window.location.hash = `${screen}${query}`;
    setRoute(getRoute());
  };
  const staff = ['dashboard', 'orders', 'handover', 'return'].includes(route.screen);
  const nav = staff
    ? [
        { screen: 'dashboard' as Screen, label: 'Bảng việc', icon: 'clock' as const },
        { screen: 'orders' as Screen, label: 'Đơn thuê', icon: 'bag' as const },
        { screen: 'handover' as Screen, label: 'Giao đồ', icon: 'arrow' as const },
        { screen: 'return' as Screen, label: 'Nhận trả', icon: 'scan' as const },
      ]
    : [
        { screen: 'catalog' as Screen, label: 'Khám phá', icon: 'spark' as const },
        { screen: 'booking' as Screen, label: 'Đặt thuê', icon: 'bag' as const },
      ];
  return (
    <div className={`app ${staff ? 'app-staff' : 'app-customer'}`}>
      <div className="demo-banner">
        <span className="demo-dot" /> Bản demo giao diện · Dữ liệu fixture, thao tác không lưu lên
        máy chủ
      </div>
      <header className="site-header">
        <div className="header-inner">
          <a href="#catalog" className="brand" aria-label="Studio Trang Phục, về trang khám phá">
            <span className="brand-mark">S</span>
            <span>
              STUDIO<span className="brand-period">.</span>
              <small>TRANG PHỤC</small>
            </span>
          </a>
          <nav className={`top-nav ${menuOpen ? 'open' : ''}`} aria-label="Điều hướng chính">
            {nav.map((item) => (
              <a
                key={item.screen}
                href={`#${item.screen}`}
                className={route.screen === item.screen ? 'active' : ''}
              >
                <Icon name={item.icon} size={17} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <a className="area-switch" href={staff ? '#catalog' : '#dashboard'}>
              {staff ? 'Xem khu khách' : 'Khu nhân viên'} <Icon name="arrow" size={16} />
            </a>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label="Mở điều hướng"
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </header>
      <div className="demo-controls">
        <div className="demo-controls-inner">
          <span>Kiểm tra trạng thái UI</span>
          <label htmlFor="demo-scenario">Tình huống fixture</label>
          <select
            id="demo-scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value as DemoScenario)}
          >
            {scenarioOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <main id="main-content" className="main-content">
        {route.screen === 'catalog' && <CatalogPage scenario={scenario} go={go} />}
        {route.screen === 'booking' && (
          <BookingPage
            scenario={scenario}
            go={go}
            costumeId={route.params.get('costume') ?? undefined}
          />
        )}
        {route.screen === 'dashboard' && <DashboardPage scenario={scenario} go={go} />}
        {route.screen === 'orders' && (
          <OrdersPage
            scenario={scenario}
            go={go}
            initialOrderId={route.params.get('order') ?? undefined}
            initialFilter={route.params.get('filter') ?? undefined}
          />
        )}
        {route.screen === 'handover' && (
          <OrderDetailShell
            scenario={scenario}
            mode="handover"
            go={go}
            initialOrderId={route.params.get('order') ?? 'RT-1028'}
          />
        )}
        {route.screen === 'return' && (
          <OrderDetailShell
            scenario={scenario}
            mode="return"
            go={go}
            initialOrderId={route.params.get('order') ?? 'RT-1031'}
          />
        )}
      </main>
      <footer className="site-footer">
        <span>Studio Trang Phục · Prototype UI</span>
        <span>Chỉ có 5 luồng lõi · Dữ liệu minh họa</span>
      </footer>
    </div>
  );
}
