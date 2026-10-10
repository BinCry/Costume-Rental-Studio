import type { BookingDraft, CatalogItem, Order, QuoteSnapshot } from '../fixtures/types';
import type { ActiveUnit, CustomerOrder, Unit } from '../fixtures/studio';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: { code?: string; message?: string };
};
type Page<T> = { items: T[]; pagination?: { page: number; pageSize: number; totalItems: number; totalPages: number } };
type ApiModel = {
  id: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  material?: string | null;
  category?: { name?: string | null } | null;
  media?: Array<{ mediaUrl?: string | null; altText?: string | null }>;
};
type ApiVariant = {
  id: string; modelId: string; variantCode: string; sizeCode: string; colorCode: string;
  dailyRentalPriceVnd: string | number | bigint; depositAmountVnd: string | number | bigint;
  status?: string; editionLabel?: string | null; fitNotes?: string | null;
  media?: Array<{ mediaUrl?: string | null; altText?: string | null }>;
  model?: ApiModel | null;
};
type ApiBranch = {
  id: string;
  name: string;
  branchCode?: string;
  status?: string;
  address?: string | null;
  phone?: string | null;
};
type ApiQuote = {
  quoteExpiresAt: string;
  policy: {
    versionCode?: string;
    billingDayMode?: 'CALENDAR_DAY' | 'ROLLING_24_HOURS' | string;
    quoteValidHours?: number;
  };
  period: { billableDays: number; plannedStartAt: string; plannedDueAt: string };
  items: Array<{
    variantId: string;
    dailyRentalPriceVnd: string | number | bigint;
    depositAmountVnd: string | number | bigint;
    rentalAmountVnd: string | number | bigint;
    availableUnits: number;
  }>;
  promotion?: { discountVnd: string | number | bigint } | null;
  subtotalVnd: string | number | bigint;
  discountVnd: string | number | bigint;
  rentalAmountVnd: string | number | bigint;
  depositVnd: string | number | bigint;
  totalDueVnd: string | number | bigint;
  available: boolean;
};
type ApiOrder = {
  id: string; orderCode: string; status: Order['status']; version: number;
  plannedStartAt: string; plannedDueAt: string; customerNote?: string | null;
  customer?: { user?: { displayName?: string; phone?: string | null } };
  pickupBranch?: { id?: string; name?: string };
  items?: Array<{
    id: string;
    variantId?: string;
    variant?: { sizeCode?: string; colorCode?: string; model?: { name?: string } };
    unit?: { id?: string; unitCode?: string; operationalStatus?: string };
    unitDailyPriceVnd?: string | number | bigint;
    unitDepositVnd?: string | number | bigint;
    billableDays?: number;
    accessories?: Array<{
      id: string;
      quantityOut: number;
      quantityReturned?: number | null;
    }>;
  }>;
  payments?: Array<{ purpose: string; amountVnd: string | number | bigint; status: string }>;
  lateFeeVnd?: string | number | bigint;
  otherFeeVnd?: string | number | bigint;
  events?: Array<{ occurredAt?: string; eventType?: string }>;
};
type ApiUnit = { id: string; unitCode: string; conditionGrade?: string };
type ApiActiveRental = {
  id: string;
  unit?: {
    unitCode?: string;
    variant?: {
      sizeCode?: string;
      colorCode?: string;
      model?: { name?: string };
    };
  } | null;
  order: {
    orderCode: string;
    plannedStartAt: string;
    plannedDueAt: string;
    pickupBranch?: { name?: string } | null;
    customer?: { user?: { displayName?: string; phone?: string | null } | null } | null;
  };
};
type ApiInventoryUnit = {
  id: string;
  unitCode: string;
  operationalStatus: Unit['status'];
  conditionGrade?: string;
  variant?: {
    variantCode?: string;
    sizeCode?: string;
    colorCode?: string;
    model?: { name?: string };
  } | null;
  currentBranch?: { name?: string } | null;
};

export type RentalEvidence = {
  uploadKey: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
  capturedAt?: string;
};

