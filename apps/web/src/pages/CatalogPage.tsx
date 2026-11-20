import { useCallback, useEffect, useRef, useState, type TransitionEvent } from 'react';
import type { Navigate } from '../App';
import { ImageWithFallback } from '../components/ImageWithFallback';
import {
  Button,
  EmptyState,
  Feedback,
  DateTimeField,
  Field,
  Icon,
  SelectField,
  SkeletonGrid,
  StatusLabel,
} from '../components/ui';
import { money } from '../components/support';
import { useFixtureResource } from '../components/useFixtureResource';
import { branches, fixtureAdapter, fixturePeriod } from '../fixtures/adapter';
import type { CatalogItem, DemoScenario } from '../fixtures/types';
import { apiEnabled, hasAccessToken } from '../api/client';
import { useBranchOptions } from '../components/useBranchOptions';
import { BranchAddressNote } from '../components/BranchAddressNote';
import {
  formatCalendarDate,
  minimumRentalDateTime,
  minimumRentalReturnDateTime,
} from '../utils/date-format';
import { rentalPeriodIssues } from '../utils/rental-period';
import { checkCatalogAvailability, type CatalogAvailability } from './catalogAvailability';

const loadCatalog = (scenario: DemoScenario) => fixtureAdapter.listCatalog(scenario);
type CatalogSort = 'default' | 'price-asc' | 'price-desc' | 'name';
function catalogSortFromUrl(value: string | null): CatalogSort {
  return value === 'price-asc' || value === 'price-desc' || value === 'name' ? value : 'default';
}

interface AvailabilitySnapshot {
  key: string;
  values: Record<string, CatalogAvailability>;
  availableVariants: Record<string, string[]>;
}

const heroLooks = [
  { code: 'ao-dai', label: 'Áo dài' },
  { code: 'suit', label: 'Suit' },
  { code: 'dam', label: 'Đầm' },
] as const;

