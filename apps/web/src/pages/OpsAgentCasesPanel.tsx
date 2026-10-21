import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeOpsAgentCase,
  ApiClientError,
  approveOpsAgentAction,
  claimOpsAgentCase,
  confirmOpsAgentCase,
  getOpsAgentCase,
  listOpsAgentCases,
  opsAgentActionOutcomeUnknown,
  prepareOpsAgentConfirmation,
  prepareOpsAgentOverdueFollowUp,
  rejectOpsAgentAction,
  rejectOpsAgentConfirmation,
  releaseOpsAgentCase,
  type OpsAgentCaseResult,
  type OpsAgentFollowUpChannel,
  type OpsAgentFollowUpOutcome,
  type OpsAgentOption,
} from '../api/client';
import { AssistantMarkdown } from '../components/AssistantMarkdown';
import { Button, ConfirmDialog, EmptyState, Feedback } from '../components/ui';

type SeverityFilter = 'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type OwnershipFilter = 'all' | 'unassigned' | 'mine';
type StateFilter =
  | 'all'
  | 'ANALYZING'
  | 'WAITING_CONFIRMATION'
  | 'WAITING_APPROVAL'
  | 'MONITORING'
  | 'SUCCEEDED'
  | 'HANDED_OFF';

const findingLabels: Record<string, string> = {
  PREVIOUS_RENTAL_NOT_RETURNED: 'Đơn trước chưa trả',
  ALLOCATED_UNIT_NOT_READY: 'Bộ chưa sẵn sàng',
  ORDER_PREPARATION_DELAYED: 'Chuẩn bị có nguy cơ trễ',
  RENTAL_RETURN_OVERDUE: 'Đơn thuê quá hạn',
  OPERATIONAL_CAPACITY_SHORTFALL: 'Thiếu năng lực xử lý',
  UNIT_SCHEDULE_CONFLICT: 'Trùng lịch bộ trang phục',
};

const findingGuidance: Record<string, string> = {
  PREVIOUS_RENTAL_NOT_RETURNED:
    'Đơn trước vẫn giữ bộ hoặc khoảng dự phòng trả trễ và vệ sinh không còn đủ trước giờ nhận kế tiếp.',
  ALLOCATED_UNIT_NOT_READY:
    'Bộ đã gán đang sai chi nhánh, còn lịch vệ sinh/sửa chữa/chuyển kho hoặc chưa có thời điểm sẵn sàng đáng tin cậy.',
  ORDER_PREPARATION_DELAYED:
    'Đơn sắp đến giờ nhận nhưng khâu chuẩn bị chưa hoàn tất theo trạng thái hệ thống.',
  RENTAL_RETURN_OVERDUE: 'Đơn đã qua hạn trả và vẫn còn bộ đang được ghi nhận là khách giữ.',
  OPERATIONAL_CAPACITY_SHORTFALL:
    'Đây là thiếu phút công so với khung năng lực xử lý đã khai báo. Hệ thống chưa đọc ca làm hoặc kỹ năng từng nhân viên nên chưa thể kết luận thiếu nhân sự.',
  UNIT_SCHEDULE_CONFLICT:
    'Hai đơn đang cùng giữ một bộ trong các khoảng thời gian bảo vệ bị chồng lấn.',
};

const statusLabels: Record<string, string> = {
  NEW: 'Mới',
  ANALYZING: 'Đang xử lý',
  PLAN_READY: 'Có phương án',
  WAITING_INPUT: 'Cần thêm thông tin',
  WAITING_CONFIRMATION: 'Chờ xác nhận',
  WAITING_APPROVAL: 'Chờ duyệt',
  EXECUTING: 'Đang thực hiện',
  MONITORING: 'Đang theo dõi',
  SUCCEEDED: 'Thành công',
  INSUFFICIENT_DATA: 'Thiếu dữ liệu',
  HANDED_OFF: 'Cần bàn giao',
  FAILED: 'Cần phân tích lại',
  CANCELLED: 'Đã hủy',
};

const severityLabels: Record<string, string> = {
  CRITICAL: 'Khẩn cấp',
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

const stateFilters: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'ANALYZING', label: 'Đang xử lý' },
  { value: 'WAITING_CONFIRMATION', label: 'Chờ xác nhận' },
  { value: 'WAITING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'MONITORING', label: 'Đang theo dõi' },
  { value: 'SUCCEEDED', label: 'Thành công' },
  { value: 'HANDED_OFF', label: 'Cần bàn giao' },
];

function labelForFinding(ruleCode?: string) {
  if (!ruleCode) return 'Cảnh báo vận hành';
  return findingLabels[ruleCode] ?? ruleCode.replaceAll('_', ' ').toLocaleLowerCase('vi');
}

type WorkflowStepState = 'complete' | 'current' | 'waiting' | 'replan' | 'blocked';
interface OpsWorkflowStep {
  id: 'detect' | 'predict' | 'simulate' | 'recommend' | 'execute' | 'monitor';
  label: string;
  state: WorkflowStepState;
  detail: string;
}

