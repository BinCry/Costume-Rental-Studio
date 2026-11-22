import { formatCalendarDate, formatPolicyDate } from '../utils/date-format';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  ConfirmDialog,
  DetailDialog,
  DateField,
  EmptyState,
  Feedback,
  Field,
  SelectField,
  TextAreaField,
  StatusLabel,
} from '../components/ui';
import { money } from '../components/support';
import {
  BranchSelector,
  InlineIssue,
  KeyFacts,
  PageHeading,
  Panel,
  PermissionGroup,
  SearchField,
  StateGate,
  Timeline,
} from '../components/studio';
import { useFixtureResource } from '../components/useFixtureResource';
import { useBranchOptions } from '../components/useBranchOptions';
import {
  permissions,
  studioAdapter,
  type Branch,
  type CostumeDetail,
  type Employee,
  type Policy,
  type ReportRange,
  type ReportSnapshot,
  type Variant,
} from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';
import {
  ApiClientError,
  apiEnabled,
  deleteCatalogMedia,
  hasAccessToken,
  listCatalogCategories,
  listModelAccessories,
  listCatalogMedia,
  createModelAccessory,
  setModelAccessoryActive,
  updateModelAccessory,
  type CatalogMediaRecord,
  type CatalogAccessory,
  updateCatalogMedia,
  uploadCatalogMedia,
} from '../api/client';

const issueText = (error: unknown) =>
  error instanceof Error ? error.message : 'Thao tác chưa hoàn tất.';
const accountLabels: Record<Employee['accountStatus'], string> = {
  PENDING: 'Chờ kích hoạt',
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Bị khóa',
  INACTIVE: 'Ngừng sử dụng',
};
const employmentLabels: Record<Employee['employmentStatus'], string> = {
  ACTIVE: 'Đang làm việc',
  ON_LEAVE: 'Tạm nghỉ',
  TERMINATED: 'Đã nghỉ',
};
const uuidIdentifierPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const employeeDisplayCode = (employee: Employee) => {
  const explicitCode = employee.employeeCode?.trim();
  if (explicitCode && !uuidIdentifierPattern.test(explicitCode)) return explicitCode;
  return /^NV-[A-Z0-9-]+$/i.test(employee.code) ? employee.code : 'Chưa cấp mã';
};
const staffRoleLabels: Record<string, string> = {
  SALES_STAFF: 'Nhân viên bán hàng',
  INVENTORY_STAFF: 'Nhân viên kho',
};