export type SettlementSnapshot = {
  orderId: string;
  status: string;
  rental: { dueVnd: string; paidVnd: string; remainingVnd: string };
  deposit: {
    dueVnd: string;
    paidVnd: string;
    deductionVnd: string;
    refundedVnd: string;
    refundRemainingVnd: string;
    refundAvailableVnd?: string;
    refundInProgressVnd: string;
  };
  extra: { dueVnd: string; paidVnd: string; remainingVnd: string };
  outstandingVnd: string;
  canPickup: boolean;
  canComplete: boolean;
};

export type PaymentRecord = {
  id: string;
  purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA' | string;
  method: string;
  amountVnd: string | number;
  status: string;
  transactionReference?: string | null;
};

const configuredBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  '';
export const apiBaseUrl = configuredBaseUrl.replace(/\/$/, '');
export const apiEnabled = apiBaseUrl.length > 0;
const accessTokenKey = 'costume-rental.access-token';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}
function token() { return window.sessionStorage.getItem(accessTokenKey); }
function saveToken(value: string | null) {
  if (value) window.sessionStorage.setItem(accessTokenKey, value);
  else window.sessionStorage.removeItem(accessTokenKey);
}
function numberValue(value: string | number | bigint | null | undefined) { return Number(value ?? 0); }

let refreshing: Promise<boolean> | undefined;
async function refreshAccessToken() {
  if (!apiEnabled) return false;
  refreshing ??= fetch(apiBaseUrl + '/api/v1/auth/refresh', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
  }).then(async (response) => {
    if (!response.ok) return false;
    const body = (await response.json()) as ApiEnvelope<{ accessToken?: string }>;
    if (body.success && body.data.accessToken) { saveToken(body.data.accessToken); return true; }
    return false;
  }).catch(() => false).finally(() => { refreshing = undefined; });
  return refreshing;
}
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (!apiEnabled) throw new ApiClientError(0, 'API_NOT_CONFIGURED', 'API chưa được cấu hình');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const accessToken = token();
  if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);
  const response = await fetch(apiBaseUrl + path, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && await refreshAccessToken()) return request<T>(path, init, false);
  const body = response.status === 204 ? null : await response.json() as ApiEnvelope<T>;
  if (!response.ok || !body?.success) {
    throw new ApiClientError(response.status, body?.error?.code ?? 'API_REQUEST_FAILED', body?.error?.message ?? ('API request failed: ' + response.status));
  }
  return body.data;
}

const branchIds = new Map<string, string>();
const variants = new Map<string, ApiVariant>();
const orderRefs = new Map<string, { id: string; itemIds: string[] }>();
const unitRefs = new Map<string, Map<string, string>>();
const quoteRefs = new Map<string, { variantId: string; branchId: string }>();

