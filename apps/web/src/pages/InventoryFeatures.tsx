import { useCallback, useState, type FormEvent } from 'react';
import type { Navigate } from '../App';
import { Button, ConfirmDialog, Feedback, Field, SelectField, TextAreaField, StatusLabel } from '../components/ui';
import {
  BarcodeLookup,
  BranchSelector,
  FilterBar,
  InlineIssue,
  KeyFacts,
  PageHeading,
  Panel,
  SearchField,
  StateGate,
  Timeline,
  UnitDetailPanel,
} from '../components/studio';
import { blockStatusLabels, blockTypeLabels, conditionLabels, unitStatusLabels } from '../components/statusLabels';
import { useFixtureResource } from '../components/useFixtureResource';
import { useBranchOptions } from '../components/useBranchOptions';
import { useMobileDetailReveal } from '../components/useMobileDetailReveal';
import {
  studioAdapter,
  type Transfer,
  type TransferStatus,
  type Unit,
  type UnitBlock,
} from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';
import {
  apiEnabled,
  cancelUnitBlock,
  changeInventoryUnitStatus,
  completeUnitBlock,
  createCapacityWindow,
  createInventoryUnit,
  createUnitBlock,
  deleteCapacityWindow,
  inspectInventoryUnit,
  listCapacityWindows,
  listInventoryUnitEvents,
  listUnitBlocks,
  hasAccessToken,
  retireInventoryUnit,
  startUnitBlock,
  updateCapacityWindow,
  updateUnitBlock,
  type CapacityWindowRecord,
  type ScheduledBlock,
} from '../api/client';

const localDateTimeInput = (offsetMinutes: number) => {
  const value = new Date(Date.now() + offsetMinutes * 60_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

function CreateInventoryUnitPanel({
  scenario,
  branch,
  onCreated,
}: {
  scenario: DemoScenario;
  branch: string;
  onCreated: (unit: Unit) => void;
}) {
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.details);
  const [unitCode, setUnitCode] = useState('');
  const [variantId, setVariantId] = useState('');
  const [acquiredAt, setAcquiredAt] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const variants = (data ?? []).flatMap((model) => model.variants.map((variant) => ({
    id: variant.apiId,
    label: `${model.name} · ${variant.size} / ${variant.color}`,
  }))).filter((variant): variant is { id: string; label: string } => !!variant.id);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unitCode.trim() || !variantId || (cost && (!Number.isSafeInteger(Number(cost)) || Number(cost) < 0))) {
      setIssue('Nhập barcode, chọn biến thể và kiểm tra giá nhập.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      const unit = await createInventoryUnit({
        unitCode,
        variantId,
        branchName: branch,
        acquiredAt: acquiredAt || undefined,
        acquisitionCostVnd: cost ? Number(cost) : undefined,
        conditionNotes: notes.trim() || undefined,
      });
      onCreated(unit);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không thể tạo bộ mới.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={`Ghi nhận bộ mới · ${branch}`}>
      {loading ? <p className="muted" role="status">Đang tải biến thể đang kinh doanh…</p> : (
        <form className="stack-form" onSubmit={(event) => void save(event)}>
          <div className="feature-filters">
            <Field label="Barcode bộ" required value={unitCode} disabled={busy} onChange={(event) => setUnitCode(event.target.value.toUpperCase())} hint="Chỉ dùng chữ, số và dấu gạch nối." />
            <SelectField label="Mẫu / biến thể" required value={variantId} disabled={busy || !variants.length} onChange={(event) => setVariantId(event.target.value)}>
              <option value="">Chọn biến thể</option>
              {variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.label}</option>)}
            </SelectField>
            <Field label="Ngày nhập" type="date" value={acquiredAt} disabled={busy} onChange={(event) => setAcquiredAt(event.target.value)} />
            <Field label="Giá nhập (đ)" type="number" min="0" step="1000" value={cost} disabled={busy} onChange={(event) => setCost(event.target.value)} />
          </div>
          <TextAreaField label="Ghi chú tiếp nhận" value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} />
          {!variants.length && !loading && <Feedback tone="warning" title="Chưa có biến thể để nhập kho">Hãy kiểm tra quyền xem danh mục và trạng thái kinh doanh của biến thể.</Feedback>}
          {error && <Feedback tone="danger" title="Không tải được danh mục">{String(error)} <button type="button" className="text-button" onClick={retry}>Thử lại</button></Feedback>}
          {issue && <Feedback tone="danger" title="Chưa tạo được bộ">{issue}</Feedback>}
          <Button type="submit" loading={busy} disabled={loading || !variants.length}>Tạo bộ chờ kiểm tra</Button>
        </form>
      )}
    </Panel>
  );
}

