import { useCallback, useEffect, useState } from 'react';
import {
  apiEnabled,
  createPromotion,
  hasAccessToken,
  listPromotions,
  setPromotionActive,
  updatePromotion,
  type PromotionMutation,
  type PromotionRecord,
} from '../api/client';
import { Button, DateTimeField, EmptyState, Feedback, Field, SelectField, StatusLabel } from '../components/ui';
import { money } from '../components/support';
import { PageHeading, Panel } from '../components/studio';
import { formatVietnamDateTime } from '../utils/date-format';

interface PromotionFormState {
  code: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED_AMOUNT';
  discountValue: string;
  maxDiscountVnd: string;
  minOrderAmountVnd: string;
  startAt: string;
  endAt: string;
  totalUsageLimit: string;
  perCustomerLimit: string;
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Thao tác chưa hoàn tất.';

function localDateTimeInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function newPromotionForm(): PromotionFormState {
  const now = new Date();
  return {
    code: '',
    name: '',
    discountType: 'PERCENT',
    discountValue: '10',
    maxDiscountVnd: '',
    minOrderAmountVnd: '0',
    startAt: localDateTimeInputValue(now),
    endAt: localDateTimeInputValue(new Date(now.getTime() + 7 * 24 * 60 * 60_000)),
    totalUsageLimit: '',
    perCustomerLimit: '1',
  };
}

function promotionFormFromRecord(item: PromotionRecord): PromotionFormState {
  return {
    code: item.code,
    name: item.name,
    discountType: item.discountType,
    discountValue: String(item.discountValue),
    maxDiscountVnd: item.maxDiscountVnd === null ? '' : String(item.maxDiscountVnd),
    minOrderAmountVnd: String(item.minOrderAmountVnd),
    startAt: localDateTimeInputValue(new Date(item.startAt)),
    endAt: localDateTimeInputValue(new Date(item.endAt)),
    totalUsageLimit: item.totalUsageLimit === null ? '' : String(item.totalUsageLimit),
    perCustomerLimit: String(item.perCustomerLimit),
  };
}

function promotionPayload(form: PromotionFormState): PromotionMutation {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    discountType: form.discountType,
    discountValue: form.discountValue,
    maxDiscountVnd:
      form.discountType === 'PERCENT' && form.maxDiscountVnd ? form.maxDiscountVnd : null,
    minOrderAmountVnd: form.minOrderAmountVnd || '0',
    startAt: new Date(form.startAt).toISOString(),
    endAt: new Date(form.endAt).toISOString(),
    totalUsageLimit: form.totalUsageLimit ? Number(form.totalUsageLimit) : null,
    perCustomerLimit: Number(form.perCustomerLimit),
  };
}

function promotionStatus(item: PromotionRecord, now: number) {
  if (!item.isActive) return { label: 'Đã tắt', tone: 'neutral' as const };
  if (new Date(item.endAt).getTime() <= now) return { label: 'Hết hạn', tone: 'neutral' as const };
  if (new Date(item.startAt).getTime() > now)
    return { label: 'Sắp bắt đầu', tone: 'warning' as const };
  return { label: 'Đang áp dụng', tone: 'success' as const };
}