export async function login(email: string, password: string) {
  const data = await request<{ accessToken: string; user: { id: string; displayName?: string } }>(
    '/api/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password, deviceName: 'Studio web' }) },
    false,
  );
  saveToken(data.accessToken);
  return data.user;
}
export async function logout() {
  try { await request('/api/v1/auth/logout', { method: 'POST' }, false); } finally { saveToken(null); }
}
export function hasAccessToken() { return Boolean(token()); }
export async function currentUser() {
  return request<{
    id: string;
    displayName: string;
    email: string;
    roles: Array<{
      roleCode: string;
      name: string;
      actorGroup: string;
      branchId: string | null;
      permissions: Array<{ code: string; scope: string }>;
    }>;
  }>('/api/v1/auth/me');
}
export async function restoreSession() {
  if (!apiEnabled) return undefined;
  if (!hasAccessToken() && !(await refreshAccessToken())) return undefined;
  return currentUser();
}
export function googleLoginUrl() {
  return apiBaseUrl + '/api/v1/auth/google';
}
export async function listBranches() {
  // Branch discovery is intentionally public so the customer can choose a branch
  // before signing in. Staff screens still use their protected branch APIs.
  const page = await request<Page<ApiBranch>>('/api/v1/public/branches?page=1&pageSize=100&sortBy=name&sortOrder=asc');
  page.items.forEach((branch) => branchIds.set(branch.name, branch.id));
  return page.items;
}
export async function listCatalog(): Promise<CatalogItem[]> {
  const variantsPage = await request<Page<ApiVariant>>(
    '/api/v1/public/catalog/variants?page=1&pageSize=100&sortBy=variantCode&sortOrder=asc',
  );
  variantsPage.items.forEach((variant) => variants.set(variant.id, variant));
  return variantsPage.items.map((variant) => {
    const model = variant.model;
    return {
      id: variant.id, name: model?.name ?? variant.variantCode, category: model?.category?.name ?? 'Trang phục',
      sizes: [variant.sizeCode], colors: [variant.colorCode], imagePosition: 'center',
      priceFrom: numberValue(variant.dailyRentalPriceVnd), depositFrom: numberValue(variant.depositAmountVnd),
      availableAtFixturePeriod: true, description: model?.shortDescription ?? model?.description ?? '',
    };
  });
}
export async function getPublicVariant(id: string): Promise<ApiVariant> {
  const variant = await request<ApiVariant>(
    '/api/v1/public/catalog/variants/' + encodeURIComponent(id),
  );
  variants.set(variant.id, variant);
  return variant;
}
export async function checkPublicAvailability(
  variantId: string,
  branchName: string,
  plannedStartAt: string,
  plannedDueAt: string,
) {
  if (!branchIds.has(branchName)) await listBranches();
  const pickupBranchId = branchIds.get(branchName);
  if (!pickupBranchId)
    throw new ApiClientError(422, 'BRANCH_CONTEXT_MISSING', 'Không tìm thấy chi nhánh');
  const query = new URLSearchParams({
    variantId,
    pickupBranchId,
    plannedStartAt: new Date(plannedStartAt).toISOString(),
    plannedDueAt: new Date(plannedDueAt).toISOString(),
  });
  return request<{ variantId: string; pickupBranchId: string; available: boolean; availableUnits: number }>(
    '/api/v1/public/catalog/availability?' + query.toString(),
  );
}
function formatDate(value: string | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function mapOrder(order: ApiOrder): Order {
  const branch = order.pickupBranch?.name ?? 'Chi nhánh chưa xác định';
  const items = (order.items ?? []).map((item, index) => ({
    id: item.id ?? String(index + 1), costume: item.variant?.model?.name ?? 'Trang phục',
    variant: [item.variant?.sizeCode, item.variant?.colorCode].filter(Boolean).join(' / '),
    unitCode: item.unit?.unitCode, unitStatus: item.unit?.operationalStatus,
    apiUnitId: item.unit?.id,
    accessories: item.accessories,
  }));
  const rental = (order.items ?? []).reduce(
    (sum, item) => sum + numberValue(item.unitDailyPriceVnd) * (item.billableDays ?? 1),
    0,
  );
  const deposit = (order.items ?? []).reduce((sum, item) => sum + numberValue(item.unitDepositVnd), 0);
  const paid = (order.payments ?? []).filter((payment) => payment.status === 'SUCCEEDED' || payment.status === 'PAID').reduce((sum, payment) => sum + numberValue(payment.amountVnd), 0);
  return {
    id: order.orderCode || order.id, status: order.status, version: order.version,
    customer: order.customer?.user?.displayName ?? 'Khách hàng', phone: order.customer?.user?.phone ?? '',
    branch, pickup: formatDate(order.plannedStartAt), returnAt: formatDate(order.plannedDueAt),
    dayPolicy: 'Theo chính sách hiện hành của máy chủ', items,
    money: [
      { label: 'Tiền thuê', amount: rental, status: paid > 0 ? 'Đã thu một phần' : 'Chưa thu', tone: paid > 0 ? 'success' : 'neutral' },
      { label: 'Tiền cọc', amount: deposit, status: 'Theo quyết toán', tone: 'info' },
      { label: 'Phụ phí / hoàn', amount: numberValue(order.lateFeeVnd) + numberValue(order.otherFeeVnd), status: 'Theo quyết toán', tone: 'warning' },
    ],
    history: (order.events ?? []).map((event) => formatDate(event.occurredAt) + ' · ' + (event.eventType ?? 'Cập nhật đơn')),
    note: order.customerNote ?? '', eligibleUnits: [],
  };
}
function enrichOrder(order: ApiOrder, availableUnits: ApiUnit[]) {
  const mapped = mapOrder(order);
  mapped.eligibleUnits = availableUnits.map((unit) => ({
    code: unit.unitCode,
    variant: mapped.items[0]?.variant ?? 'Biến thể',
    status: 'READY',
    availableAtFixturePeriod: true,
  }));
  orderRefs.set(mapped.id, { id: order.id, itemIds: (order.items ?? []).map((item) => item.id) });
  unitRefs.set(mapped.id, new Map(availableUnits.map((unit) => [unit.unitCode, unit.id])));
  return mapped;
}
async function availableForOrder(order: ApiOrder) {
  const first = order.items?.find((item) => item.variantId);
  const branchId = order.pickupBranch?.id;
  if (!first?.variantId || !branchId) return [];
  const result = await request<{ available: boolean; units: ApiUnit[] }>(
    '/api/v1/rentals/availability?variantId=' + encodeURIComponent(first.variantId) +
      '&pickupBranchId=' + encodeURIComponent(branchId) +
      '&plannedStartAt=' + encodeURIComponent(order.plannedStartAt) +
      '&plannedDueAt=' + encodeURIComponent(order.plannedDueAt),
  );
  return result.units;
}
export async function listOrders() {
  const page = await request<Page<ApiOrder>>('/api/v1/rentals/orders?page=1&pageSize=100&sortBy=createdAt&sortOrder=desc');
  return Promise.all(page.items.map(async (order) => enrichOrder(order, await availableForOrder(order))));
}
function customerOrderFromOrder(order: Order, customerCode: string): CustomerOrder {
  const rental = order.money.find((line) => line.label === 'Tiền thuê');
  const deposit = order.money.find((line) => line.label === 'Tiền cọc');
  const extra = order.money.find((line) => line.label === 'Phụ phí / hoàn');
  return {
    id: order.id,
    customerCode,
    status: order.status,
    branch: order.branch,
    pickup: order.pickup,
    due: order.returnAt,
    costume: order.items[0]?.costume ?? 'Trang phục',
    variant: order.items[0]?.variant ?? '',
    rental: rental?.amount ?? 0,
    deposit: deposit?.amount ?? 0,
    extra: extra?.amount ?? 0,
    refund: 0,
    rentalStatus: rental?.status ?? 'Theo quyết toán',
    depositStatus: deposit?.status ?? 'Theo quyết toán',
    refundStatus: 'Theo quyết toán',
    returnStatus: order.status === 'ACTIVE' ? 'Đang ở khách' : order.status === 'COMPLETED' ? 'Đã trả' : 'Chưa giao',
    history: order.history,
    canCancel: order.status === 'PENDING_CONFIRMATION',
    version: order.version,
  };
}
export async function listCustomerOrders(): Promise<CustomerOrder[]> {
  const [orders, profile] = await Promise.all([
    listOrders(),
    request<{ customerCode: string }>('/api/v1/customers/me'),
  ]);
  return orders.map((order) => customerOrderFromOrder(order, profile.customerCode));
}
export async function listActiveRentals(branchName?: string): Promise<ActiveUnit[]> {
  const query = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'plannedDueAt', sortOrder: 'asc' });
  if (branchName && !branchIds.has(branchName)) await listBranches();
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  const page = await request<Page<ApiActiveRental>>('/api/v1/inventory/active-rentals?' + query.toString());
  return page.items.flatMap((item) => {
    const unitCode = item.unit?.unitCode;
    if (!unitCode) return [];
    const due = new Date(item.order.plannedDueAt);
    return [
      {
        barcode: unitCode,
        costume: item.unit?.variant?.model?.name ?? 'Trang phục',
        variant: [item.unit?.variant?.sizeCode, item.unit?.variant?.colorCode].filter(Boolean).join(' / '),
        customer: item.order.customer?.user?.displayName ?? 'Khách hàng',
        phone: item.order.customer?.user?.phone ?? '',
        orderId: item.order.orderCode,
        pickedUp: formatDate(item.order.plannedStartAt),
        due: formatDate(item.order.plannedDueAt),
        overdue: due.getTime() < Date.now(),
        branch: item.order.pickupBranch?.name ?? 'Chi nhánh chưa xác định',
        accessories: [],
      },
    ];
  });
}
export async function getOrder(orderId: string) {
  const order = await request<ApiOrder>('/api/v1/rentals/orders/' + encodeURIComponent(orderId));
  return enrichOrder(order, await availableForOrder(order));
}
export async function getQuote(draft: BookingDraft): Promise<QuoteSnapshot> {
  if (!branchIds.has(draft.branch)) await listBranches();
  const branchId = branchIds.get(draft.branch);
  const variant = variants.get(draft.costumeId);
  if (!branchId || !variant) throw new ApiClientError(422, 'API_CONTEXT_MISSING', 'Cần tải lại chi nhánh và mẫu trang phục');
  const me = await currentUser();
  const response = await request<ApiQuote>('/api/v1/rentals/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerUserId: me.id,
      pickupBranchId: branchId,
      channel: 'ONLINE',
      plannedStartAt: new Date(draft.pickup).toISOString(),
      plannedDueAt: new Date(draft.returnAt).toISOString(),
      items: Array.from({ length: draft.quantity }, () => ({ variantId: variant.id, accessories: [] })),
    }),
  });
  const quoteId = 'api-quote-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36));
  const pricePerDay = numberValue(response.items.find((item) => item.variantId === variant.id)?.dailyRentalPriceVnd);
  const billingMode = response.policy.billingDayMode === 'ROLLING_24_HOURS' ? 'chu kỳ 24 giờ' : 'ngày lịch';
  quoteRefs.set(quoteId, { variantId: variant.id, branchId });
  return {
    id: quoteId,
    expiresAt: formatDate(response.quoteExpiresAt),
    daysLabel: response.period.billableDays + ' ngày · ' + billingMode,
    pricePerDay,
    quantity: draft.quantity,
    rental: numberValue(response.rentalAmountVnd),
    deposit: numberValue(response.depositVnd),
    discount: numberValue(response.discountVnd),
    amountDueAtPickup: numberValue(response.totalDueVnd),
    policy: 'Chính sách ' + (response.policy.versionCode ?? 'hiện hành') + ' · do máy chủ tính',
  };
}
export async function createOrder(draft: BookingDraft, quote: QuoteSnapshot) {
  const reference = quoteRefs.get(quote.id);
  const variantId = reference?.variantId;
  const branchId = reference?.branchId;
  const me = await currentUser();
  if (!variantId || !branchId) throw new ApiClientError(422, 'API_CONTEXT_MISSING', 'Thiếu mã mẫu hoặc chi nhánh');
  const created = await request<ApiOrder>('/api/v1/rentals/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerUserId: me.id, pickupBranchId: branchId, channel: 'ONLINE',
      plannedStartAt: new Date(draft.pickup).toISOString(), plannedDueAt: new Date(draft.returnAt).toISOString(),
      customerNote: draft.note || undefined,
      items: Array.from({ length: draft.quantity }, () => ({ variantId, accessories: [] })),
    }),
  });
  quoteRefs.delete(quote.id);
  return created.orderCode || created.id;
}
export async function confirmOrder(orderCode: string, version: number, unitCodes: string[]) {
  const reference = orderRefs.get(orderCode);
  const units = unitRefs.get(orderCode);
  const allocations = unitCodes.map((code, index) => ({
    orderItemId: reference?.itemIds[index],
    unitId: units?.get(code),
  }));
  if (!reference || allocations.some((item) => !item.orderItemId || !item.unitId))
    throw new ApiClientError(422, 'UNIT_CONTEXT_MISSING', 'Chưa tải đủ mã bộ để xác nhận đơn');
  return request<ApiOrder>('/api/v1/rentals/orders/' + encodeURIComponent(reference.id) + '/confirm', {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, allocations }),
  });
}
function orderReference(orderCode: string) {
  const reference = orderRefs.get(orderCode);
  if (!reference) throw new ApiClientError(422, 'ORDER_CONTEXT_MISSING', 'Chưa tải đủ thông tin đơn');
  return reference;
}
async function orderVersionAction(
  orderCode: string,
  version: number,
  action: 'prepare' | 'ready',
) {
  const reference = orderReference(orderCode);
  return request<ApiOrder>(
    '/api/v1/rentals/orders/' + encodeURIComponent(reference.id) + '/' + action,
    { method: 'POST', body: JSON.stringify({ expectedVersion: version }) },
  );
}
export async function prepareOrder(orderCode: string, version: number) {
  return orderVersionAction(orderCode, version, 'prepare');
}
export async function readyOrder(orderCode: string, version: number) {
  return orderVersionAction(orderCode, version, 'ready');
}
/**
 * The staff UI presents preparation and ready-for-pickup as one operational step,
 * while the API keeps them as two optimistic-concurrency transitions. Chain them
 * here so the UI always carries the version returned by the first transition.
 */