// Exported pure mapping keeps the progress UI aligned with the server state machine.
// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentWorkflowSteps(result?: OpsAgentCaseResult): OpsWorkflowStep[] {
  const state = result?.state?.toUpperCase();
  const analysis = result?.analysis;
  const stale = analysis?.status === 'STALE' || state === 'FAILED';
  const hasAnalysis = Boolean(analysis && !stale);
  const hasRecommendation = Boolean(
    hasAnalysis &&
    analysis?.recommendedOptionId &&
    analysis.options.some((option) => option.optionId === analysis.recommendedOptionId),
  );
  const hasExecuted = ['EXECUTING', 'MONITORING', 'SUCCEEDED'].includes(state ?? '');

  return [
    {
      id: 'detect',
      label: 'Phát hiện',
      state: result?.finding ? 'complete' : 'waiting',
      detail: result?.finding ? labelForFinding(result.finding.ruleCode) : 'Chưa có cảnh báo',
    },
    {
      id: 'predict',
      label: 'Đánh giá rủi ro',
      state: stale
        ? 'replan'
        : hasAnalysis
          ? 'complete'
          : state === 'ANALYZING'
            ? 'current'
            : 'waiting',
      detail: stale
        ? 'Dữ liệu đổi; cần đánh giá lại'
        : analysis?.riskLevel
          ? `Mức ${formatRiskLevel(analysis.riskLevel)}`
          : hasAnalysis
            ? 'Đã đọc dữ liệu hiện tại'
            : state === 'ANALYZING'
              ? 'Đang phân tích'
              : 'Chờ nhận xử lý và phân tích',
    },
    {
      id: 'simulate',
      label: 'Giả lập',
      state: stale
        ? 'replan'
        : hasAnalysis && analysis?.options.length
          ? 'complete'
          : hasAnalysis && analysis?.outcome === 'NO_FEASIBLE_OPTION'
            ? 'blocked'
            : state === 'ANALYZING'
              ? 'current'
              : 'waiting',
      detail: stale
        ? 'Kết quả cũ không dùng được'
        : analysis?.options.length
          ? `${analysis.options.length} phương án được đánh giá`
          : analysis?.outcome === 'NO_FEASIBLE_OPTION'
            ? 'Không có phương án khả thi'
            : 'Chưa có kết quả giả lập',
    },
    {
      id: 'recommend',
      label: 'Đề xuất',
      state: stale
        ? 'replan'
        : hasRecommendation
          ? 'complete'
          : analysis?.outcome === 'NO_FEASIBLE_OPTION'
            ? 'blocked'
            : state === 'ANALYZING'
              ? 'current'
              : 'waiting',
      detail: stale
        ? 'Phân tích lại trước khi dùng'
        : hasRecommendation
          ? 'Đã xếp hạng phương án'
          : analysis?.outcome === 'NO_FEASIBLE_OPTION'
            ? 'Cần nhân viên quyết định hoặc bàn giao'
            : 'Chưa có đề xuất',
    },
    {
      id: 'execute',
      label: 'Xác nhận & thực thi',
      state: stale
        ? 'replan'
        : result?.pendingApproval || result?.pendingConfirmation || state === 'EXECUTING'
          ? 'current'
          : hasExecuted
            ? 'complete'
            : hasRecommendation
              ? 'current'
              : 'waiting',
      detail: result?.pendingApproval
        ? 'Đang chờ người có quyền duyệt'
        : result?.pendingConfirmation
          ? 'Đang chờ bạn xác nhận'
          : state === 'EXECUTING'
            ? 'Đang gửi thao tác đã duyệt'
            : hasExecuted
              ? 'Đã gửi thao tác'
              : hasRecommendation
                ? 'Chờ nhân viên xác nhận phương án'
                : 'Chưa sẵn sàng thực thi',
    },
    {
      id: 'monitor',
      label: 'Theo dõi kết quả',
      state: stale
        ? 'replan'
        : state === 'SUCCEEDED'
          ? 'complete'
          : state === 'MONITORING'
            ? 'current'
            : ['HANDED_OFF', 'INSUFFICIENT_DATA', 'CANCELLED'].includes(state ?? '')
              ? 'blocked'
              : 'waiting',
      detail: stale
        ? 'Cần đọc lại dữ liệu và lập kế hoạch mới'
        : state === 'SUCCEEDED'
          ? 'Đã xác minh đạt kết quả'
          : state === 'MONITORING'
            ? 'Đang kiểm tra lại trạng thái API'
            : state === 'HANDED_OFF'
              ? 'Đã chuyển người phụ trách'
              : state === 'INSUFFICIENT_DATA'
                ? 'Thiếu dữ liệu để xác minh'
                : state === 'CANCELLED'
                  ? 'Tình huống đã được hủy'
                  : 'Bắt đầu sau khi thực thi',
    },
  ];
}