function ModelAccessoriesPanel({
  modelId,
  canManage,
  scenario,
}: {
  modelId: string;
  canManage: boolean;
  scenario: DemoScenario;
}) {
  const loadAccessories = useCallback(async () => listModelAccessories(modelId), [modelId]);
  const {
    loading,
    data: items,
    error: loadError,
    retry,
  } = useFixtureResource(scenario, loadAccessories, modelId);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [replacement, setReplacement] = useState('0');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState({ name: '', quantity: '1', replacement: '0' });

  const saveNew = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const defaultQuantity = Number(quantity);
    const replacementValueVnd = Number(replacement);
    if (
      !name.trim() ||
      !Number.isInteger(defaultQuantity) ||
      defaultQuantity < 1 ||
      replacementValueVnd < 0
    ) {
      setIssue('Nhập tên, số lượng mặc định từ 1 trở lên và giá trị thay thế không âm.');
      return;
    }
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      await createModelAccessory(modelId, {
        name: name.trim(),
        defaultQuantity,
        replacementValueVnd,
      });
      setName('');
      setQuantity('1');
      setReplacement('0');
      setNotice('Đã thêm phụ kiện cho mẫu.');
      retry();
    } catch (error) {
      setIssue(issueText(error));
    } finally {
      setBusy(false);
    }
  };
  const saveExisting = async (item: CatalogAccessory) => {
    const defaultQuantity = Number(draft.quantity);
    const replacementValueVnd = Number(draft.replacement);
    if (
      !draft.name.trim() ||
      !Number.isInteger(defaultQuantity) ||
      defaultQuantity < 1 ||
      replacementValueVnd < 0
    ) {
      setIssue('Kiểm tra tên, số lượng mặc định và giá trị thay thế.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      await updateModelAccessory(item.id, {
        name: draft.name.trim(),
        defaultQuantity,
        replacementValueVnd,
      });
      setEditingId('');
      setNotice('Đã cập nhật phụ kiện.');
      retry();
    } catch (error) {
      setIssue(issueText(error));
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async (item: CatalogAccessory) => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      await setModelAccessoryActive(item.id, !item.isActive);
      setNotice(
        item.isActive
          ? 'Đã ngừng sử dụng phụ kiện; lịch sử thuê được giữ nguyên.'
          : 'Đã kích hoạt phụ kiện.',
      );
      retry();
    } catch (error) {
      setIssue(issueText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="catalog-media-manager" aria-label="Quản lý phụ kiện của mẫu">
      <div>
        <h3>Phụ kiện theo mẫu</h3>
        <p className="muted small-note">
          Số lượng mặc định được ghi nhận trên từng món khi tạo đơn. Phụ kiện đã có lịch sử chỉ được
          ngừng sử dụng, không xóa.
        </p>
      </div>
      {loading ? (
        <p className="muted" role="status">
          Đang tải phụ kiện…
        </p>
      ) : loadError ? (
        <Feedback tone="danger" title="Không tải được danh sách phụ kiện">
          {loadError}{' '}
          <button type="button" className="text-button" onClick={retry}>
            Thử lại
          </button>
        </Feedback>
      ) : (
        <div className="feature-card-list">
          {(items ?? []).map((item) => (
            <article className="feature-list-row" key={item.id}>
              {editingId === item.id ? (
                <>
                  <Field
                    label="Tên phụ kiện"
                    value={draft.name}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                  <div className="feature-filters">
                    <Field
                      label="Số lượng mặc định"
                      type="number"
                      min="1"
                      step="1"
                      value={draft.quantity}
                      disabled={busy}
                      onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                    />
                    <Field
                      label="Giá trị thay thế (đ)"
                      type="number"
                      min="0"
                      step="1000"
                      value={draft.replacement}
                      disabled={busy}
                      onChange={(event) => setDraft({ ...draft, replacement: event.target.value })}
                    />
                  </div>
                  <div className="catalog-media-card__actions">
                    <Button type="button" loading={busy} onClick={() => void saveExisting(item)}>
                      Lưu phụ kiện
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => setEditingId('')}
                    >
                      Hủy
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <strong>{item.name}</strong>
                  <span>
                    {item.defaultQuantity} món · giá trị thay thế {money(item.replacementValueVnd)}
                  </span>
                  <StatusLabel
                    text={item.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                    tone={item.isActive ? 'success' : 'neutral'}
                  />
                  {canManage && (
                    <div className="catalog-media-card__actions">
                      <Button
                        type="button"
                        variant="quiet"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(item.id);
                          setDraft({
                            name: item.name,
                            quantity: String(item.defaultQuantity),
                            replacement: String(item.replacementValueVnd),
                          });
                          setIssue('');
                        }}
                      >
                        Chỉnh sửa
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={busy}
                        onClick={() => void toggleActive(item)}
                      >
                        {item.isActive ? 'Ngừng sử dụng' : 'Kích hoạt'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
          {!items?.length && (
            <EmptyState title="Mẫu chưa có phụ kiện">
              Thêm các món cần kiểm đếm khi giao và nhận đồ.
            </EmptyState>
          )}
        </div>
      )}
      {canManage && (
        <form className="stack-form" onSubmit={(event) => void saveNew(event)}>
          <h4>Thêm phụ kiện</h4>
          <Field
            label="Tên phụ kiện"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="feature-filters">
            <Field
              label="Số lượng mặc định"
              type="number"
              min="1"
              step="1"
              value={quantity}
              disabled={busy}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <Field
              label="Giá trị thay thế (đ)"
              type="number"
              min="0"
              step="1000"
              value={replacement}
              disabled={busy}
              onChange={(event) => setReplacement(event.target.value)}
            />
          </div>
          <Button type="submit" loading={busy}>
            Thêm phụ kiện
          </Button>
        </form>
      )}
      {issue && (
        <Feedback tone="danger" title="Không cập nhật được phụ kiện">
          {issue}
        </Feedback>
      )}
      {notice && (
        <Feedback tone="success" title="Đã lưu thay đổi">
          {notice}
        </Feedback>
      )}
      {!loading && issue && (
        <Button type="button" variant="quiet" onClick={retry}>
          Tải lại
        </Button>
      )}
    </section>
  );
}

export function CatalogAdminPage({
  scenario,
  canManage = true,
}: {
  scenario: DemoScenario;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.details);
  const loadCategories = useCallback(
    async () => (realApiMode ? listCatalogCategories() : []),
    [realApiMode],
  );
  const categoriesResource = useFixtureResource(scenario, loadCategories);
  const [selected, setSelected] = useState('ao-dai-lina');
  const [detailOpen, setDetailOpen] = useState(false);
  const [catalogSection, setCatalogSection] = useState<'info' | 'variants' | 'media'>('info');
  const [model, setModel] = useState<CostumeDetail>();
  const [variant, setVariant] = useState<Variant>();
  const [pendingCatalogTarget, setPendingCatalogTarget] = useState('');
  const [pendingVariantTarget, setPendingVariantTarget] = useState('');
  const [savedModelSnapshot, setSavedModelSnapshot] = useState<{ id: string; value: string }>();
  const [savedVariantSnapshot, setSavedVariantSnapshot] = useState<{
    code: string;
    value: string;
  }>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number>();
  const [mediaIssue, setMediaIssue] = useState('');
  const [mediaFileIssue, setMediaFileIssue] = useState('');
  const [mediaNotice, setMediaNotice] = useState('');
  const [mediaOwnerLoadedId, setMediaOwnerLoadedId] = useState('');
  const [mediaOwnerErrorId, setMediaOwnerErrorId] = useState('');
  const [mediaItems, setMediaItems] = useState<CatalogMediaRecord[]>([]);
  const [mediaFile, setMediaFile] = useState<File>();
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [mediaInputKey, setMediaInputKey] = useState(0);
  const [mediaAltText, setMediaAltText] = useState('');
  const [editingMediaAltId, setEditingMediaAltId] = useState('');
  const [editingMediaAltText, setEditingMediaAltText] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState('');
  const [pendingDeleteMedia, setPendingDeleteMedia] = useState<CatalogMediaRecord>();
  const [savedModelId, setSavedModelId] = useState('');
  const mediaModel =
    model?.id === selected ? model : (data?.find((item) => item.id === selected) ?? data?.[0]);
  const isPersistedModel = Boolean(
    mediaModel &&
    (savedModelId === mediaModel.id || data?.some((item) => item.id === mediaModel.id)),
  );
  const mediaOwnerId =
    realApiMode && isPersistedModel && mediaModel?.modelCode?.trim() ? mediaModel.id : undefined;

  useEffect(() => {
    if (!mediaPreviewUrl) return;
    return () => URL.revokeObjectURL(mediaPreviewUrl);
  }, [mediaPreviewUrl]);

  useEffect(() => {
    let current = true;
    if (!mediaOwnerId) return;
    void listCatalogMedia('model', mediaOwnerId)
      .then((items) => {
        if (!current) return;
        setMediaItems([...items].sort((a, b) => a.sortOrder - b.sortOrder));
        setMediaOwnerLoadedId(mediaOwnerId);
        setMediaOwnerErrorId('');
        setReplaceTargetId('');
        setEditingMediaAltId('');
        setMediaIssue('');
      })
      .catch((error: unknown) => {
        if (!current) return;
        setMediaItems([]);
        setMediaOwnerLoadedId('');
        setMediaOwnerErrorId(mediaOwnerId);
        setMediaIssue(issueText(error));
      })
      .finally(() => {
        if (current) setMediaLoading(false);
      });
    return () => {
      current = false;
    };
  }, [mediaOwnerId]);

  const resetMediaDraft = () => {
    setMediaFile(undefined);
    setMediaPreviewUrl('');
    setMediaAltText('');
    setReplaceTargetId('');
    setEditingMediaAltId('');
    setPendingDeleteMedia(undefined);
    setMediaIssue('');
    setMediaNotice('');
    setMediaFileIssue('');
    setMediaInputKey((value) => value + 1);
  };
  const chooseMediaFile = (file: File | undefined) => {
    setMediaIssue('');
    setMediaNotice('');
    setMediaFileIssue('');
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMediaFile(undefined);
      setMediaPreviewUrl('');
      setMediaFileIssue('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    setMediaFile(file);
    setMediaPreviewUrl(file ? URL.createObjectURL(file) : '');
  };
  const renderMediaUploadFields = (disabled: boolean) => (
    <>
      <Field
        key={mediaInputKey}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        label="Chọn ảnh"
        error={mediaFileIssue}
        disabled={disabled}
        onChange={(event) => chooseMediaFile(event.target.files?.[0])}
        hint="JPEG, PNG hoặc WebP; giới hạn dung lượng theo cấu hình hệ thống."
      />
      {mediaFile && <p className="muted small-note">Đã chọn: {mediaFile.name}</p>}
      {mediaPreviewUrl && (
        <div className="catalog-media-preview">
          <img src={mediaPreviewUrl} alt="Xem trước ảnh sắp tải lên" />
          <span className="muted small-note">Ảnh xem trước</span>
        </div>
      )}
      <Field
        label="Mô tả ảnh"
        value={mediaAltText}
        disabled={disabled}
        onChange={(event) => setMediaAltText(event.target.value)}
        hint="Mô tả ngắn giúp người dùng đọc màn hình hiểu nội dung ảnh."
      />
    </>
  );
  const saveModel = async () => {
    if (!model?.name.trim()) {
      setIssue('Nhập tên mẫu.');
      return;
    }
    if (realApiMode && (!model.modelCode?.trim() || !model.categoryId)) {
      setIssue('Mẫu mới cần mã mẫu và danh mục trên máy chủ.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      const saved = await studioAdapter.saveModel(model, scenario);
      setModel(saved);
      setSelected(saved.id);
      setSavedModelSnapshot({ id: saved.id, value: JSON.stringify(saved) });
      if (realApiMode) setSavedModelId(saved.id);
      if (realApiMode && mediaFile) setCatalogSection('media');
      setNotice(
        realApiMode ? 'Đã lưu mẫu vào danh mục trên máy chủ.' : 'Đã lưu mẫu trong fixture.',
      );
      retry();
    } catch (e) {
      setIssue(issueText(e));
    } finally {
      setBusy(false);
    }
  };
  const refreshMedia = async (ownerId: string) => {
    const items = await listCatalogMedia('model', ownerId);
    setMediaItems([...items].sort((a, b) => a.sortOrder - b.sortOrder));
    setMediaOwnerLoadedId(ownerId);
    setMediaOwnerErrorId('');
  };

  const retryMediaList = async (ownerId: string) => {
    setMediaLoading(true);
    setMediaIssue('');
    setMediaOwnerErrorId('');
    try {
      await refreshMedia(ownerId);
    } catch (error) {
      setMediaItems([]);
      setMediaOwnerLoadedId('');
      setMediaOwnerErrorId(ownerId);
      setMediaIssue(issueText(error));
    } finally {
      setMediaLoading(false);
    }
  };

  const saveMedia = async (target: CostumeDetail, replaceExisting = false) => {
    if (!realApiMode || !target.modelCode || !mediaFile) {
      setMediaIssue('Chọn ảnh và lưu mẫu trước khi tải lên.');
      return;
    }
    const replacement = replaceExisting
      ? mediaItems.find((item) => item.id === replaceTargetId)
      : undefined;
    if (replaceExisting && !replacement) {
      setMediaIssue('Ảnh cần thay không còn trong danh sách. Hãy tải lại thư viện ảnh.');
      return;
    }
    if (mediaAltText.trim().length > 500) {
      setMediaIssue('Mô tả ảnh không được vượt quá 500 ký tự.');
      return;
    }
    const sortOrder = replacement
      ? replacement.sortOrder
      : mediaItems.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
    const enteredAltText = mediaAltText.trim();
    const altText =
      enteredAltText.length > 0 ? enteredAltText : (replacement?.altText ?? target.name);
    setMediaBusy(true);
    setMediaProgress(0);
    setMediaIssue('');
    setMediaNotice('');
    try {
      await uploadCatalogMedia('model', target.id, mediaFile, altText, sortOrder, setMediaProgress);
    } catch (error) {
      setMediaIssue(issueText(error));
      setMediaBusy(false);
      setMediaProgress(undefined);
      return;
    }

    let oldImageDeleteFailed = false;
    if (replacement) {
      try {
        await deleteCatalogMedia(replacement.id);
      } catch {
        oldImageDeleteFailed = true;
      }
    }
    setMediaFile(undefined);
    setMediaPreviewUrl('');
    setMediaAltText('');
    setReplaceTargetId('');
    setMediaProgress(undefined);
    setMediaFileIssue('');
    setMediaInputKey((value) => value + 1);
    try {
      await refreshMedia(target.id);
      setMediaNotice(replacement ? 'Đã tải ảnh mới cho mẫu.' : 'Đã thêm ảnh vào mẫu trên máy chủ.');
      retry();
    } catch (error) {
      setMediaItems([]);
      setMediaOwnerLoadedId('');
      setMediaOwnerErrorId(target.id);
      setMediaIssue(`Ảnh đã tải lên nhưng chưa làm mới được thư viện. ${issueText(error)}`);
    }
    if (oldImageDeleteFailed) {
      setMediaIssue(
        'Ảnh mới đã tải lên nhưng ảnh cũ chưa xóa được. Tải lại thư viện rồi xóa ảnh cũ nếu cần.',
      );
    }
    setMediaBusy(false);
  };

  const makePrimaryMedia = async (media: CatalogMediaRecord, ownerId: string) => {
    setMediaBusy(true);
    setMediaIssue('');
    setMediaNotice('');
    try {
      const ordered = [
        media,
        ...mediaItems
          .filter((item) => item.id !== media.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      ];
      for (const [index, item] of ordered.entries()) {
        await updateCatalogMedia(item.id, { sortOrder: index + 1 });
      }
      await updateCatalogMedia(media.id, { sortOrder: 0 });
      await refreshMedia(ownerId);
      setMediaNotice('Đã đặt ảnh này làm ảnh đại diện của mẫu.');
      retry();
    } catch (error) {
      setMediaIssue(issueText(error));
      try {
        await refreshMedia(ownerId);
      } catch {
        // Giữ lỗi thao tác để người dùng có thể tải lại thư viện.
      }
    } finally {
      setMediaBusy(false);
    }
  };

  const saveMediaAltText = async (media: CatalogMediaRecord, ownerId: string) => {
    if (editingMediaAltText.trim().length > 500) {
      setMediaIssue('Mô tả ảnh không được vượt quá 500 ký tự.');
      return;
    }
    setMediaBusy(true);
    setMediaIssue('');
    setMediaNotice('');
    try {
      await updateCatalogMedia(media.id, { altText: editingMediaAltText.trim() || null });
      await refreshMedia(ownerId);
      setEditingMediaAltId('');
      setMediaNotice('Đã cập nhật mô tả ảnh.');
    } catch (error) {
      setMediaIssue(issueText(error));
    } finally {
      setMediaBusy(false);
    }
  };

  const removeMedia = async () => {
    if (!pendingDeleteMedia || !mediaOwnerId) return;
    setMediaBusy(true);
    setMediaIssue('');
    setMediaNotice('');
    try {
      await deleteCatalogMedia(pendingDeleteMedia.id);
      setPendingDeleteMedia(undefined);
      await refreshMedia(mediaOwnerId);
      setMediaNotice('Đã xóa ảnh khỏi mẫu.');
      retry();
    } catch (error) {
      setMediaIssue(issueText(error));
    } finally {
      setMediaBusy(false);
    }
  };
  const saveVariant = async () => {
    if (
      !variant?.size ||
      !variant.color ||
      variant.price < 0 ||
      variant.deposit < 0 ||
      (variant.replacement ?? 0) < 0
    ) {
      setIssue('Kiểm tra size, màu và các khoản tiền.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      await studioAdapter.saveVariant(variant, scenario);
      setSavedVariantSnapshot({ code: variant.code, value: JSON.stringify(variant) });
      setNotice(
        realApiMode
          ? 'Đã lưu biến thể và giá trên máy chủ. Đơn cũ vẫn giữ snapshot.'
          : 'Đã lưu biến thể và giá hiện hành trong fixture. Đơn cũ giữ snapshot.',
      );
      retry();
    } catch (e) {
      setIssue(issueText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <StateGate
      loading={loading || categoriesResource.loading}
      error={error ?? categoriesResource.error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có mẫu trang phục"
    >
      {(items) => {
        const originalModel = items.find((item) => item.id === model?.id);
        const modelSnapshot =
          model && savedModelSnapshot?.id === model.id
            ? savedModelSnapshot.value
            : JSON.stringify(originalModel);
        const hasUnsavedModel = !!model && JSON.stringify(model) !== modelSnapshot;
        const current =
          model?.id === selected && (hasUnsavedModel || !originalModel)
            ? model
            : (items.find((item) => item.id === selected) ?? model ?? items[0]);
        const editing = model?.id === current.id && hasUnsavedModel ? model : current;
        const isEditingModelPersisted = Boolean(
          savedModelId === editing.id || items.some((item) => item.id === editing.id),
        );
        const originalVariant = current.variants.find((item) => item.code === variant?.code);
        const variantSnapshot =
          variant && savedVariantSnapshot?.code === variant.code
            ? savedVariantSnapshot.value
            : JSON.stringify(originalVariant);
        const hasUnsavedVariant = !!variant && JSON.stringify(variant) !== variantSnapshot;
        const hasUnsavedCatalogDraft =
          hasUnsavedModel ||
          hasUnsavedVariant ||
          !!mediaFile ||
          !!editingMediaAltId ||
          !!replaceTargetId;
        const createVariant = () =>
          setVariant({
            code: `${current.id.toUpperCase()}-NEW`,
            modelId: current.id,
            size: '',
            color: '',
            fit: '',
            price: 0,
            deposit: 0,
            replacement: 0,
          });
        const startNewModel = () => {
          resetMediaDraft();
          setCatalogSection('info');
          const id = `mau-demo-${items.length + 1}`;
          setSelected(id);
          setModel({
            id,
            name: '',
            modelCode: '',
            categoryId: '',
            category: 'Trang phục',
            description: '',
            material: '',
            accessories: [],
            imagePosition: 'missing',
            variants: [],
          });
          setVariant(undefined);
          setIssue('');
          setDetailOpen(true);
        };
        const selectExistingModel = (id: string) => {
          resetMediaDraft();
          setCatalogSection('info');
          setSelected(id);
          setModel(undefined);
          setVariant(undefined);
          setIssue('');
          setDetailOpen(true);
        };
        return (
          <div className="page">
            <PageHeading
              title="Mẫu, biến thể & giá"
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    disabled={mediaBusy || busy}
                    onClick={() => {
                      if (hasUnsavedCatalogDraft) setPendingCatalogTarget('__new__');
                      else startNewModel();
                    }}
                  >
                    + Tạo mẫu
                  </Button>
                ) : undefined
              }
            />
            <div className="admin-table-workspace catalog-admin-workspace">
              <div role="region" aria-label="Danh sách mẫu trang phục" tabIndex={0}>
                <Panel title="Danh mục mẫu">
                  <div
                    className="responsive-table catalog-admin-table"
                    role="region"
                    aria-label="Danh sách mẫu trang phục"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Mã mẫu</th>
                          <th scope="col">Tên mẫu</th>
                          <th scope="col">Danh mục</th>
                          <th scope="col">Biến thể</th>
                          <th scope="col">Giá thuê từ</th>
                          <th scope="col">Cọc từ</th>
                          <th scope="col">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr
                            key={item.id}
                            className={detailOpen && selected === item.id ? 'selected' : ''}
                          >
                            <td data-label="Mã mẫu">
                              {item.modelCode?.trim() ? item.modelCode : item.id}
                            </td>
                            <td data-label="Tên mẫu">{item.name}</td>
                            <td data-label="Danh mục">{item.category}</td>
                            <td data-label="Biến thể">{item.variants.length}</td>
                            <td data-label="Giá thuê từ">
                              {item.variants.length
                                ? money(Math.min(...item.variants.map((entry) => entry.price)))
                                : '—'}
                            </td>
                            <td data-label="Cọc từ">
                              {item.variants.length
                                ? money(Math.min(...item.variants.map((entry) => entry.deposit)))
                                : '—'}
                            </td>
                            <td data-label="Chi tiết">
                              <Button
                                type="button"
                                variant="quiet"
                                disabled={mediaBusy || busy}
                                aria-label={`Chi tiết mẫu ${item.name}`}
                                onClick={() => {
                                  if (detailOpen && selected === item.id) return;
                                  if (hasUnsavedCatalogDraft && selected !== item.id) {
                                    setPendingCatalogTarget(item.id);
                                  } else if (selected === item.id) {
                                    setDetailOpen(true);
                                  } else {
                                    selectExistingModel(item.id);
                                  }
                                }}
                              >
                                Chi tiết
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
              {detailOpen && editing && (
                <DetailDialog
                  title={
                    editing.modelCode?.trim()
                      ? `Chi tiết mẫu ${editing.modelCode}`
                      : editing.name
                        ? `Chi tiết mẫu ${editing.name}`
                        : 'Tạo mẫu mới'
                  }
                  closeLabel="Đóng chi tiết mẫu trang phục"
                  className="catalog-editor-dialog"
                  onClose={() => setDetailOpen(false)}
                >
                  <div
                    className="catalog-editor-content"
                    role="region"
                    aria-label="Chỉnh sửa mẫu trang phục"
                    tabIndex={0}
                  >
                    <div
                      className="variant-pills catalog-editor-sections"
                      role="group"
                      aria-label="Chỉnh sửa mẫu trang phục"
                    >
                      <button
                        type="button"
                        className={catalogSection === 'info' ? 'active' : ''}
                        aria-pressed={catalogSection === 'info'}
                        onClick={() => setCatalogSection('info')}
                      >
                        Thông tin
                      </button>
                      <button
                        type="button"
                        className={catalogSection === 'variants' ? 'active' : ''}
                        aria-pressed={catalogSection === 'variants'}
                        onClick={() => setCatalogSection('variants')}
                      >
                        Biến thể & giá
                      </button>
                      {realApiMode && (
                        <button
                          type="button"
                          className={catalogSection === 'media' ? 'active' : ''}
                          aria-pressed={catalogSection === 'media'}
                          onClick={() => setCatalogSection('media')}
                        >
                          Ảnh sản phẩm
                        </button>
                      )}
                    </div>
                    <div hidden={catalogSection === 'variants'}>
                      <Panel title={catalogSection === 'media' ? 'Ảnh sản phẩm' : 'Thông tin mẫu'}>
                        <div hidden={catalogSection !== 'info'}>
                          <fieldset
                            className="permission-fieldset catalog-editor-form"
                            disabled={!canManage || mediaBusy}
                          >
                            <div className="feature-filters">
                              <Field
                                label="Mã mẫu"
                                value={editing.modelCode ?? ''}
                                readOnly={realApiMode && isEditingModelPersisted}
                                onChange={(e) =>
                                  setModel({ ...editing, modelCode: e.target.value.toUpperCase() })
                                }
                                hint={
                                  realApiMode
                                    ? isEditingModelPersisted
                                      ? 'Không thể đổi sau khi lưu.'
                                      : 'Mã duy nhất; khóa sau khi lưu.'
                                    : undefined
                                }
                              />
                              <Field
                                label="Tên mẫu"
                                value={editing.name}
                                onChange={(e) => setModel({ ...editing, name: e.target.value })}
                              />
                              {realApiMode ? (
                                <SelectField
                                  label="Danh mục"
                                  value={editing.categoryId ?? ''}
                                  onChange={(e) => {
                                    const categoryId = e.target.value;
                                    const category = categoriesResource.data?.find(
                                      (item) => item.id === categoryId,
                                    );
                                    setModel({
                                      ...editing,
                                      categoryId,
                                      category: category?.name ?? editing.category,
                                    });
                                  }}
                                >
                                  <option value="">Chọn danh mục</option>
                                  {(categoriesResource.data ?? []).map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </SelectField>
                              ) : (
                                <Field
                                  label="Loại trang phục"
                                  value={editing.category}
                                  onChange={(e) =>
                                    setModel({ ...editing, category: e.target.value })
                                  }
                                />
                              )}
                              <Field
                                label="Chất liệu"
                                value={editing.material}
                                onChange={(e) => setModel({ ...editing, material: e.target.value })}
                              />
                            </div>
                            <TextAreaField
                              label="Mô tả"
                              value={editing.description}
                              onChange={(e) =>
                                setModel({ ...editing, description: e.target.value })
                              }
                            />
                            {realApiMode ? (
                              editing.modelCode && mediaOwnerId === editing.id ? (
                                <ModelAccessoriesPanel
                                  modelId={editing.id}
                                  canManage={canManage}
                                  scenario={scenario}
                                />
                              ) : (
                                <Feedback tone="info" title="Lưu mẫu trước">
                                  Sau khi mẫu được tạo trên máy chủ, bạn có thể quản lý phụ kiện và
                                  số lượng đi kèm.
                                </Feedback>
                              )
                            ) : (
                              <Field
                                label="Phụ kiện mẫu (cách nhau bằng dấu phẩy)"
                                value={editing.accessories.join(', ')}
                                onChange={(e) =>
                                  setModel({
                                    ...editing,
                                    accessories: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            )}
                            <div className="editor-save-bar">
                              <Button loading={busy} onClick={() => void saveModel()}>
                                Lưu mẫu
                              </Button>
                            </div>
                          </fieldset>
                        </div>
                        <div hidden={catalogSection !== 'media'}>
                          {realApiMode && !isEditingModelPersisted && (
                            <section
                              className="catalog-media-manager"
                              aria-label="Chuẩn bị ảnh sản phẩm"
                            >
                              <Feedback tone="info" title="Lưu mẫu để tải ảnh lên">
                                Bạn có thể chọn ảnh trước. Sau khi lưu thông tin mẫu, ảnh đã chọn sẽ
                                được giữ lại để tải lên đúng mẫu.
                              </Feedback>
                              <div className="catalog-media-upload">
                                {renderMediaUploadFields(mediaBusy || busy)}
                                <div className="catalog-media-upload__actions">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    loading={busy}
                                    disabled={!canManage || busy || mediaBusy}
                                    onClick={() => void saveModel()}
                                  >
                                    Lưu mẫu và tiếp tục
                                  </Button>
                                </div>
                              </div>
                            </section>
                          )}
                          {realApiMode &&
                            isEditingModelPersisted &&
                            mediaOwnerId === editing.id && (
                              <section
                                className="catalog-media-manager"
                                aria-label="Quản lý ảnh sản phẩm"
                              >
                                {mediaOwnerId === editing.id &&
                                  mediaOwnerErrorId !== editing.id &&
                                  (mediaLoading || mediaOwnerLoadedId !== editing.id) && (
                                    <p className="muted" role="status">
                                      Đang tải thư viện ảnh…
                                    </p>
                                  )}
                                {mediaBusy && mediaProgress !== undefined && (
                                  <div
                                    className="catalog-media-progress"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    <span>Đang tải và lưu ảnh</span>
                                    <progress
                                      max={100}
                                      value={mediaProgress}
                                      aria-label="Tiến độ tải ảnh"
                                    />
                                    <strong>{mediaProgress}%</strong>
                                  </div>
                                )}
                                {(mediaOwnerErrorId === editing.id ||
                                  (mediaOwnerLoadedId === editing.id && mediaIssue)) && (
                                  <Feedback
                                    tone="danger"
                                    title="Không thể hoàn tất thao tác với ảnh"
                                  >
                                    {mediaIssue}
                                    <Button
                                      type="button"
                                      variant="quiet"
                                      loading={mediaLoading}
                                      onClick={() => void retryMediaList(editing.id)}
                                    >
                                      Tải lại thư viện ảnh
                                    </Button>
                                  </Feedback>
                                )}
                                {mediaOwnerLoadedId === editing.id &&
                                  !mediaLoading &&
                                  !mediaIssue &&
                                  mediaItems.length === 0 && (
                                    <EmptyState title="Mẫu này chưa có ảnh">
                                      Thêm ảnh để khách dễ nhận biết mẫu trang phục.
                                    </EmptyState>
                                  )}
                                {mediaOwnerLoadedId === editing.id && mediaItems.length > 0 && (
                                  <div className="catalog-media-grid">
                                    {mediaItems.map((media, mediaIndex) => (
                                      <article
                                        className={`catalog-media-card ${replaceTargetId === media.id ? 'selected' : ''}`}
                                        key={media.id}
                                      >
                                        <img
                                          src={media.mediaUrl}
                                          alt={media.altText ?? editing.name}
                                          loading="lazy"
                                        />
                                        <div className="catalog-media-card__body">
                                          <strong>
                                            {mediaIndex === 0
                                              ? 'Ảnh đại diện'
                                              : `Ảnh ${mediaIndex + 1}`}
                                          </strong>
                                          <span className="muted small-note">
                                            {media.altText?.trim()
                                              ? media.altText
                                              : 'Chưa có mô tả ảnh'}
                                          </span>
                                          {canManage && (
                                            <div className="catalog-media-card__actions">
                                              <Button
                                                type="button"
                                                variant="quiet"
                                                disabled={mediaBusy}
                                                onClick={() => {
                                                  setEditingMediaAltId(
                                                    editingMediaAltId === media.id ? '' : media.id,
                                                  );
                                                  setEditingMediaAltText(media.altText ?? '');
                                                  setMediaIssue('');
                                                }}
                                              >
                                                {editingMediaAltId === media.id
                                                  ? 'Đóng mô tả'
                                                  : 'Sửa mô tả'}
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="quiet"
                                                disabled={mediaBusy}
                                                onClick={() => {
                                                  setReplaceTargetId(
                                                    replaceTargetId === media.id ? '' : media.id,
                                                  );
                                                  setMediaAltText(media.altText ?? editing.name);
                                                }}
                                              >
                                                {replaceTargetId === media.id
                                                  ? 'Bỏ chọn ảnh'
                                                  : 'Chọn để thay'}
                                              </Button>
                                              {mediaIndex !== 0 && (
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  loading={mediaBusy}
                                                  onClick={() =>
                                                    void makePrimaryMedia(media, editing.id)
                                                  }
                                                >
                                                  Đặt làm ảnh đại diện
                                                </Button>
                                              )}
                                              <Button
                                                type="button"
                                                variant="quiet"
                                                disabled={mediaBusy}
                                                onClick={() => setPendingDeleteMedia(media)}
                                              >
                                                Xóa ảnh
                                              </Button>
                                            </div>
                                          )}
                                          {editingMediaAltId === media.id && (
                                            <div className="catalog-media-alt-editor">
                                              <Field
                                                label="Mô tả ảnh"
                                                value={editingMediaAltText}
                                                disabled={mediaBusy}
                                                onChange={(event) =>
                                                  setEditingMediaAltText(event.target.value)
                                                }
                                              />
                                              <div className="catalog-media-card__actions">
                                                <Button
                                                  type="button"
                                                  variant="secondary"
                                                  loading={mediaBusy}
                                                  onClick={() =>
                                                    void saveMediaAltText(media, editing.id)
                                                  }
                                                >
                                                  Lưu mô tả
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="quiet"
                                                  disabled={mediaBusy}
                                                  onClick={() => setEditingMediaAltId('')}
                                                >
                                                  Hủy
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                )}
                                {canManage && (
                                  <div className="catalog-media-upload">
                                    {renderMediaUploadFields(
                                      mediaBusy ||
                                        mediaLoading ||
                                        mediaOwnerLoadedId !== editing.id,
                                    )}
                                    <div className="catalog-media-upload__actions">
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        loading={mediaBusy}
                                        disabled={
                                          !mediaFile ||
                                          !canManage ||
                                          mediaLoading ||
                                          mediaOwnerLoadedId !== editing.id
                                        }
                                        onClick={() => void saveMedia(editing)}
                                      >
                                        Thêm ảnh
                                      </Button>
                                      {replaceTargetId && (
                                        <Button
                                          type="button"
                                          loading={mediaBusy}
                                          disabled={
                                            !mediaFile ||
                                            !canManage ||
                                            mediaLoading ||
                                            mediaOwnerLoadedId !== editing.id
                                          }
                                          onClick={() => void saveMedia(editing, true)}
                                        >
                                          Thay ảnh đã chọn
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {mediaOwnerLoadedId === editing.id && mediaNotice && (
                                  <Feedback tone="success" title="Ảnh đã được cập nhật">
                                    {mediaNotice}
                                  </Feedback>
                                )}
                              </section>
                            )}
                        </div>
                      </Panel>
                    </div>
                    <div hidden={catalogSection !== 'variants'}>
                      <Panel
                        title="Biến thể & giá"
                        action={
                          canManage ? (
                            <Button
                              variant="quiet"
                              disabled={busy || mediaBusy}
                              onClick={() => {
                                if (hasUnsavedVariant) setPendingVariantTarget('__new__');
                                else createVariant();
                              }}
                            >
                              + Biến thể
                            </Button>
                          ) : undefined
                        }
                      >
                        <div className="variant-pills">
                          {current.variants.map((v) => (
                            <button
                              key={v.code}
                              type="button"
                              className={variant?.code === v.code ? 'active' : ''}
                              aria-pressed={variant?.code === v.code}
                              disabled={busy || mediaBusy}
                              onClick={() => {
                                if (variant?.code === v.code) return;
                                if (hasUnsavedVariant) setPendingVariantTarget(v.code);
                                else setVariant(v);
                              }}
                            >
                              {v.size} · {v.color}
                            </button>
                          ))}
                        </div>
                        {variant ? (
                          <fieldset
                            className="permission-fieldset stack-form"
                            disabled={!canManage}
                          >
                            <p className="muted">
                              {variant.code} · biến thể {variant.modelId}
                            </p>
                            <div className="feature-filters">
                              <Field
                                label="Size"
                                value={variant.size}
                                onChange={(e) => setVariant({ ...variant, size: e.target.value })}
                              />
                              <Field
                                label="Màu"
                                value={variant.color}
                                onChange={(e) => setVariant({ ...variant, color: e.target.value })}
                              />
                              <Field
                                label="Edition"
                                value={variant.edition ?? ''}
                                onChange={(e) =>
                                  setVariant({ ...variant, edition: e.target.value })
                                }
                              />
                              <Field
                                type="number"
                                min="0"
                                label="Giá thuê / ngày (đ)"
                                value={variant.price}
                                onChange={(e) =>
                                  setVariant({ ...variant, price: Number(e.target.value) })
                                }
                              />
                              <Field
                                type="number"
                                min="0"
                                label="Tiền cọc (đ)"
                                value={variant.deposit}
                                onChange={(e) =>
                                  setVariant({ ...variant, deposit: Number(e.target.value) })
                                }
                              />
                              <Field
                                type="number"
                                min="0"
                                label="Giá thay thế (đ)"
                                value={variant.replacement}
                                onChange={(e) =>
                                  setVariant({ ...variant, replacement: Number(e.target.value) })
                                }
                              />
                            </div>
                            <TextAreaField
                              label="Ghi chú phom dáng"
                              value={variant.fit}
                              onChange={(e) => setVariant({ ...variant, fit: e.target.value })}
                            />
                            <Feedback tone="warning" title="Giá snapshot trên đơn">
                              Sửa giá hiện hành không thay đổi giá, cọc hoặc số ngày trên đơn đã
                              lập.
                            </Feedback>
                            <div className="editor-save-bar">
                              <Button loading={busy} onClick={() => void saveVariant()}>
                                Lưu biến thể & giá
                              </Button>
                            </div>
                          </fieldset>
                        ) : (
                          <p className="muted">Chọn biến thể để sửa giá hoặc tạo mới.</p>
                        )}
                      </Panel>
                    </div>
                    <InlineIssue text={issue} conflict={scenario === 'version'} />
                    {notice && (
                      <Feedback tone="success" title="Đã lưu">
                        {notice}
                      </Feedback>
                    )}
                    {pendingDeleteMedia && (
                      <ConfirmDialog
                        title="Xóa ảnh sản phẩm?"
                        confirmText="Xóa ảnh"
                        danger
                        loading={mediaBusy}
                        onClose={() => setPendingDeleteMedia(undefined)}
                        onConfirm={() => void removeMedia()}
                      >
                        <p>
                          Ảnh “
                          {pendingDeleteMedia.altText?.trim()
                            ? pendingDeleteMedia.altText
                            : 'không có mô tả'}
                          ” sẽ bị gỡ khỏi mẫu. Thao tác này không thể hoàn tác.
                        </p>
                      </ConfirmDialog>
                    )}
                    {pendingCatalogTarget && (
                      <ConfirmDialog
                        title="Chưa lưu thay đổi danh mục"
                        confirmText="Bỏ thay đổi"
                        onClose={() => setPendingCatalogTarget('')}
                        onConfirm={() => {
                          if (pendingCatalogTarget === '__new__') startNewModel();
                          else selectExistingModel(pendingCatalogTarget);
                          setPendingCatalogTarget('');
                        }}
                      >
                        <p>
                          Thông tin mẫu, giá hoặc ảnh đang sửa sẽ mất. Bạn có thể quay lại để lưu
                          trước.
                        </p>
                      </ConfirmDialog>
                    )}
                    {pendingVariantTarget && (
                      <ConfirmDialog
                        title="Chưa lưu biến thể"
                        confirmText="Bỏ thay đổi"
                        onClose={() => setPendingVariantTarget('')}
                        onConfirm={() => {
                          if (pendingVariantTarget === '__new__') createVariant();
                          else
                            setVariant(
                              current.variants.find((item) => item.code === pendingVariantTarget),
                            );
                          setPendingVariantTarget('');
                        }}
                      >
                        <p>
                          Giá và thông tin biến thể đang sửa sẽ mất. Bạn có thể quay lại để lưu
                          trước.
                        </p>
                      </ConfirmDialog>
                    )}
                  </div>
                </DetailDialog>
              )}
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}

export function EmployeesPage({
  scenario,
  canManage = true,
}: {
  scenario: DemoScenario;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const {
    options: branchOptions,
    ready: branchesReady,
    error: branchesError,
    retry: retryBranches,
  } = useBranchOptions();
  const rolesResource = useFixtureResource(scenario, studioAdapter.roles);
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.employees);
  const [selected, setSelected] = useState('NV-001');
  const [editing, setEditing] = useState<Employee>();
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [issue, setIssue] = useState('');
  const [staffConflict, setStaffConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState<'ALL' | Employee['employmentStatus']>(
    'ALL',
  );
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [assignmentBranchSelection, setAssignmentBranchSelection] = useState(
    realApiMode ? '' : 'Chi nhánh Quận 1',
  );
  const [assignmentRole, setAssignmentRole] = useState('SALES_STAFF');
  const assignmentBranch = realApiMode
    ? branchOptions.includes(assignmentBranchSelection)
      ? assignmentBranchSelection
      : (branchOptions[0] ?? '')
    : assignmentBranchSelection;
  const [pendingEmployee, setPendingEmployee] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const staffRoles = (rolesResource.data ?? []).filter((role) => role.group === 'STAFF');
  const availableAssignmentRoles = staffRoles.length
    ? staffRoles
    : realApiMode
      ? []
      : [
          { code: 'SALES_STAFF', name: staffRoleLabels.SALES_STAFF },
          { code: 'INVENTORY_STAFF', name: staffRoleLabels.INVENTORY_STAFF },
        ];
  const selectedAssignmentRole = availableAssignmentRoles.some(
    (role) => role.code === assignmentRole,
  )
    ? assignmentRole
    : (availableAssignmentRoles[0]?.code ?? '');
  const save = async () => {
    setIssue('');
    setStaffConflict(false);
    if (!editing?.name.trim() || !editing.email.includes('@')) {
      setIssue('Nhập tên và email hợp lệ.');
      return;
    }
    if (realApiMode && creatingEmployee && editing.assignments.length === 0) {
      setIssue(
        'Hãy bấm “+ Gán vai trò” để thêm ít nhất một vai trò tại chi nhánh trước khi tạo tài khoản. Chọn vai trò trong danh sách chưa lưu phân công.',
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await studioAdapter.saveEmployee(editing, scenario);
      setNotice(
        realApiMode && creatingEmployee && saved.accountLinkedToExistingCustomer
          ? `Đã gắn hồ sơ nhân viên ${saved.employeeCode ?? saved.code} vào tài khoản khách hàng đã xác minh ${saved.email}. Tài khoản dùng chung một hồ sơ; hãy đăng xuất rồi đăng nhập lại để làm mới quyền và vào đúng khu vực.`
          : realApiMode && creatingEmployee && saved.accountStatus === 'PENDING'
            ? `Đã tạo hồ sơ nhân viên ${saved.employeeCode ?? saved.code}. Tài khoản đang chờ kích hoạt: nhân viên đăng nhập bằng Google với đúng email ${saved.email}; hệ thống sẽ xác minh email và mở quyền đã phân công.`
            : realApiMode
              ? 'Đã lưu hồ sơ nhân viên và các phân công vai trò theo chi nhánh trên hệ thống.'
              : 'Đã lưu nhân viên và phân công trong fixture.',
      );
      setEditing(undefined);
      setCreatingEmployee(false);
      retry();
    } catch (e) {
      setIssue(issueText(e));
      setStaffConflict(e instanceof ApiClientError && e.code === 'STAFF_CONFLICT');
    } finally {
      setBusy(false);
    }
  };
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có nhân viên"
    >
      {(items) => {
        const current = items.find((x) => x.code === selected) ?? items[0];
        const person = editing?.code === selected ? editing : current;
        const visibleEmployees = items.filter((employee) => {
          const query = search.trim().toLocaleLowerCase('vi');
          const searchable =
            `${employee.name} ${employee.email} ${employeeDisplayCode(employee)}`.toLocaleLowerCase(
              'vi',
            );
          return (
            searchable.includes(query) &&
            (employmentFilter === 'ALL' || employee.employmentStatus === employmentFilter) &&
            (branchFilter === 'ALL' ||
              employee.assignments.some((assignment) => assignment.branch === branchFilter)) &&
            (roleFilter === 'ALL' ||
              employee.assignments.some((assignment) => assignment.roleCode === roleFilter))
          );
        });
        return (
          <div className="page">
            <PageHeading
              eyebrow="QUẢN TRỊ / NHÂN SỰ"
              title="Nhân viên & phân công"
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    disabled={!!editing}
                    onClick={() => {
                      const code = realApiMode
                        ? `NV-${globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() ?? Date.now().toString(36).toUpperCase()}`
                        : `NV-DEMO-${items.length + 1}`;
                      setSelected(code);
                      setCreatingEmployee(true);
                      setEditing({
                        code,
                        name: '',
                        email: '',
                        accountStatus: 'PENDING',
                        employmentStatus: 'ACTIVE',
                        assignments: [],
                      });
                      setDetailOpen(true);
                    }}
                  >
                    + Tạo nhân viên chờ kích hoạt
                  </Button>
                ) : undefined
              }
            />
            <div className="admin-table-workspace employee-admin-workspace">
              <Panel title="Danh sách nhân viên">
                <SearchField
                  label="Tìm theo tên, email hoặc mã nhân viên"
                  value={search}
                  onChange={setSearch}
                />
                <div className="feature-filters">
                  <SelectField
                    label="Trạng thái làm việc"
                    value={employmentFilter}
                    onChange={(event) =>
                      setEmploymentFilter(event.target.value as typeof employmentFilter)
                    }
                  >
                    <option value="ALL">Tất cả trạng thái</option>
                    {(['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const).map((status) => (
                      <option value={status} key={status}>
                        {employmentLabels[status]}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Chi nhánh"
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                  >
                    <option value="ALL">Tất cả chi nhánh</option>
                    {branchOptions.map((branch) => (
                      <option value={branch} key={branch}>
                        {branch}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Vai trò"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                  >
                    <option value="ALL">Tất cả vai trò</option>
                    {staffRoles.map((role) => (
                      <option value={role.code} key={role.code}>
                        {role.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <p className="muted small-note" role="status">
                  Hiển thị {visibleEmployees.length} / {items.length} nhân viên
                </p>
                {visibleEmployees.length === 0 ? (
                  <div className="empty-filter-state">
                    <p>Không tìm thấy nhân viên phù hợp.</p>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => {
                        setSearch('');
                        setEmploymentFilter('ALL');
                        setBranchFilter('ALL');
                        setRoleFilter('ALL');
                      }}
                    >
                      Xóa bộ lọc
                    </Button>
                  </div>
                ) : (
                  <div
                    className="responsive-table catalog-admin-table employee-admin-table"
                    role="region"
                    aria-label="Bảng nhân viên"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Nhân viên</th>
                          <th scope="col">Email</th>
                          <th scope="col">Chi nhánh</th>
                          <th scope="col">Vai trò</th>
                          <th scope="col">Tài khoản</th>
                          <th scope="col">Làm việc</th>
                          <th scope="col">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEmployees.map((employee) => (
                          <tr
                            key={employee.code}
                            className={
                              detailOpen && person.code === employee.code ? 'selected' : ''
                            }
                          >
                            <td data-label="Nhân viên">
                              <span className="employee-admin-person">
                                <strong>{employee.name}</strong>
                                <small className="employee-admin-code">
                                  {employeeDisplayCode(employee)}
                                </small>
                              </span>
                            </td>
                            <td
                              data-label="Email"
                              title={employee.email}
                              className="employee-admin-email"
                            >
                              {employee.email}
                            </td>
                            <td data-label="Chi nhánh">
                              {employee.assignments.length
                                ? [
                                    ...new Set(
                                      employee.assignments.map((assignment) => assignment.branch),
                                    ),
                                  ].join(', ')
                                : 'Chưa phân công'}
                            </td>
                            <td data-label="Vai trò">
                              {employee.assignments.length
                                ? [
                                    ...new Set(
                                      employee.assignments.map(
                                        (assignment) =>
                                          staffRoleLabels[assignment.roleCode] ??
                                          assignment.roleCode,
                                      ),
                                    ),
                                  ].join(', ')
                                : 'Chưa phân công'}
                            </td>
                            <td data-label="Tài khoản">{accountLabels[employee.accountStatus]}</td>
                            <td data-label="Làm việc">
                              {employmentLabels[employee.employmentStatus]}
                            </td>
                            <td data-label="Chi tiết">
                              <Button
                                type="button"
                                variant="quiet"
                                disabled={busy}
                                aria-pressed={detailOpen && person.code === employee.code}
                                aria-label={`Chi tiết nhân viên ${employee.name}`}
                                onClick={() => {
                                  if (detailOpen && selected === employee.code) return;
                                  if (editing && selected !== employee.code) {
                                    setPendingEmployee(employee.code);
                                    return;
                                  }
                                  if (selected === employee.code) {
                                    setDetailOpen(true);
                                    return;
                                  }
                                  setSelected(employee.code);
                                  setEditing(undefined);
                                  setCreatingEmployee(false);
                                  setIssue('');
                                  setDetailOpen(true);
                                }}
                              >
                                Chi tiết
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              {detailOpen && person && (
                <DetailDialog
                  title={
                    creatingEmployee
                      ? 'Tạo nhân viên chờ kích hoạt'
                      : `Hồ sơ ${employeeDisplayCode(person)}`
                  }
                  onClose={() => setDetailOpen(false)}
                >
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Hồ sơ nhân viên đang chọn"
                    key={person.code}
                  >
                    <Panel title={`Hồ sơ ${employeeDisplayCode(person)}`}>
                      <fieldset className="permission-fieldset" disabled={!canManage}>
                        <div className="feature-filters">
                          <Field
                            label="Họ tên"
                            value={person.name}
                            onChange={(e) => setEditing({ ...person, name: e.target.value })}
                          />
                          <Field
                            label={
                              creatingEmployee || person.accountStatus === 'PENDING'
                                ? 'Email Google để kích hoạt'
                                : 'Email'
                            }
                            value={person.email}
                            onChange={(e) => setEditing({ ...person, email: e.target.value })}
                          />
                          {realApiMode && creatingEmployee && (
                            <p className="field-hint">
                              Nếu email đã thuộc tài khoản khách hàng đang hoạt động và đã xác minh,
                              hồ sơ nhân viên sẽ được gắn vào chính tài khoản đó. Email mới sẽ chờ
                              nhân viên đăng nhập bằng Google để kích hoạt.
                            </p>
                          )}
                          <SelectField
                            label="Trạng thái tài khoản"
                            value={person.accountStatus}
                            disabled={realApiMode}
                            onChange={(e) =>
                              setEditing({
                                ...person,
                                accountStatus: e.target.value as Employee['accountStatus'],
                              })
                            }
                          >
                            {(['PENDING', 'ACTIVE', 'LOCKED', 'INACTIVE'] as const).map((x) => (
                              <option value={x} key={x}>
                                {accountLabels[x]}
                              </option>
                            ))}
                          </SelectField>
                          {realApiMode && (
                            <p className="field-hint">
                              {person.accountStatus === 'PENDING'
                                ? 'Tài khoản đang chờ kích hoạt. Nhân viên cần đăng nhập bằng Google với đúng email đã đăng ký; hệ thống sẽ xác minh email rồi mở quyền đã phân công.'
                                : 'Trạng thái đăng nhập do luồng xác thực quản lý; màn hình này chỉ cập nhật hồ sơ và trạng thái làm việc.'}
                            </p>
                          )}
                          <SelectField
                            label="Trạng thái làm việc"
                            value={person.employmentStatus}
                            onChange={(e) =>
                              setEditing({
                                ...person,
                                employmentStatus: e.target.value as Employee['employmentStatus'],
                              })
                            }
                          >
                            {(['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const).map((x) => (
                              <option value={x} key={x}>
                                {employmentLabels[x]}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        <h3>Vai trò theo chi nhánh</h3>
                        <div className="employee-assignment-list">
                          {person.assignments.map((a, i) => (
                            <div className="feature-list-row" key={i}>
                              <strong>{a.branch}</strong>
                              <span>{staffRoleLabels[a.roleCode] ?? a.roleCode}</span>
                              <Button
                                variant="quiet"
                                onClick={() =>
                                  setEditing({
                                    ...person,
                                    assignments: person.assignments.filter((_, n) => n !== i),
                                  })
                                }
                              >
                                Bỏ phân công
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="feature-filters">
                          <BranchSelector
                            label="Chi nhánh phân công"
                            value={assignmentBranch}
                            options={realApiMode ? branchOptions : undefined}
                            disabled={realApiMode && (!branchesReady || branchOptions.length === 0)}
                            onChange={setAssignmentBranchSelection}
                          />
                          <SelectField
                            label="Thêm vai trò tại chi nhánh"
                            value={selectedAssignmentRole}
                            disabled={
                              availableAssignmentRoles.length === 0 ||
                              (realApiMode && rolesResource.loading)
                            }
                            onChange={(event) => setAssignmentRole(event.target.value)}
                          >
                            {availableAssignmentRoles.map((role) => (
                              <option value={role.code} key={role.code}>
                                {role.name}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        {realApiMode && rolesResource.error && (
                          <Feedback tone="danger" title="Chưa tải được danh sách vai trò">
                            Không thể gán vai trò cho đến khi tải được danh sách.{' '}
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => rolesResource.retry()}
                            >
                              Thử lại
                            </button>
                          </Feedback>
                        )}
                        <Button
                          variant="secondary"
                          disabled={
                            person.assignments.some(
                              (entry) =>
                                entry.branch === assignmentBranch &&
                                entry.roleCode === selectedAssignmentRole,
                            ) ||
                            (realApiMode &&
                              (!assignmentBranch ||
                                !selectedAssignmentRole ||
                                !!rolesResource.error))
                          }
                          onClick={() =>
                            setEditing({
                              ...person,
                              assignments: [
                                ...person.assignments,
                                { branch: assignmentBranch, roleCode: selectedAssignmentRole },
                              ],
                            })
                          }
                        >
                          {person.assignments.some(
                            (entry) =>
                              entry.branch === assignmentBranch &&
                              entry.roleCode === selectedAssignmentRole,
                          )
                            ? 'Vai trò đã được gán'
                            : '+ Gán vai trò'}
                        </Button>
                        <p className="muted small-note">
                          Quyền nhân viên có được xác định bởi vai trò được gán tại chi nhánh.
                        </p>
                        {realApiMode && branchesError && (
                          <Feedback tone="danger" title="Chưa tải được danh sách chi nhánh">
                            Không thể thêm phân công cho đến khi tải được danh sách chi nhánh.{' '}
                            <button type="button" className="text-button" onClick={retryBranches}>
                              Thử lại
                            </button>
                          </Feedback>
                        )}
                        <div className={`feature-actions ${editing ? 'editor-save-bar' : ''}`}>
                          <Button disabled={!editing} loading={busy} onClick={() => void save()}>
                            Lưu hồ sơ & phân công
                          </Button>
                          {editing && (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditing(undefined);
                                setCreatingEmployee(false);
                              }}
                            >
                              Bỏ thay đổi
                            </Button>
                          )}
                        </div>
                        {editing && (
                          <p className="field-hint" role="status">
                            Có thay đổi chưa lưu trong hồ sơ này.
                          </p>
                        )}
                      </fieldset>
                    </Panel>
                    {staffConflict ? (
                      <Feedback tone="warning" title="Không thể tạo hồ sơ nhân viên">
                        <p>{issue}</p>
                        <p>
                          Tài khoản khách hàng đang hoạt động và đã xác minh email có thể được gắn
                          hồ sơ nhân viên để dùng chung một lần đăng nhập. Nếu lần tạo trước đã
                          thành công, tải lại danh sách rồi tìm theo email hoặc mã nhân viên.
                        </p>
                        <div className="feature-actions">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSearch(editing?.email.trim() ?? '');
                              retry();
                            }}
                          >
                            Tải lại và tìm theo email
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() => {
                              setSearch(editing ? employeeDisplayCode(editing) : '');
                              retry();
                            }}
                          >
                            Tìm theo mã nhân viên
                          </Button>
                        </div>
                      </Feedback>
                    ) : (
                      <InlineIssue text={issue} />
                    )}
                    {notice && (
                      <Feedback tone="success" title="Đã lưu">
                        {notice}
                      </Feedback>
                    )}
                  </div>
                </DetailDialog>
              )}
            </div>
            {pendingEmployee && (
              <ConfirmDialog
                title="Chưa lưu thay đổi nhân viên"
                confirmText="Bỏ thay đổi và mở hồ sơ khác"
                onClose={() => setPendingEmployee('')}
                onConfirm={() => {
                  setSelected(pendingEmployee);
                  setEditing(undefined);
                  setCreatingEmployee(false);
                  setPendingEmployee('');
                  setDetailOpen(true);
                }}
              >
                <p>Thông tin và phân công đang sửa sẽ mất. Bạn có thể quay lại để lưu trước.</p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

export function BranchesPage({
  scenario,
  canManage = true,
}: {
  scenario: DemoScenario;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.branches);
  const [selected, setSelected] = useState('HCM-Q1');
  const [editing, setEditing] = useState<Branch>();
  const [pendingBranch, setPendingBranch] = useState('');
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có chi nhánh"
    >
      {(items) => {
        const existingBranch = items.find((x) => x.code === selected);
        const current = existingBranch ?? items[0];
        const branch = editing?.code === selected ? editing : current;
        const obligations =
          existingBranch && !realApiMode
            ? studioAdapter.branchObligations(existingBranch.name)
            : { orders: 0, units: 0, transfers: 0 };
        const hasObligations = obligations.orders + obligations.units + obligations.transfers > 0;
        const closingExisting = existingBranch?.status === 'ACTIVE' && branch.status === 'INACTIVE';
        const startNewBranch = () => {
          const code = `CN-DEMO-${items.length + 1}`;
          setSelected(code);
          setEditing({
            code,
            name: '',
            address: '',
            timezone: 'Asia/Ho_Chi_Minh',
            status: 'ACTIVE',
          });
          setIssue('');
        };
        return (
          <div className="page">
            <PageHeading
              title="Chi nhánh"
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (editing) setPendingBranch('__new__');
                      else startNewBranch();
                    }}
                  >
                    + Thêm chi nhánh
                  </Button>
                ) : undefined
              }
            />
            <div className="feature-two-column independent-scroll-workspace">
              <Panel title="Danh sách chi nhánh" scrollRegionLabel="Cuộn danh sách chi nhánh">
                <div className="feature-card-list">
                  {items.map((x) => (
                    <button
                      className={`feature-list-row selectable ${selected === x.code ? 'selected' : ''}`}
                      key={x.code}
                      onClick={() => {
                        if (editing && selected !== x.code) {
                          setPendingBranch(x.code);
                          return;
                        }
                        setSelected(x.code);
                        setEditing(undefined);
                        setIssue('');
                      }}
                    >
                      <strong>{x.name}</strong>
                      <span>{x.address}</span>
                      <small>
                        {x.code} · {x.status}
                      </small>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel
                key={branch.code}
                title={`Thông tin ${branch.code}`}
                scrollRegionLabel="Cuộn thông tin chi nhánh"
              >
                <fieldset className="permission-fieldset" disabled={!canManage}>
                  <div className="stack-form">
                    <Field
                      label="Tên chi nhánh"
                      value={branch.name}
                      onChange={(e) => setEditing({ ...branch, name: e.target.value })}
                    />
                    <Field
                      label="Địa chỉ"
                      value={branch.address}
                      onChange={(e) => setEditing({ ...branch, address: e.target.value })}
                    />
                    <Field
                      label="Timezone"
                      value={branch.timezone}
                      onChange={(e) => setEditing({ ...branch, timezone: e.target.value })}
                    />
                    <SelectField
                      label="Trạng thái"
                      value={branch.status}
                      onChange={(e) =>
                        setEditing({ ...branch, status: e.target.value as Branch['status'] })
                      }
                    >
                      <option value="ACTIVE">Đang hoạt động</option>
                      <option value="INACTIVE">Ngừng hoạt động</option>
                    </SelectField>
                    {closingExisting && !realApiMode && (
                      <Feedback
                        tone={hasObligations ? 'warning' : 'info'}
                        title="Kiểm tra trước khi ngừng chi nhánh"
                      >
                        Trong fixture: {obligations.orders} đơn đang xử lý · {obligations.units} bộ
                        còn tại chi nhánh · {obligations.transfers} phiếu điều chuyển mở.
                        {hasObligations
                          ? ' Cần xử lý các nghĩa vụ này trước khi lưu trạng thái ngừng hoạt động.'
                          : ' Fixture không còn các nghĩa vụ trên. Backend vẫn phải kiểm tra khoản thu/hoàn và hồ sơ hỗ trợ trước khi chốt.'}
                      </Feedback>
                    )}
                    {closingExisting && realApiMode && (
                      <Feedback tone="info" title="Kiểm tra điều kiện trên máy chủ">
                        Số liệu chi tiết không có trong API hiện tại. Máy chủ sẽ xác nhận điều kiện
                        ngừng chi nhánh khi lưu.
                      </Feedback>
                    )}
                    <div className={editing ? 'editor-save-bar' : undefined}>
                      <Button
                        disabled={closingExisting && hasObligations}
                        loading={busy}
                        onClick={() => {
                          void (async () => {
                            if (!branch.name.trim()) {
                              setIssue('Nhập tên chi nhánh.');
                              return;
                            }
                            setBusy(true);
                            setIssue('');
                            try {
                              const saved = await studioAdapter.saveBranch(branch, scenario);
                              setSelected(saved.code);
                              setEditing(undefined);
                              retry();
                            } catch (e) {
                              setIssue(issueText(e));
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        Lưu chi nhánh
                      </Button>
                      <InlineIssue text={issue} />
                      {editing && (
                        <p className="field-hint" role="status">
                          Chi nhánh có thay đổi chưa lưu.
                        </p>
                      )}
                    </div>
                  </div>
                </fieldset>
              </Panel>
            </div>
            {pendingBranch && (
              <ConfirmDialog
                title="Chưa lưu thay đổi chi nhánh"
                confirmText="Bỏ thay đổi"
                onClose={() => setPendingBranch('')}
                onConfirm={() => {
                  if (pendingBranch === '__new__') startNewBranch();
                  else {
                    setSelected(pendingBranch);
                    setEditing(undefined);
                    setIssue('');
                  }
                  setPendingBranch('');
                }}
              >
                <p>Thông tin đang sửa sẽ mất. Bạn có thể quay lại để lưu trước.</p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

export function RolesPage({
  scenario,
  canManage = true,
}: {
  scenario: DemoScenario;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.roles);
  const permissionsResource = useFixtureResource(scenario, studioAdapter.permissions);
  const [selected, setSelected] = useState('SALES_STAFF');
  const [draft, setDraft] = useState<string[]>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingRole, setPendingRole] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <StateGate
      loading={loading || permissionsResource.loading}
      error={error ?? permissionsResource.error}
      data={data}
      retry={() => {
        retry();
        permissionsResource.retry();
      }}
      emptyTitle="Chưa có vai trò"
    >
      {(roles) => {
        const availablePermissions = permissionsResource.data ?? permissions;
        const role = roles.find((r) => r.code === selected) ?? roles[0];
        const checked = draft ?? role.permissions;
        const changed =
          checked.length !== role.permissions.length ||
          checked.some((code) => !role.permissions.includes(code));
        const addedPermissions = checked.filter((code) => !role.permissions.includes(code));
        const removedPermissions = role.permissions.filter((code) => !checked.includes(code));
        const groups = ['Đơn thuê', 'Giao / trả', 'Thanh toán', 'Kho', 'CRM', 'Quản trị'];
        return (
          <div className="page">
            <PageHeading eyebrow="QUẢN TRỊ / PHÂN QUYỀN" title="Quyền theo vai trò" />
            <div className="admin-table-workspace role-admin-workspace">
              <Panel title="Vai trò">
                <div
                  className="responsive-table catalog-admin-table role-admin-table"
                  role="region"
                  aria-label="Bảng vai trò"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Vai trò</th>
                        <th scope="col">Mã vai trò</th>
                        <th scope="col">Nhóm</th>
                        <th scope="col">Số quyền</th>
                        <th scope="col">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((item) => (
                        <tr
                          key={item.code}
                          className={detailOpen && role.code === item.code ? 'selected' : ''}
                        >
                          <td data-label="Vai trò">
                            <strong>{item.name}</strong>
                          </td>
                          <td data-label="Mã vai trò">
                            <code>{item.code}</code>
                          </td>
                          <td data-label="Nhóm">{item.group}</td>
                          <td data-label="Số quyền">{item.permissions.length}</td>
                          <td data-label="Chi tiết">
                            <Button
                              type="button"
                              variant="quiet"
                              disabled={busy}
                              aria-pressed={detailOpen && role.code === item.code}
                              aria-label={`Chi tiết quyền ${item.name}`}
                              onClick={() => {
                                if (detailOpen && selected === item.code) return;
                                if (changed && item.code !== role.code) {
                                  setPendingRole(item.code);
                                  return;
                                }
                                if (selected === item.code) {
                                  setDetailOpen(true);
                                  return;
                                }
                                setSelected(item.code);
                                setDraft(undefined);
                                setIssue('');
                                setNotice('');
                                setPermissionSearch('');
                                setDetailOpen(true);
                              }}
                            >
                              Chi tiết
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              {detailOpen && (
                <DetailDialog title={`Quyền của ${role.name}`} onClose={() => setDetailOpen(false)}>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Quyền của vai trò đang chọn"
                    key={role.code}
                  >
                    <Panel title={role.name}>
                      <p className="muted">
                        Quyền được chọn áp dụng cho vai trò này. Phân công vai trò cho nhân viên
                        theo chi nhánh ở màn hình nhân sự. Giao, nhận và trả đồ dùng quyền quản lý
                        đơn thuê theo chi nhánh.
                      </p>
                      <KeyFacts
                        rows={[
                          { label: 'Nhóm', value: role.group },
                          { label: 'Mã vai trò', value: role.code },
                          { label: 'Đã chọn', value: `${checked.length} mã quyền` },
                        ]}
                      />
                      <SearchField
                        label="Tìm quyền theo tên hoặc mã"
                        value={permissionSearch}
                        onChange={setPermissionSearch}
                      />
                    </Panel>
                    <div className="permission-groups">
                      {groups.map((group) => {
                        const matching = availablePermissions.filter(
                          (p) =>
                            p.group === group &&
                            `${p.label} ${p.code} ${p.description}`
                              .toLocaleLowerCase('vi')
                              .includes(permissionSearch.toLocaleLowerCase('vi')),
                        );
                        return permissionSearch && !matching.length ? null : (
                          <PermissionGroup
                            title={group}
                            key={group}
                            permissions={matching}
                            selected={checked}
                            filtered={Boolean(permissionSearch)}
                            disabled={!canManage}
                            onToggle={(code) =>
                              setDraft(
                                checked.includes(code)
                                  ? checked.filter((x) => x !== code)
                                  : [...checked, code],
                              )
                            }
                            onSelectAll={() =>
                              setDraft([
                                ...new Set([...checked, ...matching.map((item) => item.code)]),
                              ])
                            }
                            onClear={() =>
                              setDraft(
                                checked.filter(
                                  (code) => !matching.some((item) => item.code === code),
                                ),
                              )
                            }
                          />
                        );
                      })}
                    </div>
                    {permissionSearch &&
                      !availablePermissions.some((p) =>
                        `${p.label} ${p.code} ${p.description}`
                          .toLocaleLowerCase('vi')
                          .includes(permissionSearch.toLocaleLowerCase('vi')),
                      ) && <p className="muted">Không có quyền khớp từ khóa.</p>}
                    {role.group === 'ADMIN' && changed && !checked.includes('rbac.manage.all') && (
                      <Feedback
                        tone="warning"
                        title="Vai trò quản trị sắp mất quyền sửa phân quyền"
                      >
                        Backend cần bảo vệ quản trị viên cuối cùng trước khi cho phép lưu thay đổi
                        này.
                      </Feedback>
                    )}
                    {changed && (
                      <Panel title="Xem trước thay đổi quyền">
                        <p className="muted">
                          {addedPermissions.length} quyền được thêm · {removedPermissions.length}{' '}
                          quyền được bỏ.
                        </p>
                        {addedPermissions.map((code) => (
                          <p className="permission-change" key={`add-${code}`}>
                            <strong>Thêm</strong>{' '}
                            {availablePermissions.find((item) => item.code === code)?.label ?? code}
                            <code>{code}</code>
                          </p>
                        ))}
                        {removedPermissions.map((code) => (
                          <p className="permission-change" key={`remove-${code}`}>
                            <strong>Bỏ</strong>{' '}
                            {availablePermissions.find((item) => item.code === code)?.label ?? code}
                            <code>{code}</code>
                          </p>
                        ))}
                      </Panel>
                    )}
                    {changed && (
                      <div className="feature-actions role-save-bar" role="status">
                        <span>
                          Chưa lưu: +{addedPermissions.length} / −{removedPermissions.length} quyền
                        </span>
                        <Button
                          disabled={!canManage || busy}
                          loading={busy}
                          onClick={() => {
                            void (async () => {
                              setBusy(true);
                              setIssue('');
                              try {
                                await studioAdapter.saveRole(
                                  { ...role, permissions: checked },
                                  scenario,
                                );
                                setDraft(undefined);
                                setNotice(
                                  realApiMode
                                    ? 'Đã lưu quyền trên hệ thống. Các thao tác tiếp theo sẽ được backend kiểm theo quyền và chi nhánh.'
                                    : 'Đã lưu quyền vào fixture. API sau này phải kiểm quyền mỗi thao tác.',
                                );
                                retry();
                              } catch (e) {
                                setIssue(issueText(e));
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Lưu quyền vai trò
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={!canManage}
                          onClick={() => setDraft(undefined)}
                        >
                          Bỏ thay đổi
                        </Button>
                      </div>
                    )}
                    <InlineIssue text={issue} conflict={scenario === 'version'} />
                    {notice && (
                      <Feedback tone="success" title="Đã lưu">
                        {notice}
                      </Feedback>
                    )}
                  </div>
                </DetailDialog>
              )}
            </div>
            {pendingRole && (
              <ConfirmDialog
                title="Chưa lưu quyền vai trò"
                confirmText="Bỏ thay đổi và mở vai trò khác"
                onClose={() => setPendingRole('')}
                onConfirm={() => {
                  setSelected(pendingRole);
                  setDraft(undefined);
                  setPendingRole('');
                  setIssue('');
                  setNotice('');
                  setPermissionSearch('');
                  setDetailOpen(true);
                }}
              >
                <p>Các checkbox vừa thay đổi sẽ mất. Bạn có thể quay lại để lưu trước.</p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

export function PoliciesPage({
  scenario,
  canManage = true,
}: {
  scenario: DemoScenario;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.policies);
  const [selected, setSelected] = useState('POLICY-2026-BUFFER-01');
  const [draft, setDraft] = useState<Policy>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingPolicyAction, setPendingPolicyAction] = useState('');
  const [effectiveDateValid, setEffectiveDateValid] = useState(true);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có chính sách"
    >
      {(items) => {
        const policy = items.find((p) => p.code === selected) ?? items[0];
        const startPolicyDraft = () => {
          setEffectiveDateValid(true);
          setIssue('');
          setDraft({
            ...policy,
            lateFeeFormulaVersion: policy.lateFeeFormulaVersion ?? 1,
            code: `POLICY-DEMO-${items.length + 1}`,
            from: '',
            to: undefined,
            reason: '',
          });
          setDetailOpen(true);
        };
        return (
          <div className="page">
            <PageHeading
              title="Phiên bản chính sách thuê"
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (draft) setDetailOpen((open) => !open);
                      else startPolicyDraft();
                    }}
                  >
                    {draft
                      ? detailOpen
                        ? 'Đóng biểu mẫu'
                        : 'Tiếp tục soạn phiên bản'
                      : '+ Phiên bản mới'}
                  </Button>
                ) : undefined
              }
            />
            <div className="admin-table-workspace policy-admin-workspace">
              <Panel title={`Lịch sử phiên bản · ${items.length}`}>
                <div
                  className="responsive-table catalog-admin-table policy-admin-table"
                  role="region"
                  aria-label="Bảng phiên bản chính sách"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Phiên bản</th>
                        <th scope="col">Hiệu lực</th>
                        <th scope="col">Đếm ngày</th>
                        <th scope="col">Lý do thay đổi</th>
                        <th scope="col">Trạng thái</th>
                        <th scope="col">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.code}
                          className={detailOpen && selected === item.code ? 'selected' : ''}
                        >
                          <td data-label="Phiên bản">
                            <strong>{item.code}</strong>
                          </td>
                          <td data-label="Hiệu lực">
                            {formatPolicyDate(item.from)} → {formatPolicyDate(item.to)}
                          </td>
                          <td data-label="Đếm ngày">
                            {item.billingMode === 'ROLLING_24_HOURS' ? '24 giờ' : 'Ngày lịch'}
                          </td>
                          <td data-label="Lý do thay đổi">{item.reason || '—'}</td>
                          <td data-label="Trạng thái">
                            <StatusLabel
                              text={item.to ? 'Lịch sử' : 'Hiện hành'}
                              tone={item.to ? 'neutral' : 'success'}
                            />
                          </td>
                          <td data-label="Chi tiết">
                            <Button
                              type="button"
                              variant="quiet"
                              disabled={busy}
                              aria-pressed={detailOpen && selected === item.code}
                              aria-label={`Chi tiết phiên bản ${item.code}`}
                              onClick={() => {
                                if (detailOpen && selected === item.code) return;
                                if (draft && selected !== item.code) {
                                  setPendingPolicyAction(item.code);
                                  return;
                                }
                                setSelected(item.code);
                                setIssue('');
                                setDetailOpen(true);
                              }}
                            >
                              Chi tiết
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              {detailOpen && (
                <DetailDialog
                  title={draft ? 'Tạo phiên bản chính sách' : `Chi tiết ${policy.code}`}
                  onClose={() => setDetailOpen(false)}
                >
                  <div
                    key={policy.code}
                    role="region"
                    aria-label="Chi tiết chính sách"
                    tabIndex={0}
                  >
                    <Panel title={policy.code}>
                      <StatusLabel
                        text={
                          policy.to
                            ? 'Lịch sử'
                            : realApiMode
                              ? 'Đang hiệu lực trên máy chủ'
                              : 'Đang hiệu lực theo fixture'
                        }
                        tone={policy.to ? 'neutral' : 'success'}
                      />
                      <KeyFacts
                        rows={[
                          { label: 'Bắt đầu', value: policy.from },
                          { label: 'Kết thúc', value: policy.to ?? 'Chưa có' },
                          {
                            label: 'Đếm ngày',
                            value:
                              policy.billingMode === 'ROLLING_24_HOURS'
                                ? '24 giờ liên tục'
                                : 'Ngày lịch',
                          },
                          {
                            label: 'Số ngày',
                            value: `${policy.minDays}–${policy.maxDays ?? 'Không giới hạn'}`,
                          },
                          { label: 'Báo giá hiệu lực', value: `${policy.quoteHours} giờ` },
                          { label: 'Hủy miễn phí trước', value: `${policy.cancelHours} giờ` },
                          { label: 'Phí hủy trễ', value: `${policy.lateCancelFeePercent ?? 0}%` },
                          {
                            label: 'Ân hạn trả trễ',
                            value: `${policy.lateGraceMinutes ?? 0} phút`,
                          },
                          {
                            label: 'Phí trễ',
                            value: `${policy.lateFeePercentPerDay ?? 0}% mỗi 24 giờ, tối đa 100% tiền thuê từng bộ`,
                          },
                        ]}
                      />
                      <details className="policy-advanced-details">
                        <summary>Điều kiện và cấu hình khác</summary>
                        <KeyFacts
                          rows={[
                            {
                              label: 'Ân hạn không đến nhận',
                              value: `${policy.noShowGraceMinutes ?? 0} phút`,
                            },
                            {
                              label: 'Thời hạn hoàn tiền dự kiến',
                              value:
                                policy.refundSlaBusinessDays == null
                                  ? 'Chưa cấu hình'
                                  : `${policy.refundSlaBusinessDays} ngày làm việc`,
                            },
                            {
                              label: 'Cách tính phí',
                              value:
                                policy.lateFeeFormulaVersion === 2
                                  ? 'Theo từng bộ, sau giảm giá'
                                  : 'Cách tính cũ theo toàn đơn',
                            },
                            {
                              label: 'Dự phòng trả trễ',
                              value: `${((policy.lateReturnBufferMinutes ?? 0) / 60).toLocaleString('vi-VN')} giờ`,
                            },
                            {
                              label: 'Vệ sinh/chuẩn bị mặc định',
                              value: `${((policy.defaultCleaningBufferMinutes ?? 0) / 60).toLocaleString('vi-VN')} giờ; mẫu có thể ghi đè`,
                            },
                            {
                              label: 'Tổng đệm mặc định',
                              value: `${(((policy.lateReturnBufferMinutes ?? 0) + (policy.defaultCleaningBufferMinutes ?? 0)) / 60).toLocaleString('vi-VN')} giờ`,
                            },
                            { label: 'Lý do thay đổi', value: policy.reason },
                          ]}
                        />
                        <Timeline
                          items={[
                            `${formatPolicyDate(policy.from)} · Tạo ${policy.code}: ${policy.reason}`,
                          ]}
                        />
                      </details>
                    </Panel>
                    {draft && (
                      <Panel
                        title={realApiMode ? 'Tạo phiên bản trên máy chủ' : 'Tạo phiên bản fixture'}
                      >
                        <fieldset className="permission-fieldset" disabled={!canManage}>
                          <div className="feature-filters">
                            <Field
                              label="Mã phiên bản"
                              value={draft.code}
                              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                            />
                            <DateField
                              label="Ngày hiệu lực"
                              required
                              value={draft.from}
                              onChange={(from) => setDraft({ ...draft, from })}
                              onValidityChange={setEffectiveDateValid}
                            />
                            <SelectField
                              label="Cách đếm ngày"
                              value={draft.billingMode}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  billingMode: e.target.value as Policy['billingMode'],
                                })
                              }
                            >
                              <option value="ROLLING_24_HOURS">Chu kỳ 24 giờ</option>
                              <option value="CALENDAR_DAY">Ngày lịch</option>
                            </SelectField>
                            <Field
                              type="number"
                              min="1"
                              label="Số ngày tối thiểu"
                              value={draft.minDays}
                              onChange={(e) =>
                                setDraft({ ...draft, minDays: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="1"
                              label="Số ngày tối đa"
                              value={draft.maxDays ?? ''}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  maxDays: e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              hint="Để trống nếu không giới hạn thời gian thuê."
                            />
                            <Field
                              type="number"
                              min="1"
                              step="1"
                              label="Báo giá có hiệu lực (giờ)"
                              value={draft.quoteHours}
                              onChange={(e) =>
                                setDraft({ ...draft, quoteHours: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="0"
                              step="1"
                              label="Hủy miễn phí trước (giờ)"
                              value={draft.cancelHours}
                              onChange={(e) =>
                                setDraft({ ...draft, cancelHours: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="0"
                              step="1"
                              label="Ân hạn không đến nhận (phút)"
                              value={draft.noShowGraceMinutes ?? 0}
                              onChange={(e) =>
                                setDraft({ ...draft, noShowGraceMinutes: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              label="Phí hủy trễ (%)"
                              value={draft.lateCancelFeePercent ?? 0}
                              onChange={(e) =>
                                setDraft({ ...draft, lateCancelFeePercent: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="1"
                              step="1"
                              label="SLA hoàn tiền (ngày làm việc)"
                              value={draft.refundSlaBusinessDays ?? ''}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  refundSlaBusinessDays:
                                    e.target.value === '' ? null : Number(e.target.value),
                                })
                              }
                              hint="Để trống nếu chưa công bố SLA hoàn tiền."
                            />
                            <Field
                              type="number"
                              min="0"
                              step="1"
                              label="Ân hạn trả trễ (phút)"
                              value={draft.lateGraceMinutes ?? 0}
                              onChange={(e) =>
                                setDraft({ ...draft, lateGraceMinutes: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              label="Phí trễ (% mỗi 24 giờ)"
                              value={draft.lateFeePercentPerDay ?? 0}
                              onChange={(e) =>
                                setDraft({ ...draft, lateFeePercentPerDay: Number(e.target.value) })
                              }
                            />
                            <Field
                              type="number"
                              min="0"
                              max="168"
                              step="0.5"
                              label="Dự phòng khách trả trễ (giờ)"
                              value={(draft.lateReturnBufferMinutes ?? 0) / 60}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  lateReturnBufferMinutes: Math.round(Number(e.target.value) * 60),
                                })
                              }
                              hint="Khoảng nội bộ tính sau giờ trả hẹn; không kéo dài thời gian khách được thuê."
                            />
                            <Field
                              type="number"
                              min="0"
                              max="168"
                              step="0.5"
                              label="Vệ sinh/chuẩn bị mặc định (giờ)"
                              value={(draft.defaultCleaningBufferMinutes ?? 0) / 60}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  defaultCleaningBufferMinutes: Math.round(
                                    Number(e.target.value) * 60,
                                  ),
                                })
                              }
                              hint="Dùng khi mẫu chưa có thời gian riêng. Giá trị cụ thể của mẫu sẽ ghi đè mức mặc định này."
                            />
                          </div>
                          <p className="field-hint">
                            Tổng đệm xếp lịch nội bộ:{' '}
                            {(
                              ((draft.lateReturnBufferMinutes ?? 0) +
                                (draft.defaultCleaningBufferMinutes ?? 0)) /
                              60
                            ).toLocaleString('vi-VN')}{' '}
                            giờ; không kéo dài kỳ thuê của khách.
                          </p>
                          {realApiMode &&
                            ((draft.lateReturnBufferMinutes ?? 0) > 0 ||
                              (draft.defaultCleaningBufferMinutes ?? 0) > 0) && (
                              <Feedback tone="warning" title="Rà soát các đơn đã xác nhận">
                                Mọi đơn tương lai cần được kiểm tra theo buffer mới; nếu hai khoảng
                                chiếm dụng chồng nhau, hãy xử lý phân công trước khi phiên bản
                                policy có hiệu lực.
                              </Feedback>
                            )}
                          <TextAreaField
                            label="Lý do thay đổi"
                            value={draft.reason}
                            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                          />
                          <div
                            className="policy-draft-preview"
                            role="region"
                            aria-label="Xem trước phiên bản chính sách"
                          >
                            <strong>Xem trước cấu hình</strong>
                            <KeyFacts
                              rows={[
                                {
                                  label: 'Hiệu lực từ',
                                  value: draft.from ? formatPolicyDate(draft.from) : 'Chưa chọn',
                                },
                                {
                                  label: 'Kỳ thuê',
                                  value: `${draft.minDays}–${draft.maxDays ?? 'Không giới hạn'} ngày`,
                                },
                                { label: 'Hủy miễn phí trước', value: `${draft.cancelHours} giờ` },
                                {
                                  label: 'Phí hủy trễ',
                                  value: `${draft.lateCancelFeePercent ?? 0}%`,
                                },
                                {
                                  label: 'Phí trả trễ',
                                  value: `${draft.lateFeePercentPerDay ?? 0}% mỗi 24 giờ`,
                                },
                                {
                                  label: 'Đệm lịch nội bộ',
                                  value: `${(((draft.lateReturnBufferMinutes ?? 0) + (draft.defaultCleaningBufferMinutes ?? 0)) / 60).toLocaleString('vi-VN')} giờ`,
                                },
                              ]}
                            />
                          </div>
                          <div className="feature-actions editor-save-bar">
                            <Button
                              disabled={!canManage}
                              loading={busy}
                              onClick={() => {
                                void (async () => {
                                  if (
                                    !effectiveDateValid ||
                                    !draft.from ||
                                    !draft.reason.trim() ||
                                    (draft.maxDays != null && draft.maxDays < draft.minDays)
                                  ) {
                                    setIssue('Nhập ngày hiệu lực, lý do và số ngày hợp lệ.');
                                    return;
                                  }
                                  setBusy(true);
                                  setIssue('');
                                  try {
                                    await studioAdapter.savePolicy(draft, scenario);
                                    setSelected(draft.code);
                                    setDraft(undefined);
                                    retry();
                                  } catch (e) {
                                    setIssue(issueText(e));
                                  } finally {
                                    setBusy(false);
                                  }
                                })();
                              }}
                            >
                              Tạo phiên bản
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setDraft(undefined);
                                setIssue('');
                              }}
                            >
                              Bỏ bản nháp
                            </Button>
                          </div>
                        </fieldset>
                      </Panel>
                    )}
                    <InlineIssue text={issue} />
                  </div>
                </DetailDialog>
              )}
            </div>
            {pendingPolicyAction && (
              <ConfirmDialog
                title="Chưa lưu phiên bản chính sách"
                confirmText="Bỏ bản nháp"
                onClose={() => setPendingPolicyAction('')}
                onConfirm={() => {
                  setDraft(undefined);
                  setSelected(pendingPolicyAction);
                  setIssue('');
                  setDetailOpen(true);
                  setPendingPolicyAction('');
                }}
              >
                <p>Phiên bản đang soạn sẽ mất. Bạn có thể quay lại để lưu trước.</p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}

type ReportPreset = '7' | '30' | '90' | 'custom';

function dateKeyInStudio(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function recentDateRange(days: number) {
  const to = dateKeyInStudio();
  return { from: shiftDateKey(to, 1 - days), to };
}

function reportRangeDays(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
}

function compactMoney(value: number) {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString('vi-VN')}k`;
  return value.toLocaleString('vi-VN');
}

function formatReportBucket(value: string, groupBy: ReportRange['groupBy']) {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value.slice(5)}/${value.slice(0, 4)}`;
  const date = formatCalendarDate(value);
  return groupBy === 'week' ? `Tuần ${date}` : date;
}

function RevenueTrendChart({
  points,
  groupBy,
}: {
  points: NonNullable<ReportSnapshot['revenuePeriods']>;
  groupBy: ReportRange['groupBy'];
}) {
  if (!points.length)
    return (
      <div className="report-chart-empty">
        Chưa có doanh thu thuê đã ghi nhận trong khoảng thời gian này.
      </div>
    );

  const width = 820;
  const height = 280;
  const left = 72;
  const right = 20;
  const top = 18;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const baseline = top + plotHeight;
  const peak = Math.max(...points.map((point) => point.rentalVnd), 0);
  const scale = peak > 0 ? 10 ** Math.ceil(Math.log10(peak)) : 1;
  const ceiling = (Math.ceil((peak / scale) * 4) * scale) / 4 || scale;
  const step = plotWidth / points.length;
  const barWidth = Math.max(2, Math.min(22, step * 0.58));
  const labelIndexes = new Set([0, Math.round((points.length - 1) / 2), points.length - 1]);

  return (
    <div className="report-chart-scroll">
      <svg
        className="report-revenue-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Biểu đồ doanh thu tiền thuê theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'}`}
      >
        {[0, 0.5, 1].map((fraction) => {
          const y = baseline - plotHeight * fraction;
          return (
            <g key={fraction}>
              <line x1={left} x2={width - right} y1={y} y2={y} className="report-chart-gridline" />
              <text x={left - 10} y={y + 4} textAnchor="end" className="report-chart-axis-label">
                {compactMoney(ceiling * fraction)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const barHeight = Math.max(0, (point.rentalVnd / ceiling) * plotHeight);
          const x = left + index * step + (step - barWidth) / 2;
          const y = baseline - barHeight;
          return (
            <g key={point.period}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={Math.min(5, barWidth / 2)}
                className="report-chart-bar"
              >
                <title>{`${formatReportBucket(point.period, groupBy)} · ${money(point.rentalVnd)}`}</title>
              </rect>
              {labelIndexes.has(index) && (
                <text
                  x={left + index * step + step / 2}
                  y={baseline + 25}
                  textAnchor={
                    points.length === 1
                      ? 'middle'
                      : index === 0
                        ? 'start'
                        : index === points.length - 1
                          ? 'end'
                          : 'middle'
                  }
                  className="report-chart-axis-label"
                >
                  {formatReportBucket(point.period, groupBy)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const paymentStatusLabel = (status: string) =>
  ({
    SUCCEEDED: 'Thành công',
    PENDING: 'Chờ xử lý',
    FAILED: 'Thất bại',
    CANCELLED: 'Đã hủy',
  })[status] ?? status;

const refundStatusLabel = (status: string) =>
  ({
    REQUESTED: 'Chờ xử lý',
    PROCESSING: 'Đang xử lý',
    COMPLETED: 'Đã hoàn',
    FAILED: 'Thất bại',
    CANCELLED: 'Đã hủy',
  })[status] ?? status;
const inventoryStatusLabel = (status: string) =>
  ({
    INBOUND: 'Chờ kiểm tra',
    READY: 'Sẵn sàng',
    CLEANING: 'Đang vệ sinh',
    REPAIR: 'Đang sửa',
    IN_TRANSFER: 'Đang điều chuyển',
    RETIRED: 'Ngừng sử dụng',
  })[status] ?? status;
const inventoryConditionLabel = (condition: string) =>
  ({
    UNINSPECTED: 'Chưa kiểm tra',
    NEW: 'Mới',
    GOOD: 'Tốt',
    FAIR: 'Cần theo dõi',
    POOR: 'Kém',
    DAMAGED: 'Hư hỏng',
  })[condition] ?? condition;

function downloadReportCsv(report: ReportSnapshot, range: Pick<ReportRange, 'from' | 'to'>) {
  const rows: (string | number)[][] = [
    ['Loại', 'Chi nhánh', 'Từ ngày', 'Đến ngày', 'Kỳ / trạng thái', 'Số lượng', 'Giá trị (VND)'],
    ['Tổng quan', report.branch, range.from, range.to, 'Lượt thuê', report.rentalCount, ''],
    ['Tổng quan', report.branch, range.from, range.to, 'Doanh thu thuê', '', report.rentalRevenue],
    ['Tổng quan', report.branch, range.from, range.to, 'Cọc đang giữ', '', report.depositsHeld],
    [
      'Tổng quan',
      report.branch,
      range.from,
      range.to,
      'Quá hạn',
      report.overdueOrders ?? report.overdueUnits,
      '',
    ],
    [
      'Tổng quan',
      report.branch,
      range.from,
      range.to,
      'Đã hoàn cọc',
      '',
      report.completedRefund ?? 0,
    ],
    ...(report.revenuePeriods ?? []).map((period): (string | number)[] => [
      'Doanh thu theo kỳ',
      report.branch,
      range.from,
      range.to,
      period.period,
      '',
      period.rentalVnd,
    ]),
    ...report.transactions.map((item): (string | number)[] => [
      'Giao dịch',
      report.branch,
      range.from,
      range.to,
      paymentStatusLabel(item.status),
      item.count,
      '',
    ]),
    ...report.refunds.map((item): (string | number)[] => [
      'Hoàn cọc',
      report.branch,
      range.from,
      range.to,
      refundStatusLabel(item.status),
      item.count,
      '',
    ]),
  ];
  const csv =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            const raw =
              typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : String(value);
            return `"${raw.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bao-cao-studio-${range.from}-${range.to}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ReportsPage({
  scenario,
  branch,
  audience = 'admin',
}: {
  scenario: DemoScenario;
  branch: string;
  audience?: 'admin' | 'staff';
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const [preset, setPreset] = useState<ReportPreset>('30');
  const [range, setRange] = useState(() => recentDateRange(30));
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);
  const [draftFromValid, setDraftFromValid] = useState(true);
  const [draftToValid, setDraftToValid] = useState(true);
  const [groupBy, setGroupBy] = useState<ReportRange['groupBy']>('day');
  const today = dateKeyInStudio();
  const draftRangeValid =
    draftFromValid &&
    draftToValid &&
    !!draftFrom &&
    !!draftTo &&
    draftFrom <= draftTo &&
    draftTo <= today &&
    reportRangeDays(draftFrom, draftTo) <= 365;
  const loadReports = useCallback(
    (currentScenario: DemoScenario) =>
      branch
        ? studioAdapter.reports(currentScenario, branch, {
            from: range.from,
            to: range.to,
            groupBy,
          })
        : Promise.resolve([]),
    [branch, range.from, range.to, groupBy],
  );
  const { loading, error, data, retry } = useFixtureResource(
    scenario,
    loadReports,
    `${branch}:${range.from}:${range.to}:${groupBy}`,
  );
  const choosePreset = (nextPreset: Exclude<ReportPreset, 'custom'>) => {
    const nextRange = recentDateRange(Number(nextPreset));
    setPreset(nextPreset);
    setRange(nextRange);
    setDraftFrom(nextRange.from);
    setDraftTo(nextRange.to);
    setDraftFromValid(true);
    setDraftToValid(true);
    setGroupBy(nextPreset === '90' ? 'week' : 'day');
  };
  const applyCustomRange = () => {
    if (!draftRangeValid) return;
    setRange({ from: draftFrom, to: draftTo });
  };
  const periodLabel = `${formatCalendarDate(range.from)} – ${formatCalendarDate(range.to)}`;
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có báo cáo"
      allowEmpty
    >
      {(reports) => {
        const scoped = reports.filter((report) => report.branch === branch);
        const report = scoped[0];
        return (
          <div className="page">
            <PageHeading
              title={audience === 'staff' ? 'Báo cáo vận hành' : 'Báo cáo quản trị'}
              action={
                report && !loading && !error ? (
                  <Button variant="secondary" onClick={() => downloadReportCsv(report, range)}>
                    Tải CSV
                  </Button>
                ) : undefined
              }
            />
            <section className="report-control-panel" aria-label="Bộ lọc báo cáo">
              <div className="report-control-heading">
                <div>
                  <span className="report-control-label">CHI NHÁNH ĐANG XEM</span>
                  <strong>{branch || 'Chưa chọn chi nhánh'}</strong>
                </div>
                <span className="report-active-period">{periodLabel}</span>
              </div>
              <div className="report-control-row">
                <div
                  className="report-period-switch"
                  role="group"
                  aria-label="Chọn khoảng thời gian"
                >
                  {(
                    [
                      ['7', '7 ngày'],
                      ['30', '30 ngày'],
                      ['90', '90 ngày'],
                      ['custom', 'Tùy chỉnh'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      className={preset === value ? 'active' : ''}
                      aria-pressed={preset === value}
                      key={value}
                      onClick={() =>
                        value === 'custom' ? setPreset('custom') : choosePreset(value)
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <SelectField
                  label="Gom số liệu theo"
                  value={groupBy}
                  onChange={(event) => setGroupBy(event.target.value as ReportRange['groupBy'])}
                >
                  <option value="day">Ngày</option>
                  <option value="week">Tuần</option>
                  <option value="month">Tháng</option>
                </SelectField>
              </div>
              {preset === 'custom' && (
                <div className="report-custom-range">
                  <DateField
                    label="Từ ngày"
                    value={draftFrom}
                    max={draftTo || today}
                    onChange={setDraftFrom}
                    onValidityChange={setDraftFromValid}
                  />
                  <DateField
                    label="Đến ngày"
                    value={draftTo}
                    min={draftFrom}
                    max={today}
                    onChange={setDraftTo}
                    onValidityChange={setDraftToValid}
                  />
                  <Button variant="primary" disabled={!draftRangeValid} onClick={applyCustomRange}>
                    Áp dụng khoảng ngày
                  </Button>
                  {!draftRangeValid && (
                    <p className="report-range-error" role="alert">
                      Chọn ngày hợp lệ trong tối đa 366 ngày và không vượt quá hôm nay.
                    </p>
                  )}
                </div>
              )}
            </section>
            {!branch || !report ? (
              <EmptyState title={branch ? 'Chưa có số liệu trong kỳ này' : 'Chưa chọn chi nhánh'}>
                Chọn một chi nhánh được phân công hoặc thử khoảng ngày khác.
              </EmptyState>
            ) : (
              <>
                <div className="report-grid">
                  <Panel title="Lượt thuê">
                    <strong className="report-number">
                      {report.rentalCount.toLocaleString('vi-VN')}
                    </strong>
                    <p className="report-card-note">Đơn tạo trong kỳ</p>
                  </Panel>
                  <Panel title="Doanh thu tiền thuê">
                    <strong className="report-number">{money(report.rentalRevenue)}</strong>
                    <p className="report-card-note">Không gồm tiền cọc</p>
                  </Panel>
                  <Panel title="Đã hoàn cọc">
                    <strong className="report-number">{money(report.completedRefund ?? 0)}</strong>
                    <p className="report-card-note">Hoàn tất trong kỳ báo cáo</p>
                  </Panel>
                  <Panel title="Cọc đang giữ (số dư hiện tại)">
                    <strong className="report-number">{money(report.depositsHeld)}</strong>
                    <p className="report-card-note">Tính theo số dư hiện tại của chi nhánh.</p>
                  </Panel>
                </div>
                {realApiMode && (
                  <div className="feature-two-column report-detail-grid">
                    <Panel title={`Tồn kho · ${report.inventoryTotalUnits ?? 0} bộ`}>
                      {(report.inventoryByStatus ?? []).length ? (
                        <KeyFacts
                          rows={(report.inventoryByStatus ?? []).map((item) => ({
                            label: inventoryStatusLabel(item.status),
                            value: item.count,
                          }))}
                        />
                      ) : (
                        <p className="muted">Chi nhánh chưa có bộ trang phục.</p>
                      )}
                    </Panel>
                    <Panel title="Tình trạng trang phục">
                      {(report.inventoryByCondition ?? []).length ? (
                        <KeyFacts
                          rows={(report.inventoryByCondition ?? []).map((item) => ({
                            label: inventoryConditionLabel(item.condition),
                            value: item.count,
                          }))}
                        />
                      ) : (
                        <p className="muted">Chưa có dữ liệu kiểm tra tình trạng.</p>
                      )}
                    </Panel>
                  </div>
                )}
                <Panel title="Doanh thu thuê theo thời gian" className="report-chart-panel">
                  <div className="report-chart-legend">
                    <span aria-hidden="true" /> Tiền thuê đã ghi nhận
                  </div>
                  <RevenueTrendChart points={report.revenuePeriods ?? []} groupBy={groupBy} />
                </Panel>
                <div
                  className={`feature-two-column report-detail-grid ${realApiMode ? 'report-detail-grid--single' : ''}`}
                >
                  <Panel title="Giao dịch theo trạng thái">
                    <KeyFacts
                      rows={report.transactions.map((item) => ({
                        label: paymentStatusLabel(item.status),
                        value: item.count,
                      }))}
                    />
                    {scenario === 'bankPending' && (
                      <Feedback tone="warning" title="Chuyển khoản đang chờ đối soát">
                        Khoản này chưa được tính là đã thu.
                      </Feedback>
                    )}
                  </Panel>
                  {(!realApiMode || scenario === 'refundFailed') && (
                    <Panel title="Hoàn cọc">
                      {!realApiMode && (
                        <KeyFacts
                          rows={report.refunds.map((item) => ({
                            label: refundStatusLabel(item.status),
                            value: item.count,
                          }))}
                        />
                      )}
                      {scenario === 'refundFailed' && (
                        <Feedback tone="danger" title="Hoàn cọc thất bại">
                          Cần đối soát trạng thái; không tự thử lại giao dịch tài chính.
                        </Feedback>
                      )}
                    </Panel>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}