export async function prepareAndReadyOrder(orderCode: string, version: number) {
  const prepared = await prepareOrder(orderCode, version);
  return readyOrder(orderCode, prepared.version);
}
export async function rejectOrder(orderCode: string, version: number, reason: string) {
  const reference = orderReference(orderCode);
  return request<ApiOrder>('/api/v1/rentals/orders/' + encodeURIComponent(reference.id) + '/reject', {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, reason }),
  });
}
export async function cancelOrder(orderCode: string, version: number, reason: string) {
  const reference = orderReference(orderCode);
  return request<ApiOrder>('/api/v1/rentals/orders/' + encodeURIComponent(reference.id) + '/cancel', {
    method: 'POST', body: JSON.stringify({ expectedVersion: version, reason }),
  });
}
export async function cancelCustomerOrder(orderCode: string, version: number, reason: string) {
  await cancelOrder(orderCode, version, reason);
  const updated = (await listCustomerOrders()).find((order) => order.id === orderCode);
  if (!updated) throw new ApiClientError(404, 'RENTAL_ORDER_NOT_FOUND', 'Không tìm thấy đơn vừa hủy');
  return updated;
}
export async function listInventoryUnits(branchName?: string, search?: string): Promise<Unit[]> {
  if (branchName && !branchIds.has(branchName)) await listBranches();
  const query = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'unitCode', sortOrder: 'asc' });
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  if (search?.trim()) query.set('search', search.trim());
  const page = await request<Page<ApiInventoryUnit>>('/api/v1/inventory/units?' + query.toString());
  return page.items.map((unit) => ({
    apiId: unit.id,
    barcode: unit.unitCode,
    variantCode: unit.variant?.variantCode ?? '',
    model: unit.variant?.model?.name ?? 'Trang phục',
    variant: [unit.variant?.sizeCode, unit.variant?.colorCode].filter(Boolean).join(' / '),
    branch: unit.currentBranch?.name ?? 'Chi nhánh chưa xác định',
    status: unit.operationalStatus,
    condition: unit.conditionGrade ?? 'UNINSPECTED',
    available: unit.operationalStatus === 'READY',
    blocks: [],
    history: [],
  }));
}
export async function createUnitBlock(
  unitId: string,
  block: { type: 'CLEANING' | 'REPAIR' | 'INSPECTION'; from: string; until: string; reason: string },
) {
  return request('/api/v1/scheduling/unit-blocks', {
    method: 'POST',
    body: JSON.stringify({
      unitId,
      blockType: block.type,
      blockedFrom: new Date(block.from).toISOString(),
      blockedUntil: new Date(block.until).toISOString(),
      reason: block.reason,
    }),
  });
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

export async function uploadRentalEvidence(
  orderItemId: string,
  phase: 'PICKUP' | 'RETURN',
  file: File,
): Promise<RentalEvidence> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new ApiClientError(400, 'INVALID_EVIDENCE', 'Ảnh phải là JPEG, PNG hoặc WebP');
  const presigned = await request<{
    objectKey: string;
    uploadUrl: string;
    fields: Record<string, string>;
  }>('/api/v1/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'rental-evidence',
      ownerType: 'rental-item',
      ownerId: orderItemId,
      phase,
      contentType: file.type,
      size: file.size,
    }),
  });
  const form = new FormData();
  Object.entries(presigned.fields).forEach(([key, value]) => form.append(key, value));
  form.append('file', file);
  const uploaded = await fetch(presigned.uploadUrl, { method: 'POST', body: form });
  if (!uploaded.ok)
    throw new ApiClientError(uploaded.status, 'EVIDENCE_UPLOAD_FAILED', 'Không tải được ảnh bằng chứng');
  return { uploadKey: presigned.objectKey, contentType: file.type as RentalEvidence['contentType'], size: file.size, capturedAt: new Date().toISOString() };
}