function formatRiskScore(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)}/100`
    : undefined;
}

function formatRiskLevel(value?: string | null) {
  if (!value) return undefined;
  return severityLabels[value] ?? (value === 'UNKNOWN' ? 'Chưa xác định' : value);
}

function labelForState(state: string) {
  return statusLabels[state] ?? 'Cần kiểm tra trạng thái';
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    return undefined;
  const text = String(value).trim();
  if (!text || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text) || text.includes('@')) return undefined;
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function evidenceRows(caseData: OpsAgentCaseResult) {
  const evidence = caseData.finding?.evidence;
  const flatten = (
    record: Record<string, unknown>,
    prefix = '',
    depth = 0,
  ): { key: string; value: string }[] =>
    Object.entries(record).flatMap(([key, value]) => {
      if (/(^id$|_id$|uuid|email|phone|customer|actor|token|secret|password)/i.test(key)) return [];
      const label = prefix ? `${prefix}.${key}` : key;
      const text = safeText(value);
      if (text) return [{ key: label, value: text }];
      if (depth < 2 && value && typeof value === 'object' && !Array.isArray(value))
        return flatten(value as Record<string, unknown>, label, depth + 1);
      return [];
    });
  return evidence ? flatten(evidence) : [];
}

function ownershipFor(caseData: OpsAgentCaseResult) {
  return caseData.ownership ?? 'UNCLAIMED';
}

function formatDate(value?: string | null, fallback = 'Chưa có dữ liệu') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Thời điểm chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Chưa có dữ liệu';
  if (value < 60) return `${Math.round(value)} phút`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function formatCost(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Chưa có dữ liệu';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

function optionRisk(option: OpsAgentOption) {
  if (option.riskSummary) return option.riskSummary;
  if (option.riskLevel) return option.riskLevel;
  if (typeof option.riskScore === 'number') return `Điểm ${option.riskScore}`;
  if (option.risks?.length) {
    return option.risks
      .map((risk) =>
        typeof risk === 'string' ? risk : (safeText(risk.summary) ?? safeText(risk.label)),
      )
      .filter(Boolean)
      .join(' · ');
  }
  return 'Chưa có dữ liệu';
}

function optionTitle(option: OpsAgentOption, index: number) {
  return (
    safeText(option.actionPreview?.title) ??
    safeText(option.actionPreview?.summary) ??
    `Phương án ${option.rank ?? index + 1}`
  );
}

function optionDescription(option: OpsAgentOption) {
  return (
    safeText(option.actionPreview?.description) ??
    safeText(option.actionPreview?.rationale) ??
    safeText(option.actionPreview?.reason)
  );
}

function actionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409 || error.code === 'AGENT_CASE_CONFLICT')
      return 'Dữ liệu liên quan vừa thay đổi. Kế hoạch cũ không còn hiệu lực; tải lại và phân tích lại trước khi xác nhận.';
    return error.message;
  }
  return 'Không thể hoàn tất thao tác. Hãy tải lại trạng thái trước khi thử tiếp.';
}

function replaceCase(cases: OpsAgentCaseResult[], updated: OpsAgentCaseResult) {
  const index = cases.findIndex((item) => item.caseId === updated.caseId);
  if (index < 0) return [updated, ...cases];
  return cases.map((item) => (item.caseId === updated.caseId ? updated : item));
}

export function OpsAgentCasesPanel({ branchId }: { branchId?: string }) {
  const [cases, setCases] = useState<OpsAgentCaseResult[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedCase, setSelectedCase] = useState<OpsAgentCaseResult>();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState<string>();
  const [confirmingExecution, setConfirmingExecution] = useState(false);
  const [actionOutcomeUnknown, setActionOutcomeUnknown] = useState(false);
  const defaultFollowUp = {
    channel: 'IN_PERSON' as OpsAgentFollowUpChannel,
    outcome: 'CONTACTED' as OpsAgentFollowUpOutcome,
    occurredAt: '',
    promisedReturnAt: '',
    nextFollowUpAt: '',
  };
  const [followUpDraft, setFollowUpDraft] = useState({ caseId: '', ...defaultFollowUp });
  const followUp = followUpDraft.caseId === selectedId ? followUpDraft : defaultFollowUp;
  const updateFollowUp = (update: (draft: typeof defaultFollowUp) => typeof defaultFollowUp) => {
    setFollowUpDraft((current) => ({
      caseId: selectedId,
      ...update(current.caseId === selectedId ? current : defaultFollowUp),
    }));
  };
  const requestRevision = useRef(0);
  const selectedIdRef = useRef('');
  const detailRevision = useRef(0);

  const reloadList = useCallback(
    async (preserveSelected = true) => {
      if (!branchId) {
        setCases([]);
        setNextCursor(null);
        setSelectedId('');
        setSelectedCase(undefined);
        setError('');
        return;
      }
      const revision = ++requestRevision.current;
      setLoading(true);
      setLoadingMore(false);
      setError('');
      if (!preserveSelected) {
        setCases([]);
        setNextCursor(null);
        setLastCheckedAt(undefined);
        selectedIdRef.current = '';
        setSelectedId('');
        setSelectedCase(undefined);
      }
      try {
        const result = await listOpsAgentCases(branchId, {
          ownership: ownershipFilter,
          state: stateFilter === 'all' ? undefined : stateFilter,
          limit: 50,
        });
        if (revision !== requestRevision.current) return;
        setCases(result.items);
        setNextCursor(result.nextCursor);
        const previousId = selectedIdRef.current;
        const nextId =
          preserveSelected && result.items.some((item) => item.caseId === previousId)
            ? previousId
            : (result.items[0]?.caseId ?? '');
        selectedIdRef.current = nextId;
        setSelectedId(nextId);
        setSelectedCase(result.items.find((item) => item.caseId === nextId));
      } catch (loadError) {
        if (revision === requestRevision.current) setError(actionError(loadError));
      } finally {
        if (revision === requestRevision.current) setLoading(false);
      }
    },
    [branchId, ownershipFilter, stateFilter],
  );

  const loadMore = useCallback(async () => {
    if (!branchId || !nextCursor || loading || loadingMore) return;
    const revision = requestRevision.current;
    setLoadingMore(true);
    setError('');
    try {
      const result = await listOpsAgentCases(branchId, {
        ownership: ownershipFilter,
        state: stateFilter === 'all' ? undefined : stateFilter,
        cursor: nextCursor,
        limit: 50,
      });
      if (revision !== requestRevision.current) return;
      setCases((current) => {
        const knownIds = new Set(current.map((item) => item.caseId));
        return [...current, ...result.items.filter((item) => !knownIds.has(item.caseId))];
      });
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      if (revision === requestRevision.current) setError(actionError(loadError));
    } finally {
      if (revision === requestRevision.current) setLoadingMore(false);
    }
  }, [branchId, loading, loadingMore, nextCursor, ownershipFilter, stateFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reloadList(false), 0);
    return () => {
      window.clearTimeout(timer);
      requestRevision.current += 1;
    };
  }, [reloadList]);

  const loadSelected = useCallback(
    async (caseId: string, options: { silent?: boolean } = {}) => {
      if (!branchId || !caseId) return;
      const revision = ++detailRevision.current;
      if (!options.silent) {
        setDetailLoading(true);
        setNotice('');
      }
      try {
        const detail = await getOpsAgentCase(caseId, branchId);
        if (revision !== detailRevision.current || selectedIdRef.current !== caseId) return;
        setSelectedCase(detail);
        setLastCheckedAt(new Date().toISOString());
        setActionOutcomeUnknown(false);
        setNotice('');
        setCases((current) => replaceCase(current, detail));
      } catch (loadError) {
        if (revision === detailRevision.current) setNotice(actionError(loadError));
      } finally {
        if (revision === detailRevision.current && !options.silent) setDetailLoading(false);
      }
    },
    [branchId],
  );

  const visibleCases = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('vi');
    return cases
      .filter((item) => {
        if (severityFilter !== 'all' && item.finding?.severity !== severityFilter) return false;
        if (!normalized) return true;
        const haystack = [
          labelForFinding(item.finding?.ruleCode),
          item.message,
          item.finding?.ruleCode,
          item.finding?.status,
          ...(item.relatedOrders ?? []).map((order) => order.orderCode),
          ...(item.relatedUnits ?? []).map((unit) => unit.unitCode),
        ]
          .join(' ')
          .toLocaleLowerCase('vi');
        return haystack.includes(normalized);
      })
      .sort((left, right) => {
        const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const severityDifference =
          (severityOrder[left.finding?.severity ?? ''] ?? 4) -
          (severityOrder[right.finding?.severity ?? ''] ?? 4);
        if (severityDifference) return severityDifference;
        const leftDeadline = left.deadlineAt
          ? Date.parse(left.deadlineAt)
          : Number.POSITIVE_INFINITY;
        const rightDeadline = right.deadlineAt
          ? Date.parse(right.deadlineAt)
          : Number.POSITIVE_INFINITY;
        return leftDeadline - rightDeadline;
      });
  }, [cases, search, severityFilter]);

  const isSelectedVisible = visibleCases.some((item) => item.caseId === selectedId);
  const current = isSelectedVisible
    ? selectedCase?.caseId === selectedId
      ? selectedCase
      : visibleCases.find((item) => item.caseId === selectedId)
    : undefined;
  const finding = current?.finding;
  const analysis = current?.analysis;
  const recommended = analysis?.options.find(
    (option) => option.optionId === analysis.recommendedOptionId,
  );
  const canExecuteRecommended = Boolean(
    analysis?.status === 'ACTIVE' &&
    analysis.outcome === 'READY' &&
    recommended?.feasible === true &&
    recommended.executable === true,
  );
  const requiresReplan = Boolean(analysis?.status === 'STALE' || current?.state === 'FAILED');
  const isTerminal = ['SUCCEEDED', 'CANCELLED', 'HANDED_OFF'].includes(current?.state ?? '');

  useEffect(() => {
    if (!branchId || !selectedId || current?.state !== 'MONITORING') return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === 'visible') await loadSelected(selectedId, { silent: true });
      if (active) timer = window.setTimeout(() => void poll(), 30_000);
    };
    timer = window.setTimeout(() => void poll(), 30_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [branchId, current?.state, loadSelected, selectedId]);

  const evidence = current ? evidenceRows(current) : [];
  const isOverdueFollowUp = finding?.ruleCode === 'RENTAL_RETURN_OVERDUE';
  const occurredAt = followUp.occurredAt ? new Date(followUp.occurredAt) : undefined;
  const promisedReturnAt = followUp.promisedReturnAt
    ? new Date(followUp.promisedReturnAt)
    : undefined;
  const nextFollowUpAt = followUp.nextFollowUpAt ? new Date(followUp.nextFollowUpAt) : undefined;
  const requiresPromisedReturn = followUp.outcome === 'PROMISED_RETURN';
  const requiresNextFollowUp = ['NO_ANSWER', 'REQUESTED_EXTENSION', 'REFUSED_RETURN'].includes(
    followUp.outcome,
  );
  const followUpValid = Boolean(
    occurredAt &&
    !Number.isNaN(occurredAt.getTime()) &&
    occurredAt <= new Date() &&
    (!requiresPromisedReturn ||
      (promisedReturnAt &&
        !Number.isNaN(promisedReturnAt.getTime()) &&
        promisedReturnAt > occurredAt &&
        promisedReturnAt > new Date())) &&
    (!requiresNextFollowUp ||
      (nextFollowUpAt &&
        !Number.isNaN(nextFollowUpAt.getTime()) &&
        nextFollowUpAt > occurredAt &&
        nextFollowUpAt > new Date())),
  );

  const runAction = useCallback(
    async (
      kind:
        | 'claim'
        | 'release'
        | 'analyze'
        | 'prepare'
        | 'prepare-overdue'
        | 'confirm'
        | 'reject-confirmation'
        | 'approve'
        | 'reject-approval',
    ) => {
      if (!branchId || !current?.version) return;
      setActionLoading(true);
      setNotice('');
      try {
        let updated: OpsAgentCaseResult;
        if (kind === 'claim')
          updated = await claimOpsAgentCase(current.caseId, branchId, current.version);
        else if (kind === 'release')
          updated = await releaseOpsAgentCase(current.caseId, branchId, current.version);
        else if (kind === 'analyze')
          updated = await analyzeOpsAgentCase(current.caseId, branchId, current.version);
        else if (kind === 'prepare') {
          if (!analysis) return;
          updated = await prepareOpsAgentConfirmation(current.caseId, branchId, {
            analysisId: analysis.analysisId,
            expectedVersion: current.version,
          });
        } else if (kind === 'prepare-overdue') {
          if (!analysis || !followUp.occurredAt) return;
          updated = await prepareOpsAgentOverdueFollowUp(current.caseId, branchId, {
            analysisId: analysis.analysisId,
            expectedVersion: current.version,
            channel: followUp.channel,
            outcome: followUp.outcome,
            occurredAt: new Date(followUp.occurredAt).toISOString(),
            ...(requiresPromisedReturn && followUp.promisedReturnAt
              ? { promisedReturnAt: new Date(followUp.promisedReturnAt).toISOString() }
              : {}),
            ...(requiresNextFollowUp && followUp.nextFollowUpAt
              ? { nextFollowUpAt: new Date(followUp.nextFollowUpAt).toISOString() }
              : {}),
          });
        } else if (kind === 'confirm') {
          if (!current.pendingConfirmation) return;
          updated = await confirmOpsAgentCase(
            current.caseId,
            current.pendingConfirmation.confirmationId,
            branchId,
          );
        } else if (kind === 'reject-confirmation') {
          if (!current.pendingConfirmation) return;
          updated = await rejectOpsAgentConfirmation(
            current.caseId,
            current.pendingConfirmation.confirmationId,
            branchId,
          );
        } else if (kind === 'approve') {
          if (!current.pendingApproval) return;
          updated = await approveOpsAgentAction(current.pendingApproval.approvalId, branchId);
        } else {
          if (!current.pendingApproval) return;
          updated = await rejectOpsAgentAction(current.pendingApproval.approvalId, branchId);
        }
        setSelectedCase(updated);
        setLastCheckedAt(new Date().toISOString());
        setCases((existing) => replaceCase(existing, updated));
        setNotice('');
        setConfirmingExecution(false);
      } catch (actionFailure) {
        const message = actionError(actionFailure);
        setNotice(message);
        if (
          actionFailure instanceof ApiClientError &&
          (actionFailure.status === 409 || actionFailure.code === 'AGENT_CASE_CONFLICT')
        ) {
          await loadSelected(current.caseId);
          await reloadList(true);
        } else if (opsAgentActionOutcomeUnknown(actionFailure)) {
          setActionOutcomeUnknown(true);
          setNotice(
            'Máy chủ chưa xác nhận kết quả thao tác. Tải lại trạng thái trước khi thử tiếp để tránh tạo thao tác trùng.',
          );
        }
      } finally {
        setActionLoading(false);
      }
    },
    [
      analysis,
      branchId,
      current,
      followUp,
      loadSelected,
      reloadList,
      requiresNextFollowUp,
      requiresPromisedReturn,
    ],
  );

  const canManage = Boolean(
    branchId &&
    !isTerminal &&
    current &&
    ownershipFor(current) === 'MINE' &&
    current.version &&
    !actionLoading &&
    !actionOutcomeUnknown,
  );
  const canClaim = Boolean(
    branchId &&
    !isTerminal &&
    current &&
    ownershipFor(current) === 'UNCLAIMED' &&
    current.version &&
    !actionLoading &&
    !actionOutcomeUnknown,
  );
  const canReviewApproval = Boolean(
    branchId && !isTerminal && !actionLoading && !actionOutcomeUnknown,
  );
  const latestObservedAt = finding?.sourceObservedAt ?? analysis?.sourceObservedAt;

  return (
    <section className="ops-alert-workspace" aria-label="Cảnh báo Ops Agent">
      <header className="ops-alert-heading">
        <div>
          <p className="eyebrow">XỬ LÝ THEO CHI NHÁNH</p>
          <h2>Cảnh báo vận hành</h2>
          <p>Ưu tiên tình huống theo mức độ và hạn xử lý; mở một mục để xem căn cứ và phương án.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void reloadList(true)}
          loading={loading}
          disabled={!branchId}
        >
          Tải lại danh sách
        </Button>
      </header>

      <p className="ops-alert-api-scope">
        Hàng đợi và trạng thái lấy từ API theo chi nhánh. Phân tích hiển thị các phương án Agent trả
        về; hệ thống chỉ thực thi phương án API cho phép sau bước xác nhận hoặc duyệt.
      </p>

      {!branchId && (
        <Feedback tone="warning" title="Chưa chọn được chi nhánh">
          Chọn chi nhánh đã được cấp quyền để xem các cảnh báo vận hành.
        </Feedback>
      )}
      {error && (
        <Feedback
          tone="danger"
          title="Không tải được cảnh báo"
          action={
            <Button variant="secondary" onClick={() => void reloadList(true)}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Feedback>
      )}

      <div className="ops-alert-filters">
        <label className="ops-alert-search">
          <span>Tìm theo loại cảnh báo, mã đơn hoặc mã bộ</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ví dụ: RT-1024"
          />
        </label>
        <label>
          <span>Mức độ</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
          >
            <option value="all">Mọi mức độ</option>
            {Object.entries(severityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Trạng thái</span>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as StateFilter)}
          >
            {stateFilters.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Người xử lý</span>
          <select
            value={ownershipFilter}
            onChange={(event) => setOwnershipFilter(event.target.value as OwnershipFilter)}
          >
            <option value="all">Tất cả</option>
            <option value="unassigned">Chưa nhận</option>
            <option value="mine">Tôi đang xử lý</option>
          </select>
        </label>
      </div>

      {loading && cases.length === 0 ? (
        <div className="ops-alert-loading" role="status">
          Đang tải danh sách cảnh báo…
        </div>
      ) : !error && visibleCases.length === 0 && !nextCursor ? (
        <EmptyState
          title={cases.length ? 'Không tìm thấy cảnh báo phù hợp' : 'Chi nhánh chưa có cảnh báo'}
        >
          {cases.length
            ? 'Thay đổi bộ lọc hoặc từ khóa tìm kiếm để xem các tình huống khác.'
            : 'Các cảnh báo mới sẽ xuất hiện tại đây khi Ops Agent phát hiện.'}
        </EmptyState>
      ) : (
        <div className="ops-alert-layout">
          <section className="ops-alert-list" aria-label="Danh sách tình huống">
            <div className="ops-alert-list-heading">
              <strong>{visibleCases.length} tình huống</strong>
              <span>{branchId ? 'Theo chi nhánh đang làm việc' : ''}</span>
            </div>
            {visibleCases.length === 0 && nextCursor && (
              <p className="ops-alert-refreshing">Không có cảnh báo khớp trong lượt đã tải.</p>
            )}
            {visibleCases.map((item) => (
              <button
                type="button"
                key={item.caseId}
                className={`ops-alert-row${item.caseId === selectedId ? 'is-selected' : ''}`}
                aria-pressed={item.caseId === selectedId}
                onClick={() => {
                  selectedIdRef.current = item.caseId;
                  setSelectedId(item.caseId);
                  setSelectedCase(item);
                  setLastCheckedAt(undefined);
                  void loadSelected(item.caseId);
                }}
              >
                <span
                  className={`ops-alert-severity severity-${(item.finding?.severity ?? 'medium').toLocaleLowerCase()}`}
                >
                  {severityLabels[item.finding?.severity ?? ''] ?? 'Chưa phân loại'}
                </span>
                <strong>{labelForFinding(item.finding?.ruleCode)}</strong>
                <span className="ops-alert-row-meta">
                  <span>{labelForState(item.state)}</span>
                  <time dateTime={item.deadlineAt ?? undefined}>
                    Hạn: {formatDate(item.deadlineAt, 'Chưa đặt hạn')}
                  </time>
                </span>
              </button>
            ))}
            {loading && cases.length > 0 && (
              <p className="ops-alert-refreshing" role="status">
                Đang cập nhật danh sách…
              </p>
            )}
            {nextCursor && (
              <div className="ops-alert-list-more">
                <Button
                  variant="quiet"
                  onClick={() => void loadMore()}
                  loading={loadingMore}
                  disabled={loading}
                >
                  Tải thêm cảnh báo
                </Button>
              </div>
            )}
          </section>

          <section className="ops-alert-detail" aria-label="Chi tiết cảnh báo" aria-live="polite">
            {!current ? (
              <EmptyState title="Chọn một cảnh báo">
                Nguyên nhân, dữ liệu liên quan và các bước tiếp theo sẽ hiển thị tại đây.
              </EmptyState>
            ) : (
              <>
                <div className="ops-alert-detail-head">
                  <div>
                    <div className="ops-alert-detail-tags">
                      <span
                        className={`ops-alert-severity severity-${(finding?.severity ?? 'medium').toLocaleLowerCase()}`}
                      >
                        {severityLabels[finding?.severity ?? ''] ?? 'Chưa phân loại'}
                      </span>
                      <span className="ops-alert-status">{labelForState(current.state)}</span>
                    </div>
                    <h3>{labelForFinding(finding?.ruleCode)}</h3>
                    {current.message ? (
                      <AssistantMarkdown content={current.message} />
                    ) : (
                      <p>Ops Agent phát hiện một tình huống cần đối chiếu.</p>
                    )}
                    {finding?.ruleCode && findingGuidance[finding.ruleCode] && (
                      <p className="ops-alert-finding-guidance">
                        {findingGuidance[finding.ruleCode]}
                      </p>
                    )}
                  </div>
                  <div className="ops-alert-deadline">
                    <span>Hạn xử lý</span>
                    <strong>{formatDate(current.deadlineAt, 'Chưa đặt hạn')}</strong>
                  </div>
                </div>

                {notice && (
                  <Feedback tone="warning" title="Cần cập nhật kế hoạch">
                    {notice}
                  </Feedback>
                )}
                {requiresReplan && (
                  <Feedback tone="warning" title="Kế hoạch cần được lập lại">
                    Dữ liệu nguồn đã thay đổi hoặc phương án trước không thành công. Hãy phân tích
                    lại; mọi xác nhận cũ không được dùng tiếp.
                  </Feedback>
                )}
                {detailLoading && (
                  <div className="ops-alert-loading" role="status">
                    Đang tải chi tiết và trạng thái mới nhất…
                  </div>
                )}

                <div className="ops-alert-facts">
                  <div>
                    <span>Phát hiện lần đầu</span>
                    <strong>{formatDate(finding?.firstDetectedAt)}</strong>
                  </div>
                  <div>
                    <span>Cập nhật dữ liệu</span>
                    <strong>{formatDate(latestObservedAt)}</strong>
                  </div>
                  <div>
                    <span>Người xử lý</span>
                    <strong>
                      {ownershipFor(current) === 'MINE'
                        ? 'Bạn'
                        : ownershipFor(current) === 'OTHER'
                          ? 'Đã có người nhận'
                          : 'Chưa có'}
                    </strong>
                  </div>
                </div>

                <section className="ops-alert-lifecycle" aria-label="Tiến độ xử lý tình huống">
                  <div className="ops-alert-lifecycle-head">
                    <h4>Tiến độ xử lý</h4>
                    {current.state === 'MONITORING' && (
                      <span>
                        {lastCheckedAt
                          ? `Kiểm tra gần nhất ${formatDate(lastCheckedAt)}`
                          : 'Tự kiểm tra trạng thái mỗi 30 giây khi đang mở'}
                      </span>
                    )}
                  </div>
                  <ol className="ops-alert-lifecycle-steps">
                    {opsAgentWorkflowSteps(current).map((step, index) => (
                      <li
                        className={`is-${step.state}`}
                        key={step.id}
                        aria-current={step.state === 'current' ? 'step' : undefined}
                      >
                        <span className="ops-alert-step-index" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="ops-alert-step-copy">
                          <strong>{step.label}</strong>
                          <small>{step.detail}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="ops-alert-section">
                  <h4>Nguyên nhân và bằng chứng</h4>
                  {evidence.length ? (
                    <dl className="ops-alert-evidence">
                      {evidence.map((item, index) => (
                        <div key={`${item.key}-${index}`}>
                          <dt>{item.key.replaceAll('_', ' ')}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="ops-alert-muted">
                      Agent chưa trả về bằng chứng chi tiết cho tình huống này.
                    </p>
                  )}
                </section>

                {current.relatedOrders?.length || current.relatedUnits?.length ? (
                  <section className="ops-alert-section">
                    <h4>Đơn thuê và bộ liên quan</h4>
                    <div className="ops-alert-entities">
                      {current.relatedOrders?.map((order) => (
                        <article key={order.orderCode}>
                          <span>Đơn thuê</span>
                          <strong>{order.orderCode}</strong>
                          <small>
                            {labelForState(order.status)} · {formatDate(order.plannedStartAt)} –{' '}
                            {formatDate(order.plannedDueAt)}
                          </small>
                        </article>
                      ))}
                      {current.relatedUnits?.map((unit) => (
                        <article key={unit.unitCode}>
                          <span>Bộ trang phục</span>
                          <strong>{unit.unitCode}</strong>
                          <small>
                            {unit.operationalStatus} · Tình trạng {unit.conditionGrade}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="ops-alert-section">
                  <div className="ops-alert-section-title">
                    <div>
                      <h4>Phương án xử lý</h4>
                      <p>
                        Agent mô phỏng để tham khảo; hệ thống chưa thực hiện cho tới khi bạn xác
                        nhận.
                      </p>
                    </div>
                    {analysis?.status === 'STALE' && <span className="ops-alert-stale">Đã cũ</span>}
                  </div>
                  {analysis ? (
                    <>
                      {analysis.narrative?.summary && (
                        <p className="ops-alert-analysis-summary">{analysis.narrative.summary}</p>
                      )}
                      {(typeof analysis.riskLevel === 'string' ||
                        typeof analysis.riskScore === 'number' ||
                        typeof analysis.estimatedDelayMinutes === 'number') && (
                        <div className="ops-alert-forecast" aria-label="Đánh giá nguy cơ">
                          {analysis.riskLevel && (
                            <div>
                              <span>Mức rủi ro</span>
                              <strong>{formatRiskLevel(analysis.riskLevel)}</strong>
                            </div>
                          )}
                          {typeof analysis.riskScore === 'number' && (
                            <div>
                              <span>Điểm rủi ro</span>
                              <strong>{formatRiskScore(analysis.riskScore)}</strong>
                            </div>
                          )}
                          {typeof analysis.estimatedDelayMinutes === 'number' && (
                            <div>
                              <span>Trễ ước tính</span>
                              <strong>{formatDuration(analysis.estimatedDelayMinutes)}</strong>
                            </div>
                          )}
                          {analysis.evaluatedAt && (
                            <small>Đánh giá lúc {formatDate(analysis.evaluatedAt)}</small>
                          )}
                        </div>
                      )}
                      <p className="ops-alert-data-note">
                        Mức/điểm rủi ro là đánh giá theo dữ liệu hiện tại, không phải xác suất đã
                        hiệu chuẩn. Chỉ số nào API không trả về sẽ không được tự suy ra.
                      </p>
                      {analysis.reasons?.length ? (
                        <ul className="ops-alert-forecast-reasons">
                          {analysis.reasons.map((reason, index) => (
                            <li key={`${reason}-${index}`}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      {analysis.outcome === 'NO_FEASIBLE_OPTION' ? (
                        <Feedback tone="warning" title="Chưa có phương án khả thi">
                          Hãy kiểm tra nguyên nhân và chuyển giao cho người có thẩm quyền nếu cần.
                        </Feedback>
                      ) : analysis.options.length ? (
                        <div
                          className="ops-alert-options"
                          role="list"
                          aria-label="So sánh phương án"
                        >
                          {analysis.options.map((option, index) => {
                            const recommendedOption =
                              option.optionId === analysis.recommendedOptionId;
                            const ready = option.feasible !== false;
                            return (
                              <article
                                className={`ops-alert-option${recommendedOption ? 'is-recommended' : ''}`}
                                key={option.optionId}
                                role="listitem"
                              >
                                <div className="ops-alert-option-head">
                                  <div>
                                    <span>Phương án {option.rank ?? index + 1}</span>
                                    <h5>{optionTitle(option, index)}</h5>
                                  </div>
                                  {recommendedOption && (
                                    <span className="ops-alert-recommended">Agent đề xuất</span>
                                  )}
                                </div>
                                <div className="ops-alert-comparison">
                                  <div>
                                    <span>Thời gian</span>
                                    <strong>
                                      {formatDuration(
                                        option.estimatedDurationMinutes ?? option.estimatedMinutes,
                                      )}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Chi phí</span>
                                    <strong>
                                      {formatCost(option.estimatedCostVnd ?? option.estimatedCost)}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Rủi ro</span>
                                    <strong>{optionRisk(option)}</strong>
                                  </div>
                                </div>
                                {optionDescription(option) && <p>{optionDescription(option)}</p>}
                                {!optionDescription(option) && (
                                  <p>
                                    {ready
                                      ? 'Được đánh giá trên dữ liệu vận hành mới nhất.'
                                      : 'Không khả thi theo dữ liệu hiện có.'}
                                  </p>
                                )}
                                {option.executable === false && (
                                  <small className="ops-alert-non-executable">
                                    Phương án này chỉ để tham khảo, chưa hỗ trợ thực thi tự động.
                                  </small>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ops-alert-muted">
                          Chưa có phương án từ Agent. Chọn “Phân tích” để tạo kế hoạch mới.
                        </p>
                      )}
                      {analysis.narrative?.risks?.length ? (
                        <div className="ops-alert-risk-note">
                          <strong>Điểm cần lưu ý</strong>
                          <ul>
                            {analysis.narrative.risks.map((risk, index) => (
                              <li key={`${risk}-${index}`}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.narrative?.rationale?.length ? (
                        <div className="ops-alert-risk-note">
                          <strong>Vì sao Agent xếp phương án này lên đầu</strong>
                          <ul>
                            {analysis.narrative.rationale.map((reason, index) => (
                              <li key={`${reason}-${index}`}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.narrative?.fallback && (
                        <p className="ops-alert-muted">
                          Không có phương án tự động khả thi.{' '}
                          {analysis.narrative.nextStep ??
                            'Hãy kiểm tra lại dữ liệu và bàn giao nếu cần.'}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="ops-alert-muted">
                      Chưa có kế hoạch phân tích. Nhận xử lý tình huống rồi chọn “Phân tích” để lấy
                      phương án và số liệu từ Agent.
                    </p>
                  )}
                  {analysis?.options.length ? (
                    <p className="ops-alert-data-note">
                      Thời gian hoặc chi phí ghi “Chưa có dữ liệu” khi Agent chưa cung cấp số đo cho
                      phương án đó.
                    </p>
                  ) : null}
                  <p className="ops-alert-api-limit">
                    Việc giả lập chỉ đọc dữ liệu và không giữ bộ hay chuyển kho. Bản API hiện chỉ
                    cho thực thi các thao tác đã được phát hành; tạo tác vụ, giữ bộ và chuyển kho
                    chưa được bật qua luồng Agent.
                  </p>
                </section>

                {isOverdueFollowUp &&
                  analysis?.status === 'ACTIVE' &&
                  !current.pendingConfirmation && (
                    <section className="ops-alert-follow-up">
                      <div>
                        <h4>Ghi nhận lần liên hệ khách</h4>
                        <p>
                          Chỉ ghi nhận sau khi nhân viên đã liên hệ thực tế. Luồng này không tự gửi
                          tin, gia hạn đơn hay tính phí.
                        </p>
                      </div>
                      <div className="ops-alert-follow-up-grid">
                        <label>
                          Kênh liên hệ
                          <select
                            value={followUp.channel}
                            onChange={(event) =>
                              updateFollowUp((draft) => ({
                                ...draft,
                                channel: event.target.value as OpsAgentFollowUpChannel,
                              }))
                            }
                          >
                            <option value="IN_PERSON">Trực tiếp</option>
                            <option value="PHONE">Điện thoại</option>
                            <option value="EMAIL">Email</option>
                            <option value="CHAT">Chat</option>
                            <option value="SOCIAL">Mạng xã hội</option>
                          </select>
                        </label>
                        <label>
                          Kết quả
                          <select
                            value={followUp.outcome}
                            onChange={(event) =>
                              updateFollowUp((draft) => ({
                                ...draft,
                                outcome: event.target.value as OpsAgentFollowUpOutcome,
                              }))
                            }
                          >
                            <option value="CONTACTED">Đã liên hệ</option>
                            <option value="PROMISED_RETURN">Khách hẹn trả</option>
                            <option value="NO_ANSWER">Không nghe máy</option>
                            <option value="REQUESTED_EXTENSION">Xin gia hạn</option>
                            <option value="REFUSED_RETURN">Từ chối trả</option>
                            <option value="OTHER">Khác</option>
                          </select>
                        </label>
                        <label>
                          Thời điểm đã liên hệ
                          <input
                            type="datetime-local"
                            required
                            value={followUp.occurredAt}
                            onChange={(event) =>
                              updateFollowUp((draft) => ({
                                ...draft,
                                occurredAt: event.target.value,
                              }))
                            }
                          />
                        </label>
                        {requiresPromisedReturn && (
                          <label>
                            Thời gian khách hẹn trả
                            <input
                              type="datetime-local"
                              required
                              value={followUp.promisedReturnAt}
                              onChange={(event) =>
                                updateFollowUp((draft) => ({
                                  ...draft,
                                  promisedReturnAt: event.target.value,
                                }))
                              }
                            />
                          </label>
                        )}
                        {requiresNextFollowUp && (
                          <label>
                            Lịch liên hệ tiếp theo
                            <input
                              type="datetime-local"
                              required
                              value={followUp.nextFollowUpAt}
                              onChange={(event) =>
                                updateFollowUp((draft) => ({
                                  ...draft,
                                  nextFollowUpAt: event.target.value,
                                }))
                              }
                            />
                          </label>
                        )}
                      </div>
                      <p className="ops-alert-muted">
                        Khi xác nhận chuẩn bị, hệ thống sẽ tạo bản ghi CRM idempotent để theo dõi.
                        {requiresNextFollowUp && !followUp.nextFollowUpAt
                          ? ' Cần chọn lịch liên hệ tiếp theo.'
                          : ''}
                      </p>
                      <Button
                        onClick={() => void runAction('prepare-overdue')}
                        loading={actionLoading}
                        disabled={!canManage || !followUpValid || !analysis?.analysisId}
                      >
                        Chuẩn bị ghi nhận để xác nhận
                      </Button>
                    </section>
                  )}

                {current.pendingConfirmation && (
                  <section className="ops-alert-pending">
                    <div>
                      <span className="eyebrow">ĐANG CHỜ XÁC NHẬN</span>
                      <h4>{current.pendingConfirmation.summary}</h4>
                      <p>
                        Hết hạn: {formatDate(current.pendingConfirmation.expiresAt)}. Xác nhận sẽ
                        gửi lệnh thực thi đã được Agent chuẩn bị.
                      </p>
                    </div>
                    <div className="ops-alert-actions">
                      <Button
                        onClick={() => setConfirmingExecution(true)}
                        loading={actionLoading}
                        disabled={!canManage}
                      >
                        Xác nhận và thực thi
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void runAction('reject-confirmation')}
                        loading={actionLoading}
                        disabled={!canManage}
                      >
                        Từ chối
                      </Button>
                    </div>
                  </section>
                )}
                {current.pendingApproval && (
                  <section className="ops-alert-pending">
                    <div>
                      <span className="eyebrow">CẦN NGƯỜI CÓ QUYỀN DUYỆT</span>
                      <h4>{current.pendingApproval.summary}</h4>
                      <p>
                        Quyền yêu cầu: {current.pendingApproval.requiredPermission} · Hết hạn:{' '}
                        {formatDate(current.pendingApproval.expiresAt)}
                      </p>
                    </div>
                    <div className="ops-alert-actions">
                      <Button
                        onClick={() => void runAction('approve')}
                        loading={actionLoading}
                        disabled={!canReviewApproval}
                      >
                        Duyệt
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void runAction('reject-approval')}
                        loading={actionLoading}
                        disabled={!canReviewApproval}
                      >
                        Từ chối
                      </Button>
                    </div>
                  </section>
                )}

                <footer className="ops-alert-actions ops-alert-detail-actions">
                  {ownershipFor(current) === 'UNCLAIMED' && !isTerminal && (
                    <Button
                      onClick={() => void runAction('claim')}
                      loading={actionLoading}
                      disabled={!canClaim}
                    >
                      Nhận xử lý
                    </Button>
                  )}
                  {ownershipFor(current) === 'MINE' && !isTerminal && (
                    <Button
                      variant="secondary"
                      onClick={() => void runAction('release')}
                      loading={actionLoading}
                      disabled={!canManage}
                    >
                      Trả lại hàng đợi
                    </Button>
                  )}
                  {ownershipFor(current) === 'MINE' && !isTerminal && (
                    <Button
                      onClick={() => void runAction('analyze')}
                      loading={actionLoading}
                      disabled={!canManage || !branchId || detailLoading}
                    >
                      Phân tích{requiresReplan ? ' lại' : ''}
                    </Button>
                  )}
                  {ownershipFor(current) === 'MINE' &&
                    canExecuteRecommended &&
                    !current.pendingConfirmation &&
                    !isOverdueFollowUp && (
                      <Button
                        variant="secondary"
                        onClick={() => void runAction('prepare')}
                        loading={actionLoading}
                        disabled={!canManage || !current.version}
                      >
                        Chuẩn bị xác nhận thực thi
                      </Button>
                    )}
                  {ownershipFor(current) === 'OTHER' && (
                    <span className="ops-alert-owner-note">
                      Tình huống đã được nhân viên khác nhận.
                    </span>
                  )}
                  {!current.version && (
                    <span className="ops-alert-owner-note">
                      Thiếu phiên bản hồ sơ; hãy tải lại trước khi thao tác.
                    </span>
                  )}
                  <Button
                    variant="quiet"
                    onClick={() => void loadSelected(current.caseId)}
                    loading={detailLoading}
                    disabled={actionLoading}
                  >
                    Cập nhật trạng thái
                  </Button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {confirmingExecution && current?.pendingConfirmation && (
        <ConfirmDialog
          title="Xác nhận thực thi phương án"
          confirmText="Xác nhận và thực thi"
          onConfirm={() => void runAction('confirm')}
          onClose={() => setConfirmingExecution(false)}
          loading={actionLoading}
        >
          <p>{current.pendingConfirmation.summary}</p>
          <p>
            Hành động chỉ được gửi khi bạn xác nhận tại đây. Nếu dữ liệu đã thay đổi, hệ thống sẽ
            yêu cầu lập lại kế hoạch.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