const transferStatus: Record<TransferStatus, string> = {
  REQUESTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  IN_TRANSIT: 'Đang vận chuyển',
  RECEIVED: 'Đã nhận đủ',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

export function InventoryPage({
  scenario,
  branch,
  go,
  canManage = true,
}: {
  scenario: DemoScenario;
  branch: string;
  go: Navigate;
  canManage?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.units);
  const loadBlocks = useCallback(
    async () => realApiMode ? listUnitBlocks({ branchName: branch }) : [],
    [branch, realApiMode],
  );
  const blocksResource = useFixtureResource(scenario, loadBlocks, branch);
  const loadCapacity = useCallback(
    async () => realApiMode && branch ? listCapacityWindows(branch) : [],
    [branch, realApiMode],
  );
  const capacityResource = useFixtureResource(scenario, loadCapacity, branch);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Tất cả');
  const [selected, setSelected] = useState<Unit>();
  const [blockType, setBlockType] = useState<UnitBlock['type']>('CLEANING');
  const [from, setFrom] = useState(() => localDateTimeInput(60));
  const [until, setUntil] = useState(() => localDateTimeInput(180));
  const [reason, setReason] = useState('');
  const [effort, setEffort] = useState('60');
  const [blockCost, setBlockCost] = useState('');
  const [capacityWindowId, setCapacityWindowId] = useState('');
  const [editingBlock, setEditingBlock] = useState<ScheduledBlock>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreateUnit, setShowCreateUnit] = useState(false);
  const [inspectionGrade, setInspectionGrade] = useState<'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED'>('GOOD');
  const [unitTargetStatus, setUnitTargetStatus] = useState<'READY' | 'CLEANING' | 'REPAIR'>('CLEANING');
  const [operationNotes, setOperationNotes] = useState('');
  const [retirementOpen, setRetirementOpen] = useState(false);
  const [retirementNotes, setRetirementNotes] = useState('');
  const [cancelTarget, setCancelTarget] = useState<ScheduledBlock>();
  const [cancelReason, setCancelReason] = useState('');
  const [windowStart, setWindowStart] = useState(() => localDateTimeInput(24 * 60 + 9 * 60));
  const [windowEnd, setWindowEnd] = useState(() => localDateTimeInput(24 * 60 + 12 * 60));
  const [windowMinutes, setWindowMinutes] = useState('120');
  const [windowNotes, setWindowNotes] = useState('');
  const [editingWindow, setEditingWindow] = useState<CapacityWindowRecord>();
  const [deleteWindowTarget, setDeleteWindowTarget] = useState<CapacityWindowRecord>();
  const { detailRef, revealDetail } = useMobileDetailReveal<HTMLDivElement>();
  const refreshUnitDetail = async (unit: Unit) => {
    if (!unit.apiId || !realApiMode) {
      setSelected(unit);
      return;
    }
    try {
      const [blocks, history] = await Promise.all([
        listUnitBlocks({ unitId: unit.apiId }),
        listInventoryUnitEvents(unit.apiId),
      ]);
      setSelected({
        ...unit,
        blocks,
        history,
      });
    } catch (error) {
      setSelected(unit);
      setIssue(error instanceof Error ? error.message : 'Không tải được lịch sử bộ.');
    }
  };
  const selectUnit = (unit: Unit) => {
    setIssue('');
    setNotice('');
    setSelected(unit);
    revealDetail();
    void refreshUnitDetail(unit);
  };
  const addBlock = async () => {
    if (!selected || !reason.trim() || until <= from) {
      setIssue('Nhập lý do và khoảng block hợp lệ.');
      return;
    }
    if (!Number.isInteger(Number(effort)) || Number(effort) < 1 || (blockCost && (!Number.isSafeInteger(Number(blockCost)) || Number(blockCost) < 0))) {
      setIssue('Kiểm tra số phút xử lý và chi phí dự kiến.');
      return;
    }
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      if (editingBlock && realApiMode) {
        await updateUnitBlock(editingBlock.id, {
          blockType: blockType,
          blockedFrom: from,
          blockedUntil: until,
          capacityWindowId: capacityWindowId || null,
          estimatedEffortMinutes: Number(effort),
          costVnd: blockCost ? Number(blockCost) : null,
          reason: reason.trim(),
          expectedUpdatedAt: editingBlock.updatedAt,
        });
        setEditingBlock(undefined);
        blocksResource.retry();
        await refreshUnitDetail(selected);
      } else if (realApiMode && selected.apiId) {
        await createUnitBlock(selected.apiId, {
          type: blockType,
          from,
          until,
          reason: reason.trim(),
          capacityWindowId: capacityWindowId || undefined,
          estimatedEffortMinutes: Number(effort),
          costVnd: blockCost ? Number(blockCost) : undefined,
        });
        blocksResource.retry();
        await refreshUnitDetail(selected);
      } else {
        setSelected(await studioAdapter.addBlock(
          selected.barcode,
          { type: blockType, from, until, reason, status: 'PLANNED' },
          scenario,
        ));
      }
      retry();
      setReason('');
      setNotice(editingBlock
        ? `Đã cập nhật lịch ${blockTypeLabels[blockType]} cho ${selected.barcode}.`
        : realApiMode
          ? `Đã tạo lịch ${blockTypeLabels[blockType]} cho ${selected.barcode} trên hệ thống.`
          : `Đã tạo block ${blockTypeLabels[blockType]} cho ${selected.barcode} trong fixture.`);
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không tạo được block.');
    } finally {
      setBusy(false);
    }
  };
  const updateUnit = async (operation: () => Promise<Unit>, successMessage: string) => {
    if (!selected) return;
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const updated = await operation();
      setSelected({ ...updated, blocks: selected.blocks, history: selected.history });
      retry();
      await refreshUnitDetail(updated);
      setOperationNotes('');
      setNotice(successMessage);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không thể cập nhật bộ.');
    } finally {
      setBusy(false);
    }
  };
  const updateBlock = async (block: ScheduledBlock, action: 'start' | 'complete') => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      if (action === 'start') await startUnitBlock(block.id);
      else await completeUnitBlock(block.id);
      blocksResource.retry();
      retry();
      if (selected) await refreshUnitDetail(selected);
      setNotice(action === 'start' ? 'Đã bắt đầu lịch xử lý.' : 'Đã hoàn tất lịch xử lý; bộ đã chuyển sang sẵn sàng.');
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không cập nhật được lịch xử lý.');
    } finally {
      setBusy(false);
    }
  };
  const confirmCancelBlock = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setBusy(true);
    setIssue('');
    try {
      await cancelUnitBlock(cancelTarget.id, cancelReason.trim());
      setCancelTarget(undefined);
      setCancelReason('');
      blocksResource.retry();
      retry();
      if (selected) await refreshUnitDetail(selected);
      setNotice('Đã hủy lịch; lịch sử vẫn được lưu.');
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không hủy được lịch xử lý.');
    } finally {
      setBusy(false);
    }
  };
  const addCapacityWindow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const availableMinutes = Number(windowMinutes);
    if (!branch || windowEnd <= windowStart || !Number.isInteger(availableMinutes) || availableMinutes < 1) {
      setIssue('Kiểm tra khoảng thời gian và số phút năng lực.');
      return;
    }
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      if (editingWindow) {
        await updateCapacityWindow(editingWindow.id, {
          startsAt: windowStart,
          endsAt: windowEnd,
          availableMinutes,
          notes: windowNotes.trim() || null,
          expectedUpdatedAt: editingWindow.updatedAt,
        });
        setEditingWindow(undefined);
        setNotice('Đã cập nhật năng lực xử lý.');
      } else {
        await createCapacityWindow(branch, {
          startsAt: windowStart,
          endsAt: windowEnd,
          availableMinutes,
          notes: windowNotes.trim() || undefined,
        });
        setNotice('Đã ghi nhận năng lực xử lý cho chi nhánh.');
      }
      capacityResource.retry();
      setWindowNotes('');
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không thể tạo khung năng lực.');
    } finally {
      setBusy(false);
    }
  };
  const confirmDeleteCapacityWindow = async () => {
    if (!deleteWindowTarget) return;
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      await deleteCapacityWindow(deleteWindowTarget.id);
      setDeleteWindowTarget(undefined);
      if (editingWindow?.id === deleteWindowTarget.id) setEditingWindow(undefined);
      capacityResource.retry();
      blocksResource.retry();
      setNotice('Đã xóa khung năng lực. Các lịch xử lý liên quan vẫn còn và không còn gắn với khung này.');
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Không xóa được khung năng lực.');
    } finally {
      setBusy(false);
    }
  };
  const availableStatusTargets = selected?.status === 'READY'
    ? ['CLEANING', 'REPAIR'] as const
    : selected?.status === 'CLEANING'
      ? ['READY', 'REPAIR'] as const
      : selected?.status === 'REPAIR'
        ? ['READY'] as const
        : [] as const;
  const effectiveUnitTarget = availableStatusTargets.some((status) => status === unitTargetStatus)
    ? unitTargetStatus
    : (availableStatusTargets[0] ?? 'READY');
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Kho chưa có bộ trang phục"
    >
      {(units) => {
        const visible = units.filter(
          (u) =>
            u.branch === branch &&
            (filter === 'Tất cả' || u.status === filter) &&
            `${u.barcode} ${u.model} ${u.variant}`.toLowerCase().includes(search.toLowerCase()),
        );
        return (
          <div className="page">
            <PageHeading
              eyebrow="KHO / BỘ TRANG PHỤC"
              title="Kho theo barcode"
              description="Quản lý tình trạng từng bộ, lịch xử lý và năng lực của chi nhánh."
              action={canManage ? <div className="feature-actions">
                <Button variant="secondary" onClick={() => go('transfers')}>Phiếu điều chuyển</Button>
                {realApiMode && <Button onClick={() => setShowCreateUnit((value) => !value)}>{showCreateUnit ? 'Đóng nhập bộ' : '＋ Nhập bộ mới'}</Button>}
              </div> : undefined}
            />
            {showCreateUnit && realApiMode && canManage && (
              <CreateInventoryUnitPanel
                scenario={scenario}
                branch={branch}
                onCreated={(unit) => {
                  setShowCreateUnit(false);
                  setSelected(unit);
                  retry();
                  setNotice(`Đã ghi nhận ${unit.barcode}; bộ đang chờ kiểm tra đầu vào.`);
                }}
              />
            )}
            <div className="feature-two-column">
              <div>
                <Panel title="Tra cứu bộ">
                  <BarcodeLookup
                    branch={branch}
                    scenario={scenario}
                    onFound={(unit) => {
                      selectUnit(unit);
                    }}
                    onError={() => setSelected(undefined)}
                  />
                  <FilterBar>
                    <SearchField label="Tìm barcode hoặc mẫu" value={search} onChange={setSearch} />
                    <SelectField
                      label="Trạng thái vận hành"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>Tất cả</option>
                      {Object.entries(unitStatusLabels).map(([code, label]) => (
                        <option value={code} key={code}>
                          {label}
                        </option>
                      ))}
                    </SelectField>
                  </FilterBar>
                </Panel>
                <Panel title={`${visible.length} bộ tại ${branch}`}>
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Barcode</th>
                          <th>Mẫu / biến thể</th>
                          <th>Chi nhánh</th>
                          <th>Vận hành</th>
                          <th>Khả dụng kỳ mẫu</th>
                          <th>Block</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((u) => (
                          <tr key={u.barcode}>
                            <td>
                              <button
                                className="text-link"
                                onClick={() => {
                                  selectUnit(u);
                                }}
                              >
                                {u.barcode}
                              </button>
                            </td>
                            <td>
                              {u.model}
                              <small>{u.variant}</small>
                            </td>
                            <td>{u.branch}</td>
                            <td>
                              <StatusLabel
                                text={unitStatusLabels[u.status]}
                                tone={
                                  u.status === 'READY'
                                    ? 'success'
                                    : u.status === 'REPAIR'
                                      ? 'danger'
                                      : 'warning'
                                }
                              />
                            </td>
                            <td>{u.available ? 'Có thể kiểm tra' : 'Không khả dụng'}</td>
                            <td>{u.blocks.filter((b) => b.status !== 'COMPLETED').length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!visible.length && <p className="muted">Không có bộ phù hợp bộ lọc.</p>}
                </Panel>
                <Panel title="Lịch xử lý tại chi nhánh" action={<Button type="button" variant="quiet" loading={blocksResource.loading} onClick={blocksResource.retry}>Tải lại</Button>}>
                  {blocksResource.error && <Feedback tone="danger" title="Không tải được lịch xử lý">{String(blocksResource.error)} <button type="button" className="text-button" onClick={blocksResource.retry}>Thử lại</button></Feedback>}
                  {blocksResource.loading ? <p className="muted" role="status">Đang tải lịch…</p> : (
                    <div className="responsive-table">
                      <table>
                        <thead><tr><th>Barcode</th><th>Công việc</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {(blocksResource.data ?? []).map((block) => <tr key={block.id}>
                            <td>{block.unitCode || 'Bộ trang phục'}</td>
                            <td>{blockTypeLabels[block.type]}<small>{block.reason}</small></td>
                            <td>{new Date(block.from).toLocaleString('vi-VN')}<small>đến {new Date(block.until).toLocaleString('vi-VN')}</small></td>
                            <td><StatusLabel text={blockStatusLabels[block.status]} tone={block.status === 'COMPLETED' ? 'success' : block.status === 'CANCELLED' ? 'neutral' : block.status === 'IN_PROGRESS' ? 'warning' : 'info'} /></td>
                          <td>{canManage && block.status === 'PLANNED' && <div className="catalog-media-card__actions"><Button type="button" variant="quiet" disabled={busy} onClick={() => void updateBlock(block, 'start')}>Bắt đầu</Button><Button type="button" variant="quiet" disabled={busy} onClick={() => { const unit = units.find((candidate) => candidate.apiId === block.unitId); if (unit) selectUnit(unit); setEditingBlock(block); setBlockType(block.type); setFrom(toLocalDateTimeInput(block.from)); setUntil(toLocalDateTimeInput(block.until)); setReason(block.reason); setEffort(String(block.estimatedEffortMinutes ?? 60)); setBlockCost(block.costVnd === undefined ? '' : String(block.costVnd)); setCapacityWindowId(block.capacityWindowId ?? ''); }}>Chỉnh lịch</Button><Button type="button" variant="quiet" disabled={busy} onClick={() => { setCancelTarget(block); setCancelReason(''); }}>Hủy lịch</Button></div>}{canManage && block.status === 'IN_PROGRESS' && <Button type="button" variant="secondary" loading={busy} onClick={() => void updateBlock(block, 'complete')}>Hoàn tất</Button>}</td>
                          </tr>)}
                        </tbody>
                      </table>
                      {!blocksResource.data?.length && <p className="muted">Chi nhánh chưa có lịch xử lý.</p>}
                    </div>
                  )}
                </Panel>
              </div>
              <div ref={detailRef} tabIndex={-1} role="region" aria-label="Chi tiết bộ đang chọn">
                {selected ? (
                  <>
                    <UnitDetailPanel unit={selected} />
                    {canManage && (
                      <Panel title="Cập nhật tình trạng bộ">
                        {realApiMode && selected.apiId ? (
                          selected.status === 'INBOUND' ? (
                            <div className="stack-form">
                              <p className="muted">Kiểm tra tình trạng trước khi đưa bộ vào sử dụng.</p>
                              <SelectField label="Tình trạng kiểm tra" value={inspectionGrade} onChange={(event) => setInspectionGrade(event.target.value as typeof inspectionGrade)}>
                                <option value="NEW">Mới</option><option value="GOOD">Tốt</option><option value="FAIR">Cần theo dõi</option><option value="POOR">Kém</option><option value="DAMAGED">Hư hỏng</option>
                              </SelectField>
                              <TextAreaField label="Ghi chú kiểm tra" value={operationNotes} onChange={(event) => setOperationNotes(event.target.value)} />
                              <div className="feature-actions">
                                <Button loading={busy} onClick={() => void updateUnit(() => inspectInventoryUnit(selected.apiId!, { conditionGrade: inspectionGrade, nextStatus: 'READY', notes: operationNotes.trim() || undefined }), 'Đã kiểm tra và đưa bộ vào trạng thái sẵn sàng.')}>Đạt · sẵn sàng</Button>
                                <Button variant="secondary" loading={busy} onClick={() => void updateUnit(() => inspectInventoryUnit(selected.apiId!, { conditionGrade: inspectionGrade, nextStatus: 'REPAIR', notes: operationNotes.trim() || undefined }), 'Đã ghi nhận kiểm tra; bộ cần sửa chữa.')}>Cần sửa</Button>
                              </div>
                            </div>
                          ) : selected.status === 'READY' || selected.status === 'CLEANING' || selected.status === 'REPAIR' ? (
                            <div className="stack-form">
                              <SelectField label="Chuyển trạng thái" value={effectiveUnitTarget} onChange={(event) => setUnitTargetStatus(event.target.value as typeof unitTargetStatus)}>
                                {(selected.status === 'READY' ? ['CLEANING', 'REPAIR'] : selected.status === 'CLEANING' ? ['READY', 'REPAIR'] : ['READY']).map((status) => <option key={status} value={status}>{unitStatusLabels[status as Unit['status']]}</option>)}
                              </SelectField>
                              <TextAreaField label="Ghi chú" value={operationNotes} onChange={(event) => setOperationNotes(event.target.value)} />
                              <Button loading={busy} onClick={() => void updateUnit(() => changeInventoryUnitStatus(selected.apiId!, { targetStatus: effectiveUnitTarget, notes: operationNotes.trim() || undefined }), `Đã chuyển bộ sang ${unitStatusLabels[effectiveUnitTarget]}.`)}>Cập nhật trạng thái</Button>
                            </div>
                          ) : <p className="muted">Bộ đang điều chuyển hoặc đã ngừng sử dụng nên không thể đổi trạng thái tại đây.</p>
                        ) : <p className="muted">Thao tác vòng đời bộ cần kết nối API và quyền quản lý kho.</p>}
                        {realApiMode && selected.apiId && selected.status !== 'RETIRED' && selected.status !== 'IN_TRANSFER' && <Button type="button" variant="quiet" disabled={busy} onClick={() => { setRetirementNotes(''); setRetirementOpen(true); }}>Ngừng sử dụng bộ</Button>}
                        {issue && <Feedback tone="danger" title="Thao tác chưa hoàn tất">{issue}</Feedback>}
                        {notice && <Feedback tone="success" title="Đã cập nhật">{notice}</Feedback>}
                      </Panel>
                    )}
                    {canManage && (
                      <Panel title={editingBlock ? 'Chỉnh lịch xử lý' : 'Tạo lịch xử lý cho bộ'} action={editingBlock ? <Button type="button" variant="quiet" onClick={() => setEditingBlock(undefined)}>Bỏ chỉnh sửa</Button> : undefined}>
                        <p className="muted">
                          {realApiMode
                            ? 'Tạo block sẽ gửi thời gian, loại block và lý do lên backend để giữ lịch khả dụng nhất quán.'
                            : 'Fixture hỗ trợ vệ sinh, sửa chữa và kiểm tra. Việc block có thể ảnh hưởng lịch còn bộ.'}
                        </p>
                        <SelectField
                          label="Loại block"
                          value={blockType}
                          onChange={(e) => setBlockType(e.target.value as UnitBlock['type'])}
                        >
                          <option value="CLEANING">Vệ sinh</option>
                          <option value="REPAIR">Sửa chữa</option>
                          <option value="INSPECTION">Kiểm tra</option>
                          <option value="ALTERATION">Chỉnh sửa</option>
                          <option value="INTERNAL_USE">Sử dụng nội bộ</option>
                          <option value="MANUAL">Chặn lịch thủ công</option>
                          <option value="OTHER">Khác</option>
                        </SelectField>
                        <div className="feature-filters">
                          <Field
                            type="datetime-local"
                            label="Từ"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                          />
                          <Field
                            type="datetime-local"
                            label="Đến"
                            value={until}
                            onChange={(e) => setUntil(e.target.value)}
                          />
                        </div>
                        <div className="feature-filters">
                          <Field label="Thời lượng dự kiến (phút)" type="number" min="1" max="10080" value={effort} onChange={(event) => setEffort(event.target.value)} />
                          <Field label="Chi phí dự kiến (đ)" type="number" min="0" step="1000" value={blockCost} onChange={(event) => setBlockCost(event.target.value)} />
                        </div>
                        {realApiMode && (capacityResource.data?.length ?? 0) > 0 && <SelectField label="Khung năng lực (nếu có)" value={capacityWindowId} onChange={(event) => setCapacityWindowId(event.target.value)}><option value="">Không gắn khung</option>{capacityResource.data?.map((window) => <option key={window.id} value={window.id}>{new Date(window.startsAt).toLocaleString('vi-VN')} · {window.availableMinutes} phút</option>)}</SelectField>}
                        <TextAreaField
                          label="Lý do"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <Button loading={busy} disabled={!canManage || (realApiMode && !selected.apiId)} onClick={() => void addBlock()}>
                          {editingBlock ? 'Lưu lịch xử lý' : realApiMode ? 'Tạo lịch xử lý' : 'Tạo block fixture'}
                        </Button>
                        <InlineIssue text={issue} conflict={scenario === 'conflict' || scenario === 'version'} />
                      </Panel>
                    )}
                  </>
                ) : (
                  <Panel title="Chọn một bộ">
                    <p className="muted">Chọn dòng hoặc quét barcode để xem block và lịch sử bộ.</p>
                  </Panel>
                )}
              </div>
            </div>
            <Panel title={`Năng lực xử lý · ${branch}`}>
              {capacityResource.error && <Feedback tone="danger" title="Không tải được năng lực xử lý">{String(capacityResource.error)} <button type="button" className="text-button" onClick={capacityResource.retry}>Thử lại</button></Feedback>}
              {capacityResource.loading ? <p className="muted" role="status">Đang tải khung năng lực…</p> : (
                <div className="feature-card-list">
                  {(capacityResource.data ?? []).map((window: CapacityWindowRecord) => <div className="feature-list-row" key={window.id}>
                    <strong>{new Date(window.startsAt).toLocaleString('vi-VN')} – {new Date(window.endsAt).toLocaleString('vi-VN')}</strong>
                    <span>{window.availableMinutes} phút năng lực</span>
                    {window.notes && <small>{window.notes}</small>}
                    {canManage && <div className="catalog-media-card__actions"><Button type="button" variant="quiet" disabled={busy} onClick={() => { setEditingWindow(window); setWindowStart(toLocalDateTimeInput(window.startsAt)); setWindowEnd(toLocalDateTimeInput(window.endsAt)); setWindowMinutes(String(window.availableMinutes)); setWindowNotes(window.notes ?? ''); }}>Điều chỉnh</Button><Button type="button" variant="quiet" disabled={busy} onClick={() => setDeleteWindowTarget(window)}>Xóa khung</Button></div>}
                  </div>)}
                  {!capacityResource.data?.length && <p className="muted">Chưa khai báo khung năng lực.</p>}
                </div>
              )}
              {canManage && realApiMode && <form className="stack-form" onSubmit={(event) => void addCapacityWindow(event)}>
                <h3>{editingWindow ? 'Điều chỉnh khung năng lực' : 'Thêm khung năng lực'}</h3>
                <div className="feature-filters">
                  <Field label="Bắt đầu" type="datetime-local" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                  <Field label="Kết thúc" type="datetime-local" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                  <Field label="Phút có thể xử lý" type="number" min="1" max="100800" value={windowMinutes} onChange={(event) => setWindowMinutes(event.target.value)} />
                </div>
                <Field label="Ghi chú" value={windowNotes} onChange={(event) => setWindowNotes(event.target.value)} />
                <div className="feature-actions"><Button type="submit" loading={busy}>{editingWindow ? 'Cập nhật khung' : 'Lưu năng lực chi nhánh'}</Button>{editingWindow && <Button type="button" variant="quiet" disabled={busy} onClick={() => setEditingWindow(undefined)}>Hủy chỉnh sửa</Button>}</div>
              </form>}
            </Panel>
            {retirementOpen && selected && <ConfirmDialog title="Ngừng sử dụng bộ này?" confirmText="Ngừng sử dụng" danger loading={busy} confirmDisabled={!retirementNotes.trim()} onClose={() => setRetirementOpen(false)} onConfirm={() => void updateUnit(async () => {
              const updated = await retireInventoryUnit(selected.apiId!, retirementNotes.trim());
              setRetirementOpen(false);
              return updated;
            }, 'Bộ đã được ngừng sử dụng.') }>
              <p>Bộ sẽ không còn được đưa vào lịch thuê. Chỉ thực hiện khi đã xác nhận không có đơn, điều chuyển hoặc lịch xử lý đang mở.</p>
              <TextAreaField label="Lý do bắt buộc" required value={retirementNotes} onChange={(event) => setRetirementNotes(event.target.value)} />
            </ConfirmDialog>}
            {deleteWindowTarget && <ConfirmDialog title="Xóa khung năng lực?" confirmText="Xóa khung" danger loading={busy} onClose={() => setDeleteWindowTarget(undefined)} onConfirm={() => void confirmDeleteCapacityWindow()}>
              <p>Thao tác này gỡ khung khỏi lịch năng lực chi nhánh. Lịch xử lý đang gắn với khung vẫn được giữ lại nhưng sẽ không còn liên kết.</p>
              <p><strong>{new Date(deleteWindowTarget.startsAt).toLocaleString('vi-VN')} – {new Date(deleteWindowTarget.endsAt).toLocaleString('vi-VN')}</strong></p>
            </ConfirmDialog>}
            {cancelTarget && <ConfirmDialog title="Hủy lịch xử lý?" confirmText="Hủy lịch" danger loading={busy} confirmDisabled={!cancelReason.trim()} onClose={() => setCancelTarget(undefined)} onConfirm={() => void confirmCancelBlock()}>
              <p>Lịch sẽ chuyển sang trạng thái đã hủy và vẫn còn trong lịch sử bộ.</p>
              <TextAreaField label="Lý do hủy" required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            </ConfirmDialog>}
          </div>
        );
      }}
    </StateGate>
  );
}