function orderApiId(orderCode: string) {
  return orderReference(orderCode).id;
}

export async function recordCashPayment(
  orderCode: string,
  purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA',
  amountVnd: number,
) {
  return request<PaymentRecord>(`/api/v1/payments/orders/${encodeURIComponent(orderApiId(orderCode))}/cash`, {
    method: 'POST',
    body: JSON.stringify({ purpose, amountVnd: String(Math.round(amountVnd)), idempotencyKey: idempotencyKey('cash') }),
  });
}

export async function recordBankTransferPayment(
  orderCode: string,
  purpose: 'RENTAL' | 'DEPOSIT' | 'EXTRA',
  amountVnd: number,
  transactionReference: string,
) {
  return request<PaymentRecord>(`/api/v1/payments/orders/${encodeURIComponent(orderApiId(orderCode))}/bank-transfer`, {
    method: 'POST',
    body: JSON.stringify({ purpose, amountVnd: String(Math.round(amountVnd)), transactionReference, idempotencyKey: idempotencyKey('bank') }),
  });
}

export async function listOrderPayments(orderCode: string) {
  return request<PaymentRecord[]>(`/api/v1/payments/orders/${encodeURIComponent(orderApiId(orderCode))}`);
}

export async function getOrderSettlement(orderCode: string) {
  return request<SettlementSnapshot>(`/api/v1/payments/orders/${encodeURIComponent(orderApiId(orderCode))}/summary`);
}

