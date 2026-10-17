import { useCallback, useState } from 'react';
import {
  Button,
  ConfirmDialog,
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
import { useMobileDetailReveal } from '../components/useMobileDetailReveal';
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
  apiEnabled,
  hasAccessToken,
  listCatalogCategories,
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

export function CatalogAdminPage({ scenario, canManage = true }: { scenario: DemoScenario; canManage?: boolean }) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.details);
  const loadCategories = useCallback(
    async () => (realApiMode ? listCatalogCategories() : []),
    [realApiMode],
  );
  const categoriesResource = useFixtureResource(scenario, loadCategories);
  const [selected, setSelected] = useState('ao-dai-lina');
  const [model, setModel] = useState<CostumeDetail>();
  const [variant, setVariant] = useState<Variant>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mediaFile, setMediaFile] = useState<File>();
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
      setNotice(realApiMode ? 'Đã lưu mẫu vào danh mục trên máy chủ.' : 'Đã lưu mẫu trong fixture.');
      retry();
    } catch (e) {
      setIssue(issueText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveMedia = async () => {
    if (!realApiMode || !model?.modelCode || !mediaFile) {
      setIssue('Chọn ảnh và lưu mẫu trước khi tải media lên máy chủ.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      await uploadCatalogMedia('model', model.id, mediaFile, model.name);
      setMediaFile(undefined);
      setNotice('Đã tải ảnh và gắn vào mẫu trên máy chủ.');
      retry();
    } catch (e) {
      setIssue(issueText(e));
    } finally {
      setBusy(false);
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
      setNotice(realApiMode ? 'Đã lưu biến thể và giá trên máy chủ. Đơn cũ vẫn giữ snapshot.' : 'Đã lưu biến thể và giá hiện hành trong fixture. Đơn cũ giữ snapshot.');
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
        const current =
          model?.id === selected ? model : (items.find((i) => i.id === selected) ?? items[0]);
        const editing = model?.id === current.id ? model : current;
        return (
          <div className="page">
            <PageHeading
              eyebrow="QUẢN TRỊ / DANH MỤC"
              title="Mẫu, biến thể & giá"
              description="Giá thuê/ngày, cọc và giá thay thế được đặt trên biến thể, dùng chung toàn chuỗi."
              action={canManage ? (
                <Button
                  variant="secondary"
                  onClick={() => {
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
                  }}
                >
                  + Tạo mẫu
                </Button>
              ) : undefined}
            />
            <div className="feature-two-column">
              <div>
                <Panel title="Danh mục mẫu">
                  <div className="feature-card-list">
                    {items.map((item) => (
                      <button
                        className={`feature-list-row selectable ${selected === item.id ? 'selected' : ''}`}
                        key={item.id}
                        onClick={() => {
                          setSelected(item.id);
                          setModel(undefined);
                          setVariant(undefined);
                        }}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.category} · {item.variants.length} biến thể
                        </span>
                        <small>{item.id}</small>
                      </button>
                    ))}
                  </div>
                </Panel>
                <Panel title="Thông tin mẫu">
                  <fieldset className="permission-fieldset" disabled={!canManage}>
                  <div className="feature-filters">
                    <Field
                      label="Mã mẫu"
                      value={editing.modelCode ?? ''}
                      disabled={realApiMode && Boolean(editing.modelCode)}
                      onChange={(e) => setModel({ ...editing, modelCode: e.target.value.toUpperCase() })}
                      hint={realApiMode ? 'Mã duy nhất trên toàn hệ thống.' : undefined}
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
                          const category = categoriesResource.data?.find((item) => item.id === categoryId);
                          setModel({ ...editing, categoryId, category: category?.name ?? editing.category });
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
                        onChange={(e) => setModel({ ...editing, category: e.target.value })}
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
                    onChange={(e) => setModel({ ...editing, description: e.target.value })}
                  />
                  <Field
                    label="Phụ kiện (cách nhau bằng dấu phẩy)"
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
                  {realApiMode && !editing.modelCode && (
                    <p className="muted small-note">
                      Mẫu mới sẽ được tạo với mã mẫu và danh mục đã chọn. Media sẽ được bổ sung ở bước
                      upload riêng sau khi máy chủ trả về mã mẫu.
                    </p>
                  )}
                  {realApiMode && editing.modelCode && (
                    <div className="stack-form">
                      <Field
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        label="Ảnh đại diện mẫu"
                        onChange={(e) => setMediaFile(e.target.files?.[0])}
                        hint="JPEG, PNG hoặc WebP; ảnh sẽ được lưu qua dịch vụ media của máy chủ."
                      />
                      <Button variant="secondary" loading={busy} disabled={!mediaFile} onClick={() => void saveMedia()}>
                        Tải ảnh lên
                      </Button>
                    </div>
                  )}
                  <Button loading={busy} onClick={() => void saveModel()}>
                    Lưu mẫu
                  </Button>
                  </fieldset>
                </Panel>
              </div>
              <div>
                <Panel
                  title="Biến thể & giá"
                  action={canManage ? (
                    <Button
                      variant="quiet"
                      onClick={() =>
                        setVariant({
                          code: `${current.id.toUpperCase()}-NEW`,
                          modelId: current.id,
                          size: '',
                          color: '',
                          fit: '',
                          price: 0,
                          deposit: 0,
                          replacement: 0,
                        })
                      }
                    >
                      + Biến thể
                    </Button>
                  ) : undefined}
                >
                  <div className="variant-pills">
                    {current.variants.map((v) => (
                      <button
                        key={v.code}
                        className={variant?.code === v.code ? 'active' : ''}
                        onClick={() => setVariant(v)}
                      >
                        {v.size} · {v.color}
                      </button>
                    ))}
                  </div>
                  {variant ? (
                    <fieldset className="permission-fieldset stack-form" disabled={!canManage}>
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
                          onChange={(e) => setVariant({ ...variant, edition: e.target.value })}
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
                        Sửa giá hiện hành không thay đổi giá, cọc hoặc số ngày trên đơn đã lập.
                      </Feedback>
                      <Button loading={busy} onClick={() => void saveVariant()}>
                        Lưu biến thể & giá
                      </Button>
                    </fieldset>
                  ) : (
                    <p className="muted">Chọn biến thể để sửa giá hoặc tạo mới.</p>
                  )}
                </Panel>
                <InlineIssue text={issue} conflict={scenario === 'version'} />
                {notice && (
                  <Feedback tone="success" title="Đã lưu">
                    {notice}
                  </Feedback>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}

export function EmployeesPage({ scenario, canManage = true }: { scenario: DemoScenario; canManage?: boolean }) {
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
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState<'ALL' | Employee['employmentStatus']>('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [assignmentBranchSelection, setAssignmentBranchSelection] = useState(realApiMode ? '' : 'Chi nhánh Quận 1');
  const [assignmentRole, setAssignmentRole] = useState('SALES_STAFF');
  const assignmentBranch = realApiMode
    ? branchOptions.includes(assignmentBranchSelection)
      ? assignmentBranchSelection
      : branchOptions[0] ?? ''
    : assignmentBranchSelection;
  const [pendingEmployee, setPendingEmployee] = useState('');
  const { detailRef, revealDetail } = useMobileDetailReveal<HTMLDivElement>();
  const staffRoles = (rolesResource.data ?? []).filter((role) => role.group === 'STAFF');
  const availableAssignmentRoles = staffRoles.length
    ? staffRoles
    : realApiMode
      ? []
      : [{ code: 'SALES_STAFF', name: staffRoleLabels.SALES_STAFF }, { code: 'INVENTORY_STAFF', name: staffRoleLabels.INVENTORY_STAFF }];
  const selectedAssignmentRole = availableAssignmentRoles.some((role) => role.code === assignmentRole)
    ? assignmentRole
    : availableAssignmentRoles[0]?.code ?? '';
  const save = async () => {
    if (!editing?.name.trim() || !editing.email.includes('@')) {
      setIssue('Nhập tên và email hợp lệ.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      await studioAdapter.saveEmployee(editing, scenario);
      setNotice(
        realApiMode
          ? 'Đã lưu hồ sơ nhân viên và các phân công role theo chi nhánh trên hệ thống.'
          : 'Đã lưu nhân viên và phân công trong fixture.',
      );
      setEditing(undefined);
      retry();
    } catch (e) {
      setIssue(issueText(e));
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
          const searchable = `${employee.name} ${employee.email} ${employeeDisplayCode(employee)}`
            .toLocaleLowerCase('vi');
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
              description="Thông tin nhân viên tách khỏi role được gán tại từng chi nhánh."
              action={canManage ? (
                <Button
                  variant="secondary"
                  disabled={!!editing}
                  onClick={() => {
                    const code = `NV-DEMO-${items.length + 1}`;
                    setSelected(code);
                    setEditing({
                      code,
                      name: '',
                      email: '',
                      accountStatus: 'PENDING',
                      employmentStatus: 'ACTIVE',
                      assignments: [],
                    });
                    revealDetail();
                  }}
                >
                  + Tạo nhân viên chờ kích hoạt
                </Button>
              ) : undefined}
            />
            <div className="feature-two-column">
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
                    onChange={(event) => setEmploymentFilter(event.target.value as typeof employmentFilter)}
                  >
                    <option value="ALL">Tất cả trạng thái</option>
                    {(['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const).map((status) => (
                      <option value={status} key={status}>{employmentLabels[status]}</option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Chi nhánh"
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                  >
                    <option value="ALL">Tất cả chi nhánh</option>
                    {branchOptions.map((branch) => <option value={branch} key={branch}>{branch}</option>)}
                  </SelectField>
                  <SelectField
                    label="Vai trò"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                  >
                    <option value="ALL">Tất cả vai trò</option>
                    {staffRoles.map((role) => <option value={role.code} key={role.code}>{role.name}</option>)}
                  </SelectField>
                </div>
                <p className="muted small-note" role="status">
                  Hiển thị {visibleEmployees.length} / {items.length} nhân viên
                </p>
                <div className="feature-card-list">
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
                  ) : visibleEmployees.map((x) => (
                      <button
                        className={`feature-list-row selectable ${person.code === x.code ? 'selected' : ''}`}
                        key={x.code}
                        onClick={() => {
                          if (editing && selected !== x.code) {
                            setPendingEmployee(x.code);
                            return;
                          }
                          setSelected(x.code);
                          setEditing(undefined);
                          revealDetail();
                        }}
                      >
                        <strong>{x.name}</strong>
                        <span>{x.email}</span>
                        <small>
                          Mã nhân viên: {employeeDisplayCode(x)}
                          {' · '}Tài khoản: {accountLabels[x.accountStatus]} · Việc làm:{' '}
                          {employmentLabels[x.employmentStatus]}
                        </small>
                      </button>
                    ))}
                </div>
              </Panel>
              <div
                ref={detailRef}
                tabIndex={-1}
                role="region"
                aria-label="Hồ sơ nhân viên đang chọn"
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
                      label="Email Google dự kiến"
                      value={person.email}
                      onChange={(e) => setEditing({ ...person, email: e.target.value })}
                    />
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
                      <p className="field-hint">Trạng thái đăng nhập được quản lý qua luồng xác thực; màn hình này chỉ cập nhật hồ sơ và trạng thái làm việc.</p>
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
                      disabled={availableAssignmentRoles.length === 0 || (realApiMode && rolesResource.loading)}
                      onChange={(event) => setAssignmentRole(event.target.value)}
                    >
                      {availableAssignmentRoles.map((role) => (
                        <option value={role.code} key={role.code}>{role.name}</option>
                      ))}
                    </SelectField>
                  </div>
                  {realApiMode && rolesResource.error && (
                    <Feedback tone="danger" title="Chưa tải được danh sách vai trò">
                      Không thể gán vai trò cho đến khi tải được danh sách.{' '}
                      <button type="button" className="text-button" onClick={() => rolesResource.retry()}>Thử lại</button>
                    </Feedback>
                  )}
                  <Button
                    variant="secondary"
                      disabled={person.assignments.some(
                        (entry) =>
                          entry.branch === assignmentBranch && entry.roleCode === selectedAssignmentRole,
                      ) || (realApiMode && (!assignmentBranch || !selectedAssignmentRole || !!rolesResource.error))}
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
                        entry.branch === assignmentBranch && entry.roleCode === selectedAssignmentRole,
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
                      <button type="button" className="text-button" onClick={retryBranches}>Thử lại</button>
                    </Feedback>
                  )}
                  <div className="feature-actions">
                    <Button disabled={!editing} loading={busy} onClick={() => void save()}>
                      Lưu hồ sơ & phân công
                    </Button>
                    {editing && (
                      <Button variant="secondary" onClick={() => setEditing(undefined)}>
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
                <InlineIssue text={issue} />
                {notice && (
                  <Feedback tone="success" title="Đã lưu">
                    {notice}
                  </Feedback>
                )}
              </div>
            </div>
            {pendingEmployee && (
              <ConfirmDialog
                title="Chưa lưu thay đổi nhân viên"
                confirmText="Bỏ thay đổi và mở hồ sơ khác"
                onClose={() => setPendingEmployee('')}
                onConfirm={() => {
                  setSelected(pendingEmployee);
                  setEditing(undefined);
                  setPendingEmployee('');
                  revealDetail();
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

export function BranchesPage({ scenario, canManage = true }: { scenario: DemoScenario; canManage?: boolean }) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.branches);
  const [selected, setSelected] = useState('HCM-Q1');
  const [editing, setEditing] = useState<Branch>();
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
        const obligations = existingBranch && !realApiMode
          ? studioAdapter.branchObligations(existingBranch.name)
          : { orders: 0, units: 0, transfers: 0 };
        const hasObligations = obligations.orders + obligations.units + obligations.transfers > 0;
        const closingExisting = existingBranch?.status === 'ACTIVE' && branch.status === 'INACTIVE';
        return (
          <div className="page">
            <PageHeading
              eyebrow="QUẢN TRỊ / CHI NHÁNH"
              title="Chi nhánh"
              description="Mỗi bộ có chi nhánh hiện tại; nhận/trả cùng chi nhánh trong đơn thuê."
              action={canManage ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const code = `CN-DEMO-${items.length + 1}`;
                    setSelected(code);
                    setEditing({
                      code,
                      name: '',
                      address: '',
                      timezone: 'Asia/Ho_Chi_Minh',
                      status: 'ACTIVE',
                    });
                  }}
                >
                  + Thêm chi nhánh
                </Button>
              ) : undefined}
            />
            <div className="feature-two-column">
              <Panel title="Danh sách chi nhánh">
                <div className="feature-card-list">
                  {items.map((x) => (
                    <button
                      className={`feature-list-row selectable ${selected === x.code ? 'selected' : ''}`}
                      key={x.code}
                      onClick={() => {
                        setSelected(x.code);
                        setEditing(undefined);
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
              <Panel title={`Thông tin ${branch.code}`}>
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
                      Số liệu chi tiết không có trong API hiện tại. Máy chủ sẽ xác nhận điều kiện ngừng chi nhánh khi lưu.
                    </Feedback>
                  )}
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
                          await studioAdapter.saveBranch(branch, scenario);
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
                </div>
                </fieldset>
              </Panel>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}

export function RolesPage({ scenario, canManage = true }: { scenario: DemoScenario; canManage?: boolean }) {
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
  const { detailRef, revealDetail } = useMobileDetailReveal<HTMLDivElement>();
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
            <PageHeading
              eyebrow="QUẢN TRỊ / PHÂN QUYỀN"
              title="Quyền theo vai trò"
              description="Chọn một vai trò, tick mã quyền có sẵn. Scope thuộc định nghĩa quyền và không đổi tại màn hình này."
            />
            <div className={`role-layout ${changed ? 'has-unsaved-role' : ''}`}>
              <Panel title="Vai trò">
                <div className="feature-card-list">
                  {roles.map((r) => (
                    <button
                      className={`feature-list-row selectable ${role.code === r.code ? 'selected' : ''}`}
                      key={r.code}
                      onClick={() => {
                        if (changed && r.code !== role.code) {
                          setPendingRole(r.code);
                          return;
                        }
                        setSelected(r.code);
                        setDraft(undefined);
                        setIssue('');
                        revealDetail();
                      }}
                    >
                      <strong>{r.name}</strong>
                      <span>
                        {r.code} · {r.group}
                      </span>
                      <small>{r.permissions.length} quyền</small>
                    </button>
                  ))}
                </div>
              </Panel>
              <div
                ref={detailRef}
                tabIndex={-1}
                role="region"
                aria-label="Quyền của vai trò đang chọn"
              >
                <Panel title={role.name}>
                  <p className="muted">
                    Quyền được chọn áp dụng cho vai trò này. Phân công vai trò cho nhân viên theo
                    chi nhánh ở màn hình nhân sự.
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
                          setDraft([...new Set([...checked, ...matching.map((item) => item.code)])])
                        }
                        onClear={() =>
                          setDraft(
                            checked.filter((code) => !matching.some((item) => item.code === code)),
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
                  <Feedback tone="warning" title="Vai trò quản trị sắp mất quyền sửa phân quyền">
                    Backend cần bảo vệ quản trị viên cuối cùng trước khi cho phép lưu thay đổi này.
                  </Feedback>
                )}
                {changed && (
                  <Panel title="Xem trước thay đổi quyền">
                    <p className="muted">
                      {addedPermissions.length} quyền được thêm · {removedPermissions.length} quyền
                      được bỏ.
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
                    <Button variant="secondary" disabled={!canManage} onClick={() => setDraft(undefined)}>
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
                  revealDetail();
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

export function PoliciesPage({ scenario, canManage = true }: { scenario: DemoScenario; canManage?: boolean }) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.policies);
  const [selected, setSelected] = useState('POLICY-2026-BUFFER-01');
  const [draft, setDraft] = useState<Policy>();
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
        return (
          <div className="page">
            <PageHeading
              eyebrow="QUẢN TRỊ / CHÍNH SÁCH"
              title="Phiên bản chính sách thuê"
              description="Đơn giữ snapshot chính sách tại thời điểm lập. Sửa bằng cách tạo phiên bản mới có thời điểm hiệu lực."
              action={canManage ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      ...policy,
                      lateFeeFormulaVersion: policy.lateFeeFormulaVersion ?? 1,
                      code: `POLICY-DEMO-${items.length + 1}`,
                      from: '',
                      to: undefined,
                      reason: '',
                    })
                  }
                >
                  + Phiên bản mới
                </Button>
              ) : undefined}
            />
            <div className="feature-two-column">
              <Panel title="Lịch sử phiên bản">
                <div className="feature-card-list">
                  {items.map((p) => (
                    <button
                      className={`feature-list-row selectable ${selected === p.code ? 'selected' : ''}`}
                      key={p.code}
                      onClick={() => setSelected(p.code)}
                    >
                      <strong>{p.code}</strong>
                      <span>
                        {p.from} → {p.to ?? 'Hiện hành'}
                      </span>
                      <small>
                        {p.billingMode === 'ROLLING_24_HOURS' ? 'Chu kỳ 24 giờ' : 'Ngày lịch'}
                      </small>
                    </button>
                  ))}
                </div>
              </Panel>
              <div>
                <Panel title={policy.code}>
                  <StatusLabel
                    text={policy.to ? 'Lịch sử' : realApiMode ? 'Đang hiệu lực trên máy chủ' : 'Đang hiệu lực theo fixture'}
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
                      { label: 'Số ngày', value: `${policy.minDays}–${policy.maxDays ?? 'Không giới hạn'}` },
                      { label: 'Báo giá hiệu lực', value: `${policy.quoteHours} giờ` },
                      { label: 'Hủy miễn phí trước', value: `${policy.cancelHours} giờ` },
                      { label: 'Ân hạn không đến nhận', value: `${policy.noShowGraceMinutes ?? 0} phút` },
                      { label: 'Phí hủy trễ', value: `${policy.lateCancelFeePercent ?? 0}%` },
                      { label: 'Thời hạn hoàn tiền dự kiến', value: policy.refundSlaBusinessDays == null ? 'Chưa cấu hình' : `${policy.refundSlaBusinessDays} ngày làm việc` },
                      { label: 'Ân hạn trả trễ', value: `${policy.lateGraceMinutes ?? 0} phút` },
                      { label: 'Phí trễ', value: `${policy.lateFeePercentPerDay ?? 0}% mỗi 24 giờ, tối đa 100% tiền thuê từng bộ` },
                      { label: 'Cách tính phí', value: policy.lateFeeFormulaVersion === 2 ? 'Theo từng bộ, sau giảm giá' : 'Cách tính cũ theo toàn đơn' },
                      { label: 'Dự phòng trả trễ', value: `${((policy.lateReturnBufferMinutes ?? 0) / 60).toLocaleString('vi-VN')} giờ` },
                      { label: 'Vệ sinh/chuẩn bị mặc định', value: `${((policy.defaultCleaningBufferMinutes ?? 0) / 60).toLocaleString('vi-VN')} giờ; mẫu có thể ghi đè` },
                      { label: 'Tổng đệm mặc định', value: `${(((policy.lateReturnBufferMinutes ?? 0) + (policy.defaultCleaningBufferMinutes ?? 0)) / 60).toLocaleString('vi-VN')} giờ` },
                      { label: 'Lý do thay đổi', value: policy.reason },
                    ]}
                  />
                  <h3>Audit</h3>
                  <Timeline items={[`${policy.from} · Tạo ${policy.code}: ${policy.reason}`]} />
                </Panel>
                {draft && (
                  <Panel title={realApiMode ? 'Tạo phiên bản trên máy chủ' : 'Tạo phiên bản fixture'}>
                    <fieldset className="permission-fieldset" disabled={!canManage}>
                    <div className="feature-filters">
                      <Field
                        label="Mã phiên bản"
                        value={draft.code}
                        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                      />
                      <Field
                        type="date"
                        label="Ngày hiệu lực"
                        value={draft.from}
                        onChange={(e) => setDraft({ ...draft, from: e.target.value })}
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
                        onChange={(e) => setDraft({ ...draft, minDays: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="1"
                        label="Số ngày tối đa"
                        value={draft.maxDays ?? ''}
                        onChange={(e) => setDraft({ ...draft, maxDays: e.target.value === '' ? null : Number(e.target.value) })}
                        hint="Để trống nếu không giới hạn thời gian thuê."
                      />
                      <Field
                        type="number"
                        min="1"
                        step="1"
                        label="Báo giá có hiệu lực (giờ)"
                        value={draft.quoteHours}
                        onChange={(e) => setDraft({ ...draft, quoteHours: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="0"
                        step="1"
                        label="Hủy miễn phí trước (giờ)"
                        value={draft.cancelHours}
                        onChange={(e) => setDraft({ ...draft, cancelHours: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="0"
                        step="1"
                        label="Ân hạn không đến nhận (phút)"
                        value={draft.noShowGraceMinutes ?? 0}
                        onChange={(e) => setDraft({ ...draft, noShowGraceMinutes: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        label="Phí hủy trễ (%)"
                        value={draft.lateCancelFeePercent ?? 0}
                        onChange={(e) => setDraft({ ...draft, lateCancelFeePercent: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="1"
                        step="1"
                        label="SLA hoàn tiền (ngày làm việc)"
                        value={draft.refundSlaBusinessDays ?? ''}
                        onChange={(e) => setDraft({ ...draft, refundSlaBusinessDays: e.target.value === '' ? null : Number(e.target.value) })}
                        hint="Để trống nếu chưa công bố SLA hoàn tiền."
                      />
                      <Field
                        type="number"
                        min="0"
                        step="1"
                        label="Ân hạn trả trễ (phút)"
                        value={draft.lateGraceMinutes ?? 0}
                        onChange={(e) => setDraft({ ...draft, lateGraceMinutes: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        label="Phí trễ (% mỗi 24 giờ)"
                        value={draft.lateFeePercentPerDay ?? 0}
                        onChange={(e) => setDraft({ ...draft, lateFeePercentPerDay: Number(e.target.value) })}
                      />
                      <Field
                        type="number"
                        min="0"
                        max="168"
                        step="0.5"
                        label="Dự phòng khách trả trễ (giờ)"
                        value={(draft.lateReturnBufferMinutes ?? 0) / 60}
                        onChange={(e) => setDraft({ ...draft, lateReturnBufferMinutes: Math.round(Number(e.target.value) * 60) })}
                        hint="Khoảng nội bộ tính sau giờ trả hẹn; không kéo dài thời gian khách được thuê."
                      />
                      <Field
                        type="number"
                        min="0"
                        max="168"
                        step="0.5"
                        label="Vệ sinh/chuẩn bị mặc định (giờ)"
                        value={(draft.defaultCleaningBufferMinutes ?? 0) / 60}
                        onChange={(e) => setDraft({ ...draft, defaultCleaningBufferMinutes: Math.round(Number(e.target.value) * 60) })}
                        hint="Dùng khi mẫu chưa có thời gian riêng. Giá trị cụ thể của mẫu sẽ ghi đè mức mặc định này."
                      />
                    </div>
                    <p className="muted small-note">
                      Mức khởi điểm đã duyệt là 12 giờ dự phòng + 12 giờ vệ sinh/chuẩn bị. Phiên bản policy này đang tạo tổng đệm mặc định {(((draft.lateReturnBufferMinutes ?? 0) + (draft.defaultCleaningBufferMinutes ?? 0)) / 60).toLocaleString('vi-VN')} giờ; có thể thay đổi ở các phiên bản sau. Đây là khoảng xếp lịch nội bộ, không phải ân hạn hay gia hạn thuê. Ân hạn và mức phí trễ là chính sách riêng, vẫn cần được chốt trước khi công bố.
                    </p>
                    {realApiMode && ((draft.lateReturnBufferMinutes ?? 0) > 0 || (draft.defaultCleaningBufferMinutes ?? 0) > 0) && (
                      <Feedback tone="warning" title="Rà soát các đơn đã xác nhận">
                        Mọi đơn tương lai cần được kiểm tra theo buffer mới; nếu hai khoảng chiếm dụng chồng nhau, hãy xử lý phân công trước khi phiên bản policy có hiệu lực.
                      </Feedback>
                    )}
                    <TextAreaField
                      label="Lý do thay đổi"
                      value={draft.reason}
                      onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                    />
                    <Button
                      disabled={!canManage}
                      loading={busy}
                      onClick={() => {
                        void (async () => {
                          if (
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
                    </fieldset>
                  </Panel>
                )}
                <InlineIssue text={issue} />
              </div>
            </div>
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

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function reportRangeDays(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000;
}

function compactMoney(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString('vi-VN')}k`;
  return value.toLocaleString('vi-VN');
}

function formatReportBucket(value: string, groupBy: ReportRange['groupBy']) {
  if (/^\d{4}-\d{2}$/.test(value)) return value.slice(5).replace('-', '/') + `/${value.slice(2, 4)}`;
  const shortDate = formatReportDate(value).slice(0, 5);
  return groupBy === 'week' ? `Tuần ${shortDate}` : shortDate;
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
  const ceiling = Math.ceil(peak / scale * 4) * scale / 4 || scale;
  const step = plotWidth / points.length;
  const barWidth = Math.max(2, Math.min(22, step * 0.58));
  const labelIndexes = new Set(
    [0, Math.round((points.length - 1) / 2), points.length - 1],
  );

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
                  textAnchor="middle"
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

export function ReportsPage({
  scenario,
  branch,
}: {
  scenario: DemoScenario;
  branch: string;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const [preset, setPreset] = useState<ReportPreset>('30');
  const [range, setRange] = useState(() => recentDateRange(30));
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);
  const [groupBy, setGroupBy] = useState<ReportRange['groupBy']>('day');
  const today = dateKeyInStudio();
  const draftRangeValid =
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
    setGroupBy(nextPreset === '90' ? 'week' : 'day');
  };
  const applyCustomRange = () => {
    if (!draftRangeValid) return;
    setRange({ from: draftFrom, to: draftTo });
  };
  const periodLabel = `${formatReportDate(range.from)} – ${formatReportDate(range.to)}`;
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
              eyebrow="QUẢN TRỊ / BÁO CÁO"
              title="Báo cáo vận hành"
              description={`Theo dõi tình hình thuê và thu chi tại ${branch || 'chi nhánh đang chọn'}.`}
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
                <div className="report-period-switch" role="group" aria-label="Chọn khoảng thời gian">
                  {([
                    ['7', '7 ngày'],
                    ['30', '30 ngày'],
                    ['90', '90 ngày'],
                    ['custom', 'Tùy chỉnh'],
                  ] as const).map(([value, label]) => (
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
                  <Field
                    label="Từ ngày"
                    type="date"
                    value={draftFrom}
                    max={draftTo || today}
                    onChange={(event) => setDraftFrom(event.target.value)}
                  />
                  <Field
                    label="Đến ngày"
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    max={today}
                    onChange={(event) => setDraftTo(event.target.value)}
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
                <p className="report-period-caption">
                  Kỳ báo cáo: <strong>{periodLabel}</strong> · Tiền cọc đang giữ được theo dõi riêng,
                  không tính vào doanh thu.
                </p>
                <div className="report-grid">
                  <Panel title="Lượt thuê">
                    <strong className="report-number">{report.rentalCount.toLocaleString('vi-VN')}</strong>
                    <p className="report-card-note">Đơn tạo trong kỳ</p>
                  </Panel>
                  <Panel title="Doanh thu tiền thuê">
                    <strong className="report-number">{money(report.rentalRevenue)}</strong>
                    <p className="report-card-note">Không gồm tiền cọc</p>
                  </Panel>
                  <Panel title="Cọc đang giữ">
                    <strong className="report-number">{money(report.depositsHeld)}</strong>
                    <p className="report-card-note">Khoản cần hoàn hoặc đối soát</p>
                  </Panel>
                  <Panel title={realApiMode ? 'Đơn quá hạn' : 'Bộ quá hạn'}>
                    <strong className="report-number">
                      {realApiMode ? report.overdueOrders ?? 0 : report.overdueUnits}
                    </strong>
                    <p className="report-card-note">Cần được nhân viên theo dõi</p>
                  </Panel>
                  {realApiMode && (
                    <Panel title="Đã hoàn cọc">
                      <strong className="report-number">{money(report.completedRefund ?? 0)}</strong>
                      <p className="report-card-note">Hoàn tất trong kỳ báo cáo</p>
                    </Panel>
                  )}
                </div>
                <Panel
                  title="Doanh thu thuê theo thời gian"
                  className="report-chart-panel"
                  action={
                    <div className="report-chart-total">
                      <span>Tổng trong kỳ</span>
                      <strong>{money(report.rentalRevenue)}</strong>
                    </div>
                  }
                >
                  <div className="report-chart-legend">
                    <span aria-hidden="true" /> Tiền thuê đã ghi nhận
                  </div>
                  <RevenueTrendChart points={report.revenuePeriods ?? []} groupBy={groupBy} />
                </Panel>
                <div className="feature-two-column report-detail-grid">
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
                  <Panel title="Hoàn cọc">
                    {realApiMode ? (
                      <p className="muted">
                        Tổng số tiền đã hoàn được thể hiện ở chỉ số “Đã hoàn cọc” phía trên.
                      </p>
                    ) : (
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
                </div>
              </>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}
