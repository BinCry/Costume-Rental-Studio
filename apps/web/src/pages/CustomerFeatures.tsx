import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Navigate } from '../App';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { BrandLogoMark } from '../components/BrandLogoMark';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Feedback,
  Field,
  SelectField,
  StatusLabel,
} from '../components/ui';
import { defaultRentalDate, money, orderStatus } from '../components/support';
import {
  BranchSelector,
  DateTimeField,
  FilterBar,
  InlineIssue,
  KeyFacts,
  MoneySummary,
  PageHeading,
  Panel,
  StateGate,
  Timeline,
} from '../components/studio';
import { useFixtureResource } from '../components/useFixtureResource';
import { branches, fixturePeriod } from '../fixtures/adapter';
import { studioAdapter, type CostumeDetail, type CustomerOrder } from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';
import {
  ApiClientError,
  apiEnabled,
  checkPublicAvailability,
  createPaymentCheckout,
  getCustomerOrderEndReason,
  getOrderSettlement,
  getOwnCustomerProfile,
  getPublicModelVariants,
  listCustomerOrders,
  listOrderPayments,
  hasAccessToken,
  type SettlementSnapshot,
  updateOwnCustomerProfile,
} from '../api/client';
import { useBranchOptions } from '../components/useBranchOptions';
import { isValidPhone } from '../utils/phone';
import { rentalPeriodIssues } from '../utils/rental-period';

const loadCostumeDetails =
  (id: string) =>
  async (scenario: DemoScenario): Promise<CostumeDetail[]> => {
    if (!apiEnabled || (!hasAccessToken() && import.meta.env.DEV))
      return studioAdapter.details(scenario);
    // The public endpoint exposes only published model and variant data.
    const variants = await getPublicModelVariants(id);
    const first = variants[0];
    if (!first) return [];
    const modelImages = (first.model?.media ?? []).flatMap((media) =>
      media.mediaUrl ? [{ url: media.mediaUrl, alt: media.altText ?? undefined }] : [],
    );
    return [
      {
        id,
        name: first.model?.name ?? first.variantCode,
        category: first.model?.category?.name ?? 'Trang phục',
        description: first.model?.shortDescription ?? first.model?.description ?? '',
        material: first.model?.material ?? 'Thông tin chất liệu sẽ được xác nhận tại studio.',
        accessories: [],
        imagePosition: modelImages.length ? 'center' : 'missing',
        imageUrl: modelImages[0]?.url,
        imageAlt: modelImages[0]?.alt,
        images: modelImages,
        variants: variants.map((variant) => ({
          apiId: variant.id,
          code: variant.variantCode,
          modelId: variant.modelId,
          size: variant.sizeCode,
          color: variant.colorCode,
          edition: variant.editionLabel ?? undefined,
          fit: variant.fitNotes ?? '',
          images: (variant.media ?? []).flatMap((media) =>
            media.mediaUrl ? [{ url: media.mediaUrl, alt: media.altText ?? undefined }] : [],
          ),
          price: Number(variant.dailyRentalPriceVnd),
          deposit: Number(variant.depositAmountVnd),
        })),
      },
    ];
  };

const loadCustomerOrders = (scenario: DemoScenario) =>
  apiEnabled && (hasAccessToken() || !import.meta.env.DEV)
    ? listCustomerOrders()
    : studioAdapter.customerOrders(scenario);

function readDetailPeriod(key: string) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as {
      pickup?: unknown;
      due?: unknown;
    } | null;
    if (typeof saved?.pickup === 'string' && typeof saved?.due === 'string') {
      return { pickup: saved.pickup, due: saved.due };
    }
  } catch {
    // Detail still works when session storage is unavailable.
  }
  return undefined;
}