export async function pickupOrder(
  orderCode: string,
  expectedVersion: number,
  items: Array<{ orderItemId: string; conditionGrade: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED'; conditionNotes?: string; evidence: RentalEvidence[] }>,
) {
  return request<ApiOrder>(`/api/v1/rentals/orders/${encodeURIComponent(orderApiId(orderCode))}/pickup`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, items }),
  });
}

export async function returnOrder(
  orderCode: string,
  expectedVersion: number,
  partial: boolean,
  returnNotes: string,
  items: Array<{
    orderItemId: string;
    returnConditionGrade: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
    isMissing: boolean;
    damageNotes?: string;
    nextOperationalStatus: 'CLEANING' | 'REPAIR';
    repairBlockedUntil?: string;
    evidence: RentalEvidence[];
    accessories: Array<{ accessoryId: string; quantityReturned: number; conditionIn?: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED' | null }>;
  }>,
) {
  return request<ApiOrder>(`/api/v1/rentals/orders/${encodeURIComponent(orderApiId(orderCode))}/return`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, partial, returnNotes: returnNotes || undefined, items }),
  });
}

export async function assessOrderReturn(
  orderCode: string,
  expectedVersion: number,
  items: Array<{ orderItemId: string; damageFeeVnd: number; missingFeeVnd: number; accessories: Array<{ accessoryId: string; damageFeeVnd: number; missingFeeVnd: number }> }>,
) {
  return request<ApiOrder>(`/api/v1/rentals/orders/${encodeURIComponent(orderApiId(orderCode))}/assessment`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, items }),
  });
}

export async function prepareOrderSettlement(
  orderCode: string,
  expectedVersion: number,
  depositDeductionVnd = 0,
  otherFeeVnd = 0,
  settlementNote = '',
) {
  return request<ApiOrder>(`/api/v1/payments/orders/${encodeURIComponent(orderApiId(orderCode))}/settlement`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, depositDeductionVnd: String(Math.round(depositDeductionVnd)), otherFeeVnd: String(Math.round(otherFeeVnd)), settlementNote: settlementNote || undefined }),
  });
}
