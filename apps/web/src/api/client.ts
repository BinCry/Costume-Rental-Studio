import type { BookingDraft, CatalogItem, Order, QueueTask, QuoteSnapshot } from '../fixtures/types';
import type {
  ActiveUnit,
  Branch,
  Case,
  Customer,
  CustomerOrder,
  CostumeDetail,
  Employee,
  Permission,
  Policy,
  ReportSnapshot,
  Role,
  Transfer,
  TransferStatus,
  Unit,
  Variant,
} from '../fixtures/studio';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}
interface Page<T> { items: T[]; pagination?: { page: number; pageSize: number; totalItems: number; totalPages: number } }
interface ApiModel {
  id: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  material?: string | null;
  category?: { name?: string | null } | null;
  media?: { mediaUrl?: string | null; altText?: string | null }[];
}
type ApiAdminModel = ApiModel & {
  modelCode: string;
  categoryId: string;
  status?: string;
  category?: { id?: string; name?: string | null } | null;
};
interface ApiCategory { id: string; name: string; status?: string }
interface ApiVariant {
  id: string; modelId: string; variantCode: string; sizeCode: string; colorCode: string;
  dailyRentalPriceVnd: string | number | bigint; depositAmountVnd: string | number | bigint;
  replacementValueVnd?: string | number | bigint;
  status?: string; editionLabel?: string | null; fitNotes?: string | null;
  media?: { mediaUrl?: string | null; altText?: string | null }[];
  model?: ApiModel | null;
}
interface ApiBranch {
  id: string;
  name: string;
  branchCode?: string;
  status?: string;
  address?: string | null;
  phone?: string | null;
}
interface ApiQuote {
  quoteExpiresAt: string;
  policy: {
    versionCode?: string;
    billingDayMode?: string;
    quoteValidHours?: number;
    lateGraceMinutes?: number;
    lateFeePercentPerDay?: number | string;
  };
  period: { billableDays: number; plannedStartAt: string; plannedDueAt: string };
  items: {
    variantId: string;
    dailyRentalPriceVnd: string | number | bigint;
    depositAmountVnd: string | number | bigint;
    rentalAmountVnd: string | number | bigint;
    availableUnits: number;
  }[];
  promotion?: { discountVnd: string | number | bigint } | null;
  subtotalVnd: string | number | bigint;
  discountVnd: string | number | bigint;
  rentalAmountVnd: string | number | bigint;
  depositVnd: string | number | bigint;
  totalDueVnd: string | number | bigint;
  available: boolean;
}
interface ApiOrder {
  id: string; orderCode: string; status: Order['status']; version: number;
  plannedStartAt: string; plannedDueAt: string; customerNote?: string | null;
  customer?: { user?: { displayName?: string; phone?: string | null } };
  pickupBranch?: { id?: string; name?: string };
  items?: {
    id: string;
    variantId?: string;
    variant?: { sizeCode?: string; colorCode?: string; model?: { name?: string } };
    unit?: { id?: string; unitCode?: string; operationalStatus?: string };
    unitDailyPriceVnd?: string | number | bigint;
    unitDepositVnd?: string | number | bigint;
    billableDays?: number;
    accessories?: {
      id: string;
      quantityOut: number;
      quantityReturned?: number | null;
    }[];
  }[];
  payments?: { purpose: string; amountVnd: string | number | bigint; status: string }[];
  lateFeeVnd?: string | number | bigint;
  otherFeeVnd?: string | number | bigint;
  events?: { occurredAt?: string; eventType?: string }[];
}
interface ApiUnit { id: string; unitCode: string; conditionGrade?: string }
interface ApiActiveRental {
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
}
interface ApiInventoryUnit {
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
}
interface ApiCustomer {
  userId: string;
  customerCode: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  preferredBranchId?: string | null;
}
interface ApiCrmCase {
  id: string;
  caseCode: string;
  customerUserId: string;
  branchId: string;
  orderId?: string | null;
  subject: string;
  description?: string | null;
  caseType?: string | null;
  priority: Case['priority'];
  status: Case['status'];
  ownerUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  customer?: {
    customerCode?: string;
    user?: { id?: string; displayName?: string; phone?: string | null; email?: string | null };
  } | null;
  branch?: { id?: string; name?: string } | null;
  order?: { id?: string; orderCode?: string } | null;
  owner?: { user?: { id?: string; displayName?: string } | null } | null;
}
interface ApiCaseHistory {
  occurredAt?: string;
  eventType?: string;
  note?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
}
interface ApiInteraction {
  occurredAt?: string;
  interactionType?: string;
  channel?: string;
  summary?: string;
}
interface ApiTransfer {
  id: string;
  transferCode: string;
  status: TransferStatus;
  version: number;
  requestNote?: string | null;
  endReason?: string | null;
  createdAt?: string;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  items: {
    unitId: string;
    conditionOut?: string | null;
    conditionIn?: string | null;
    unit?: { unitCode?: string } | null;
  }[];
}
interface ApiPolicy {
  id: string;
  versionCode: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  billingDayMode: Policy['billingMode'];
  minRentalDays: number;
  maxRentalDays?: number | null;
  quoteValidHours: number;
  freeCancelBeforeHours: number;
  noShowGraceMinutes?: number;
  lateCancelFeePercent?: number | string;
  refundSlaBusinessDays?: number | null;
  lateGraceMinutes?: number;
  lateFeePercentPerDay?: number | string;
  lateReturnBufferMinutes?: number;
  defaultCleaningBufferMinutes?: number;
  lateFeeFormulaVersion?: number;
  changeReason: string;
}
interface ApiOverviewReport {
  from: string;
  to: string;
  branchId?: string | null;
  ordersCreated: number;
  overdueOrders: number;
  rentalRevenueVnd: string | number | bigint;
  depositsHeldVnd: string | number | bigint;
  completedRefundVnd?: string | number | bigint;
}
interface ApiRentalReport { totalOrders: number; overdueOrders: number }
interface ApiPaymentReport {
  byStatus: { status: string; count: number }[];
  byMethod: { method: string; count: number }[];
}

export interface RentalEvidence {
  uploadKey: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
  capturedAt?: string;
}

export interface SettlementSnapshot {
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
}

export interface PaymentRecord {
  id: string;
  purpose: string;
  method: string;
  amountVnd: string | number;
  status: string;
  transactionReference?: string | null;
}

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
  readonly details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
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
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? 'API_REQUEST_FAILED',
      body?.error?.message ?? ('API request failed: ' + response.status),
      body?.error?.details,
    );
  }
  return body.data;
}