function HeroCarousel() {
  // Lặp ba bộ ảnh để lượt cuối trượt về bộ đầu mà không giật khung hình.
  const [position, setPosition] = useState(2);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [manuallyPlaying, setManuallyPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [tablet, setTablet] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches,
  );
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const resetFrame = useRef<number | undefined>(undefined);
  const activeLook = heroLooks[(position - 2) % heroLooks.length];
  const trackOffset = compact
    ? -((position + 1) * 100) / 9
    : tablet
      ? 4.54545 - ((position + 1) * 100) / 9
      : -(position * 100) / 9;
  const resetLoop = useCallback(() => {
    setTransitionEnabled(false);
    setPosition(2);
    if (resetFrame.current !== undefined) window.cancelAnimationFrame(resetFrame.current);
    resetFrame.current = window.requestAnimationFrame(() => {
      resetFrame.current = window.requestAnimationFrame(() => setTransitionEnabled(true));
    });
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setCompact(narrow.matches);
      if (narrow.matches) resetLoop();
    };
    narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, [resetLoop]);

  useEffect(() => {
    const medium = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const update = () => {
      setTablet(medium.matches);
      resetLoop();
    };
    medium.addEventListener('change', update);
    return () => medium.removeEventListener('change', update);
  }, [resetLoop]);

  useEffect(() => {
    if (paused || reducedMotion || ((hovered || focused) && !manuallyPlaying)) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setPosition((current) => current + 1);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reducedMotion, manuallyPlaying]);

  useEffect(() => {
    if (position !== 5) return;
    const fallback = window.setTimeout(resetLoop, 1100);
    return () => window.clearTimeout(fallback);
  }, [position, resetLoop]);

  useEffect(
    () => () => {
      if (resetFrame.current !== undefined) window.cancelAnimationFrame(resetFrame.current);
    },
    [],
  );

  const finishSlide = (event: TransitionEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== 'transform' ||
      position !== 5
    )
      return;
    resetLoop();
  };

  return (
    <div
      className="hero-image"
      role="group"
      aria-roledescription="carousel"
      aria-label={`Ba phong cách trang phục minh họa, nổi bật: ${activeLook.label}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!focused) setManuallyPlaying(false);
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          if (!hovered) setManuallyPlaying(false);
        }
      }}
    >
      <div
        className="hero-carousel-track"
        style={{
          transform: `translate3d(${trackOffset}%, 0, 0)`,
          transition: transitionEnabled ? undefined : 'none',
        }}
        onTransitionEnd={finishSlide}
        aria-live="off"
      >
        {Array.from({ length: 9 }, (_, index) => {
          const look = heroLooks[index % heroLooks.length];
          return (
            <div
              className={`hero-slide hero-slide--${look.code} ${index === position + 1 ? 'is-active' : index === position ? 'is-prev' : index === position + 2 ? 'is-next' : ''}`}
              key={`${look.code}-${index}`}
              aria-hidden={index !== position + 1}
            >
              <div className="hero-slide-visual">
                <div className="hero-slide-photo">
                  <img
                    src="/images/lookbook-minh-hoa.webp"
                    alt={`Ảnh minh họa trang phục ${look.label}`}
                    draggable="false"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hero-carousel-controls">
        <div className="hero-carousel-indicator" role="group" aria-label="Chọn ảnh minh họa">
          {heroLooks.map((look, index) => (
            <button
              type="button"
              className={look.code === activeLook.code ? 'is-active' : ''}
              key={look.code}
              aria-label={`Hiển thị ảnh minh họa ${look.label}`}
              aria-current={look.code === activeLook.code ? 'true' : undefined}
              onClick={() => setPosition(index + 2)}
            >
              <span />
            </button>
          ))}
        </div>
        {!reducedMotion && (
          <button
            className="hero-carousel-pause"
            type="button"
            onClick={() => {
              setManuallyPlaying(paused);
              setPaused(!paused);
            }}
            aria-label={
              paused ? 'Tiếp tục trình chiếu trang phục' : 'Tạm dừng trình chiếu trang phục'
            }
            aria-pressed={paused}
            title={paused ? 'Tiếp tục' : 'Tạm dừng'}
          >
            {paused ? '▶' : 'Ⅱ'}
          </button>
        )}
      </div>
    </div>
  );
}

function CostumeCard({
  item,
  periodSelected,
  fixtureAvailabilityKnown,
  conflict,
  availabilityOverride,
  availabilityState,
  availableVariants,
  onRetry,
  onView,
}: {
  item: CatalogItem;
  periodSelected: boolean;
  fixtureAvailabilityKnown: boolean;
  conflict: boolean;
  availabilityOverride?: boolean;
  availabilityState?: CatalogAvailability;
  availableVariants?: string[];
  onRetry?: () => void;
  onView: (trigger: HTMLButtonElement) => void;
}) {
  const available = availabilityOverride ?? item.availableAtFixturePeriod;
  const availability = availabilityState
    ? availabilityState === 'loading'
      ? 'Đang kiểm tra biến thể…'
      : availabilityState === 'error'
        ? 'Chưa kiểm tra được lịch'
        : availabilityState === 'available'
          ? 'Có size/màu phù hợp theo kỳ đã chọn'
          : 'Không có size/màu phù hợp theo kỳ này'
    : periodSelected && fixtureAvailabilityKnown
      ? available && !conflict
        ? 'Còn theo kỳ chọn'
        : 'Không còn theo kỳ chọn'
      : undefined;
  return (
    <article className="costume-card">
      <div
        className={`costume-media costume-${item.imagePosition}`}
        role={item.imageUrl ? undefined : 'img'}
        aria-label={item.imageUrl ? undefined : (item.imageAlt ?? `Ảnh minh họa mẫu ${item.name}`)}
      >
        {item.imageUrl ? (
          <ImageWithFallback src={item.imageUrl} alt={item.imageAlt ?? item.name} />
        ) : item.imagePosition === 'missing' ? (
          <span className="media-placeholder">
            <Icon name="spark" size={30} /> Chưa có ảnh
          </span>
        ) : null}
      </div>
      <div className="costume-body">
        <div className="costume-top">
          <div>
            <p className="eyebrow">{item.category}</p>
            <h3>{item.name}</h3>
          </div>
        </div>
        {item.description.trim() && <p className="costume-description">{item.description}</p>}
        <p className="costume-variant">
          {item.sizes.join(', ')} <span>·</span> {item.colors.join(', ')}
        </p>
        <div className="costume-price">
          <span>
            Từ <strong>{money(item.priceFrom)}</strong>/ngày
          </span>
          <small>Cọc từ {money(item.depositFrom)}</small>
        </div>
        {availability && (
          <div className="inline-status">
            <StatusLabel
              text={availability}
              tone={
                availability.startsWith('Có') || availability.startsWith('Còn')
                  ? 'success'
                  : availability.startsWith('Đang')
                    ? 'info'
                    : availability.startsWith('Chưa')
                      ? 'danger'
                      : 'warning'
              }
            />
            {availabilityState === 'available' && availableVariants?.length ? (
              <p className="availability-variants">
                Có thể thuê theo kỳ này: {availableVariants.join(', ')}
              </p>
            ) : null}
            {availabilityState === 'error' && onRetry && (
              <button type="button" className="text-button" onClick={onRetry}>
                Thử lại
              </button>
            )}
          </div>
        )}
        {periodSelected && !availability && !fixtureAvailabilityKnown && (
          <StatusLabel text="Chưa có dữ liệu khả dụng cho kỳ này" tone="neutral" />
        )}
        <Button
          variant="secondary"
          className="card-button"
          onClick={(event) => onView(event.currentTarget)}
        >
          Xem nhanh <Icon name="arrow" size={17} />
        </Button>
      </div>
    </article>
  );
}

export function CatalogPage({
  scenario,
  go,
  initialContext,
}: {
  scenario: DemoScenario;
  go: Navigate;
  initialContext: URLSearchParams;
}) {
  const requestedBranch = initialContext.get('branch');
  const apiMode = apiEnabled && (hasAccessToken() || !import.meta.env.DEV);
  const {
    options: branchOptions,
    addresses: branchAddresses,
    ready: branchOptionsReady,
    error: branchOptionsError,
    retry: retryBranches,
  } = useBranchOptions();
  const [branchSelection, setBranchSelection] = useState(() =>
    requestedBranch?.trim() ? requestedBranch : apiMode ? '' : branches[0],
  );
  const branch = branchOptions.includes(branchSelection)
    ? branchSelection
    : (branchOptions[0] ?? (apiMode ? '' : branchSelection));
  const [pickup, setPickup] = useState(initialContext.get('pickup') ?? '');
  const [returnAt, setReturnAt] = useState(initialContext.get('returnAt') ?? '');
  const [category, setCategory] = useState(initialContext.get('category') ?? 'Tất cả');
  const [size, setSize] = useState(initialContext.get('size') ?? 'Tất cả');
  const [color, setColor] = useState(initialContext.get('color') ?? 'Tất cả');
  const [search, setSearch] = useState(initialContext.get('search') ?? '');
  const [sort, setSort] = useState<CatalogSort>(() =>
    catalogSortFromUrl(initialContext.get('sort')),
  );
  const [availabilityOnly, setAvailabilityOnly] = useState(initialContext.get('available') === '1');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [apiAvailability, setApiAvailability] = useState<AvailabilitySnapshot>();
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const previewRef = useRef<HTMLElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const { loading, data, error, retry } = useFixtureResource(scenario, loadCatalog);
  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    const initialTimer = window.setTimeout(updateTime, 0);
    const interval = window.setInterval(updateTime, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);
  const context = {
    branch,
    pickup,
    returnAt,
    category,
    size,
    color,
    search,
    sort,
    available: availabilityOnly ? '1' : '',
  };
  useEffect(() => {
    if (window.location.pathname !== '/') return;
    const params = new URLSearchParams();
    if (branch && branch !== branches[0]) params.set('branch', branch);
    if (pickup) params.set('pickup', pickup);
    if (returnAt) params.set('returnAt', returnAt);
    if (category !== 'Tất cả') params.set('category', category);
    if (size !== 'Tất cả') params.set('size', size);
    if (color !== 'Tất cả') params.set('color', color);
    if (normalizedSearch) params.set('search', search.trim());
    if (sort !== 'default') params.set('sort', sort);
    if (availabilityOnly) params.set('available', '1');
    window.history.replaceState(null, '', `/${params.toString() ? `?${params}` : ''}`);
  }, [
    branch,
    pickup,
    returnAt,
    category,
    size,
    color,
    search,
    normalizedSearch,
    sort,
    availabilityOnly,
  ]);
  const periodSelected = !!pickup && !!returnAt;
  const { pickupIssue, returnIssue } = rentalPeriodIssues(pickup, returnAt);
  const dateRangeIssue = pickupIssue ?? returnIssue;
  const availabilityRequestEnabled =
    apiMode && !!branch && periodSelected && !dateRangeIssue && Boolean(data?.length);
  const availabilityKey = JSON.stringify([
    branch,
    pickup,
    returnAt,
    category,
    size,
    color,
    normalizedSearch,
  ]);
  const currentApiAvailability =
    availabilityRequestEnabled && apiAvailability?.key === availabilityKey
      ? apiAvailability.values
      : availabilityRequestEnabled && data?.length
        ? Object.fromEntries(data.map((item) => [item.id, 'loading' as const]))
        : {};
  const currentAvailableVariants =
    availabilityRequestEnabled && apiAvailability?.key === availabilityKey
      ? apiAvailability.availableVariants
      : {};
  useEffect(() => {
    if (!availabilityRequestEnabled || !data?.length) return;
    let cancelled = false;
    const visible = data.filter(
      (item) =>
        (category === 'Tất cả' || item.category === category) &&
        item.name.toLocaleLowerCase('vi').includes(normalizedSearch),
    );
    const timer = window.setTimeout(() => {
      void checkCatalogAvailability(visible, branch, pickup, returnAt, size, color).then(
        (values) => {
          if (!cancelled) setApiAvailability({ key: availabilityKey, ...values });
        },
      );
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    apiMode,
    availabilityKey,
    availabilityRequestEnabled,
    availabilityRetry,
    branch,
    category,
    color,
    data,
    pickup,
    returnAt,
    normalizedSearch,
    size,
  ]);
  const fixtureAvailabilityKnown =
    !apiMode &&
    !dateRangeIssue &&
    pickup === fixturePeriod.pickup &&
    returnAt === fixturePeriod.returnAt &&
    branch === branches[0];
  const categoryOptions = [
    ...new Set((data ?? []).map((item) => item.category).filter(Boolean)),
  ].sort();
  const sizeOptions = [...new Set((data ?? []).flatMap((item) => item.sizes))].sort();
  const colorOptions = [...new Set((data ?? []).flatMap((item) => item.colors))].sort();
  const filteredByControls = (data ?? []).filter(
    (item) =>
      (category === 'Tất cả' || item.category === category) &&
      (item.apiVariants?.length
        ? item.apiVariants.some(
            (variant) =>
              (size === 'Tất cả' || variant.size === size) &&
              (color === 'Tất cả' || variant.color === color),
          )
        : (size === 'Tất cả' || item.sizes.includes(size)) &&
          (color === 'Tất cả' || item.colors.includes(color))) &&
      item.name.toLocaleLowerCase('vi').includes(normalizedSearch),
  );
  if (sort !== 'default') {
    filteredByControls.sort((first, second) => {
      const difference =
        sort === 'name'
          ? first.name.localeCompare(second.name, 'vi')
          : sort === 'price-desc'
            ? second.priceFrom - first.priceFrom
            : first.priceFrom - second.priceFrom;
      return (
        difference ||
        first.name.localeCompare(second.name, 'vi') ||
        first.id.localeCompare(second.id)
      );
    });
  }
  const availabilitySearchReady = apiMode
    ? Boolean(branch && periodSelected && !dateRangeIssue)
    : fixtureAvailabilityKnown;
  const availabilityResultsLoading =
    availabilityOnly &&
    apiMode &&
    availabilitySearchReady &&
    filteredByControls.some(
      (item) => !currentApiAvailability[item.id] || currentApiAvailability[item.id] === 'loading',
    );
  const availabilityResultsFailed =
    availabilityOnly &&
    apiMode &&
    availabilitySearchReady &&
    filteredByControls.length > 0 &&
    filteredByControls.every((item) => currentApiAvailability[item.id] === 'error');
  const availabilityResultsPartiallyFailed =
    availabilityOnly &&
    apiMode &&
    availabilitySearchReady &&
    filteredByControls.some((item) => currentApiAvailability[item.id] === 'error') &&
    !availabilityResultsFailed;
  const filtered = !availabilityOnly
    ? filteredByControls
    : !availabilitySearchReady
      ? []
      : apiMode
        ? filteredByControls.filter((item) => currentApiAvailability[item.id] === 'available')
        : filteredByControls.filter(
            (item) => item.availableAtFixturePeriod && scenario !== 'conflict',
          );
  const catalogCountLabel = loading
    ? 'Đang tải mẫu…'
    : availabilityOnly
      ? !availabilitySearchReady
        ? 'Chọn lịch để lọc'
        : availabilityResultsLoading
          ? 'Đang kiểm tra lịch…'
          : `${filtered.length} mẫu còn hàng`
      : `${filtered.length} mẫu trang phục`;
  const hasActiveFilters =
    category !== 'Tất cả' || size !== 'Tất cả' || color !== 'Tất cả' || Boolean(search.trim());
  const reset = () => {
    setCategory('Tất cả');
    setSize('Tất cả');
    setColor('Tất cả');
    setSearch('');
  };
  const openPreview = (item: CatalogItem, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setSelectedItem(item);
    window.requestAnimationFrame(() => {
      previewRef.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  const closePreview = () => {
    setSelectedItem(null);
    window.requestAnimationFrame(() => {
      previewTriggerRef.current?.focus({ preventScroll: true });
      previewTriggerRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };
  const beginAvailabilitySearch = () => {
    setAvailabilityOnly(true);
    const filters = document.getElementById('availability-filters');
    filters?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'center',
    });
    window.requestAnimationFrame(() =>
      filters?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true }),
    );
  };
  const toggleAvailabilityOnly = () => setAvailabilityOnly((current) => !current);
  return (
    <div className="page catalog-page">
      <section className="catalog-hero">
        <div className="hero-copy">
          <h1>
            Thuê trang phục
            <br />
            <em>theo lịch của bạn.</em>
          </h1>
          <div className="hero-actions">
            <a
              className="button button-primary"
              href="#bo-suu-tap"
              onClick={() => setAvailabilityOnly(false)}
            >
              Xem bộ sưu tập <Icon name="arrow" size={18} />
            </a>
            <button
              className="button button-secondary"
              type="button"
              aria-controls="availability-filters"
              onClick={beginAvailabilitySearch}
            >
              Tìm mẫu theo lịch <Icon name="calendar" size={18} />
            </button>
          </div>
        </div>
        <HeroCarousel />
      </section>
      {branchOptionsError && (
        <Feedback tone="danger" title="Chưa tải được danh sách chi nhánh">
          Danh mục vẫn hiển thị, nhưng chưa thể kiểm tra lịch thuê.{' '}
          <Button variant="secondary" onClick={retryBranches}>
            Thử lại
          </Button>
        </Feedback>
      )}
      <section
        id="availability-filters"
        className="availability-bar"
        aria-label="Chi nhánh và thời gian thuê"
      >
        <div className="branch-picker-field">
          <SelectField
            label="Chi nhánh"
            value={branch}
            disabled={!branchOptionsReady || branchOptions.length === 0}
            onChange={(event) => setBranchSelection(event.target.value)}
          >
            {branchOptions.length === 0 && (
              <option value="">
                {branchOptionsReady ? 'Chưa có chi nhánh khả dụng' : 'Đang tải chi nhánh…'}
              </option>
            )}
            {branchOptions.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </SelectField>
          <BranchAddressNote branchName={branch} address={branchAddresses[branch]} />
        </div>
        <DateTimeField
          label="Nhận đồ"
          value={pickup}
          min={currentTime > 0 ? minimumRentalDateTime(currentTime) : undefined}
          error={pickupIssue}
          onChange={setPickup}
        />
        <DateTimeField
          label="Trả đồ"
          value={returnAt}
          min={currentTime > 0 ? minimumRentalReturnDateTime(pickup, currentTime) : undefined}
          onChange={setReturnAt}
          error={returnIssue}
        />
      </section>
      <section id="bo-suu-tap" className="catalog-section">
        <div className="section-heading">
          <div>
            <h2>Bộ sưu tập trang phục</h2>
          </div>
          <div className="catalog-heading-actions">
            <Button
              variant="secondary"
              className="availability-mode-toggle"
              aria-pressed={availabilityOnly}
              onClick={toggleAvailabilityOnly}
            >
              {availabilityOnly ? 'Xem tất cả mẫu' : 'Chỉ mẫu còn hàng'}
            </Button>
            <div className="catalog-count" role="status" aria-live="polite">
              {catalogCountLabel}
            </div>
          </div>
        </div>
        {availabilityOnly && !periodSelected && (
          <Feedback tone="info" title="Chọn lịch để tìm mẫu còn hàng">
            Nhập chi nhánh, giờ nhận và giờ trả ở khung phía trên.
          </Feedback>
        )}
        {availabilityOnly &&
          periodSelected &&
          !dateRangeIssue &&
          !apiMode &&
          !fixtureAvailabilityKnown && (
            <Feedback tone="info" title="Chưa có dữ liệu tồn kho cho lịch này">
              Bản xem thử chỉ có dữ liệu cho một kỳ mẫu. Có thể xem toàn bộ mẫu hoặc thử kỳ mẫu.
            </Feedback>
          )}
        {dateRangeIssue && (
          <Feedback tone="warning" title="Khoảng thuê chưa hợp lệ">
            {dateRangeIssue} Tồn kho chưa được kiểm tra.
          </Feedback>
        )}
        <div className="catalog-layout">
          <aside
            id="catalog-filters"
            className={`catalog-filters ${filterOpen ? 'open' : ''}`}
            aria-label="Bộ lọc trang phục"
          >
            <div className="filter-heading">
              <h3>Bộ lọc</h3>
            </div>
            <SelectField
              label="Loại trang phục"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {['Tất cả', ...categoryOptions].map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </SelectField>
            <SelectField
              label="Kích cỡ"
              value={size}
              onChange={(event) => setSize(event.target.value)}
            >
              {['Tất cả', ...sizeOptions].map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </SelectField>
            <SelectField
              label="Màu sắc"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            >
              {['Tất cả', ...colorOptions].map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </SelectField>
          </aside>
          <div className="catalog-results">
            <div className="catalog-controls">
              <Field
                label="Tìm trang phục"
                type="search"
                placeholder="Tên mẫu trang phục"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <SelectField
                label="Sắp xếp"
                value={sort}
                onChange={(event) => setSort(event.target.value as CatalogSort)}
              >
                <option value="default">Mặc định</option>
                <option value="price-asc">Giá thấp trước</option>
                <option value="price-desc">Giá cao trước</option>
                <option value="name">Tên A–Z</option>
              </SelectField>
              <Button
                variant="secondary"
                className="filter-toggle"
                aria-expanded={filterOpen}
                aria-controls="catalog-filters"
                onClick={() => setFilterOpen(!filterOpen)}
              >
                <Icon name="filter" size={18} /> Bộ lọc
              </Button>
            </div>
            <div className="result-toolbar">
              <span className="catalog-mobile-count" role="status" aria-live="polite">
                {catalogCountLabel}
              </span>
              <div className="active-chips">
                <span className="chip">
                  <Icon name="pin" size={15} />
                  {branch}
                </span>
                {periodSelected && (
                  <button
                    type="button"
                    className="chip chip-filter"
                    onClick={() => {
                      setPickup('');
                      setReturnAt('');
                    }}
                    aria-label="Xóa kỳ thuê đã chọn"
                  >
                    <Icon name="calendar" size={15} />
                    {formatCalendarDate(pickup.slice(0, 10))} →{' '}
                    {formatCalendarDate(returnAt.slice(0, 10))}
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                {availabilityOnly && (
                  <span className="chip">
                    <Icon name="check" size={15} />
                    Chỉ mẫu còn hàng
                  </span>
                )}
                {category !== 'Tất cả' && (
                  <button
                    type="button"
                    className="chip chip-filter"
                    onClick={() => setCategory('Tất cả')}
                    aria-label={`Xóa lọc loại ${category}`}
                  >
                    Loại: {category} <span aria-hidden="true">×</span>
                  </button>
                )}
                {size !== 'Tất cả' && (
                  <button
                    type="button"
                    className="chip chip-filter"
                    onClick={() => setSize('Tất cả')}
                    aria-label={`Xóa lọc kích cỡ ${size}`}
                  >
                    Size: {size} <span aria-hidden="true">×</span>
                  </button>
                )}
                {color !== 'Tất cả' && (
                  <button
                    type="button"
                    className="chip chip-filter"
                    onClick={() => setColor('Tất cả')}
                    aria-label={`Xóa lọc màu ${color}`}
                  >
                    Màu: {color} <span aria-hidden="true">×</span>
                  </button>
                )}
                {search.trim() && (
                  <button
                    type="button"
                    className="chip chip-filter"
                    onClick={() => setSearch('')}
                    aria-label={`Xóa từ khóa ${search}`}
                  >
                    Tìm: {search} <span aria-hidden="true">×</span>
                  </button>
                )}
                {hasActiveFilters && (
                  <button type="button" className="text-button" onClick={reset}>
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>
            {selectedItem &&
              !loading &&
              !error &&
              data?.some((entry) => entry.id === selectedItem.id) && (
                <section
                  ref={previewRef}
                  className="catalog-preview"
                  aria-label={`Chi tiết ${selectedItem.name}`}
                  tabIndex={-1}
                >
                  <div className={`catalog-preview-image costume-${selectedItem.imagePosition}`}>
                    {selectedItem.imageUrl ? (
                      <ImageWithFallback
                        src={selectedItem.imageUrl}
                        alt={selectedItem.imageAlt ?? selectedItem.name}
                      />
                    ) : (
                      <ImageWithFallback alt={selectedItem.imageAlt ?? selectedItem.name} />
                    )}
                  </div>
                  <div className="catalog-preview-copy">
                    <div className="preview-top">
                      <p className="eyebrow">XEM NHANH TRANG PHỤC</p>
                      <button
                        className="icon-button"
                        aria-label="Đóng chi tiết trang phục"
                        onClick={closePreview}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <h3>{selectedItem.name}</h3>
                    {selectedItem.description.trim() && <p>{selectedItem.description}</p>}
                    <p>
                      <strong>Size:</strong> {selectedItem.sizes.join(', ')} · <strong>Màu:</strong>{' '}
                      {selectedItem.colors.join(', ')}
                    </p>
                    <p>
                      <strong>Giá tham khảo:</strong> từ {money(selectedItem.priceFrom)}/ngày ·{' '}
                      <strong>Cọc:</strong> từ {money(selectedItem.depositFrom)}
                    </p>
                    <p className="preview-disclaimer">
                      Việc chọn mẫu chưa giữ bộ. Studio xác nhận mã bộ sau khi nhận yêu cầu.
                    </p>
                    <div className="feature-actions">
                      <Button
                        variant="secondary"
                        onClick={() => go('detail', { id: selectedItem.id, ...context })}
                      >
                        Xem đầy đủ
                      </Button>
                      <Button
                        onClick={() => go('booking', { costume: selectedItem.id, ...context })}
                      >
                        Bắt đầu yêu cầu thuê <Icon name="arrow" size={17} />
                      </Button>
                    </div>
                  </div>
                </section>
              )}
            {scenario === 'conflict' && periodSelected && (
              <Feedback
                tone="warning"
                title="Không còn bộ phù hợp ở chi nhánh này trong thời gian đã chọn"
              >
                Hãy đổi ngày, chi nhánh, size hoặc xóa bộ lọc. Lựa chọn khác vẫn được giữ.
              </Feedback>
            )}
            {error && (
              <Feedback
                tone="danger"
                title="Không tải được bộ sưu tập"
                action={
                  <Button variant="secondary" onClick={retry}>
                    Thử lại
                  </Button>
                }
              >
                {error}
              </Feedback>
            )}
            {availabilityResultsFailed && (
              <Feedback
                tone="danger"
                title="Chưa kiểm tra được tồn kho theo lịch"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setAvailabilityRetry((value) => value + 1)}
                  >
                    Thử lại
                  </Button>
                }
              >
                Giữ nguyên lịch đã chọn rồi thử lại.
              </Feedback>
            )}
            {availabilityResultsPartiallyFailed && (
              <Feedback
                tone="warning"
                title="Một số mẫu chưa kiểm tra được lịch"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setAvailabilityRetry((value) => value + 1)}
                  >
                    Thử lại
                  </Button>
                }
              >
                Danh sách chỉ hiển thị các mẫu đã xác nhận còn hàng.
              </Feedback>
            )}
            {loading || availabilityResultsLoading ? (
              <SkeletonGrid />
            ) : availabilityOnly &&
              (!availabilitySearchReady || availabilityResultsFailed) ? null : !error &&
              filtered.length === 0 ? (
              <EmptyState
                title={
                  availabilityOnly
                    ? availabilityResultsPartiallyFailed
                      ? 'Chưa xác định được mẫu còn hàng'
                      : 'Không có mẫu còn hàng theo lịch này'
                    : periodSelected
                      ? 'Không có trang phục phù hợp tại chi nhánh và thời gian này'
                      : 'Chưa có mẫu phù hợp bộ lọc'
                }
              >
                {availabilityOnly
                  ? 'Thử size khác, đổi thời gian hoặc chọn chi nhánh khác.'
                  : 'Hãy đổi ngày, xóa bộ lọc hoặc chọn chi nhánh khác.'}
                <div className="empty-actions">
                  {availabilityOnly ? (
                    <Button variant="secondary" onClick={toggleAvailabilityOnly}>
                      Xem tất cả mẫu
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={reset}>
                      Xóa bộ lọc
                    </Button>
                  )}
                  {periodSelected && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setPickup('');
                        setReturnAt('');
                        if (availabilityOnly) setAvailabilityOnly(false);
                      }}
                    >
                      Đổi ngày
                    </Button>
                  )}
                </div>
              </EmptyState>
            ) : (
              !error && (
                <div className="catalog-grid">
                  {filtered.map((item) => (
                    <CostumeCard
                      key={item.id}
                      item={item}
                      periodSelected={periodSelected}
                      fixtureAvailabilityKnown={fixtureAvailabilityKnown}
                      conflict={scenario === 'conflict'}
                      availabilityOverride={
                        currentApiAvailability[item.id] === 'available'
                          ? true
                          : currentApiAvailability[item.id] === 'unavailable'
                            ? false
                            : undefined
                      }
                      availabilityState={
                        apiMode && periodSelected ? currentApiAvailability[item.id] : undefined
                      }
                      availableVariants={currentAvailableVariants[item.id]}
                      onRetry={() => setAvailabilityRetry((value) => value + 1)}
                      onView={(trigger) => openPreview(item, trigger)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
