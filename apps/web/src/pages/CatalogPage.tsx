import { useCallback, useEffect, useRef, useState, type TransitionEvent } from 'react';
import type { Navigate } from '../App';
import { ImageWithFallback } from '../components/ImageWithFallback';
import {
  Button,
  EmptyState,
  Feedback,
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
import { checkCatalogAvailability, type CatalogAvailability } from './catalogAvailability';

const loadCatalog = (scenario: DemoScenario) => fixtureAdapter.listCatalog(scenario);

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
        <span className="media-caption">{item.imageUrl ? 'Ảnh trang phục' : 'Ảnh minh họa'}</span>
      </div>
      <div className="costume-body">
        <div className="costume-top">
          <div>
            <p className="eyebrow">{item.category}</p>
            <h3>{item.name}</h3>
          </div>
          <Icon name="arrow" size={19} />
        </div>
        <p className="costume-description">{item.description}</p>
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
          Xem chi tiết <Icon name="arrow" size={17} />
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [apiAvailability, setApiAvailability] = useState<AvailabilitySnapshot>();
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const previewRef = useRef<HTMLElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const { loading, data, error, retry } = useFixtureResource(scenario, loadCatalog);
  const context = { branch, pickup, returnAt, category, size, color, search };
  useEffect(() => {
    if (window.location.pathname !== '/') return;
    const params = new URLSearchParams();
    if (branch && branch !== branches[0]) params.set('branch', branch);
    if (pickup) params.set('pickup', pickup);
    if (returnAt) params.set('returnAt', returnAt);
    if (category !== 'Tất cả') params.set('category', category);
    if (size !== 'Tất cả') params.set('size', size);
    if (color !== 'Tất cả') params.set('color', color);
    if (search) params.set('search', search);
    window.history.replaceState(null, '', `/${params.toString() ? `?${params}` : ''}`);
  }, [branch, pickup, returnAt, category, size, color, search]);
  const periodSelected = !!pickup && !!returnAt;
  const dateRangeIssue =
    periodSelected &&
    (!Number.isFinite(Date.parse(pickup)) ||
      !Number.isFinite(Date.parse(returnAt)) ||
      Date.parse(returnAt) <= Date.parse(pickup))
      ? 'Thời điểm trả phải sau thời điểm nhận.'
      : '';
  const availabilityRequestEnabled =
    apiMode && !!branch && periodSelected && !dateRangeIssue && Boolean(data?.length);
  const availabilityKey = JSON.stringify([branch, pickup, returnAt, size, color]);
  const currentApiAvailability =
    apiAvailability?.key === availabilityKey
      ? apiAvailability.values
      : availabilityRequestEnabled && data?.length
        ? Object.fromEntries(data.map((item) => [item.id, 'loading' as const]))
        : {};
  const currentAvailableVariants =
    apiAvailability?.key === availabilityKey ? apiAvailability.availableVariants : {};
  useEffect(() => {
    if (!availabilityRequestEnabled || !data?.length) return;
    let cancelled = false;
    void checkCatalogAvailability(data, branch, pickup, returnAt, size, color).then((values) => {
      if (!cancelled) setApiAvailability({ key: availabilityKey, ...values });
    });
    return () => {
      cancelled = true;
    };
  }, [
    apiMode,
    availabilityKey,
    availabilityRequestEnabled,
    availabilityRetry,
    branch,
    color,
    data,
    pickup,
    returnAt,
    size,
  ]);
  const fixtureAvailabilityKnown =
    !apiMode &&
    pickup === fixturePeriod.pickup &&
    returnAt === fixturePeriod.returnAt &&
    branch === branches[0];
  const categoryOptions = [
    ...new Set((data ?? []).map((item) => item.category).filter(Boolean)),
  ].sort();
  const sizeOptions = [...new Set((data ?? []).flatMap((item) => item.sizes))].sort();
  const colorOptions = [...new Set((data ?? []).flatMap((item) => item.colors))].sort();
  const filtered = (data ?? []).filter(
    (item) =>
      (category === 'Tất cả' || item.category === category) &&
      (size === 'Tất cả' || item.sizes.includes(size)) &&
      (color === 'Tất cả' || item.colors.includes(color)) &&
      item.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
  );
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
  return (
    <div className="page catalog-page">
      <section className="catalog-hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Icon name="spark" size={15} /> THE LOOK IS YOURS
          </span>
          <h1>
            Trang phục đẹp.
            <br />
            <em>Khoảnh khắc của bạn.</em>
          </h1>
          <a className="button button-primary" href="#bo-suu-tap">
            Khám phá bộ sưu tập <Icon name="arrow" size={18} />
          </a>
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
      <section className="availability-bar" aria-label="Chi nhánh và thời gian thuê">
        <div className="availability-title">
          <Icon name="calendar" size={21} />
          <span>
            Chọn lịch của bạn<small>Khả dụng chỉ hiển thị sau khi chọn kỳ thuê</small>
          </span>
        </div>
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
        <Field
          label="Nhận đồ"
          type="datetime-local"
          value={pickup}
          onChange={(event) => setPickup(event.target.value)}
        />
        <Field
          label="Trả đồ"
          type="datetime-local"
          value={returnAt}
          onChange={(event) => setReturnAt(event.target.value)}
          error={dateRangeIssue || undefined}
        />
      </section>
      <section id="bo-suu-tap" className="catalog-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CHỌN ĐÚNG PHONG CÁCH</p>
            <h2>Bộ sưu tập trang phục</h2>
          </div>
          <div className="catalog-count">
            {loading ? 'Đang tải...' : `${filtered.length} mẫu trang phục`}
          </div>
        </div>
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
              <button className="text-button" onClick={reset}>
                Xóa lọc
              </button>
            </div>
            <Field
              label="Tìm trang phục"
              placeholder="Tên mẫu bạn thích"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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
            <p className="filter-note">
              Giá “từ” là mức tham khảo theo biến thể. Báo giá cuối cần được studio xác nhận.
            </p>
          </aside>
          <div className="catalog-results">
            <div className="result-toolbar">
              <div className="active-chips">
                <span className="chip">
                  <Icon name="pin" size={15} />
                  {branch}
                </span>
                {periodSelected && (
                  <span className="chip">
                    <Icon name="calendar" size={15} />
                    {pickup.slice(0, 10)} → {returnAt.slice(0, 10)}
                  </span>
                )}
              </div>
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
                    <p>{selectedItem.description}</p>
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
            {loading ? (
              <SkeletonGrid />
            ) : !error && filtered.length === 0 ? (
              <EmptyState
                title={
                  periodSelected
                    ? 'Không có trang phục phù hợp tại chi nhánh và thời gian này'
                    : 'Chưa có mẫu phù hợp bộ lọc'
                }
              >
                Hãy đổi ngày, xóa bộ lọc hoặc chọn chi nhánh khác.
                <div className="empty-actions">
                  <Button variant="secondary" onClick={reset}>
                    Xóa bộ lọc
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setPickup('');
                      setReturnAt('');
                    }}
                  >
                    Đổi ngày
                  </Button>
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
      <section className="rental-guide" aria-labelledby="rental-guide-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CÁCH THUÊ</p>
            <h2 id="rental-guide-title">Thuê trang phục trong 3 bước</h2>
          </div>
        </div>
        <ol className="rental-guide-steps">
          <li>
            <span>01</span>
            <h3>Chọn mẫu và lịch</h3>
            <p>Chọn mẫu, size và ngày thuê.</p>
          </li>
          <li>
            <span>02</span>
            <h3>Studio xác nhận</h3>
            <p>Studio kiểm tra lịch rồi xác nhận từng bộ.</p>
          </li>
          <li>
            <span>03</span>
            <h3>Nhận đồ và quyết toán cọc</h3>
            <p>Thanh toán khi nhận; cọc được quyết toán sau khi trả đồ.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