const branchIds = new Map<string, string>();
const branchRefs = new Map<string, string>();
const variants = new Map<string, ApiVariant>();
const modelRefs = new Map<string, { id: string; categoryId: string; modelCode: string }>();
const variantRefs = new Map<string, { id: string; modelId: string }>();
const orderRefs = new Map<string, { id: string; itemIds: string[]; version?: number }>();
const unitRefs = new Map<string, Map<string, string>>();
const quoteRefs = new Map<string, {
  variantId: string;
  branchId: string;
  customerUserId: string;
  channel: string;
}>();
const roleRefs = new Map<string, string>();
const permissionRefs = new Map<string, string>();
const staffRefs = new Map<string, { userId: string; assignments: Map<string, string> }>();
const crmAssigneeRefs = new Map<string, string>();
const customerRefs = new Map<string, { userId: string; branchId?: string }>();
const caseRefs = new Map<
  string,
  {
    id: string;
    customerUserId: string;
    branchId: string;
    orderId?: string;
    ownerUserId?: string;
    status: Case['status'];
  }
>();
const transferRefs = new Map<string, { id: string; fromBranchId: string; toBranchId: string; unitIds: Map<string, string> }>();

export async function login(email: string, password: string) {
  const data = await request<{ accessToken: string; user: { id: string; displayName?: string } }>(
    '/api/v1/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password, deviceName: 'Studio web' }) },
    false,
  );
  saveToken(data.accessToken);
  return data.user;
}
export async function requestRegistrationOtp(email: string) {
  return request<{ challengeId: string; expiresIn: number; retryAfter: number }>(
    '/api/v1/auth/register/otp',
    { method: 'POST', body: JSON.stringify({ email }) },
    false,
  );
}
export async function registerCustomer(input: {
  email: string;
  phone?: string;
  challengeId: string;
  otp: string;
  displayName: string;
  password: string;
}) {
  const data = await request<{
    created: boolean;
    accessToken: string;
    customer: { userId: string; customerCode: string; displayName: string; email: string; phone?: string | null };
  }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ ...input, deviceName: 'Studio web' }),
  }, false);
  saveToken(data.accessToken);
  return data;
}
export async function requestPasswordResetOtp(email: string) {
  return request<{ challengeId: string; expiresIn: number; retryAfter: number }>(
    '/api/v1/auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }) },
    false,
  );
}
export async function verifyPasswordResetOtp(challengeId: string, otp: string) {
  return request<{ resetToken: string; expiresIn: number }>(
    '/api/v1/auth/verify-reset-otp',
    { method: 'POST', body: JSON.stringify({ challengeId, otp }) },
    false,
  );
}
export async function resetPassword(resetToken: string, newPassword: string) {
  return request<null>(
    '/api/v1/auth/reset-password',
    { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) },
    false,
  );
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
    phone?: string | null;
    roles: {
      roleCode: string;
      name: string;
      actorGroup: string;
      branchId: string | null;
      permissions: { code: string; scope: string }[];
    }[];
  }>('/api/v1/auth/me');
}