export function TransfersPage({ scenario, branch, canManage = true }: { scenario: DemoScenario; branch: string; canManage?: boolean }) {
  const loadTransfers = useCallback(
    (currentScenario: DemoScenario) => studioAdapter.transfers(currentScenario, branch),
    [branch],
  );
  const realApiMode = apiEnabled && hasAccessToken();
  const { options: branchOptions, ready: branchesReady, error: branchesError, retry: retryBranches } = useBranchOptions();
  const { loading, error, data, retry } = useFixtureResource(scenario, loadTransfers, branch);
  const [selected, setSelected] = useState('DC-001');
  const [from, setFrom] = useState(branch);
  const [to, setTo] = useState(realApiMode ? '' : branch === 'Chi nhánh Quận 1' ? 'Chi nhánh Thủ Đức' : 'Chi nhánh Quận 1');
  const [unitCodeEntry, setUnitCodeEntry] = useState(() => ({
    apiMode: realApiMode,
    value: realApiMode ? '' : 'BC-012',
  }));
  const unitCode = unitCodeEntry.apiMode === realApiMode
    ? unitCodeEntry.value
    : realApiMode ? '' : 'BC-012';
  const setUnitCode = (value: string) => setUnitCodeEntry({ apiMode: realApiMode, value });
  const [note, setNote] = useState('');
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { detailRef, revealDetail } = useMobileDetailReveal<HTMLDivElement>();
  const sourceBranch = realApiMode ? branch : from;
  const destinationOptions = branchOptions.filter((name) => name !== sourceBranch);
  const destinationBranch = realApiMode
    ? destinationOptions.includes(to) ? to : destinationOptions[0] ?? ''
    : to;
  const save = async (value: Transfer) => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await studioAdapter.saveTransfer(value, scenario);
      setSelected(result.code);
      revealDetail();
      setNote('');
      setNotice(`Đã tạo ${result.code}; chờ duyệt trước khi xuất bộ.`);
      retry();
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không lưu được phiếu.');
    } finally {
      setBusy(false);
    }
  };
  const advance = async (transfer: Transfer, next: TransferStatus) => {
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      const result = await studioAdapter.advanceTransfer(
        transfer.code,
        next,
        Object.entries(checks).map(([barcode, grade]) => ({ barcode, in: grade })),
        reason,
        scenario,
        transfer,
      );
      setNotice(
        next === 'RECEIVED'
          ? `Đã nhận ${result.units.filter((item) => item.received).length}/${result.units.length} bộ. ${result.status === 'RECEIVED' ? 'Phiếu đã nhận đủ.' : 'Các bộ còn lại vẫn đang vận chuyển.'}`
          : `Phiếu ${transfer.code} đã chuyển sang ${transferStatus[next]}.`,
      );
      setChecks({});
      retry();
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không đổi được trạng thái.');
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
      emptyTitle="Chưa có phiếu điều chuyển"
    >
      {(transfers) => {
        const current = transfers.find((t) => t.code === selected) ?? transfers[0];
        return (
          <div className="page">
            <PageHeading
              eyebrow="KHO / ĐIỀU CHUYỂN"
              title="Điều chuyển chi nhánh"
              description="Yêu cầu → duyệt → xuất kho → kiểm từng bộ khi nhận. Bộ chỉ đổi chi nhánh sau bước nhận."
            />
            <div className="feature-two-column">
              <div>
                {canManage && <Panel title="Tạo yêu cầu">
                  <div className="feature-filters">
                    {realApiMode ? (
                      <div className="field">
                        <span>Chi nhánh xuất</span>
                        <strong>{sourceBranch}</strong>
                      </div>
                    ) : (
                      <BranchSelector
                        label="Chi nhánh xuất"
                        value={from}
                        options={branchOptions}
                        onChange={(value) => {
                          setFrom(value);
                          setTo(branchOptions.find((name) => name !== value) ?? '');
                        }}
                      />
                    )}
                    <BranchSelector
                      label="Chi nhánh nhận"
                      value={destinationBranch}
                      options={destinationOptions}
                      disabled={realApiMode && (!branchesReady || branchesError || destinationOptions.length === 0)}
                      onChange={setTo}
                    />
                    <Field
                      label="Barcode bộ sẵn sàng"
                      value={unitCode}
                      onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <TextAreaField
                    label="Lý do điều chuyển"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {realApiMode && branchesError && (
                    <Feedback tone="danger" title="Chưa tải được danh sách chi nhánh">
                      Không thể chọn nơi nhận.{' '}
                      <button type="button" className="text-button" onClick={retryBranches}>Thử lại</button>
                    </Feedback>
                  )}
                  <Button
                    disabled={busy || (realApiMode && (!branchesReady || branchesError || !destinationBranch))}
                    onClick={() => {
                      if (!unitCode.trim()) {
                        setIssue('Nhập barcode bộ cần điều chuyển.');
                        return;
                      }
                      if (sourceBranch === destinationBranch || !destinationBranch || !note.trim()) {
                        setIssue('Chọn hai chi nhánh khác nhau và nhập lý do.');
                        return;
                      }
                      void save({
                        code: `DC-DEMO-${transfers.length + 1}`,
                        from: sourceBranch,
                        to: destinationBranch,
                        status: 'REQUESTED',
                        units: [{ barcode: unitCode.trim() }],
                        note,
                        version: 1,
                        history: ['03/10 · Tạo yêu cầu fixture'],
                      });
                    }}
                  >
                    Tạo phiếu yêu cầu
                  </Button>
                </Panel>}
                <Panel title="Phiếu điều chuyển">
                  <div className="feature-card-list">
                    {transfers.map((t) => (
                      <button
                        className={`feature-list-row selectable ${current.code === t.code ? 'selected' : ''}`}
                        key={t.code}
                        onClick={() => {
                          setSelected(t.code);
                          setChecks({});
                          setNotice('');
                          revealDetail();
                        }}
                      >
                        <strong>
                          {t.code} · {transferStatus[t.status]}
                        </strong>
                        <span>
                          {t.from} → {t.to}
                        </span>
                        <small>{t.units.map((u) => u.barcode).join(', ')}</small>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>
              <div
                ref={detailRef}
                tabIndex={-1}
                role="region"
                aria-label="Chi tiết phiếu điều chuyển đang chọn"
              >
                <Panel title={current.code}>
                  <StatusLabel
                    text={transferStatus[current.status]}
                    tone={
                      current.status === 'RECEIVED'
                        ? 'success'
                        : current.status === 'REJECTED' || current.status === 'CANCELLED'
                          ? 'danger'
                          : 'warning'
                    }
                  />
                  <KeyFacts
                    rows={[
                      { label: 'Từ', value: current.from },
                      { label: 'Đến', value: current.to },
                      {
                        label: 'Đã nhận',
                        value: `${current.units.filter((item) => item.received).length}/${current.units.length} bộ`,
                      },
                      { label: 'Ghi chú', value: current.note },
                      { label: 'Phiên bản', value: current.version },
                    ]}
                  />
                  <h3>Kiểm từng bộ</h3>
                  {current.units.map((u) => (
                    <div className="feature-list-row" key={u.barcode}>
                      <strong>{u.barcode}</strong>
                      <span>
                        Tình trạng xuất: {u.out ? (conditionLabels[u.out] ?? u.out) : 'Chưa xuất'} ·
                        Nhận: {u.received ?? 'Chưa nhận'}
                      </span>
                      {canManage && current.status === 'IN_TRANSIT' && !u.received ? (
                        <SelectField
                          label={`Tình trạng nhận ${u.barcode}`}
                          value={checks[u.barcode] ?? ''}
                          onChange={(e) => setChecks({ ...checks, [u.barcode]: e.target.value })}
                        >
                          <option value="">Chưa kiểm</option>
                          <option value="GOOD">Tốt</option>
                          <option value="FAIR">Cần theo dõi</option>
                          <option value="DAMAGED">Hư hỏng</option>
                        </SelectField>
                      ) : (
                        <small>
                          Tình trạng nhận: {u.in ? (conditionLabels[u.in] ?? u.in) : '—'}
                        </small>
                      )}
                    </div>
                  ))}
                  {canManage && <div className="feature-actions">
                    {current.status === 'REQUESTED' && (
                      <Button disabled={busy} onClick={() => void advance(current, 'APPROVED')}>
                        Duyệt điều chuyển
                      </Button>
                    )}
                    {current.status === 'APPROVED' && (
                      <Button disabled={busy} onClick={() => void advance(current, 'IN_TRANSIT')}>
                        Kiểm và xuất bộ
                      </Button>
                    )}
                    {current.status === 'IN_TRANSIT' && (
                      <Button
                        disabled={
                          busy || !current.units.some((u) => !u.received && checks[u.barcode])
                        }
                        onClick={() => void advance(current, 'RECEIVED')}
                      >
                        Xác nhận nhận{' '}
                        {current.units.filter((u) => !u.received && checks[u.barcode]).length} bộ
                      </Button>
                    )}
                  </div>}
                  {canManage && current.status === 'REQUESTED' && (
                    <div className="destructive-area">
                      <TextAreaField
                        label="Lý do từ chối hoặc hủy"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div className="feature-actions">
                        <Button
                          variant="danger"
                          disabled={!reason.trim() || busy}
                          onClick={() => void advance(current, 'REJECTED')}
                        >
                          Từ chối
                        </Button>
                        <Button
                          variant="quiet"
                          disabled={!reason.trim() || busy}
                          onClick={() => void advance(current, 'CANCELLED')}
                        >
                          Hủy phiếu
                        </Button>
                      </div>
                    </div>
                  )}
                  {canManage && current.status === 'APPROVED' && (
                    <div className="destructive-area">
                      <Button variant="quiet" onClick={() => void advance(current, 'CANCELLED')}>
                        Hủy trước khi xuất
                      </Button>
                    </div>
                  )}
                  <h3>Lịch sử</h3>
                  <Timeline items={current.history} />
                </Panel>
                <InlineIssue
                  text={issue}
                  conflict={scenario === 'conflict' || scenario === 'version'}
                />
                {notice && (
                  <Feedback tone="success" title="Đã cập nhật phiếu">
                    {notice}
                  </Feedback>
                )}
                {scenario === 'unitBlocked' && (
                  <Feedback tone="warning" title="Bộ bị block">
                    Bộ đang vệ sinh hoặc sửa chữa không được xuất.
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