export function PromotionsPage({ canManage = true }: { canManage?: boolean }) {
  const realApiMode = apiEnabled && hasAccessToken();
  const [items, setItems] = useState<PromotionRecord[]>([]);
  const [loading, setLoading] = useState(realApiMode);
  const [error, setError] = useState('');
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PromotionRecord>();
  const [form, setForm] = useState<PromotionFormState>(newPromotionForm);
  const [showForm, setShowForm] = useState(false);
  const [now, setNow] = useState(0);

  const reload = useCallback(async () => {
    if (!realApiMode) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listPromotions());
      setNow(Date.now());
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [realApiMode]);

  useEffect(() => {
    if (!realApiMode) return;
    let active = true;
    void listPromotions()
      .then((promotions) => {
        if (!active) return;
        setItems(promotions);
        setNow(Date.now());
        setError('');
      })
      .catch((caught: unknown) => {
        if (active) setError(errorText(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [realApiMode]);

  const save = async () => {
    const start = new Date(form.startAt);
    const end = new Date(form.endAt);
    const discount = Number(form.discountValue);
    if (!/^[A-Z0-9_-]{2,100}$/i.test(form.code.trim())) {
      setIssue('Mã gồm 2–100 ký tự: chữ, số, gạch ngang hoặc gạch dưới.');
      return;
    }
    if (!form.name.trim()) {
      setIssue('Nhập tên chương trình ưu đãi.');
      return;
    }
    if (
      !Number.isFinite(discount) ||
      discount <= 0 ||
      (form.discountType === 'PERCENT' && discount > 100)
    ) {
      setIssue(
        form.discountType === 'PERCENT'
          ? 'Mức giảm phần trăm phải từ 1 đến 100.'
          : 'Số tiền giảm phải lớn hơn 0.',
      );
      return;
    }
    if (
      !Number.isFinite(Number(form.minOrderAmountVnd)) ||
      Number(form.minOrderAmountVnd) < 0 ||
      !Number.isInteger(Number(form.perCustomerLimit)) ||
      Number(form.perCustomerLimit) < 1 ||
      (form.totalUsageLimit !== '' &&
        (!Number.isInteger(Number(form.totalUsageLimit)) || Number(form.totalUsageLimit) < 1))
    ) {
      setIssue('Kiểm tra đơn tối thiểu và giới hạn lượt sử dụng.');
      return;
    }
    if (
      form.maxDiscountVnd !== '' &&
      (!Number.isFinite(Number(form.maxDiscountVnd)) || Number(form.maxDiscountVnd) < 0)
    ) {
      setIssue('Mức giảm tối đa không được âm.');
      return;
    }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setIssue('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
      return;
    }

    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      if (editing) {
        const original = promotionFormFromRecord(editing);
        const payload = promotionPayload(form);
        const changed: Partial<PromotionMutation> = {};
        if (form.code.trim().toUpperCase() !== original.code.toUpperCase())
          changed.code = payload.code;
        if (form.name.trim() !== original.name) changed.name = payload.name;
        if (form.discountType !== original.discountType)
          changed.discountType = payload.discountType;
        if (form.discountValue !== original.discountValue)
          changed.discountValue = payload.discountValue;
        if (form.maxDiscountVnd !== original.maxDiscountVnd)
          changed.maxDiscountVnd = payload.maxDiscountVnd;
        if (form.minOrderAmountVnd !== original.minOrderAmountVnd)
          changed.minOrderAmountVnd = payload.minOrderAmountVnd;
        if (form.startAt !== original.startAt) changed.startAt = payload.startAt;
        if (form.endAt !== original.endAt) changed.endAt = payload.endAt;
        if (form.totalUsageLimit !== original.totalUsageLimit)
          changed.totalUsageLimit = payload.totalUsageLimit;
        if (form.perCustomerLimit !== original.perCustomerLimit)
          changed.perCustomerLimit = payload.perCustomerLimit;
        if (Object.keys(changed).length === 0) {
          setNotice('Chưa có thay đổi để lưu.');
          return;
        }
        await updatePromotion(editing.id, changed);
        setNotice('Đã cập nhật mã ưu đãi.');
      } else {
        await createPromotion(promotionPayload(form));
        setNotice('Đã tạo mã ưu đãi.');
      }
      setEditing(undefined);
      setForm(newPromotionForm());
      setShowForm(false);
      await reload();
    } catch (caught) {
      setIssue(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (item: PromotionRecord) => {
    setBusyId(item.id);
    setIssue('');
    setNotice('');
    try {
      await setPromotionActive(item.id, !item.isActive);
      setNotice(item.isActive ? 'Đã tắt mã ưu đãi.' : 'Đã bật mã ưu đãi.');
      await reload();
    } catch (caught) {
      setIssue(errorText(caught));
    } finally {
      setBusyId('');
    }
  };

  const visibleItems = items.filter((item) =>
    `${item.code} ${item.name}`
      .toLocaleLowerCase('vi')
      .includes(search.trim().toLocaleLowerCase('vi')),
  );
  return (
    <div className="page">
      <PageHeading
        title="Mã ưu đãi"
        action={
          <div className="feature-actions">
            {canManage && realApiMode && (
              <Button onClick={() => setShowForm((value) => !value)}>
                {showForm ? 'Đóng biểu mẫu' : editing ? 'Tiếp tục sửa mã' : '+ Tạo mã'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void reload()} loading={loading}>Tải lại</Button>
          </div>
        }
      />
      {!realApiMode && (
        <Feedback tone="warning" title="Cần kết nối API để quản lý mã thật">
          Mã ưu đãi không được lưu trong dữ liệu xem thử. Hãy mở trang này bằng tài khoản có quyền
          đọc ưu đãi và kết nối Studio API.
        </Feedback>
      )}
      {error && (
        <Feedback
          tone="danger"
          title="Không tải được mã ưu đãi"
          action={
            <Button variant="secondary" onClick={() => void reload()}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Feedback>
      )}
      {issue && (
        <Feedback tone="danger" title="Chưa thể hoàn tất">
          {issue}
        </Feedback>
      )}
      {notice && (
        <Feedback tone="success" title="Đã cập nhật">
          {notice}
        </Feedback>
      )}

      <div className={`promotion-admin-layout ${showForm ? 'form-open' : ''}`}>
        {showForm && (
        <Panel title={editing ? `Sửa ${editing.code}` : 'Tạo mã ưu đãi'}>
          <form
            className="promotion-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={!realApiMode || !canManage || busy}>
              <div className="promotion-form-grid">
                <h3 className="promotion-form-section-title">Chương trình</h3>
                <Field
                  label="Mã ưu đãi"
                  value={form.code}
                  maxLength={100}
                  autoCapitalize="characters"
                  placeholder="Ví dụ: STUDIO10"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                  }
                  required
                />
                <Field
                  label="Tên chương trình"
                  value={form.name}
                  maxLength={255}
                  placeholder="Ưu đãi khách hàng mới"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
                <SelectField
                  label="Hình thức giảm"
                  value={form.discountType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      discountType: event.target.value as PromotionFormState['discountType'],
                    }))
                  }
                >
                  <option value="PERCENT">Theo phần trăm</option>
                  <option value="FIXED_AMOUNT">Số tiền cố định</option>
                </SelectField>
                <Field
                  label={form.discountType === 'PERCENT' ? 'Mức giảm (%)' : 'Số tiền giảm (đ)'}
                  type="number"
                  min="1"
                  max={form.discountType === 'PERCENT' ? 100 : undefined}
                  step="1"
                  value={form.discountValue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, discountValue: event.target.value }))
                  }
                  required
                />
                <h3 className="promotion-form-section-title">Điều kiện áp dụng</h3>
                {form.discountType === 'PERCENT' && (
                  <Field
                    label="Giảm tối đa (đ, không bắt buộc)"
                    type="number"
                    min="0"
                    step="1000"
                    value={form.maxDiscountVnd}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, maxDiscountVnd: event.target.value }))
                    }
                  />
                )}
                <Field
                  label="Giá trị đơn tối thiểu (đ)"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.minOrderAmountVnd}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minOrderAmountVnd: event.target.value }))
                  }
                  required
                />
                <h3 className="promotion-form-section-title">Thời hạn & lượt sử dụng</h3>
                <DateTimeField
                  label="Bắt đầu áp dụng"
                  value={form.startAt}
                  onChange={(startAt) => setForm((current) => ({ ...current, startAt }))}
                  required
                />
                <DateTimeField
                  label="Kết thúc"
                  value={form.endAt}
                  onChange={(endAt) => setForm((current) => ({ ...current, endAt }))}
                  required
                />
                <Field
                  label="Tổng lượt (để trống nếu không giới hạn)"
                  type="number"
                  min="1"
                  step="1"
                  value={form.totalUsageLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, totalUsageLimit: event.target.value }))
                  }
                />
                <Field
                  label="Lượt tối đa mỗi khách"
                  type="number"
                  min="1"
                  step="1"
                  value={form.perCustomerLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, perCustomerLimit: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="promotion-form-actions">
                <Button type="submit" loading={busy} disabled={!canManage}>
                  {editing ? 'Lưu thay đổi' : 'Tạo mã'}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditing(undefined);
                      setForm(newPromotionForm());
                      setIssue('');
                    }}
                  >
                    Hủy sửa
                  </Button>
                )}
                {!canManage && <small>Tài khoản chỉ có quyền xem mã ưu đãi.</small>}
              </div>
            </fieldset>
          </form>
        </Panel>
        )}

        <Panel
          title={`Danh sách · ${items.length}`}
          action={
            <Field
              label="Tìm mã"
              type="search"
              value={search}
              placeholder="Mã hoặc tên chương trình"
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        >
          {!realApiMode ? (
            <EmptyState title="Chưa có dữ liệu mã ưu đãi">
              Danh sách thật chỉ tải từ API có xác thực.
            </EmptyState>
          ) : loading ? (
            <div className="feature-skeleton shimmer" role="status">
              Đang tải mã ưu đãi…
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState title={search ? 'Không tìm thấy mã phù hợp' : 'Chưa tạo mã ưu đãi'}>
              {search
                ? 'Thử tìm theo mã hoặc tên chương trình khác.'
                : 'Chọn “+ Tạo mã” để thêm chương trình đầu tiên.'}
            </EmptyState>
          ) : (
            <div className="responsive-table catalog-admin-table promotion-admin-table" role="region" aria-label="Bảng mã ưu đãi" tabIndex={0}>
              <table>
                <thead><tr><th>Mã / chương trình</th><th>Mức giảm</th><th>Đơn tối thiểu</th><th>Hiệu lực</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const status = promotionStatus(item, now);
                    const expired = new Date(item.endAt).getTime() <= now;
                    return (
                      <tr key={item.id}>
                        <td data-label="Chương trình">
                          <div className="promotion-admin-identity">
                          <strong>{item.code}</strong>
                          <span className="promotion-admin-name">{item.name}</span>
                          <details className="promotion-admin-conditions">
                            <summary>Giới hạn lượt</summary>
                            {item.totalUsageLimit === null ? 'Không giới hạn tổng lượt' : `${item.totalUsageLimit} lượt tổng`} · {item.perCustomerLimit} lượt/khách
                          </details>
                          </div>
                        </td>
                        <td data-label="Mức giảm">
                          <div className="promotion-admin-identity">
                          {item.discountType === 'PERCENT' ? `${item.discountValue}%` : money(item.discountValue)}
                          {item.discountType === 'PERCENT' && item.maxDiscountVnd !== null && <small className="promotion-admin-name">Tối đa {money(item.maxDiscountVnd)}</small>}
                          </div>
                        </td>
                        <td data-label="Đơn tối thiểu">{money(item.minOrderAmountVnd)}</td>
                        <td data-label="Hiệu lực" className="promotion-admin-dates">{formatVietnamDateTime(item.startAt)} – {formatVietnamDateTime(item.endAt)}</td>
                        <td data-label="Trạng thái"><StatusLabel text={status.label} tone={status.tone} /></td>
                        <td data-label="Thao tác">
                          <div className="promotion-admin-actions">
                            <Button
                              variant="secondary"
                              disabled={!canManage || !realApiMode || busyId === item.id}
                              onClick={() => {
                                setEditing(item);
                                setForm(promotionFormFromRecord(item));
                                setShowForm(true);
                                setIssue('');
                                setNotice('');
                              }}
                            >Sửa</Button>
                            <Button
                              variant={item.isActive ? 'danger' : 'secondary'}
                              loading={busyId === item.id}
                              disabled={!canManage || !realApiMode || (!item.isActive && expired)}
                              onClick={() => void changeStatus(item)}
                            >{item.isActive ? 'Tắt mã' : expired ? 'Đã hết hạn' : 'Bật mã'}</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