export async function getOwnCustomerProfile() {
  return request<ApiCustomer>('/api/v1/customers/me');
}
export async function updateOwnCustomerProfile(input: {
  displayName: string;
  phone: string | null;
}) {
  return request<ApiCustomer>('/api/v1/customers/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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
function branchFromApi(branch: ApiBranch): Branch {
  if (branch.branchCode) branchRefs.set(branch.branchCode, branch.id);
  branchIds.set(branch.name, branch.id);
  return {
    code: branch.branchCode ?? branch.id,
    name: branch.name,
    address: branch.address ?? '',
    status: branch.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    timezone: 'Asia/Ho_Chi_Minh',
  };
}
export async function listManagedBranches(): Promise<Branch[]> {
  const page = await request<Page<ApiBranch>>(
    '/api/v1/branches?page=1&pageSize=100&sortBy=name&sortOrder=asc',
  );
  return page.items.map(branchFromApi);
}
export async function listCatalogCategories(): Promise<{ id: string; name: string }[]> {
  const page = await request<Page<ApiCategory>>(
    '/api/v1/catalog/categories?page=1&pageSize=100&sortBy=name&sortOrder=asc',
  );
  return page.items
    .filter((category) => category.status !== 'INACTIVE')
    .map((category) => ({ id: category.id, name: category.name }));
}
export async function saveBranch(branch: Branch): Promise<Branch> {
  const reference = branchRefs.get(branch.code);
  let saved: ApiBranch;
  if (reference) {
    saved = await request<ApiBranch>(`/api/v1/branches/${encodeURIComponent(reference)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: branch.name, address: branch.address, timezone: branch.timezone }),
    });
    const desiredStatus = branch.status === 'ACTIVE' ? 'activate' : 'deactivate';
    const currentStatus = saved.status === 'INACTIVE' ? 'deactivate' : 'activate';
    if (desiredStatus !== currentStatus)
      saved = await request<ApiBranch>(`/api/v1/branches/${encodeURIComponent(reference)}/${desiredStatus}`, {
        method: 'POST',
      });
  } else {
    saved = await request<ApiBranch>('/api/v1/branches', {
      method: 'POST',
      body: JSON.stringify({
        branchCode: branch.code,
        name: branch.name,
        address: branch.address,
        timezone: branch.timezone,
      }),
    });
  }
  return branchFromApi(saved);
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
function variantFromAdminApi(variant: ApiVariant): Variant {
  variantRefs.set(variant.variantCode, { id: variant.id, modelId: variant.modelId });
  return {
    code: variant.variantCode,
    modelId: variant.modelId,
    size: variant.sizeCode,
    color: variant.colorCode,
    edition: variant.editionLabel ?? undefined,
    fit: variant.fitNotes ?? '',
    price: numberValue(variant.dailyRentalPriceVnd),
    deposit: numberValue(variant.depositAmountVnd),
    replacement: numberValue(variant.replacementValueVnd),
  };
}
export async function listCatalogDetails(): Promise<CostumeDetail[]> {
  const [models, variantsPage] = await Promise.all([
    request<Page<ApiAdminModel>>('/api/v1/catalog/models?page=1&pageSize=100&sortBy=name&sortOrder=asc'),
    request<Page<ApiVariant>>('/api/v1/catalog/variants?page=1&pageSize=100&sortBy=variantCode&sortOrder=asc'),
  ]);
  const byModel = new Map<string, Variant[]>();
  variantsPage.items.forEach((variant) => {
    variants.set(variant.id, variant);
    const mapped = variantFromAdminApi(variant);
    const list = byModel.get(variant.modelId) ?? [];
    list.push(mapped);
    byModel.set(variant.modelId, list);
  });
  return models.items.map((model) => {
    modelRefs.set(model.id, {
      id: model.id,
      categoryId: model.categoryId,
      modelCode: model.modelCode,
    });
    return {
      id: model.id,
      name: model.name,
      modelCode: model.modelCode,
      categoryId: model.categoryId,
      category: model.category?.name ?? 'Trang phục',
      description: model.description ?? model.shortDescription ?? '',
      material: model.material ?? '',
      accessories: [],
      imagePosition: model.media?.length ? 'center' : 'missing',
      variants: byModel.get(model.id) ?? [],
    };
  });
}
export async function saveCatalogModel(model: CostumeDetail): Promise<CostumeDetail> {
  const reference = modelRefs.get(model.id);
  const updated = reference
    ? await request<ApiAdminModel>(`/api/v1/catalog/models/${encodeURIComponent(reference.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: model.name,
          description: model.description || null,
          material: model.material || null,
        }),
      })
    : await request<ApiAdminModel>('/api/v1/catalog/models', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: model.categoryId,
          modelCode: model.modelCode,
          name: model.name,
          description: model.description || undefined,
          material: model.material || undefined,
        }),
      });
  modelRefs.set(updated.id, { id: updated.id, categoryId: updated.categoryId, modelCode: updated.modelCode });
  return {
    ...model,
    id: updated.id,
    modelCode: updated.modelCode,
    categoryId: updated.categoryId,
    category: updated.category?.name ?? model.category,
    name: updated.name,
    description: updated.description ?? '',
    material: updated.material ?? '',
  };
}
export async function saveCatalogVariant(variant: Variant): Promise<Variant> {
  const reference = variantRefs.get(variant.code);
  const payload = {
    modelId: variant.modelId,
    variantCode: variant.code,
    sizeCode: variant.size,
    colorCode: variant.color,
    editionLabel: variant.edition ? variant.edition : undefined,
    fitNotes: variant.fit || undefined,
    dailyRentalPriceVnd: Math.round(variant.price),
    depositAmountVnd: Math.round(variant.deposit),
    replacementValueVnd: Math.max(Math.round(variant.replacement ?? 0), Math.round(variant.deposit)),
  };
  const saved = reference
    ? await request<ApiVariant>(`/api/v1/catalog/variants/${encodeURIComponent(reference.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...payload, variantCode: undefined, modelId: undefined }),
      })
    : await request<ApiVariant>('/api/v1/catalog/variants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
  return variantFromAdminApi(saved);
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
    apiVariantId: item.variantId,
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
    apiPlannedStartAt: order.plannedStartAt, apiPlannedDueAt: order.plannedDueAt,
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
  orderRefs.set(mapped.id, { id: order.id, itemIds: (order.items ?? []).map((item) => item.id), version: order.version });
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
export async function listOrders(
  options: { loadPendingAvailability?: boolean } = {},
) {
  const page = await request<Page<ApiOrder>>('/api/v1/rentals/orders?page=1&pageSize=100&sortBy=createdAt&sortOrder=desc');
  const loadPendingAvailability = options.loadPendingAvailability ?? true;
  return Promise.all(
    page.items.map(async (order) => {
      let availableUnits: ApiUnit[] = [];
      let availabilityError: string | undefined;
      if (loadPendingAvailability && order.status === 'PENDING_CONFIRMATION') {
        try {
          availableUnits = await availableForOrder(order);
        } catch {
          availabilityError = 'Không tải được bộ khả dụng. Hãy thử tải lại trước khi xác nhận đơn.';
        }
      }
      const mapped = enrichOrder(order, availableUnits);
      if (availabilityError) mapped.availabilityError = availabilityError;
      return mapped;
    }),
  );
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
    listOrders({ loadPendingAvailability: false }),
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
export async function getQuote(
  draft: BookingDraft,
  options: { customerCode?: string; channel?: string } = {},
): Promise<QuoteSnapshot> {
  if (!branchIds.has(draft.branch)) await listBranches();
  const branchId = branchIds.get(draft.branch);
  const variant = variants.get(draft.costumeId);
  if (!branchId || !variant) throw new ApiClientError(422, 'API_CONTEXT_MISSING', 'Cần tải lại chi nhánh và mẫu trang phục');
  const customerUserId = options.customerCode
    ? customerRefs.get(options.customerCode)?.userId
    : (await currentUser()).id;
  if (!customerUserId)
    throw new ApiClientError(422, 'CUSTOMER_CONTEXT_MISSING', 'Hãy tải lại danh sách và chọn hồ sơ khách hợp lệ.');
  const channel = options.channel ?? 'ONLINE';
  const response = await request<ApiQuote>('/api/v1/rentals/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerUserId,
      pickupBranchId: branchId,
      channel,
      plannedStartAt: new Date(draft.pickup).toISOString(),
      plannedDueAt: new Date(draft.returnAt).toISOString(),
      items: Array.from({ length: draft.quantity }, () => ({ variantId: variant.id, accessories: [] })),
    }),
  });
  const quoteId = 'api-quote-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36));
  const pricePerDay = numberValue(response.items.find((item) => item.variantId === variant.id)?.dailyRentalPriceVnd);
  const billingMode = response.policy.billingDayMode === 'ROLLING_24_HOURS' ? 'chu kỳ 24 giờ' : 'ngày lịch';
  quoteRefs.set(quoteId, { variantId: variant.id, branchId, customerUserId, channel });
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
    lateGraceMinutes: response.policy.lateGraceMinutes ?? 0,
    lateFeePercentPerDay: Number(response.policy.lateFeePercentPerDay ?? 0),
  };
}
export async function createOrder(
  draft: BookingDraft,
  quote: QuoteSnapshot,
  assignedUnit?: { code: string; id: string },
) {
  const reference = quoteRefs.get(quote.id);
  const variantId = reference?.variantId;
  const branchId = reference?.branchId;
  const customerUserId = reference?.customerUserId;
  const channel = reference?.channel ?? 'ONLINE';
  if (!variantId || !branchId || !customerUserId) throw new ApiClientError(422, 'API_CONTEXT_MISSING', 'Thiếu khách, mẫu hoặc chi nhánh; hãy tải lại báo giá.');
  const created = await request<ApiOrder>('/api/v1/rentals/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerUserId, pickupBranchId: branchId, channel,
      plannedStartAt: new Date(draft.pickup).toISOString(), plannedDueAt: new Date(draft.returnAt).toISOString(),
      customerNote: draft.note || undefined,
      items: Array.from({ length: draft.quantity }, () => ({ variantId, accessories: [] })),
    }),
  });
  quoteRefs.delete(quote.id);
  const orderCode = created.orderCode || created.id;
  orderRefs.set(orderCode, { id: created.id, itemIds: (created.items ?? []).map((item) => item.id), version: created.version });
  if (assignedUnit) unitRefs.set(orderCode, new Map([[assignedUnit.code, assignedUnit.id]]));
  return orderCode;
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
    method: 'POST', body: JSON.stringify({ expectedVersion: reference.version ?? version, allocations }),
  });
}
export async function listRentalAvailability(
  variantId: string,
  branchName: string,
  plannedStartAt: string,
  plannedDueAt: string,
): Promise<Unit[]> {
  if (!branchIds.has(branchName)) await listBranches();
  if (!variants.has(variantId)) await listCatalog();
  const pickupBranchId = branchIds.get(branchName);
  const variant = variants.get(variantId);
  if (!pickupBranchId || !variant)
    throw new ApiClientError(422, 'API_CONTEXT_MISSING', 'Hãy tải lại mẫu trang phục và chi nhánh.');
  const query = new URLSearchParams({
    variantId,
    pickupBranchId,
    plannedStartAt: new Date(plannedStartAt).toISOString(),
    plannedDueAt: new Date(plannedDueAt).toISOString(),
  });
  const result = await request<{ available: boolean; units: ApiUnit[] }>(
    '/api/v1/rentals/availability?' + query.toString(),
  );
  return result.units.map((unit) => ({
    apiId: unit.id,
    barcode: unit.unitCode,
    variantCode: variant.variantCode,
    model: variant.model?.name ?? 'Trang phục',
    variant: [variant.sizeCode, variant.colorCode].filter(Boolean).join(' / '),
    branch: branchName,
    status: 'READY',
    condition: unit.conditionGrade ?? 'UNINSPECTED',
    available: true,
    blocks: [],
    history: [],
  }));
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
function localDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export async function listDashboardTasks(branchName?: string): Promise<QueueTask[]> {
  if (branchName && !branchIds.has(branchName)) await listBranches();
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  const statuses: ApiOrder['status'][] = ['PENDING_CONFIRMATION', 'READY_FOR_PICKUP', 'ACTIVE'];
  const ordersByStatus = await Promise.all(statuses.map(async (status) => {
    const orders: ApiOrder[] = [];
    let pageNumber = 1;
    let totalPages = 1;
    while (pageNumber <= totalPages) {
      const query = new URLSearchParams({
        page: String(pageNumber),
        pageSize: '100',
        sortBy: 'plannedDueAt',
        sortOrder: 'asc',
        status,
      });
      if (branchId) query.set('pickupBranchId', branchId);
      const page = await request<Page<ApiOrder>>('/api/v1/rentals/orders?' + query.toString());
      orders.push(...page.items);
      totalPages = page.pagination?.totalPages ?? 1;
      pageNumber += 1;
    }
    return orders;
  }));
  const orders = ordersByStatus.flat();
  const now = new Date();
  const today = localDateKey(now);
  const soon = now.getTime() + 2 * 60 * 60 * 1000;
  return orders.flatMap((order) => {
    const status = order.status;
    const pickupAt = new Date(order.plannedStartAt);
    const dueAt = new Date(order.plannedDueAt);
    const isPending = status === 'PENDING_CONFIRMATION';
    const isHandover = status === 'READY_FOR_PICKUP';
    const isActive = status === 'ACTIVE';
    if (!isPending && !isHandover && !isActive) return [];
    const taskDate = isActive ? dueAt : pickupAt;
    const overdue = isActive && dueAt.getTime() < now.getTime();
    const group: QueueTask['group'] = overdue
      ? 'Quá hạn'
      : taskDate.getTime() <= soon && localDateKey(taskDate) === today
        ? 'Trong 2 giờ tới'
        : 'Hôm nay';
    const taskType: QueueTask['kind'] = overdue
      ? 'overdue'
      : isPending
        ? 'pending'
        : isHandover
          ? 'handover'
          : 'return';
    const branch = order.pickupBranch?.name ?? 'Chi nhánh chưa xác định';
    const firstItem = order.items?.[0];
    const task = overdue
      ? `Đã quá hạn trả từ ${formatDate(order.plannedDueAt)}`
      : isPending
        ? 'Duyệt yêu cầu và kiểm tra khả dụng'
        : isHandover
          ? `Chuẩn bị giao lúc ${formatDate(order.plannedStartAt)}`
          : `Theo dõi hạn trả ${formatDate(order.plannedDueAt)}`;
    return [{
      id: order.id,
      orderId: order.orderCode,
      due: formatDate(isActive ? order.plannedDueAt : order.plannedStartAt),
      customer: order.customer?.user?.displayName ?? 'Khách hàng',
      phone: order.customer?.user?.phone ?? '',
      barcode: firstItem?.unit?.unitCode,
      task,
      urgency: overdue ? 'Quá hạn' : group,
      group,
      kind: taskType,
      owner: 'Chưa phân công',
      branch,
      workDate: localDateKey(taskDate),
      status: isPending ? 'Cần xử lý' : 'Đang xử lý',
    }];
  });
}
interface ApiPermission {
  id: string;
  code: string;
  module: string;
  action: string;
  scope: Permission['scope'];
  description?: string | null;
}
interface ApiRole {
  id: string;
  roleCode: string;
  name: string;
  actorGroup: Role['group'];
  rolePermissions?: { permission: ApiPermission }[];
}
export async function listRbacRoles(): Promise<Role[]> {
  const [page, permissions] = await Promise.all([
    request<ApiRole[]>('/api/v1/rbac/roles'),
    request<ApiPermission[]>('/api/v1/rbac/permissions'),
  ]);
  page.forEach((role) => roleRefs.set(role.roleCode, role.id));
  permissions.forEach((permission) => permissionRefs.set(permission.code, permission.id));
  return page.map((role) => ({
    apiId: role.id,
    code: role.roleCode,
    name: role.name,
    group: role.actorGroup,
    permissions: (role.rolePermissions ?? []).map(({ permission }) => permission.code),
  }));
}
export async function listRbacPermissions(): Promise<Permission[]> {
  const page = await request<ApiPermission[]>('/api/v1/rbac/permissions');
  page.forEach((permission) => permissionRefs.set(permission.code, permission.id));
  const groups: Record<string, string> = {
    rentals: 'Đơn thuê',
    payments: 'Thanh toán',
    refunds: 'Thanh toán',
    inventory: 'Kho',
    transfers: 'Kho',
    crm: 'CRM',
    branches: 'Quản trị',
    staff: 'Quản trị',
    rbac: 'Quản trị',
    catalog: 'Quản trị',
    reports: 'Quản trị',
    customers: 'CRM',
    policies: 'Quản trị',
    promotions: 'Quản trị',
  };
  return page.map((permission) => ({
    code: permission.code,
    group:
      permission.module === 'rentals' &&
      ['handover', 'return', 'assessment', 'settlement'].includes(permission.action)
        ? 'Giao / trả'
        : groups[permission.module] ?? permission.module,
    label: `${permission.action} · ${permission.scope}`,
    description: permission.description ?? `${permission.action} · ${permission.scope}`,
    scope: permission.scope,
  }));
}
export async function replaceRbacRolePermissions(roleCode: string, permissionCodes: string[]) {
  const roleId = roleRefs.get(roleCode);
  const permissionIds = permissionCodes.map((code) => permissionRefs.get(code)).filter(Boolean) as string[];
  if (!roleId || permissionIds.length !== permissionCodes.length)
    throw new ApiClientError(422, 'RBAC_CONTEXT_MISSING', 'Chưa tải đủ vai trò và quyền để lưu.');
  return request<ApiRole>(`/api/v1/rbac/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissionIds }),
  });
}
interface ApiStaff {
  id: string;
  email: string;
  displayName: string;
  status: Employee['accountStatus'];
  employee?: { employeeCode: string; employmentStatus: Employee['employmentStatus'] } | null;
  roleAssignments?: {
    id: string;
    role: { roleCode: string };
    branch?: { name?: string } | null;
    branchId?: string | null;
  }[];
}
function mapStaff(staff: ApiStaff): Employee {
  const code = staff.employee?.employeeCode ?? staff.id;
  const assignments = new Map<string, string>();
  const mappedAssignments = (staff.roleAssignments ?? []).map((assignment) => {
    const branch = assignment.branch?.name ?? 'Toàn chuỗi';
    assignments.set(`${branch}|${assignment.role.roleCode}`, assignment.id);
    return { branch, roleCode: assignment.role.roleCode };
  });
  staffRefs.set(code, { userId: staff.id, assignments });
  return {
    code,
    employeeCode: staff.employee?.employeeCode,
    name: staff.displayName,
    email: staff.email,
    accountStatus: staff.status,
    employmentStatus: staff.employee?.employmentStatus ?? 'ACTIVE',
    assignments: mappedAssignments,
  };
}
export async function listStaff(branchName?: string, search?: string): Promise<Employee[]> {
  if (branchName && !branchIds.has(branchName)) await listBranches();
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  if (search?.trim()) query.set('search', search.trim());
  const page = await request<Page<ApiStaff>>('/api/v1/staff?' + query.toString());
  return page.items.map(mapStaff);
}
export async function saveStaff(employee: Employee) {
  const reference = staffRefs.get(employee.code);
  if (!reference) {
    if (roleRefs.size === 0) await listRbacRoles();
    if (branchIds.size === 0) await listBranches();
    const assignments = employee.assignments.map((assignment) => ({
      roleId: roleRefs.get(assignment.roleCode),
      branchId: assignment.branch === 'Toàn chuỗi' ? null : branchIds.get(assignment.branch),
    }));
    if (assignments.some((assignment) => !assignment.roleId || (assignment.branchId === undefined && employee.assignments.length > 0)))
      throw new ApiClientError(422, 'STAFF_CONTEXT_MISSING', 'Chưa tải đủ role hoặc chi nhánh để tạo nhân viên.');
    const created = await request<ApiStaff>('/api/v1/staff', {
      method: 'POST',
      body: JSON.stringify({
        email: employee.email,
        displayName: employee.name,
        employeeCode: employee.employeeCode?.trim() ? employee.employeeCode.trim() : employee.code,
        joinedAt: new Date().toISOString(),
        assignments,
      }),
    });
    return mapStaff(created);
  }
  await request(`/api/v1/staff/${encodeURIComponent(reference.userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: employee.name,
      employmentStatus: employee.employmentStatus === 'TERMINATED' ? undefined : employee.employmentStatus,
    }),
  });
  if (employee.employmentStatus === 'TERMINATED') {
    await request(`/api/v1/staff/${encodeURIComponent(reference.userId)}/terminate`, { method: 'POST' });
    return employee;
  }
  if (roleRefs.size === 0) await listRbacRoles();
  if (branchIds.size === 0) await listBranches();
  const desired = new Map(employee.assignments.map((assignment) => [`${assignment.branch}|${assignment.roleCode}`, assignment]));
  for (const [key, assignmentId] of reference.assignments) {
    if (!desired.has(key))
      await request(`/api/v1/staff/${encodeURIComponent(reference.userId)}/role-assignments/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' });
  }
  for (const [key, assignment] of desired) {
    if (reference.assignments.has(key)) continue;
    const roleId = roleRefs.get(assignment.roleCode);
    const branchId = assignment.branch === 'Toàn chuỗi' ? null : branchIds.get(assignment.branch);
    if (!roleId || (branchId === undefined && assignment.branch !== 'Toàn chuỗi'))
      throw new ApiClientError(422, 'STAFF_CONTEXT_MISSING', 'Chưa tải đủ role hoặc chi nhánh để gán quyền.');
    await request(`/api/v1/staff/${encodeURIComponent(reference.userId)}/role-assignments`, {
      method: 'POST',
      body: JSON.stringify({ roleId, branchId }),
    });
  }
  staffRefs.delete(employee.code);
  return employee;
}
function branchNameById(branchId: string | null | undefined) {
  if (!branchId) return 'Chưa chọn chi nhánh';
  for (const [name, id] of branchIds) if (id === branchId) return name;
  return 'Chi nhánh chưa xác định';
}
function customerFromApi(customer: ApiCustomer): Customer {
  customerRefs.set(customer.customerCode, {
    userId: customer.userId,
    branchId: customer.preferredBranchId ?? undefined,
  });
  return {
    code: customer.customerCode,
    name: customer.displayName,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    preferredBranch: branchNameById(customer.preferredBranchId),
    history: [],
    interactions: [],
  };
}
export async function listCustomers(branchName?: string, search?: string): Promise<Customer[]> {
  if (branchIds.size === 0 || (branchName && !branchIds.has(branchName))) await listBranches();
  const query = new URLSearchParams({ page: '1', pageSize: '100' });
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  if (search?.trim()) query.set('search', search.trim());
  const page = await request<Page<ApiCustomer>>('/api/v1/customers?' + query.toString());
  return page.items.map(customerFromApi);
}
function historyLine(entry: ApiCaseHistory) {
  const stamp = formatDate(entry.occurredAt);
  const transition = entry.toStatus ? ` · ${entry.eventType ?? 'Cập nhật'} · ${entry.toStatus}` : '';
  return `${stamp || 'Vừa cập nhật'}${transition}${entry.note ? ` · ${entry.note}` : ''}`;
}
function interactionLine(entry: ApiInteraction) {
  const stamp = formatDate(entry.occurredAt);
  const kind = entry.interactionType ? ` · ${entry.interactionType}` : '';
  const channel = entry.channel ? ` · ${entry.channel}` : '';
  return `${stamp || 'Vừa cập nhật'}${kind}${channel}${entry.summary ? ` · ${entry.summary}` : ''}`;
}
function crmCaseFromApi(crmCase: ApiCrmCase): Case {
  const customerCode = crmCase.customer?.customerCode ?? crmCase.customerUserId;
  const branch = crmCase.branch?.name ?? branchNameById(crmCase.branchId);
  const history = crmCase.createdAt ? [`${formatDate(crmCase.createdAt)} · Tạo case`] : [];
  caseRefs.set(crmCase.caseCode, {
    id: crmCase.id,
    customerUserId: crmCase.customerUserId,
    branchId: crmCase.branchId,
    orderId: crmCase.orderId ?? crmCase.order?.id ?? undefined,
    ownerUserId: crmCase.ownerUserId ?? crmCase.owner?.user?.id ?? undefined,
    status: crmCase.status,
  });
  if (crmCase.customer?.customerCode && crmCase.customer?.user?.id) {
    customerRefs.set(crmCase.customer.customerCode, {
      userId: crmCase.customer.user.id,
      branchId: crmCase.branchId,
    });
  }
  return {
    code: crmCase.caseCode,
    customerCode,
    branch,
    orderId: crmCase.order?.orderCode ?? crmCase.orderId ?? undefined,
    subject: crmCase.subject,
    description: crmCase.description ?? '',
    priority: crmCase.priority,
    status: crmCase.status,
    owner: crmCase.owner?.user?.displayName ?? undefined,
    history,
  };
}
export async function listCrmCases(branchName?: string, customerCode?: string): Promise<Case[]> {
  if (branchIds.size === 0 || (branchName && !branchIds.has(branchName))) await listBranches();
  if (customerCode && !customerRefs.has(customerCode)) await listCustomers(branchName);
  const query = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'updatedAt', sortOrder: 'desc' });
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  const customerUserId = customerCode ? customerRefs.get(customerCode)?.userId : undefined;
  if (customerUserId) query.set('customerUserId', customerUserId);
  const page = await request<Page<ApiCrmCase>>('/api/v1/crm/cases?' + query.toString());
  return page.items.map(crmCaseFromApi);
}
export async function listCrmAssignees(branchName: string): Promise<Employee[]> {
  if (!branchIds.has(branchName)) await listBranches();
  const branchId = branchIds.get(branchName);
  if (!branchId)
    throw new ApiClientError(422, 'BRANCH_CONTEXT_MISSING', 'Không tìm thấy chi nhánh CRM.');
  const assignees = await request<{
    userId: string;
    employeeCode: string;
    displayName: string;
  }[]>(`/api/v1/crm/assignees?branchId=${encodeURIComponent(branchId)}`);
  return assignees.map((assignee) => {
    crmAssigneeRefs.set(`${branchName}|${assignee.displayName}`, assignee.userId);
    return {
      code: assignee.employeeCode,
      name: assignee.displayName,
      email: '',
      accountStatus: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      assignments: [{ branch: branchName, roleCode: 'SALES_STAFF' }],
    };
  });
}
export async function listCrmCaseHistory(caseCode: string) {
  const reference = caseRefs.get(caseCode);
  if (!reference) return [];
  const page = await request<Page<ApiCaseHistory>>(
    `/api/v1/crm/cases/${encodeURIComponent(reference.id)}/history?page=1&pageSize=100`,
  );
  return page.items.map(historyLine);
}
export async function listCustomerInteractions(customerCode: string, branchName?: string) {
  if (!customerRefs.has(customerCode)) await listCustomers(branchName);
  const reference = customerRefs.get(customerCode);
  if (!reference) return [];
  const page = await request<Page<ApiInteraction>>(
    `/api/v1/crm/customers/${encodeURIComponent(reference.userId)}/interactions?page=1&pageSize=100`,
  );
  return page.items.map(interactionLine);
}
export async function createCustomerInteraction(
  customerCode: string,
  branchName: string,
  input: {
    summary: string;
    interactionType: 'INQUIRY' | 'CONSULTATION' | 'COMPLAINT' | 'FOLLOW_UP' | 'NOTE';
    channel: 'IN_PERSON' | 'PHONE' | 'EMAIL' | 'CHAT' | 'SOCIAL';
  },
) {
  if (!branchIds.has(branchName)) await listBranches();
  if (!customerRefs.has(customerCode)) await listCustomers(branchName);
  const customerUserId = customerRefs.get(customerCode)?.userId;
  const branchId = branchIds.get(branchName);
  if (!customerUserId) throw new ApiClientError(422, 'CUSTOMER_CONTEXT_MISSING', 'Chưa tải được mã khách để ghi tương tác.');
  if (!branchId) throw new ApiClientError(422, 'BRANCH_CONTEXT_MISSING', 'Không tìm thấy chi nhánh xử lý tương tác.');
  const created = await request<ApiInteraction>(
    `/api/v1/crm/customers/${encodeURIComponent(customerUserId)}/interactions`,
    {
      method: 'POST',
      body: JSON.stringify({ ...input, branchId }),
    },
  );
  return interactionLine(created);
}
async function ownerUserId(owner: string | undefined, branch: string) {
  if (!owner) return null;
  const reference = `${branch}|${owner}`;
  if (!crmAssigneeRefs.has(reference)) await listCrmAssignees(branch);
  const userId = crmAssigneeRefs.get(reference);
  if (!userId)
    throw new ApiClientError(422, 'CRM_OWNER_NOT_FOUND', 'Người phụ trách không còn hoạt động tại chi nhánh này.');
  return userId;
}
export async function saveCrmCase(value: Case): Promise<Case> {
  if (!branchIds.has(value.branch)) await listBranches();
  const branchId = branchIds.get(value.branch);
  if (!branchId) throw new ApiClientError(422, 'BRANCH_CONTEXT_MISSING', 'Không tìm thấy chi nhánh xử lý case.');
  const reference = caseRefs.get(value.code);
  const customer = customerRefs.get(value.customerCode);
  if (!reference) {
    if (!customer) await listCustomers(value.branch);
    const resolvedCustomer = customerRefs.get(value.customerCode);
    if (!resolvedCustomer) throw new ApiClientError(422, 'CUSTOMER_CONTEXT_MISSING', 'Chưa tải được mã khách để tạo case.');
    const created = await request<ApiCrmCase>('/api/v1/crm/cases', {
      method: 'POST',
      body: JSON.stringify({
        customerUserId: resolvedCustomer.userId,
        branchId,
        subject: value.subject,
        description: value.description || undefined,
        // The existing CRM screen has no case-type field; SUPPORT is the backend's
        // neutral seed category for customer support cases.
        caseType: 'SUPPORT',
        priority: value.priority,
        ownerUserId: await ownerUserId(value.owner, value.branch).then((id) => id ? id : undefined),
        note: value.history[0],
      }),
    });
    return crmCaseFromApi(created);
  }
  if (reference.branchId !== branchId)
    throw new ApiClientError(422, 'CRM_BRANCH_CHANGE_UNSUPPORTED', 'API hiện chưa hỗ trợ chuyển case sang chi nhánh khác.');
  let updated = await request<ApiCrmCase>(`/api/v1/crm/cases/${encodeURIComponent(reference.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subject: value.subject,
      description: value.description || null,
      priority: value.priority,
    }),
  });
  const nextOwnerId = await ownerUserId(value.owner, value.branch);
  if (nextOwnerId !== (reference.ownerUserId ?? null)) {
    updated = await request<ApiCrmCase>(`/api/v1/crm/cases/${encodeURIComponent(reference.id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ ownerUserId: nextOwnerId, note: value.history[0] }),
    });
  }
  if (value.status !== reference.status) {
    updated = await request<ApiCrmCase>(`/api/v1/crm/cases/${encodeURIComponent(reference.id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: value.status, note: value.history[0] }),
    });
  }
  return crmCaseFromApi(updated);
}
export async function saveCustomer(customer: Customer): Promise<Customer> {
  if (!branchIds.has(customer.preferredBranch)) await listBranches();
  const branchId = branchIds.get(customer.preferredBranch);
  if (!branchId) throw new ApiClientError(422, 'BRANCH_CONTEXT_MISSING', 'Không tìm thấy chi nhánh ưu tiên.');
  const reference = customerRefs.get(customer.code);
  if (!reference) {
    const created = await request<{ created: boolean; customer: ApiCustomer }>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        displayName: customer.name,
        phone: customer.phone,
        email: customer.email,
      }),
    });
    return customerFromApi(created.customer);
  }
  const updated = await request<ApiCustomer>(`/api/v1/customers/${encodeURIComponent(reference.userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: customer.name,
      email: customer.email,
      preferredBranchId: branchId,
    }),
  });
  return customerFromApi(updated);
}
function transferFromApi(transfer: ApiTransfer): Transfer {
  const unitRefsForTransfer = new Map<string, string>();
  const units = transfer.items.map((item) => {
    const barcode = item.unit?.unitCode ?? item.unitId;
    unitRefsForTransfer.set(barcode, item.unitId);
    return {
      barcode,
      out: item.conditionOut ?? undefined,
      received: item.conditionIn ? 'Đã nhận' : undefined,
      in: item.conditionIn ?? undefined,
    };
  });
  transferRefs.set(transfer.transferCode, {
    id: transfer.id,
    fromBranchId: transfer.fromBranch.id,
    toBranchId: transfer.toBranch.id,
    unitIds: unitRefsForTransfer,
  });
  const history = transfer.createdAt ? [`${formatDate(transfer.createdAt)} · Tạo yêu cầu`] : [];
  if (transfer.endReason) history.unshift(`${formatDate(transfer.createdAt)} · ${transfer.endReason}`);
  return {
    code: transfer.transferCode,
    from: transfer.fromBranch.name,
    to: transfer.toBranch.name,
    status: transfer.status,
    units,
    note: transfer.requestNote ?? transfer.endReason ?? '',
    version: transfer.version,
    history,
  };
}
export async function listTransfers(branchName?: string): Promise<Transfer[]> {
  if (branchIds.size === 0 || (branchName && !branchIds.has(branchName))) await listBranches();
  const query = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'createdAt', sortOrder: 'desc' });
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  if (branchId) query.set('branchId', branchId);
  const page = await request<Page<ApiTransfer>>('/api/v1/inventory/transfers?' + query.toString());
  return page.items.map(transferFromApi);
}
async function transferUnitIds(transfer: Transfer) {
  const reference = transferRefs.get(transfer.code);
  if (reference && transfer.units.every((item) => reference.unitIds.has(item.barcode))) return reference;
  if (!branchIds.has(transfer.from)) await listBranches();
  const fromBranchId = branchIds.get(transfer.from);
  const toBranchId = branchIds.get(transfer.to);
  if (!fromBranchId || !toBranchId)
    throw new ApiClientError(422, 'TRANSFER_CONTEXT_MISSING', 'Chưa tải đủ chi nhánh điều chuyển.');
  const inventory = await listInventoryUnits(transfer.from);
  const unitIds = new Map(inventory.map((unit) => [unit.barcode, unit.apiId ?? '']));
  if (transfer.units.some((item) => !unitIds.get(item.barcode)))
    throw new ApiClientError(409, 'UNIT_CONTEXT_MISSING', 'Có bộ chưa tải được mã đơn vị để điều chuyển.');
  return { id: reference?.id ?? '', fromBranchId, toBranchId, unitIds };
}
export async function saveTransfer(transfer: Transfer): Promise<Transfer> {
  const reference = await transferUnitIds(transfer);
  const unitIds = transfer.units.map((item) => reference.unitIds.get(item.barcode)!);
  if (!reference.id) {
    const created = await request<ApiTransfer>('/api/v1/inventory/transfers', {
      method: 'POST',
      body: JSON.stringify({
        fromBranchId: reference.fromBranchId,
        toBranchId: reference.toBranchId,
        unitIds,
        requestNote: transfer.note,
      }),
    });
    return transferFromApi(created);
  }
  const updated = await request<ApiTransfer>(`/api/v1/inventory/transfers/${encodeURIComponent(reference.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ expectedVersion: transfer.version, requestNote: transfer.note, unitIds }),
  });
  return transferFromApi(updated);
}
export async function advanceTransfer(
  code: string,
  next: TransferStatus,
  checked: { barcode: string; in: string }[],
  reason: string,
  current: Transfer,
): Promise<Transfer> {
  const reference = transferRefs.get(code);
  if (!reference) throw new ApiClientError(422, 'TRANSFER_CONTEXT_MISSING', 'Chưa tải đủ phiếu điều chuyển.');
  const path = `/api/v1/inventory/transfers/${encodeURIComponent(reference.id)}`;
  let updated: ApiTransfer;
  if (next === 'APPROVED') {
    updated = await request<ApiTransfer>(path + '/approve', {
      method: 'POST', body: JSON.stringify({ expectedVersion: current.version }),
    });
  } else if (next === 'REJECTED' || next === 'CANCELLED') {
    updated = await request<ApiTransfer>(path + '/' + next.toLowerCase(), {
      method: 'POST', body: JSON.stringify({ expectedVersion: current.version, reason }),
    });
  } else if (next === 'IN_TRANSIT') {
    updated = await request<ApiTransfer>(path + '/ship', {
      method: 'POST',
      body: JSON.stringify({
        expectedVersion: current.version,
        items: current.units.map((item) => ({ unitId: reference.unitIds.get(item.barcode), conditionOut: 'GOOD' })),
      }),
    });
  } else if (next === 'RECEIVED') {
    const pending = current.units.filter((item) => !item.received);
    const selected = checked.filter((item) => pending.some((unit) => unit.barcode === item.barcode));
    if (!selected.length) throw new ApiClientError(422, 'CHECK_REQUIRED', 'Chọn ít nhất một bộ và ghi tình trạng nhận.');
    updated = await request<ApiTransfer>(path + '/receive', {
      method: 'POST',
      body: JSON.stringify({
        expectedVersion: current.version,
        partial: selected.length < pending.length,
        items: selected.map((item) => ({
          unitId: reference.unitIds.get(item.barcode),
          conditionIn: item.in === 'DAMAGED' ? 'DAMAGED' : item.in === 'FAIR' ? 'FAIR' : 'GOOD',
          receivedOperationalStatus: item.in === 'DAMAGED' ? 'REPAIR' : item.in === 'FAIR' ? 'CLEANING' : 'READY',
        })),
      }),
    });
  } else {
    throw new ApiClientError(409, 'INVALID_TRANSFER_TRANSITION', 'Trạng thái điều chuyển không hợp lệ.');
  }
  return transferFromApi(updated);
}
function policyFromApi(policy: ApiPolicy): Policy {
  return {
    code: policy.versionCode,
    from: policy.effectiveFrom.slice(0, 10),
    to: policy.effectiveTo?.slice(0, 10),
    billingMode: policy.billingDayMode,
    minDays: policy.minRentalDays,
    maxDays: policy.maxRentalDays ?? null,
    quoteHours: policy.quoteValidHours,
    cancelHours: policy.freeCancelBeforeHours,
    noShowGraceMinutes: policy.noShowGraceMinutes ?? 0,
    lateCancelFeePercent: Number(policy.lateCancelFeePercent ?? 0),
    refundSlaBusinessDays: policy.refundSlaBusinessDays === undefined ? 5 : policy.refundSlaBusinessDays,
    lateGraceMinutes: policy.lateGraceMinutes ?? 0,
    lateFeePercentPerDay: Number(policy.lateFeePercentPerDay ?? 0),
    lateReturnBufferMinutes: policy.lateReturnBufferMinutes ?? 0,
    defaultCleaningBufferMinutes: policy.defaultCleaningBufferMinutes ?? 0,
    lateFeeFormulaVersion: policy.lateFeeFormulaVersion ?? 1,
    reason: policy.changeReason,
  };
}
export async function listPolicies(): Promise<Policy[]> {
  const items = await request<ApiPolicy[]>('/api/v1/rental-policies');
  return items.map(policyFromApi);
}
export async function savePolicy(policy: Policy): Promise<Policy> {
  const created = await request<ApiPolicy>('/api/v1/rental-policies', {
    method: 'POST',
    body: JSON.stringify({
      versionCode: policy.code,
      effectiveFrom: new Date(`${policy.from}T00:00:00.000Z`).toISOString(),
      effectiveTo: policy.to ? new Date(`${policy.to}T23:59:59.999Z`).toISOString() : null,
      billingDayMode: policy.billingMode,
      minRentalDays: policy.minDays,
      maxRentalDays: policy.maxDays,
      quoteValidHours: policy.quoteHours,
      noShowGraceMinutes: policy.noShowGraceMinutes ?? 0,
      lateGraceMinutes: policy.lateGraceMinutes ?? 0,
      lateFeePercentPerDay: policy.lateFeePercentPerDay ?? 0,
      lateFeeFormulaVersion: policy.lateFeeFormulaVersion ?? 1,
      lateReturnBufferMinutes: policy.lateReturnBufferMinutes ?? 0,
      defaultCleaningBufferMinutes: policy.defaultCleaningBufferMinutes ?? 0,
      freeCancelBeforeHours: policy.cancelHours,
      lateCancelFeePercent: policy.lateCancelFeePercent ?? 0,
      refundSlaBusinessDays: policy.refundSlaBusinessDays === undefined ? 5 : policy.refundSlaBusinessDays,
      changeReason: policy.reason,
    }),
  });
  return policyFromApi(created);
}
export async function listReports(branchName?: string): Promise<ReportSnapshot[]> {
  if (branchIds.size === 0 || (branchName && !branchIds.has(branchName))) await listBranches();
  const branchId = branchName ? branchIds.get(branchName) : undefined;
  const params = new URLSearchParams({ groupBy: 'day' });
  if (branchId) params.set('branchId', branchId);
  const query = params.toString();
  const [overview, rentals, payments] = await Promise.all([
    request<ApiOverviewReport>('/api/v1/reports/overview?' + query),
    request<ApiRentalReport>('/api/v1/reports/rentals?' + query),
    request<ApiPaymentReport>('/api/v1/reports/payments?' + query),
  ]);
  const branch = branchName ?? (overview.branchId ? branchNameById(overview.branchId) : 'Toàn chuỗi');
  return [{
    branch,
    period: `${overview.from.slice(0, 10)} → ${overview.to.slice(0, 10)}`,
    rentalCount: overview.ordersCreated,
    rentalRevenue: numberValue(overview.rentalRevenueVnd),
    depositsHeld: numberValue(overview.depositsHeldVnd),
    // Keep the legacy fixture field for compatibility, but expose API semantics explicitly.
    overdueUnits: 0,
    overdueOrders: rentals.overdueOrders,
    completedRefund: numberValue(overview.completedRefundVnd ?? 0),
    transactions: payments.byStatus,
    // The overview endpoint returns the exact amount, but not a refund count.
    // Keep the count list empty instead of presenting an invented quantity.
    refunds: [],
  }];
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

export async function uploadCatalogMedia(
  ownerType: 'model' | 'variant',
  ownerId: string,
  file: File,
  altText?: string,
) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new ApiClientError(400, 'INVALID_CATALOG_MEDIA', 'Ảnh phải là JPEG, PNG hoặc WebP');
  const presigned = await request<{
    objectKey: string;
    uploadUrl: string;
    fields: Record<string, string>;
  }>('/api/v1/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'catalog-media',
      ownerType,
      ownerId,
      contentType: file.type,
      size: file.size,
    }),
  });
  const form = new FormData();
  Object.entries(presigned.fields).forEach(([key, value]) => form.append(key, value));
  form.append('file', file);
  const uploaded = await fetch(presigned.uploadUrl, { method: 'POST', body: form });
  if (!uploaded.ok)
    throw new ApiClientError(uploaded.status, 'CATALOG_MEDIA_UPLOAD_FAILED', 'Không tải được ảnh danh mục');
  const path = ownerType === 'model' ? 'models' : 'variants';
  return request(`/api/v1/catalog/${path}/${encodeURIComponent(ownerId)}/media`, {
    method: 'POST',
    body: JSON.stringify({ uploadKey: presigned.objectKey, sortOrder: 0, altText: altText ? altText : undefined }),
  });
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

export async function validatePickupOrder(orderCode: string, expectedVersion: number) {
  const reference = orderReference(orderCode);
  return request<{ ready: boolean; unitCount: number }>(
    `/api/v1/rentals/orders/${encodeURIComponent(reference.id)}/pickup-check`,
    { method: 'POST', body: JSON.stringify({ expectedVersion: reference.version ?? expectedVersion }) },
  );
}
export async function reallocateOrder(
  orderCode: string,
  expectedVersion: number,
  orderItemId: string,
  unitId: string,
  reason: string,
) {
  const reference = orderReference(orderCode);
  return request<ApiOrder>(
    `/api/v1/rentals/orders/${encodeURIComponent(reference.id)}/reallocate`,
    { method: 'POST', body: JSON.stringify({ expectedVersion: reference.version ?? expectedVersion, orderItemId, unitId, reason }) },
  );
}
export async function pickupOrder(
  orderCode: string,
  expectedVersion: number,
  items: { orderItemId: string; conditionGrade: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED'; conditionNotes?: string; evidence: RentalEvidence[] }[],
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
  items: {
    orderItemId: string;
    returnConditionGrade: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
    isMissing: boolean;
    damageNotes?: string;
    nextOperationalStatus: 'CLEANING' | 'REPAIR';
    repairBlockedUntil?: string;
    evidence: RentalEvidence[];
    accessories: { accessoryId: string; quantityReturned: number; conditionIn?: 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED' | null }[];
  }[],
) {
  return request<ApiOrder>(`/api/v1/rentals/orders/${encodeURIComponent(orderApiId(orderCode))}/return`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, partial, returnNotes: returnNotes || undefined, items }),
  });
}

export async function assessOrderReturn(
  orderCode: string,
  expectedVersion: number,
  items: { orderItemId: string; damageFeeVnd: number; missingFeeVnd: number; accessories: { accessoryId: string; damageFeeVnd: number; missingFeeVnd: number }[] }[],
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