export function CostumeDetailPage({
  id,
  scenario,
  go,
  initialContext,
}: {
  id: string;
  scenario: DemoScenario;
  go: Navigate;
  initialContext: URLSearchParams;
}) {
  const loadDetails = useMemo(() => loadCostumeDetails(id), [id]);
  const { loading, error, data, retry } = useFixtureResource(scenario, loadDetails);
  const requestedPickup = initialContext.get('pickup');
  const requestedReturn = initialContext.get('returnAt');
  const requestedBranch = initialContext.get('branch');
  const usePublicApi = apiEnabled && (hasAccessToken() || !import.meta.env.DEV);
  const {
    options: branchOptions,
    ready: branchOptionsReady,
    error: branchOptionsError,
    retry: retryBranches,
  } = useBranchOptions();
  const defaultPickup = usePublicApi ? defaultRentalDate(1) : fixturePeriod.pickup;
  const defaultReturn = usePublicApi ? defaultRentalDate(3) : fixturePeriod.returnAt;
  const [variantCode, setVariantCode] = useState(initialContext.get('variantCode') ?? '');
  const [branchSelection, setBranchSelection] = useState(
    requestedBranch ?? (usePublicApi ? '' : branches[0]),
  );
  const branch = branchOptions.includes(branchSelection)
    ? branchSelection
    : (branchOptions[0] ?? (usePublicApi ? '' : branchSelection));
  const periodKey = 'costume-rental.detail-period:' + id;
  const [period, setPeriod] = useState(() => {
    const fromCatalog = requestedPickup !== null || requestedReturn !== null;
    const saved = fromCatalog ? undefined : readDetailPeriod(periodKey);
    return {
      pickup: requestedPickup ?? saved?.pickup ?? defaultPickup,
      due: requestedReturn ?? saved?.due ?? defaultReturn,
    };
  });
  const { pickup, due } = period;
  const [photo, setPhoto] = useState(0);
  const selectedVariant =
    data?.find((value) => value.id === id)?.variants.find((value) => value.code === variantCode) ??
    data?.find((value) => value.id === id)?.variants[0];
  const selectedVariantCode = selectedVariant?.code;
  useEffect(() => {
    if (!selectedVariantCode) return;
    const url = new URL(window.location.href);
    const detailPath = '/trang-phuc/' + encodeURIComponent(id);
    if (url.pathname.replace(/\/$/, '') !== detailPath) return;
    const before = url.href;
    url.searchParams.set('variantCode', selectedVariantCode);
    if (branch) url.searchParams.set('branch', branch);
    if (pickup) url.searchParams.set('pickup', pickup);
    else url.searchParams.delete('pickup');
    if (due) url.searchParams.set('returnAt', due);
    else url.searchParams.delete('returnAt');
    if (url.href !== before) window.history.replaceState(window.history.state, '', url);
  }, [branch, due, id, pickup, selectedVariantCode]);

  const { pickupIssue, returnIssue } = rentalPeriodIssues(pickup, due);
  const dateRangeIssue = pickupIssue ?? returnIssue;
  const apiVariantId = selectedVariant?.apiId;
  const [availabilityResult, setAvailabilityResult] = useState<{
    key: string;
    status: 'available' | 'unavailable' | 'error';
  }>();
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const availabilityKey = JSON.stringify([apiVariantId, branch, pickup, due]);
  const hasAvailabilityInputs =
    usePublicApi && !!apiVariantId && !!branch && !!pickup && !!due && !dateRangeIssue;
  useEffect(() => {
    if (!hasAvailabilityInputs || !apiVariantId) return;
    let active = true;
    void checkPublicAvailability(apiVariantId, branch, pickup, due)
      .then(
        (result) =>
          active &&
          setAvailabilityResult({
            key: availabilityKey,
            status: result.available ? 'available' : 'unavailable',
          }),
      )
      .catch(() => active && setAvailabilityResult({ key: availabilityKey, status: 'error' }));
    return () => {
      active = false;
    };
  }, [
    availabilityKey,
    apiVariantId,
    availabilityRetry,
    branch,
    due,
    hasAvailabilityInputs,
    pickup,
  ]);
  const availability = hasAvailabilityInputs
    ? availabilityResult?.key === availabilityKey
      ? availabilityResult.status
      : 'loading'
    : 'idle';
  const catalogContext = Object.fromEntries(
    [...initialContext.entries()].filter(([key]) => key !== 'id' && key !== 'variantCode'),
  );
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có trang phục để xem"
    >
      {(items) => {
        const item = items.find((value) => value.id === id);
        if (!item)
          return (
            <div className="page">
              <EmptyState title="Không tìm thấy mẫu trang phục">
                <Button onClick={() => go('catalog', catalogContext)}>Về bộ sưu tập</Button>
              </EmptyState>
            </div>
          );
        const variant =
          item.variants.find((value) => value.code === variantCode) ?? item.variants[0];
        if (!variant) return <EmptyState title="Mẫu này chưa có biến thể để đặt thuê" />;
        const gallery = variant.images?.length ? variant.images : (item.images ?? []);
        const activeImage = gallery[photo];
        const fixtureKnown =
          !dateRangeIssue &&
          branch === 'Chi nhánh Quận 1' &&
          pickup === fixturePeriod.pickup &&
          due === fixturePeriod.returnAt;
        const known = usePublicApi
          ? availability !== 'idle' && availability !== 'loading'
          : fixtureKnown;
        const available = usePublicApi
          ? availability === 'available'
          : fixtureKnown && item.id !== 'dam-rouge' && scenario !== 'conflict';
        return (
          <div className="page">
            <button
              className="text-link"
              onClick={() => go('catalog', { ...catalogContext, branch, pickup, returnAt: due })}
            >
              ← Bộ sưu tập
            </button>
            <div className="costume-detail-grid">
              <div>
                <div className={`detail-photo costume-${item.imagePosition}`}>
                  <ImageWithFallback
                    src={activeImage?.url ?? item.imageUrl}
                    alt={activeImage?.alt ?? item.imageAlt ?? item.name}
                    loading="eager"
                  />
                </div>
                {gallery.length > 1 && (
                  <div className="photo-thumbs" role="group" aria-label="Ảnh của biến thể đã chọn">
                    {gallery.map((image, n) => (
                      <button
                        type="button"
                        key={`${image.url}-${n}`}
                        onClick={() => setPhoto(n)}
                        aria-pressed={photo === n}
                        aria-label={image.alt?.trim() ? image.alt : `Xem ảnh ${n + 1}`}
                        className={photo === n ? 'selected' : ''}
                      >
                        <img src={image.url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
                {gallery.length === 0 && !item.imageUrl && (
                  <p className="muted small-note">Ảnh minh họa.</p>
                )}
              </div>
              <div>
                <p className="eyebrow">{item.category} · Bộ sưu tập</p>
                <h1>{item.name}</h1>
                <Panel title="Chọn size / màu">
                  <div className="variant-pills">
                    {item.variants.map((value) => (
                      <button
                        key={value.code}
                        className={variant.code === value.code ? 'active' : ''}
                        onClick={() => {
                          setVariantCode(value.code);
                          setPhoto(0);
                        }}
                        aria-pressed={variant.code === value.code}
                      >
                        {value.size} · {value.color}
                        {value.edition ? ` · ${value.edition}` : ''}
                      </button>
                    ))}
                  </div>
                  <KeyFacts
                    rows={[
                      { label: 'Giá thuê / ngày', value: money(variant.price) },
                      { label: 'Tiền cọc', value: money(variant.deposit) },
                    ]}
                  />
                </Panel>
                <Panel title="Kiểm tra khoảng thuê">
                  <div className="feature-filters">
                    <BranchSelector
                      value={branch}
                      options={branchOptions}
                      disabled={!branchOptionsReady || branchOptions.length === 0}
                      onChange={setBranchSelection}
                    />
                    <DateTimeField
                      label="Nhận"
                      value={pickup}
                      error={pickupIssue}
                      onChange={(next) => setPeriod((current) => ({ ...current, pickup: next }))}
                    />
                    <DateTimeField
                      label="Trả"
                      value={due}
                      error={returnIssue}
                      onChange={(next) => setPeriod((current) => ({ ...current, due: next }))}
                    />
                  </div>
                  {branchOptionsError && (
                    <Feedback tone="danger" title="Chưa tải được danh sách chi nhánh">
                      Hãy thử lại trước khi kiểm tra lịch thuê.{' '}
                      <button type="button" className="text-button" onClick={retryBranches}>
                        Thử lại
                      </button>
                    </Feedback>
                  )}
                  <Feedback
                    tone={
                      dateRangeIssue
                        ? 'warning'
                        : known
                          ? available
                            ? 'success'
                            : 'warning'
                          : 'info'
                    }
                    action={
                      availability === 'error' ? (
                        <Button
                          variant="secondary"
                          onClick={() => setAvailabilityRetry((value) => value + 1)}
                        >
                          Thử lại
                        </Button>
                      ) : undefined
                    }
                    title={
                      dateRangeIssue
                        ? 'Khoảng thuê chưa hợp lệ'
                        : availability === 'loading'
                          ? 'Đang kiểm tra khả dụng'
                          : availability === 'error'
                            ? 'Chưa kiểm tra được khả dụng'
                            : known
                              ? available
                                ? 'Biến thể này đang có bộ khả dụng theo kỳ đã chọn'
                                : 'Không có bộ phù hợp theo kỳ mẫu'
                              : 'Chưa có dữ liệu khả dụng cho kỳ này'
                    }
                  >
                    {dateRangeIssue ??
                      (availability === 'error'
                        ? 'Hãy thử lại hoặc tiếp tục gửi yêu cầu để nhân viên kiểm tra trong bước duyệt.'
                        : 'Việc xem khả dụng không giữ bộ. Nhân viên sẽ duyệt và gán từng bộ sau khi bạn gửi yêu cầu.')}
                  </Feedback>
                </Panel>
                <div className="feature-actions">
                  <Button
                    disabled={!!dateRangeIssue}
                    onClick={() =>
                      go('booking', {
                        ...catalogContext,
                        costume: item.id,
                        variant: variant.code,
                        branch,
                        pickup,
                        returnAt: due,
                      })
                    }
                  >
                    Bắt đầu đặt thuê
                  </Button>
                </div>
                <p className="muted small-note">
                  Thanh toán qua payOS hoặc tại chi nhánh sau khi xác nhận; cọc quyết toán khi trả
                  đồ.
                </p>
                <details className="costume-detail-extra">
                  <summary>Chi tiết trang phục</summary>
                  {item.description && <p>{item.description}</p>}
                  {item.material && (
                    <p>
                      <strong>Chất liệu:</strong> {item.material}
                    </p>
                  )}
                  {variant.fit.trim() && (
                    <p>
                      <strong>Phom dáng:</strong> {variant.fit}
                    </p>
                  )}
                  {item.accessories.length > 0 && (
                    <p>
                      <strong>Phụ kiện:</strong> {item.accessories.join(' · ')}
                    </p>
                  )}
                  {variant.replacement && (
                    <p>
                      <strong>Giá thay thế:</strong> {money(variant.replacement)}
                    </p>
                  )}
                </details>
              </div>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}

function customerOrderNextStep(order: CustomerOrder) {
  switch (order.status) {
    case 'DRAFT':
      return 'Hoàn tất yêu cầu thuê để Studio kiểm tra lịch.';
    case 'PENDING_CONFIRMATION':
      return 'Chờ Studio xác nhận; chưa cần thanh toán.';
    case 'CONFIRMED':
    case 'PREPARING':
      return 'Kiểm tra số dư và lịch nhận đồ.';
    case 'READY_FOR_PICKUP':
      return 'Đến chi nhánh đúng giờ và mang theo mã đơn.';
    case 'ACTIVE':
      return 'Trả đồ trước hạn ghi trên đơn.';
    case 'RETURN_INSPECTION':
      return 'Chờ Studio kiểm tra đồ và quyết toán cọc.';
    case 'COMPLETED':
    case 'CANCELLED':
      if (order.refundStatus === 'Đang xử lý') return 'Theo dõi khoản hoàn tiền.';
      if (order.refundStatus === 'Cần kiểm tra') return 'Liên hệ Studio để đối chiếu khoản hoàn.';
      return 'Không cần thao tác.';
    case 'REJECTED':
      if (order.refundStatus === 'Đang xử lý') return 'Xem lý do và theo dõi khoản hoàn tiền.';
      if (order.refundStatus === 'Cần kiểm tra')
        return 'Xem lý do và liên hệ Studio về khoản hoàn.';
      return 'Xem lý do bên dưới và chọn mẫu khác nếu cần.';
    case 'NO_SHOW':
      return 'Liên hệ Studio nếu cần đối chiếu phí.';
  }
}

export function MyRentalsPage({
  id,
  scenario,
  go,
  customerCode,
}: {
  id?: string;
  scenario: DemoScenario;
  go: Navigate;
  customerCode: string;
}) {
  const { loading, error, data, retry } = useFixtureResource(scenario, loadCustomerOrders);
  const [filter, setFilter] = useState('Tất cả');
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<CustomerOrder>();
  const [endReason, setEndReason] = useState<{ orderId: string; text?: string; error?: boolean }>();
  const [reasonRetry, setReasonRetry] = useState(0);
  const reasonOrder = useMemo(
    () => (id ? (local?.id === id ? local : data?.find((order) => order.id === id)) : undefined),
    [id, local, data],
  );
  useEffect(() => {
    if (!id || !reasonOrder || reasonOrder.reason || !apiEnabled || !hasAccessToken()) return;
    if (!['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(reasonOrder.status)) return;
    let active = true;
    void getCustomerOrderEndReason(id)
      .then((text) => {
        if (active) setEndReason({ orderId: id, text });
      })
      .catch(() => {
        if (active) setEndReason({ orderId: id, error: true });
      });
    return () => {
      active = false;
    };
  }, [id, reasonOrder, reasonRetry]);
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Bạn chưa có đơn thuê"
    >
      {(orders) => {
        // The authenticated API already scopes this collection to the current customer.
        // Keep the fixture filter for the offline/demo adapter, where multiple customers
        // intentionally exist in the same in-memory collection.
        const ownOrders =
          apiEnabled && hasAccessToken()
            ? orders
            : orders.filter((order) => order.customerCode === customerCode);
        const visible = ownOrders.filter((order) => filter === 'Tất cả' || order.status === filter);
        const selected = id
          ? local?.id === id
            ? local
            : ownOrders.find((order) => order.id === id)
          : undefined;
        const confirm = async () => {
          if (!selected || !reason.trim()) {
            setIssue('Nhập lý do hủy trước khi xác nhận.');
            return;
          }
          setBusy(true);
          setIssue('');
          try {
            setLocal(await studioAdapter.cancelCustomerOrder(selected.id, reason, scenario));
            setEndReason({ orderId: selected.id, text: reason.trim() });
            setDialog(false);
            retry();
          } catch (e) {
            setIssue(e instanceof Error ? e.message : 'Không thể hủy đơn.');
          } finally {
            setBusy(false);
          }
        };
        if (id && !selected)
          return (
            <div className="page">
              <EmptyState title="Không tìm thấy đơn của bạn">
                <Button onClick={() => go('myRentals')}>Về danh sách</Button>
              </EmptyState>
            </div>
          );
        return (
          <div className="page">
            <PageHeading
              title={selected ? selected.id : 'Đơn của tôi'}
              action={
                selected ? (
                  <Button variant="secondary" onClick={() => go('myRentals')}>
                    ← Tất cả đơn
                  </Button>
                ) : undefined
              }
            />
            {selected ? (
              <div className="feature-two-column">
                <div>
                  <p className="customer-next-step">
                    <strong>Tiếp theo:</strong> {customerOrderNextStep(selected)}
                  </p>
                  <CustomerPaymentPanel
                    orderId={selected.id}
                    orderStatus={selected.status}
                    payments={selected.apiPayments ?? []}
                    realApiMode={apiEnabled && hasAccessToken()}
                    onOrdersRefresh={retry}
                  />
                  <Panel title="Thông tin thuê">
                    <div className="feature-status-row">
                      <StatusLabel {...orderStatus[selected.status]} />
                      <StatusLabel
                        text={`Tiền thuê: ${selected.rentalStatus}`}
                        tone={
                          selected.rentalStatus === 'Đã thu đủ'
                            ? 'success'
                            : selected.rentalStatus === 'Chưa thu'
                              ? 'neutral'
                              : 'warning'
                        }
                      />
                      <StatusLabel text={`Cọc: ${selected.depositStatus}`} tone="info" />
                      <StatusLabel text={`Trả: ${selected.returnStatus}`} tone="neutral" />
                    </div>
                    <KeyFacts
                      rows={[
                        {
                          label: 'Trang phục',
                          value:
                            selected.items
                              ?.map((item) => `${item.costume} · ${item.variant}`)
                              .join(' / ') ?? `${selected.costume} · ${selected.variant}`,
                        },
                        { label: 'Chi nhánh nhận và trả', value: selected.branch },
                        { label: 'Nhận', value: selected.pickup },
                        { label: 'Hạn trả', value: selected.due },
                      ]}
                    />
                    {(selected.reason ??
                      (endReason?.orderId === selected.id ? endReason.text : undefined)) && (
                      <Feedback tone="warning" title="Lý do kết thúc đơn">
                        {selected.reason ?? endReason?.text}
                      </Feedback>
                    )}
                    {endReason?.orderId === selected.id && endReason.error && (
                      <Feedback
                        tone="warning"
                        title="Chưa tải được lý do"
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => setReasonRetry((value) => value + 1)}
                          >
                            Thử lại
                          </Button>
                        }
                      />
                    )}
                    {selected.canCancel && (
                      <div className="destructive-area">
                        <Button
                          variant="danger"
                          onClick={() => {
                            setReason('');
                            setIssue('');
                            setDialog(true);
                          }}
                        >
                          Hủy yêu cầu
                        </Button>
                      </div>
                    )}
                  </Panel>
                  <details className="customer-order-history">
                    <summary>Lịch sử đơn</summary>
                    <Timeline items={selected.history} />
                  </details>
                </div>
                <div>
                  <MoneySummary
                    rental={selected.rental}
                    deposit={selected.deposit}
                    extra={selected.extra}
                    refund={selected.refund}
                  />
                  {selected.refundStatus !== 'Chưa phát sinh' &&
                    selected.refundStatus !== 'Chưa có dữ liệu' && (
                      <Panel title="Hoàn tiền">
                        <KeyFacts
                          rows={[
                            { label: 'Đã hoàn', value: money(selected.refund) },
                            ...(selected.refundPendingAmount
                              ? [
                                  {
                                    label: 'Đang chờ hoàn',
                                    value: money(selected.refundPendingAmount),
                                  },
                                ]
                              : []),
                            { label: 'Trạng thái', value: selected.refundStatus },
                            ...(selected.refundUpdatedAt
                              ? [{ label: 'Cập nhật', value: selected.refundUpdatedAt }]
                              : []),
                          ]}
                        />
                      </Panel>
                    )}
                </div>
              </div>
            ) : (
              <>
                <FilterBar>
                  <SelectField
                    label="Lọc trạng thái"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option>Tất cả</option>
                    {Array.from(new Set(ownOrders.map((order) => order.status))).map((status) => (
                      <option key={status} value={status}>
                        {orderStatus[status].text}
                      </option>
                    ))}
                  </SelectField>
                </FilterBar>
                {visible.length ? (
                  <div className="customer-order-list">
                    <div className="order-table-scroll customer-order-table">
                      <table className="order-table">
                        <thead>
                          <tr>
                            <th scope="col">Mã đơn</th>
                            <th scope="col">Trang phục</th>
                            <th scope="col">Nhận</th>
                            <th scope="col">Hạn trả</th>
                            <th scope="col">Trạng thái</th>
                            <th scope="col">Tiền thuê</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((order) => (
                            <tr key={order.id}>
                              <td>
                                <button
                                  type="button"
                                  className="order-table-link"
                                  onClick={() => go('myRentalDetail', { order: order.id })}
                                >
                                  {order.id}
                                </button>
                              </td>
                              <td>
                                {order.items?.length
                                  ? order.items.map((item) => item.costume).join(', ')
                                  : order.costume}
                              </td>
                              <td>{order.pickup}</td>
                              <td>{order.due}</td>
                              <td>
                                <StatusLabel {...orderStatus[order.status]} />
                              </td>
                              <td>{money(order.rental)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="customer-order-mobile-list">
                      {visible.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          className="customer-order-card"
                          onClick={() => go('myRentalDetail', { order: order.id })}
                        >
                          <span>
                            <strong>{order.id}</strong>
                            <StatusLabel {...orderStatus[order.status]} />
                          </span>
                          <span>
                            {order.items?.length
                              ? order.items.map((item) => item.costume).join(', ')
                              : order.costume}
                          </span>
                          <small>
                            Nhận {order.pickup} · Trả {order.due}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title={
                      ownOrders.length ? 'Không có đơn ở trạng thái này' : 'Bạn chưa có đơn thuê'
                    }
                  >
                    {ownOrders.length
                      ? 'Chọn trạng thái khác để xem đơn.'
                      : 'Khám phá trang phục và gửi yêu cầu thuê đầu tiên.'}
                  </EmptyState>
                )}
              </>
            )}
            {!dialog && (
              <InlineIssue
                text={issue}
                conflict={scenario === 'version' || scenario === 'cancelled'}
              />
            )}
            {dialog && selected && (
              <ConfirmDialog
                title="Hủy yêu cầu thuê"
                confirmText="Xác nhận hủy"
                danger
                loading={busy}
                onClose={() => {
                  setDialog(false);
                  setIssue('');
                }}
                onConfirm={() => void confirm()}
              >
                <p>
                  Yêu cầu {selected.id} sẽ kết thúc ngay khi hủy. Nếu đã trả tiền tại chi nhánh, hãy
                  liên hệ Studio để đối chiếu.
                </p>
                <Field
                  label="Lý do hủy"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  error={issue && !reason.trim() ? issue : undefined}
                />
                {issue && reason.trim() && <InlineIssue text={issue} />}
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

function CustomerPaymentPanel({
  orderId,
  orderStatus,
  payments,
  realApiMode,
  onOrdersRefresh,
}: {
  orderId: string;
  orderStatus: string;
  payments: NonNullable<CustomerOrder['apiPayments']>;
  realApiMode: boolean;
  onOrdersRefresh: () => void;
}) {
  const [settlement, setSettlement] = useState<SettlementSnapshot>();
  const [paymentRecords, setPaymentRecords] = useState<
    {
      purpose: string;
      amount: number | string;
      status: string;
      method?: string;
      checkoutUrl?: string | null;
    }[]
  >(payments);
  const [loading, setLoading] = useState(true);
  const [busyPurpose, setBusyPurpose] = useState<'RENTAL' | 'DEPOSIT' | 'EXTRA' | ''>('');
  const [loadError, setLoadError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [checkout, setCheckout] = useState<{
    purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA';
    url: string;
    amount: number;
    expiresAt?: string | null;
  }>();
  const paymentReadyStatuses = [
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'ACTIVE',
    'RETURN_INSPECTION',
  ];
  const paymentPendingConfirmation = orderStatus === 'PENDING_CONFIRMATION';
  const canPay = paymentReadyStatuses.includes(orderStatus);
  const retryPaymentState = () => {
    setLoading(true);
    setLoadError('');
    setReloadKey((value) => value + 1);
  };

  useEffect(() => {
    if (!realApiMode || !canPay) return;
    let active = true;
    void Promise.all([getOrderSettlement(orderId), listOrderPayments(orderId)])
      .then(([result, records]) => {
        if (!active) return;
        setSettlement(result);
        setPaymentRecords(
          records.map((payment) => ({
            purpose: payment.purpose,
            amount: Number(payment.amountVnd),
            status: payment.status,
            method: payment.method,
            checkoutUrl: payment.checkoutUrl,
          })),
        );
      })
      .catch((caught: unknown) => {
        if (active)
          setLoadError(
            caught instanceof Error ? caught.message : 'Chưa tải được số dư. Hãy thử tải lại.',
          );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [canPay, orderId, realApiMode, reloadKey]);

  if (!realApiMode || (!canPay && !paymentPendingConfirmation)) return null;
  const moneyValue = (value?: string | number) => Number(value ?? 0);
  const rows = settlement
    ? [
        {
          purpose: 'RENTAL' as const,
          label: 'Tiền thuê',
          remaining: moneyValue(settlement.rental.remainingVnd),
        },
        {
          purpose: 'DEPOSIT' as const,
          label: 'Tiền cọc',
          remaining: Math.max(
            0,
            moneyValue(settlement.deposit.dueVnd) - moneyValue(settlement.deposit.paidVnd),
          ),
        },
        {
          purpose: 'EXTRA' as const,
          label: 'Phụ phí',
          remaining: moneyValue(settlement.extra.remainingVnd),
        },
      ]
    : [];
  const pendingPayment = (purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA') =>
    paymentRecords.find(
      (payment) =>
        payment.purpose === purpose &&
        payment.method === 'PAYMENT_GATEWAY' &&
        ['PENDING', 'PROCESSING'].includes(payment.status),
    );
  const safeCheckoutUrl = (value?: string | null) => {
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  };
  const startCheckout = async (purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA', amount: number) => {
    if (busyPurpose || amount <= 0) return;
    setBusyPurpose(purpose);
    setCheckoutError('');
    setCheckout(undefined);
    try {
      const result = await createPaymentCheckout(orderId, purpose, amount);
      const url = safeCheckoutUrl(result.checkoutUrl);
      if (!url) {
        setCheckoutError(
          'Máy chủ chưa trả về liên kết thanh toán an toàn. Hãy tải lại quyết toán.',
        );
        return;
      }
      setCheckout({ purpose, url, amount, expiresAt: result.expiresAt });
      setPaymentRecords((current) => [
        {
          purpose,
          amount,
          status: result.payment.status,
          method: result.payment.method,
          checkoutUrl: url,
        },
        ...current.filter(
          (payment) =>
            payment.purpose !== purpose || !['PENDING', 'PROCESSING'].includes(payment.status),
        ),
      ]);
    } catch (caught) {
      setCheckoutError(
        caught instanceof Error
          ? caught.message
          : 'Chưa tạo được phiên thanh toán. Hãy kiểm tra trạng thái rồi thử lại.',
      );
    } finally {
      setBusyPurpose('');
    }
  };

  return (
    <Panel
      title="Thanh toán"
      action={
        canPay ? (
          <Button
            type="button"
            variant="quiet"
            disabled={loading || !!busyPurpose}
            onClick={() => {
              setCheckout(undefined);
              onOrdersRefresh();
            }}
          >
            {loading ? 'Đang tải…' : 'Tải lại'}
          </Button>
        ) : undefined
      }
    >
      {paymentPendingConfirmation ? (
        <Feedback tone="info" title="Thanh toán mở sau khi Studio xác nhận">
          Chưa thu tiền. Sau khi xác nhận, bạn có thể thanh toán online hoặc tại chi nhánh.
        </Feedback>
      ) : loading && !settlement ? (
        <p className="muted" role="status">
          Đang tải số dư thanh toán…
        </p>
      ) : loadError && !settlement ? (
        <Feedback
          tone="danger"
          title="Chưa tải được số dư thanh toán"
          action={
            <Button variant="secondary" onClick={retryPaymentState}>
              Thử lại
            </Button>
          }
        >
          {loadError}
        </Feedback>
      ) : (
        <div className="customer-payment-list">
          <p className="muted small-note">Thanh toán online được xác nhận sau khi cổng phản hồi.</p>
          {rows.map((row) => {
            if (row.purpose === 'EXTRA' && row.remaining <= 0) return null;
            const activeCheckout = checkout?.purpose === row.purpose ? checkout : undefined;
            const pending =
              pendingPayment(row.purpose) ??
              (activeCheckout
                ? { amount: activeCheckout.amount, checkoutUrl: activeCheckout.url }
                : undefined);
            const pendingUrl = safeCheckoutUrl(pending?.checkoutUrl);
            const paymentStatus = pending
              ? 'Đang chờ xác nhận'
              : row.remaining <= 0
                ? 'Đã thanh toán đủ'
                : 'Còn phải thanh toán';
            return (
              <div className="customer-payment-row" key={row.purpose}>
                <div className="customer-payment-row__summary">
                  <strong>{row.label}</strong>
                  <span>
                    {pending ? `Đang chờ ${money(Number(pending.amount))}` : money(row.remaining)}
                  </span>
                </div>
                <div className="customer-payment-row__actions">
                  <StatusLabel
                    text={paymentStatus}
                    tone={pending ? 'warning' : row.remaining <= 0 ? 'success' : 'neutral'}
                  />
                  {pendingUrl && !activeCheckout && (
                    <a
                      className="button button-secondary"
                      href={pendingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tiếp tục thanh toán
                    </a>
                  )}
                  {!pending && row.remaining > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      loading={busyPurpose === row.purpose}
                      disabled={!!busyPurpose || loading}
                      onClick={() => void startCheckout(row.purpose, row.remaining)}
                    >
                      Thanh toán online
                    </Button>
                  )}
                  {activeCheckout && (
                    <a
                      className="button button-primary"
                      href={activeCheckout.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở cổng thanh toán
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {loadError && settlement && (
            <Feedback
              tone="danger"
              title="Chưa làm mới được trạng thái thanh toán"
              action={
                <Button variant="secondary" onClick={retryPaymentState}>
                  Thử lại
                </Button>
              }
            >
              {loadError} Trạng thái đang hiển thị có thể chưa phải dữ liệu mới nhất.
            </Feedback>
          )}
          {checkoutError && (
            <Feedback tone="danger" title="Chưa tạo được phiên thanh toán">
              {checkoutError} Tải lại số dư trước khi thử lại để tránh tạo khoản trùng.
            </Feedback>
          )}
          {rows.some((row) => {
            const pending = pendingPayment(row.purpose);
            return !!pending && !safeCheckoutUrl(pending.checkoutUrl);
          }) && (
            <p className="muted small-note" role="status">
              Giao dịch đang chờ cổng xác nhận và chưa có liên kết tiếp tục. Hãy tải lại trạng thái;
              đừng tạo khoản thanh toán khác.
            </p>
          )}
          {checkout?.expiresAt && (
            <p className="field-hint">
              Liên kết hết hạn lúc{' '}
              {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
                new Date(checkout.expiresAt),
              )}
              .
            </p>
          )}
          <p className="muted small-note">
            Sau khi trả tiền, chọn “Tải lại” để kiểm tra trạng thái.
          </p>
        </div>
      )}
    </Panel>
  );
}

export function AccountPage({
  scenario,
  go,
  onRoleChange,
  apiIdentity,
  realApiMode = false,
}: {
  scenario: DemoScenario;
  go: Navigate;
  onRoleChange: (role: 'CUSTOMER' | 'SALES_STAFF' | 'INVENTORY_STAFF' | 'ADMIN') => void;
  apiIdentity?: {
    displayName: string;
    email: string;
    roles: { name: string; branchId: string | null; actorGroup?: string }[];
  };
  realApiMode?: boolean;
}) {
  const [state, setState] = useState<
    'entry' | 'profile' | 'PENDING' | 'LOCKED' | 'INACTIVE' | 'unauthorized' | 'ready'
  >('entry');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'SALES_STAFF' | 'INVENTORY_STAFF' | 'ADMIN'>(
    'CUSTOMER',
  );
  const [attempted, setAttempted] = useState(false);
  const [accountName, setAccountName] = useState(apiIdentity?.displayName ?? '');
  const [accountPhone, setAccountPhone] = useState('');
  const [savedAccountProfile, setSavedAccountProfile] = useState({
    name: apiIdentity?.displayName ?? '',
    phone: '',
  });
  const [accountEditing, setAccountEditing] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileIssue, setProfileIssue] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileAvailable, setProfileAvailable] = useState(false);
  const isApiCustomer = Boolean(
    realApiMode &&
    apiIdentity?.roles.some((assignedRole) => assignedRole.actorGroup === 'CUSTOMER'),
  );
  const profileRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state === 'profile') profileRef.current?.querySelector('input')?.focus();
    if (state === 'ready') successRef.current?.focus();
  }, [state]);
  useEffect(() => {
    if (attempted) profileRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempted]);
  useEffect(() => {
    if (!isApiCustomer) return;
    let active = true;
    void getOwnCustomerProfile()
      .then((profile) => {
        if (!active) return;
        setAccountName(profile.displayName);
        setAccountPhone(profile.phone ?? '');
        setSavedAccountProfile({ name: profile.displayName, phone: profile.phone ?? '' });
        setProfileIssue('');
        setProfileAvailable(true);
      })
      .catch(() => {
        if (active) setProfileIssue('Chưa tải được thông tin liên hệ. Hãy thử tải lại.');
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiIdentity?.email, isApiCustomer, profileRetry]);

  const saveAccountProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileIssue('');
    setProfileNotice('');
    const phoneIsValid = !accountPhone.trim() || isValidPhone(accountPhone);
    if (!accountName.trim()) {
      setProfileIssue('Hãy nhập họ và tên.');
      return;
    }
    if (!phoneIsValid) {
      setProfileIssue('Số điện thoại chưa đúng định dạng.');
      return;
    }
    setProfileSaving(true);
    try {
      const updated = await updateOwnCustomerProfile({
        displayName: accountName.trim(),
        phone: accountPhone.trim() || null,
      });
      setAccountName(updated.displayName);
      setAccountPhone(updated.phone ?? '');
      setSavedAccountProfile({ name: updated.displayName, phone: updated.phone ?? '' });
      setAccountEditing(false);
      setProfileNotice('Đã lưu thông tin liên hệ.');
      setProfileAvailable(true);
      window.dispatchEvent(new Event('api-session-changed'));
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'CONTACT_CONFLICT') {
        setProfileIssue('Số điện thoại này đã được dùng cho tài khoản khác.');
      } else {
        setProfileIssue('Chưa lưu được thông tin. Hãy kiểm tra kết nối rồi thử lại.');
      }
    } finally {
      setProfileSaving(false);
    }
  };
  if (realApiMode) {
    return (
      <div className="page account-page">
        <PageHeading title="Tài khoản" />
        <div className="account-layout">
          <Panel title={apiIdentity ? 'Hồ sơ' : 'Đăng nhập'}>
            {apiIdentity ? (
              <>
                <KeyFacts
                  rows={[
                    {
                      label: 'Họ tên',
                      value: profileAvailable ? savedAccountProfile.name : apiIdentity.displayName,
                    },
                    {
                      label: 'Email',
                      value: <span className="account-email">{apiIdentity.email}</span>,
                    },
                    ...(isApiCustomer
                      ? [
                          {
                            label: 'Điện thoại',
                            value: profileAvailable
                              ? savedAccountProfile.phone || 'Chưa thêm'
                              : profileLoading
                                ? 'Đang tải'
                                : 'Chưa tải được',
                          },
                        ]
                      : []),
                    {
                      label: 'Vai trò',
                      value:
                        apiIdentity.roles.map((role) => role.name).join(', ') || 'Chưa được gán',
                    },
                  ]}
                />
                {isApiCustomer && (
                  <div className="account-profile-editor">
                    {profileLoading && (
                      <p className="muted" role="status">
                        Đang tải thông tin liên hệ…
                      </p>
                    )}
                    {profileIssue && (
                      <Feedback
                        tone="danger"
                        title="Chưa cập nhật được hồ sơ"
                        action={
                          !profileAvailable ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setProfileLoading(true);
                                setProfileRetry((value) => value + 1);
                              }}
                            >
                              Thử lại
                            </Button>
                          ) : undefined
                        }
                      >
                        {profileIssue}
                      </Feedback>
                    )}
                    {profileNotice && (
                      <Feedback tone="success" title="Đã lưu hồ sơ">
                        {profileNotice}
                      </Feedback>
                    )}
                    {profileAvailable && !accountEditing && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAccountEditing(true);
                          setProfileNotice('');
                        }}
                      >
                        Chỉnh sửa liên hệ
                      </Button>
                    )}
                    {profileAvailable && accountEditing && (
                      <form
                        className="stack-form"
                        onSubmit={(event) => void saveAccountProfile(event)}
                      >
                        <Field
                          label="Họ và tên"
                          autoComplete="name"
                          maxLength={255}
                          value={accountName}
                          onChange={(event) => setAccountName(event.target.value)}
                          required
                          disabled={profileSaving}
                        />
                        <Field
                          label="Số điện thoại liên hệ (không bắt buộc)"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          placeholder="09xx xxx xxx"
                          value={accountPhone}
                          onChange={(event) => setAccountPhone(event.target.value)}
                          disabled={profileSaving}
                        />
                        <div className="feature-actions">
                          <Button type="submit" loading={profileSaving} disabled={profileLoading}>
                            Lưu
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={profileSaving}
                            onClick={() => {
                              setAccountName(savedAccountProfile.name);
                              setAccountPhone(savedAccountProfile.phone);
                              setProfileIssue('');
                              setAccountEditing(false);
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="account-entry">
                <BrandLogoMark className="brand-mark" />
                <h2>Đăng nhập vào tài khoản</h2>
                <div className="account-entry-actions">
                  <Button onClick={() => go('login')}>Đăng nhập</Button>
                  <Button variant="secondary" onClick={() => go('register')}>
                    Tạo tài khoản
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    );
  }
  const demoStateLabels = {
    entry: 'Chưa đăng nhập',
    PENDING: 'Chờ kích hoạt',
    LOCKED: 'Đã khóa',
    INACTIVE: 'Ngừng hoạt động',
    unauthorized: 'Không có quyền',
    ready: 'Đã hoàn thiện hồ sơ',
  } as const;
  return (
    <div className="page account-page">
      <PageHeading
        eyebrow="TÀI KHOẢN"
        title="Đăng nhập & hồ sơ"
        description="Bản xem thử; thông tin và thay đổi tại đây chưa được lưu trên hệ thống."
      />
      <div className="feature-two-column">
        <Panel title="Truy cập Studio">
          <div className="account-entry">
            <BrandLogoMark className="brand-mark" />
            <h2>Rất vui được gặp bạn</h2>
            <p>
              Đăng nhập để theo dõi đơn thuê và hồ sơ. Đây là trạng thái mô phỏng, không tạo phiên
              đăng nhập thật.
            </p>
            <Button variant="secondary" onClick={() => setState('profile')}>
              Xem trạng thái hồ sơ mẫu
            </Button>
          </div>
          {state === 'profile' && (
            <div className="stack-form" ref={profileRef}>
              <Field
                label="Họ tên liên hệ"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={attempted && !name.trim() ? 'Nhập họ tên liên hệ.' : undefined}
              />
              <Field
                label="Số điện thoại"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={attempted && !isValidPhone(phone) ? 'Nhập số điện thoại hợp lệ.' : undefined}
              />
              <Button
                onClick={() => {
                  setAttempted(true);
                  if (!name.trim() || !isValidPhone(phone)) {
                    return;
                  }
                  setAttempted(false);
                  setState('ready');
                }}
              >
                Hoàn thiện hồ sơ mẫu
              </Button>
            </div>
          )}
          {state === 'ready' && (
            <div ref={successRef} tabIndex={-1}>
              <Feedback tone="success" title="Hồ sơ mẫu đã hoàn thiện">
                Tài khoản nhân viên chỉ hoạt động sau khi studio xác minh và cấp quyền theo chi
                nhánh.
              </Feedback>
            </div>
          )}
          {state === 'PENDING' && (
            <Feedback tone="warning" title="Chờ kích hoạt">
              Tài khoản nhân viên cần được quản trị xác minh và gán role tại chi nhánh.
            </Feedback>
          )}
          {(state === 'LOCKED' || state === 'INACTIVE') && (
            <Feedback
              tone="danger"
              title={state === 'LOCKED' ? 'Tài khoản đã khóa' : 'Tài khoản ngừng hoạt động'}
            >
              Liên hệ quản trị studio để được hỗ trợ.
            </Feedback>
          )}
          {state === 'unauthorized' && (
            <Feedback tone="danger" title="Không có quyền">
              Vai trò hiện tại không được truy cập khu vực này.
            </Feedback>
          )}
        </Panel>
        <Panel title="Xem thử quyền truy cập">
          <SelectField
            label="Vai trò hiệu lực mẫu"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="CUSTOMER">Khách hàng</option>
            <option value="SALES_STAFF">Nhân viên bán hàng</option>
            <option value="INVENTORY_STAFF">Nhân viên kho</option>
            <option value="ADMIN">Quản trị chuỗi</option>
          </SelectField>
          <div className="variant-pills">
            {(['entry', 'PENDING', 'LOCKED', 'INACTIVE', 'unauthorized', 'ready'] as const).map(
              (value) => (
                <button
                  key={value}
                  className={state === value ? 'active' : ''}
                  onClick={() => setState(value)}
                  aria-pressed={state === value}
                >
                  {demoStateLabels[value]}
                </button>
              ),
            )}
          </div>
          <Button
            disabled={state !== 'ready' || scenario === 'permission'}
            onClick={() => {
              onRoleChange(role);
              go(
                role === 'CUSTOMER' ? 'myRentals' : role === 'ADMIN' ? 'adminCatalog' : 'dashboard',
              );
            }}
          >
            Mở khu vực xem thử
          </Button>
          <p className="muted small-note">
            Lựa chọn này chỉ dùng để xem thử giao diện. Quyền thật do studio cấp theo chi nhánh.
          </p>
        </Panel>
      </div>
    </div>
  );
}
