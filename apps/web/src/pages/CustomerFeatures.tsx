import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Navigate } from '../App';
import { ImageWithFallback } from '../components/ImageWithFallback';
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
  getOwnCustomerProfile,
  getPublicModelVariants,
  listCustomerOrders,
  hasAccessToken,
  updateOwnCustomerProfile,
} from '../api/client';
import { useBranchOptions } from '../components/useBranchOptions';

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
  const [pickup, setPickup] = useState(requestedPickup?.trim() ? requestedPickup : defaultPickup);
  const [due, setDue] = useState(requestedReturn?.trim() ? requestedReturn : defaultReturn);
  const [photo, setPhoto] = useState(0);
  const selectedVariant =
    data?.find((value) => value.id === id)?.variants.find((value) => value.code === variantCode) ??
    data?.find((value) => value.id === id)?.variants[0];
  const apiVariantId = selectedVariant?.apiId;
  const [availabilityResult, setAvailabilityResult] = useState<{
    key: string;
    status: 'available' | 'unavailable' | 'error';
  }>();
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const availabilityKey = JSON.stringify([apiVariantId, branch, pickup, due]);
  const hasAvailabilityInputs = usePublicApi && !!apiVariantId && !!branch && !!pickup && !!due;
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
    [...initialContext.entries()].filter(([key]) => key !== 'id'),
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
                <p className="muted small-note">
                  {gallery.length > 0 || (item.imageUrl?.length ?? 0) > 0
                    ? 'Ảnh do studio cung cấp.'
                    : 'Ảnh trang phục trong bản minh họa.'}
                </p>
              </div>
              <div>
                <p className="eyebrow">{item.category} · Bộ sưu tập</p>
                <h1>{item.name}</h1>
                <p className="lead">{item.description}</p>
                <div className="detail-rule">
                  <h2>Chất liệu và phom dáng</h2>
                  <p>
                    {item.material}.{' '}
                    {variant.fit.trim()
                      ? variant.fit
                      : 'Studio chưa cập nhật số đo cho size này. Hãy liên hệ để được tư vấn trước khi gửi yêu cầu.'}
                  </p>
                </div>
                <div className="detail-rule">
                  <h2>Phụ kiện</h2>
                  <p>
                    {item.accessories.length
                      ? item.accessories.join(' · ')
                      : 'Chưa có thông tin phụ kiện công khai.'}
                  </p>
                </div>
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
                      ...(variant.replacement
                        ? [
                            {
                              label: 'Giá thay thế theo biến thể',
                              value: money(variant.replacement),
                            },
                          ]
                        : []),
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
                    <DateTimeField label="Nhận" value={pickup} onChange={setPickup} />
                    <DateTimeField label="Trả" value={due} onChange={setDue} />
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
                    tone={known ? (available ? 'success' : 'warning') : 'info'}
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
                      availability === 'loading'
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
                    {availability === 'error'
                      ? 'Hãy thử lại hoặc tiếp tục gửi yêu cầu để nhân viên kiểm tra trong bước duyệt.'
                      : 'Việc xem khả dụng không giữ bộ. Nhân viên sẽ duyệt và gán từng bộ sau khi bạn gửi yêu cầu.'}
                  </Feedback>
                </Panel>
                <div className="feature-actions">
                  <Button
                    onClick={() =>
                      go('booking', {
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
                  Tiền thuê và cọc thu lúc nhận. Trả tại chính chi nhánh nhận; hoàn cọc sau kiểm tra
                  tình trạng.
                </p>
              </div>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
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
            setDialog(false);
          } catch (e) {
            setIssue(e instanceof Error ? e.message : 'Không thể hủy đơn.');
            setDialog(false);
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
              eyebrow="TÀI KHOẢN / ĐƠN THUÊ"
              title={selected ? selected.id : 'Đơn của tôi'}
              description="Theo dõi đơn, từng khoản tiền và tiến độ hoàn cọc."
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
                  <Panel title="Thông tin thuê">
                    <div className="feature-status-row">
                      <StatusLabel {...orderStatus[selected.status]} />
                      <StatusLabel
                        text={`Tiền thuê: ${selected.rentalStatus}`}
                        tone={selected.rentalStatus === 'Đã thu' ? 'success' : 'warning'}
                      />
                      <StatusLabel text={`Cọc: ${selected.depositStatus}`} tone="info" />
                      <StatusLabel text={`Trả: ${selected.returnStatus}`} tone="neutral" />
                    </div>
                    <KeyFacts
                      rows={[
                        { label: 'Trang phục', value: `${selected.costume} · ${selected.variant}` },
                        { label: 'Chi nhánh nhận và trả', value: selected.branch },
                        { label: 'Nhận', value: selected.pickup },
                        { label: 'Hạn trả', value: selected.due },
                      ]}
                    />
                    {selected.reason && (
                      <Feedback tone="warning" title="Lý do hủy / từ chối">
                        {selected.reason}
                      </Feedback>
                    )}
                    {selected.canCancel && (
                      <div className="destructive-area">
                        <Button variant="danger" onClick={() => setDialog(true)}>
                          Hủy yêu cầu
                        </Button>
                      </div>
                    )}
                  </Panel>
                  <Panel title="Lịch sử và biên nhận">
                    <Timeline items={selected.history} />
                    <p className="muted small-note">
                      Biên nhận điện tử sẽ xuất hiện khi API giao dịch và lưu chứng từ được triển
                      khai.
                    </p>
                  </Panel>
                </div>
                <div>
                  <MoneySummary
                    rental={selected.rental}
                    deposit={selected.deposit}
                    extra={selected.extra}
                    refund={selected.refund}
                  />
                  <Panel title="Trạng thái quyết toán">
                    <KeyFacts
                      rows={[
                        { label: 'Thanh toán thuê', value: selected.rentalStatus },
                        { label: 'Tiền cọc', value: selected.depositStatus },
                        { label: 'Hoàn cọc', value: selected.refundStatus },
                        { label: 'Nhận trả', value: selected.returnStatus },
                      ]}
                    />
                  </Panel>
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
                  <div className="feature-card-list">
                    {visible.map((order) => (
                      <button
                        className="rental-card"
                        key={order.id}
                        onClick={() => go('myRentalDetail', { order: order.id })}
                      >
                        <span>
                          <strong>{order.costume}</strong>
                          <small>
                            {order.id} · {order.variant}
                          </small>
                          <small>
                            {order.branch} · {order.pickup}
                          </small>
                        </span>
                        <span className="rental-card-right">
                          <StatusLabel {...orderStatus[order.status]} />
                          <strong>{money(order.rental)}</strong>
                          <small>Cọc {money(order.deposit)}</small>
                        </span>
                      </button>
                    ))}
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
            <InlineIssue
              text={issue}
              conflict={scenario === 'version' || scenario === 'cancelled'}
            />
            {dialog && selected && (
              <ConfirmDialog
                title="Hủy yêu cầu thuê"
                confirmText="Xác nhận hủy"
                danger
                loading={busy}
                onClose={() => setDialog(false)}
                onConfirm={() => void confirm()}
              >
                <p>Hủy {selected.id} sẽ được lưu trong lịch sử đơn. Lý do là bắt buộc.</p>
                <Field
                  label="Lý do hủy"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  error={issue && !reason.trim() ? issue : undefined}
                />
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

export function AccountPage({
  scenario,
  go,
  onRoleChange,
  apiIdentity,
  realApiMode = false,
  onSignOut,
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
  onSignOut?: () => void;
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
  }, [apiIdentity?.email, isApiCustomer]);

  const saveAccountProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileIssue('');
    setProfileNotice('');
    const compactPhone = accountPhone.trim().replace(/[\s()-]/g, '');
    const phoneIsValid =
      !compactPhone ||
      /^0\d{9}$/.test(compactPhone) ||
      /^84\d{9}$/.test(compactPhone) ||
      /^\+[1-9]\d{7,14}$/.test(compactPhone);
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
      setProfileNotice('Thông tin liên hệ đã được lưu. Sẽ được điền sẵn vào đơn thuê tiếp theo.');
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
        <PageHeading
          eyebrow="TÀI KHOẢN"
          title="Tài khoản Studio"
          description="Phiên đăng nhập và quyền truy cập được xác minh bởi máy chủ."
        />
        <div className="feature-two-column">
          <Panel
            title={apiIdentity ? 'Thông tin tài khoản' : 'Đăng nhập'}
            action={
              apiIdentity && onSignOut ? (
                <Button variant="quiet" onClick={onSignOut}>
                  Đăng xuất
                </Button>
              ) : undefined
            }
          >
            {apiIdentity ? (
              <>
                <KeyFacts
                  rows={[
                    { label: 'Họ tên', value: apiIdentity.displayName },
                    { label: 'Email', value: apiIdentity.email },
                    {
                      label: 'Vai trò',
                      value:
                        apiIdentity.roles.map((role) => role.name).join(', ') || 'Chưa được gán',
                    },
                  ]}
                />
                <Feedback tone="info" title="Phiên được quản lý bởi máy chủ">
                  Quyền của tài khoản được kiểm tra theo vai trò và chi nhánh khi thực hiện từng
                  thao tác.
                </Feedback>
                {isApiCustomer && (
                  <div className="account-profile-editor">
                    <h3>Thông tin liên hệ</h3>
                    <p className="muted">
                      Lưu tên và số điện thoại để lần đặt thuê sau không phải nhập lại.
                    </p>
                    {profileLoading && (
                      <Feedback tone="info" title="Đang tải hồ sơ">
                        Đang lấy thông tin liên hệ đã lưu.
                      </Feedback>
                    )}
                    {profileIssue && (
                      <Feedback tone="danger" title="Chưa hoàn tất được thao tác">
                        {profileIssue}
                      </Feedback>
                    )}
                    {profileNotice && (
                      <Feedback tone="success" title="Đã lưu hồ sơ">
                        {profileNotice}
                      </Feedback>
                    )}
                    {profileAvailable && (
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
                          hint="Số điện thoại sẽ được điền sẵn khi bạn tạo đơn thuê."
                          value={accountPhone}
                          onChange={(event) => setAccountPhone(event.target.value)}
                          disabled={profileSaving}
                        />
                        <Button type="submit" loading={profileSaving} disabled={profileLoading}>
                          Lưu thông tin liên hệ
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="account-entry">
                <span className="brand-mark">S</span>
                <h2>Đăng nhập vào tài khoản</h2>
                <p>
                  Đăng nhập để theo dõi đơn thuê, cập nhật thông tin và tiếp tục đặt trang phục.
                </p>
                <div className="account-entry-actions">
                  <Button onClick={() => go('login')}>Đăng nhập</Button>
                  <Button variant="secondary" onClick={() => go('register')}>
                    Tạo tài khoản
                  </Button>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Quyền riêng tư">
            <p className="muted">
              Đơn thuê, hồ sơ và quyền vận hành chỉ hiển thị sau khi máy chủ xác minh tài khoản.
            </p>
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
            <span className="brand-mark">S</span>
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
                error={
                  attempted && !/^0[0-9 ]{8,12}$/.test(phone.trim())
                    ? 'Nhập số điện thoại hợp lệ.'
                    : undefined
                }
              />
              <Button
                onClick={() => {
                  setAttempted(true);
                  if (!name.trim() || !/^0[0-9 ]{8,12}$/.test(phone.trim())) {
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
