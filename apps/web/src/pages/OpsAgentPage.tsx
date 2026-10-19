import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, FormEvent, ReactNode } from 'react';
import type { Navigate } from '../app/routes';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Feedback,
  Field,
  Icon,
  StatusLabel,
  TextAreaField,
} from '../components/ui';
import { AssistantMarkdown } from '../components/AssistantMarkdown';
import { useFixtureResource } from '../components/useFixtureResource';
import { fixtureAdapter, fixtureClock } from '../fixtures/adapter';
import type { DemoScenario, QueueTask } from '../fixtures/types';
import { opsAgentFixtureAdapter, opsAgentSources, opsAgentWorkflows } from '../fixtures/opsAgent';
import {
  ApiClientError,
  answerOpsKnowledge,
  approveOpsAgentAction,
  cancelOpsAgentCase,
  confirmOpsAgentCase,
  getOpsAgentCase,
  rejectOpsAgentAction,
  rejectOpsAgentConfirmation,
  sendOpsAgentMessage,
  type OpsAgentCaseResult,
  type OpsAgentEvidence,
  type OpsKnowledgeAnswer,
} from '../api/client';

type AgentTab = 'overview' | 'queue' | 'workflows' | 'knowledge' | 'activity' | 'chat' | 'case';
type QueueFilter = 'all' | QueueTask['kind'];
type AgentCaseAction = 'confirm' | 'reject-confirmation' | 'approve' | 'reject-approval' | 'cancel';
interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  question?: string;
  sourceIds: string[];
  evidence?: OpsAgentEvidence[];
  knowledgeAnswer?: OpsKnowledgeAnswer;
}
interface QueueFilterOption {
  id: QueueFilter;
  label: string;
}

const tabs: { id: AgentTab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'queue', label: 'Hàng đợi' },
  { id: 'workflows', label: 'Quy trình' },
  { id: 'knowledge', label: 'Tra cứu tri thức' },
  { id: 'activity', label: 'Nhật ký' },
  { id: 'chat', label: 'Hỏi Agent' },
  { id: 'case', label: 'Hồ sơ Agent' },
];

const apiTabs: { id: AgentTab; label: string }[] = [{ id: 'chat', label: 'Hỗ trợ vận hành' }];

const agentActionCopy: Record<
  AgentCaseAction,
  { title: string; confirmText: string; description: string; danger?: boolean }
> = {
  confirm: {
    title: 'Xác nhận yêu cầu',
    confirmText: 'Xác nhận và tiếp tục',
    description:
      'Studio sẽ tiếp tục xử lý yêu cầu đang chờ. Hãy kiểm tra nội dung và đối tượng trước khi xác nhận.',
  },
  'reject-confirmation': {
    title: 'Từ chối yêu cầu đang chờ',
    confirmText: 'Từ chối yêu cầu',
    description:
      'Yêu cầu đang chờ sẽ dừng lại. Việc từ chối không thay đổi các dữ liệu nghiệp vụ khác.',
    danger: true,
  },
  approve: {
    title: 'Duyệt thao tác',
    confirmText: 'Duyệt thao tác',
    description:
      'Yêu cầu này cần quyền duyệt. Chỉ tiếp tục khi bạn có thẩm quyền và đã kiểm tra đúng nội dung.',
  },
  'reject-approval': {
    title: 'Từ chối thao tác',
    confirmText: 'Từ chối thao tác',
    description: 'Thao tác đang chờ sẽ không được thực hiện.',
    danger: true,
  },
  cancel: {
    title: 'Hủy yêu cầu này?',
    confirmText: 'Hủy yêu cầu',
    description:
      'Yêu cầu sẽ không thể tiếp tục. Những thao tác đã hoàn thành trước đó không bị hoàn tác.',
    danger: true,
  },
};

const agentStateLabels: Record<string, string> = {
  SUCCEEDED: 'Hoàn tất',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
  WAITING_CONFIRMATION: 'Chờ xác nhận',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  AWAITING_CONFIRMATION: 'Chờ xác nhận',
  WAITING_APPROVAL: 'Chờ duyệt',
  PENDING_APPROVAL: 'Chờ duyệt',
  AWAITING_APPROVAL: 'Chờ duyệt',
  NEEDS_INPUT: 'Chờ bổ sung thông tin',
  WAITING_FOR_INPUT: 'Chờ bổ sung thông tin',
  NEEDS_MORE_INFO: 'Chờ bổ sung thông tin',
  RUNNING: 'Đang xử lý',
  IN_PROGRESS: 'Đang xử lý',
  TIMED_OUT: 'Quá thời gian',
};
const terminalAgentStates = ['SUCCEEDED', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
const decisionAgentStates = [
  'WAITING_CONFIRMATION',
  'PENDING_CONFIRMATION',
  'AWAITING_CONFIRMATION',
  'WAITING_APPROVAL',
  'PENDING_APPROVAL',
  'AWAITING_APPROVAL',
];
const inputAgentStates = ['NEEDS_INPUT', 'WAITING_FOR_INPUT', 'NEEDS_MORE_INFO'];

function isKnownOpsAgentState(state: string) {
  return Object.prototype.hasOwnProperty.call(agentStateLabels, state.toUpperCase());
}

type OpsAgentStateSnapshot = Pick<
  OpsAgentCaseResult,
  'state' | 'completed' | 'pendingInput' | 'pendingConfirmation' | 'pendingApproval'
>;

// Exported pure helpers are kept with the page so regression tests can exercise
// the same state gates the staff flow uses.
// eslint-disable-next-line react-refresh/only-export-components
export function requiresOpsAgentStateReview(result?: OpsAgentStateSnapshot) {
  if (!result) return false;
  const state = result.state.toUpperCase();
  if (!isKnownOpsAgentState(state)) return true;

  const terminal = terminalAgentStates.includes(state);
  const expectsConfirmation = [
    'WAITING_CONFIRMATION',
    'PENDING_CONFIRMATION',
    'AWAITING_CONFIRMATION',
  ].includes(state);
  const expectsApproval = ['WAITING_APPROVAL', 'PENDING_APPROVAL', 'AWAITING_APPROVAL'].includes(
    state,
  );
  const expectsInput = inputAgentStates.includes(state);
  const hasInput = Boolean(result.pendingInput?.trim());
  const hasConfirmation = Boolean(result.pendingConfirmation);
  const hasApproval = Boolean(result.pendingApproval);

  // A response with contradictory status and pending work cannot safely be
  // treated as terminal or as permission to send another write.
  if (result.completed && !terminal) return true;
  if (terminal && (hasInput || hasConfirmation || hasApproval)) return true;
  if (hasConfirmation && (!expectsConfirmation || hasApproval || hasInput)) return true;
  if (hasApproval && (!expectsApproval || hasConfirmation || hasInput)) return true;
  if (expectsConfirmation && !hasConfirmation) return true;
  if (expectsApproval && !hasApproval) return true;
  if (expectsInput !== hasInput) return true;
  return false;
}

// eslint-disable-next-line react-refresh/only-export-components
export function isOpsAgentCaseTerminal(result?: OpsAgentStateSnapshot) {
  if (!result || requiresOpsAgentStateReview(result)) return false;
  return terminalAgentStates.includes(result.state.toUpperCase());
}

// eslint-disable-next-line react-refresh/only-export-components
export function canContinueOpsAgentCase(result?: OpsAgentCaseResult) {
  return Boolean(
    result &&
    !requiresOpsAgentStateReview(result) &&
    !isOpsAgentCaseTerminal(result) &&
    inputAgentStates.includes(result.state.toUpperCase()) &&
    Boolean(result.pendingInput?.trim()),
  );
}

function agentStateLabel(state: string, needsReview = false) {
  if (needsReview) return 'Cần kiểm tra trạng thái';
  return agentStateLabels[state.toUpperCase()] ?? 'Cần kiểm tra trạng thái';
}

function agentStateTone(
  state: string,
  needsReview = false,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const normalized = state.toUpperCase();
  if (needsReview || !isKnownOpsAgentState(normalized)) return 'warning';
  if (['SUCCEEDED', 'COMPLETED'].includes(normalized)) return 'success';
  if (
    [...decisionAgentStates, 'NEEDS_INPUT', 'WAITING_FOR_INPUT', 'NEEDS_MORE_INFO'].includes(
      normalized,
    )
  )
    return 'warning';
  if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(normalized)) return 'danger';
  if (['RUNNING', 'IN_PROGRESS'].includes(normalized)) return 'info';
  return 'neutral';
}

function formatAgentTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentEvidenceLabel(evidence: OpsAgentEvidence) {
  const citation = evidence.citation?.trim();
  return (
    (citation?.length ? citation : undefined) ??
    (evidence.sourceType === 'knowledge' ? 'Tài liệu được truy xuất' : 'Dữ liệu nghiệp vụ đã đọc')
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      AGENT_CASE_CONFLICT:
        'Yêu cầu đã thay đổi hoặc không còn ở trạng thái này. Hãy cập nhật trạng thái trước khi tiếp tục.',
      AI_SERVICE_NOT_CONFIGURED: 'Dịch vụ trợ lý chưa được cấu hình. Hãy liên hệ người phụ trách.',
      AI_SERVICE_UNAVAILABLE: 'Chưa kết nối được dịch vụ trợ lý. Bạn có thể thử lại sau.',
      AI_SERVICE_TIMEOUT:
        'Dịch vụ trợ lý phản hồi quá thời gian. Hãy kiểm tra trạng thái trước khi gửi lại.',
      AI_RATE_LIMITED: 'Dịch vụ đang nhận nhiều yêu cầu. Hãy đợi một lúc rồi thử lại.',
      AGENT_CASE_NOT_FOUND:
        'Không tìm thấy yêu cầu này. Hãy kiểm tra phiên hoặc liên hệ người phụ trách.',
      INVALID_ACCESS_TOKEN:
        'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại rồi mở lại khu vực này.',
      FORBIDDEN: 'Tài khoản hiện tại chưa có quyền truy cập hoặc thực hiện thao tác này.',
    };
    const knownMessage = messages[error.code];
    if (knownMessage) return knownMessage;
    if (error.status === 0)
      return 'Mất kết nối tới dịch vụ trợ lý. Hãy cập nhật trạng thái trước khi gửi lại.';
    if (error.status === 409)
      return 'Yêu cầu đã thay đổi. Hãy cập nhật trạng thái mới nhất trước khi tiếp tục.';
    if (error.status === 408 || error.status === 504)
      return 'Yêu cầu phản hồi quá thời gian. Hãy cập nhật trạng thái trước khi thử lại.';
    if (error.status === 429)
      return 'Dịch vụ đang nhận nhiều yêu cầu. Hãy đợi một lúc rồi thử lại.';
    if (error.status === 401 || error.status === 403)
      return 'Phiên đăng nhập hoặc quyền truy cập không còn hợp lệ. Hãy đăng nhập lại hoặc liên hệ quản trị viên.';
    if (error.status >= 500)
      return 'Dịch vụ trợ lý đang gặp sự cố. Hãy cập nhật trạng thái trước khi gửi lại.';
  }
  return error instanceof Error ? error.message : fallback;
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentSendRecovery(error: unknown, hasCaseId: boolean) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = error instanceof ApiClientError ? error.status : undefined;
  const outcomeUnknown =
    (status !== undefined && (status === 0 || status === 408 || status === 504 || status >= 500)) ||
    ['AI_SERVICE_TIMEOUT', 'AI_SERVICE_UNAVAILABLE', 'NETWORK_ERROR'].includes(code);
  return {
    outcomeUnknown,
    requiresCaseRefresh: hasCaseId && (outcomeUnknown || status === 409),
    conflict: status === 409,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsKnowledgeAnswerText(result: OpsKnowledgeAnswer) {
  const answer = result.answer.trim();
  if (answer) return answer;
  return result.outcome === 'insufficient_context'
    ? 'Chưa có nội dung đủ căn cứ để trả lời câu hỏi này.'
    : 'Kho tri thức chưa trả về nội dung câu trả lời. Hãy thử lại hoặc xác nhận với người phụ trách.';
}

function agentPermissionLabel(permission: string) {
  const labels: Record<string, string> = {
    'payments:manage': 'Quản lý thanh toán',
    'transfers:manage': 'Quản lý điều chuyển kho',
  };
  return labels[permission.toLocaleLowerCase('en')] ?? 'Quyền quản lý được yêu cầu';
}

function knowledgeSourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    APPROVED: 'Đã duyệt',
    VERIFIED: 'Đã xác minh',
    UNVERIFIED: 'Chưa xác minh',
    PROVISIONAL: 'Tạm thời',
    DRAFT: 'Bản nháp',
    ACTIVE: 'Đang hiệu lực',
    RETIRED: 'Ngừng sử dụng',
  };
  const normalized = status.toUpperCase();
  return labels[normalized] ?? status.toLocaleLowerCase('vi').replaceAll('_', ' ');
}

function knowledgeSourceStatusTone(status: string): 'success' | 'warning' | 'neutral' {
  const normalized = status.toUpperCase();
  if (['APPROVED', 'VERIFIED', 'ACTIVE'].includes(normalized)) return 'success';
  if (['UNVERIFIED', 'PROVISIONAL', 'DRAFT'].includes(normalized)) return 'warning';
  return 'neutral';
}

function knowledgeRequestError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    AI_SERVICE_NOT_CONFIGURED:
      'Kho tri thức chưa được cấu hình. Câu hỏi vẫn được giữ để thử lại sau.',
    AI_SERVICE_UNAVAILABLE:
      'Chưa kết nối được kho tri thức. Đây là truy vấn chỉ đọc; bạn có thể thử lại sau.',
    AI_SERVICE_TIMEOUT:
      'Kho tri thức phản hồi quá thời gian. Truy vấn này không thay đổi dữ liệu nghiệp vụ; bạn có thể thử lại.',
    AI_RATE_LIMITED: 'Kho tri thức đang nhận quá nhiều yêu cầu. Hãy đợi rồi thử lại.',
    FORBIDDEN: 'Tài khoản hiện tại chưa có quyền tra cứu kho tri thức.',
  };
  return (
    messages[code] ?? (error instanceof Error ? error.message : 'Không truy vấn được kho tri thức.')
  );
}

const filters: QueueFilterOption[] = [
  { id: 'all', label: 'Tất cả việc' },
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'handover', label: 'Giao đồ' },
  { id: 'return', label: 'Nhận đồ trả' },
  { id: 'payment', label: 'Thanh toán' },
  { id: 'overdue', label: 'Quá hạn' },
];

const sourceStatusTone = (status: string): 'neutral' | 'warning' | 'info' =>
  status === 'Tài liệu mô tả' ? 'info' : status === 'Cần xác minh' ? 'warning' : 'neutral';

const formatFixtureTime = () =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fixtureClock);

const agentCaseSessionKey = 'costume-rental.ops-agent.case-id';

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentCaseStorageKey(actorId: string | undefined, branchId: string) {
  return actorId && branchId
    ? `${agentCaseSessionKey}:${actorId}:${encodeURIComponent(branchId)}`
    : undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentDraftStorageKey(actorId: string | undefined, branchId: string) {
  return actorId && branchId
    ? `${agentCaseSessionKey}:draft:${actorId}:${encodeURIComponent(branchId)}`
    : undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export function nextOpsAgentTabIndex(key: string, index: number, count: number) {
  if (count < 1 || index < 0 || index >= count) return undefined;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export function opsAgentActionFocusTarget(
  outcome: 'success' | 'failure',
  resultHeading: { focus: () => void } | null,
  errorPanel: { focus: () => void } | null,
) {
  return outcome === 'success' ? resultHeading : errorPanel;
}

const kindLabel: Record<QueueTask['kind'], string> = {
  pending: 'Chờ duyệt',
  handover: 'Giao đồ',
  return: 'Nhận đồ trả',
  overdue: 'Quá hạn',
  payment: 'Thanh toán',
};

const priorityRank: Record<QueueTask['group'], number> = {
  'Quá hạn': 0,
  'Trong 2 giờ tới': 1,
  'Chờ xác nhận lâu': 2,
  'Hôm nay': 3,
  'Ngày khác': 4,
};

function TabPanel({
  tab,
  children,
  labelledBy,
  hasTabs = true,
}: {
  tab: AgentTab;
  children: ReactNode;
  labelledBy?: string;
  hasTabs?: boolean;
}) {
  return (
    <>
      <section
        className="ops-agent-panel"
        id={'ops-agent-panel-' + tab}
        role="tabpanel"
        aria-labelledby={labelledBy ?? 'ops-agent-tab-' + tab}
        tabIndex={0}
      >
        {children}
      </section>
      {hasTabs &&
        tabs
          .filter((item) => item.id !== tab)
          .map((item) => (
            <section
              key={item.id}
              id={'ops-agent-panel-' + item.id}
              role="tabpanel"
              aria-labelledby={'ops-agent-tab-' + item.id}
              hidden
            />
          ))}
    </>
  );
}

function QueueRow({
  task,
  onAsk,
  onOpen,
  disableOpen = false,
}: {
  task: QueueTask;
  onAsk: () => void;
  onOpen: () => void;
  disableOpen?: boolean;
}) {
  const tone =
    task.group === 'Quá hạn'
      ? 'danger'
      : task.group === 'Trong 2 giờ tới' || task.group === 'Chờ xác nhận lâu'
        ? 'warning'
        : 'info';
  return (
    <article className="ops-queue-card">
      <div className="ops-queue-card-main">
        <div className="ops-queue-card-topline">
          <strong>{task.orderId}</strong>
          <StatusLabel text={task.urgency} tone={tone} />
        </div>
        <h3>{task.task}</h3>
        <p className="ops-queue-card-details">
          <span>{task.customer}</span>
          <span aria-hidden="true">·</span>
          <span>{task.due}</span>
          <span aria-hidden="true">·</span>
          <span>
            {task.owner === 'Chưa gán' ? 'Chưa có người phụ trách' : 'Phụ trách: ' + task.owner}
          </span>
        </p>
        <div className="ops-queue-card-meta">
          <span>{kindLabel[task.kind]}</span>
          {task.barcode && <span>Mã bộ {task.barcode}</span>}
          <span>{task.branch}</span>
        </div>
      </div>
      <div className="ops-queue-card-actions">
        <Button variant="quiet" onClick={onAsk}>
          Hỏi Agent
        </Button>
        <Button variant="secondary" onClick={onOpen} disabled={disableOpen}>
          {disableOpen ? 'Đơn mẫu' : 'Mở đơn'}
        </Button>
      </div>
    </article>
  );
}

export function OpsAgentPage({
  scenario,
  branch,
  branchId,
  go,
  actorId,
}: {
  scenario: DemoScenario;
  branch: string;
  branchId?: string;
  go: Navigate;
  actorId?: string;
}) {
  const useAgentApi = import.meta.env.VITE_OPS_AGENT_MODE === 'api';
  const branchScopeId = useAgentApi ? (branchId ?? '') : branch;
  const scopedCaseSessionKey = opsAgentCaseStorageKey(actorId, branchScopeId);
  const scopedDraftSessionKey = opsAgentDraftStorageKey(actorId, branchScopeId);
  const uncertainInitialSendSessionKey = scopedCaseSessionKey
    ? `${scopedCaseSessionKey}:uncertain-initial-send`
    : undefined;
  const hasUncertainInitialSend =
    useAgentApi &&
    Boolean(uncertainInitialSendSessionKey) &&
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(uncertainInitialSendSessionKey!) === '1';
  const [tab, setTab] = useState<AgentTab>(useAgentApi ? 'chat' : 'overview');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [queueSearch, setQueueSearch] = useState('');
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeTopic, setKnowledgeTopic] = useState('all');
  const [knowledgeType, setKnowledgeType] = useState('all');
  const [knowledgeStatus, setKnowledgeStatus] = useState('all');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [activeCaseScopeKey, setActiveCaseScopeKey] = useState(scopedCaseSessionKey);
  const [knowledgeAnswer, setKnowledgeAnswer] = useState<{
    query: string;
    result: OpsKnowledgeAnswer;
  }>();
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [caseDetailsOpen, setCaseDetailsOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState(() => {
    if (!useAgentApi || !scopedDraftSessionKey || typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(scopedDraftSessionKey) ?? '';
    } catch {
      return '';
    }
  });
  const [agentCaseId, setAgentCaseId] = useState<string | undefined>(() => {
    if (!useAgentApi || !scopedCaseSessionKey || typeof window === 'undefined') return undefined;
    return window.sessionStorage.getItem(scopedCaseSessionKey) ?? undefined;
  });
  const availableTabs = useAgentApi
    ? apiTabs.filter((item) => item.id !== 'case' || Boolean(agentCaseId))
    : tabs;
  const [agentResult, setAgentResult] = useState<OpsAgentCaseResult>();
  const [caseLoading, setCaseLoading] = useState(() => Boolean(agentCaseId));
  const [caseActionLoading, setCaseActionLoading] = useState(false);
  const [caseNeedsReconciliation, setCaseNeedsReconciliation] = useState(false);
  const [caseError, setCaseError] = useState('');
  const [caseDialogAction, setCaseDialogAction] = useState<AgentCaseAction>();
  const [showUnknownSendDialog, setShowUnknownSendDialog] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendOutcomeUnknown, setSendOutcomeUnknown] = useState(hasUncertainInitialSend);
  const [sendConflict, setSendConflict] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [sendError, setSendError] = useState(
    hasUncertainInitialSend
      ? 'Kết quả tạo yêu cầu trước đó chưa được xác nhận. Hãy đối soát trước khi gửi yêu cầu khác.'
      : '',
  );
  const [selectedTask, setSelectedTask] = useState<QueueTask>();
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  const [conflictCleared, setConflictCleared] = useState(false);
  const caseLoadInFlight = useRef(false);
  const caseActionInFlight = useRef(false);
  const messageSendInFlight = useRef(false);
  const agentCaseScopeRef = useRef(scopedCaseSessionKey);
  const draftScopeRef = useRef(scopedDraftSessionKey);
  const caseScopeGeneration = useRef(0);
  const visibleTab =
    availableTabs.some((item) => item.id === tab) &&
    (!useAgentApi || activeCaseScopeKey === scopedCaseSessionKey)
      ? tab
      : (availableTabs[0]?.id ?? 'overview');
  const chatInputContainerRef = useRef<HTMLDivElement>(null);
  const focusCaseAfterAction = useRef(false);
  const focusCaseErrorAfterAction = useRef(false);
  const caseErrorPanelRef = useRef<HTMLDivElement>(null);
  const focusSendErrorAfterFailure = useRef(false);
  const sendErrorPanelRef = useRef<HTMLDivElement>(null);
  const caseResultHeadingRef = useRef<HTMLHeadingElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text:
        import.meta.env.VITE_OPS_AGENT_MODE === 'api'
          ? 'Bạn có thể tra cứu quy trình hoặc gửi một tình huống để trợ lý phân tích. Hãy nhập nội dung rồi chọn cách gửi phù hợp.'
          : 'Mình có thể gợi ý checklist từ nội dung demo. Câu trả lời không thay đổi đơn, xác nhận thanh toán hay ghi vào nhật ký.',
      sourceIds:
        import.meta.env.VITE_OPS_AGENT_MODE === 'api' ? [] : ['product-scope', 'safety-direction'],
    },
  ]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(1);
  const caseDetailsRef = useRef<HTMLDetailsElement>(null);
  const loadQueue = useCallback(
    (currentScenario: DemoScenario) =>
      useAgentApi ? Promise.resolve([] as QueueTask[]) : fixtureAdapter.listQueue(currentScenario),
    [useAgentApi],
  );
  const { loading, data, error, retry } = useFixtureResource(
    scenario,
    loadQueue,
    branch + ':ops-agent-fixture',
  );

  useEffect(() => {
    // A cleared fixture conflict belongs to the current branch and scenario.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConflictCleared(false);
  }, [scenario, branch]);

  useLayoutEffect(() => {
    if (
      agentCaseScopeRef.current === scopedCaseSessionKey &&
      activeCaseScopeKey === scopedCaseSessionKey
    )
      return;
    agentCaseScopeRef.current = scopedCaseSessionKey;
    draftScopeRef.current = scopedDraftSessionKey;
    setActiveCaseScopeKey(scopedCaseSessionKey);
    caseScopeGeneration.current += 1;
    const nextCaseId =
      useAgentApi && scopedCaseSessionKey
        ? (window.sessionStorage.getItem(scopedCaseSessionKey) ?? undefined)
        : undefined;
    const nextUncertainSend =
      useAgentApi &&
      Boolean(uncertainInitialSendSessionKey) &&
      window.sessionStorage.getItem(uncertainInitialSendSessionKey!) === '1';
    caseLoadInFlight.current = false;
    caseActionInFlight.current = false;
    messageSendInFlight.current = false;
    focusCaseAfterAction.current = false;
    focusCaseErrorAfterAction.current = false;
    focusSendErrorAfterFailure.current = false;
    setAgentCaseId(nextCaseId);
    setAgentResult(undefined);
    setCaseLoading(Boolean(nextCaseId));
    setCaseActionLoading(false);
    setCaseNeedsReconciliation(false);
    setCaseError('');
    setCaseDialogAction(undefined);
    setCaseDetailsOpen(false);
    setSendingMessage(false);
    setPendingQuestion('');
    let savedDraft = '';
    if (useAgentApi && scopedDraftSessionKey) {
      try {
        savedDraft = window.sessionStorage.getItem(scopedDraftSessionKey) ?? '';
      } catch {
        // Keep the input usable when browser storage is unavailable.
      }
    }
    setChatDraft(savedDraft);
    setSendOutcomeUnknown(nextUncertainSend);
    setSendConflict(false);
    setSendError(
      nextUncertainSend
        ? 'Kết quả tạo yêu cầu trước đó chưa được xác nhận. Hãy đối soát trước khi gửi yêu cầu khác.'
        : '',
    );
    messageSequence.current = 1;
    setMessages([
      {
        id: 0,
        role: 'assistant',
        text: useAgentApi
          ? 'Bạn có thể tra cứu quy trình hoặc gửi một tình huống để trợ lý phân tích. Hãy nhập nội dung rồi chọn cách gửi phù hợp.'
          : 'Mình có thể gợi ý checklist từ nội dung demo. Câu trả lời không thay đổi đơn, xác nhận thanh toán hay ghi vào nhật ký.',
        sourceIds: useAgentApi ? [] : ['product-scope', 'safety-direction'],
      },
    ]);
  }, [
    activeCaseScopeKey,
    scopedCaseSessionKey,
    scopedDraftSessionKey,
    uncertainInitialSendSessionKey,
    useAgentApi,
  ]);

  useEffect(() => {
    if (!useAgentApi || !scopedDraftSessionKey || draftScopeRef.current !== scopedDraftSessionKey)
      return;
    try {
      if (chatDraft) window.sessionStorage.setItem(scopedDraftSessionKey, chatDraft);
      else window.sessionStorage.removeItem(scopedDraftSessionKey);
    } catch {
      // Draft persistence is best-effort; sending remains available without storage.
    }
  }, [chatDraft, scopedDraftSessionKey, useAgentApi]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    messageEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!focusCaseAfterAction.current || caseDialogAction || caseActionLoading) return;
    focusCaseAfterAction.current = false;
    opsAgentActionFocusTarget(
      'success',
      caseResultHeadingRef.current,
      caseErrorPanelRef.current,
    )?.focus();
  }, [agentResult, caseActionLoading, caseDialogAction]);

  useEffect(() => {
    if (!focusCaseErrorAfterAction.current || !caseError || caseDialogAction || caseActionLoading)
      return;
    focusCaseErrorAfterAction.current = false;
    opsAgentActionFocusTarget(
      'failure',
      caseResultHeadingRef.current,
      caseErrorPanelRef.current,
    )?.focus();
  }, [caseError, caseActionLoading, caseDialogAction]);

  useEffect(() => {
    if (!focusSendErrorAfterFailure.current || !sendError || sendingMessage) return;
    focusSendErrorAfterFailure.current = false;
    sendErrorPanelRef.current?.focus();
  }, [sendError, sendingMessage]);

  const branchQueue = useMemo(
    () =>
      (data ?? [])
        .filter((task) => task.branch === branch)
        .sort((a, b) => priorityRank[a.group] - priorityRank[b.group]),
    [data, branch],
  );
  const visibleQueue = useMemo(() => {
    const query = queueSearch.trim().toLocaleLowerCase('vi');
    return branchQueue.filter((task) => {
      const matchesKind = queueFilter === 'all' || task.kind === queueFilter;
      const matchesText =
        !query ||
        [task.orderId, task.customer, task.barcode ?? '', task.task, task.owner]
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(query);
      return matchesKind && matchesText;
    });
  }, [branchQueue, queueFilter, queueSearch]);
  const visibleSources = useMemo(() => {
    const query = knowledgeSearch.trim().toLocaleLowerCase('vi');
    return opsAgentSources.filter((source) => {
      const matchesTopic = knowledgeTopic === 'all' || source.topic === knowledgeTopic;
      const matchesType = knowledgeType === 'all' || source.type === knowledgeType;
      const matchesStatus =
        knowledgeStatus !== 'needs-verification' || source.status === 'Cần xác minh';
      const matchesText =
        !query ||
        [source.title, source.type, source.topic, source.summary]
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(query);
      return matchesTopic && matchesType && matchesStatus && matchesText;
    });
  }, [knowledgeSearch, knowledgeTopic, knowledgeType, knowledgeStatus]);
  const selectedSource = opsAgentSources.find((source) => source.id === selectedSourceId);
  const attentionCount = branchQueue.filter((task) => task.group !== 'Hôm nay').length;
  const overdueCount = branchQueue.filter((task) => task.group === 'Quá hạn').length;
  const unassignedCount = branchQueue.filter((task) => task.owner === 'Chưa gán').length;
  const verificationCount = opsAgentSources.filter(
    (source) => source.status === 'Cần xác minh',
  ).length;
  const currentCaseNeedsResolution =
    useAgentApi &&
    (activeCaseScopeKey !== scopedCaseSessionKey ||
      (Boolean(agentCaseId) &&
        (caseLoading ||
          caseNeedsReconciliation ||
          !agentResult ||
          !canContinueOpsAgentCase(agentResult))));
  const currentCaseStateUnknown =
    useAgentApi && Boolean(agentResult) && requiresOpsAgentStateReview(agentResult);

  const focusTab = (next: AgentTab) => {
    setTab(next);
    const index = availableTabs.findIndex((item) => item.id === next);
    if (index >= 0) tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: AgentTab) => {
    const index = availableTabs.findIndex((item) => item.id === current);
    if (index < 0) return;
    const nextIndex = nextOpsAgentTabIndex(event.key, index, availableTabs.length);
    if (nextIndex === undefined) return;
    event.preventDefault();
    focusTab(availableTabs[nextIndex].id);
  };

  const reloadAgentCase = useCallback(async () => {
    if (
      !agentCaseId ||
      !branchId ||
      agentCaseScopeRef.current !== scopedCaseSessionKey ||
      caseLoadInFlight.current ||
      caseActionInFlight.current
    )
      return;
    const operationGeneration = caseScopeGeneration.current;
    caseLoadInFlight.current = true;
    setCaseLoading(true);
    setCaseError('');
    try {
      const result = await getOpsAgentCase(agentCaseId, branchId);
      if (operationGeneration !== caseScopeGeneration.current) return;
      setAgentResult(result);
      setSendOutcomeUnknown(false);
      setSendConflict(false);
      setSendError('');
      setCaseNeedsReconciliation(false);
      if (uncertainInitialSendSessionKey)
        window.sessionStorage.removeItem(uncertainInitialSendSessionKey);
    } catch (loadError) {
      if (operationGeneration === caseScopeGeneration.current)
        setCaseError(opsAgentErrorMessage(loadError, 'Không tải được hồ sơ Agent.'));
    } finally {
      if (operationGeneration === caseScopeGeneration.current) {
        caseLoadInFlight.current = false;
        setCaseLoading(false);
      }
    }
  }, [
    agentCaseId,
    branchId,
    scopedCaseSessionKey,
    setSendConflict,
    setSendError,
    setSendOutcomeUnknown,
    uncertainInitialSendSessionKey,
  ]);

  useEffect(() => {
    if (!useAgentApi || !agentCaseId || !branchId || agentResult) return;
    const operationGeneration = caseScopeGeneration.current;
    let isCurrent = true;
    void getOpsAgentCase(agentCaseId, branchId)
      .then((result) => {
        if (isCurrent && operationGeneration === caseScopeGeneration.current)
          setAgentResult(result);
      })
      .catch((loadError: unknown) => {
        if (isCurrent && operationGeneration === caseScopeGeneration.current) {
          setCaseError(opsAgentErrorMessage(loadError, 'Không tải được yêu cầu hiện tại.'));
        }
      })
      .finally(() => {
        if (isCurrent && operationGeneration === caseScopeGeneration.current) setCaseLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [agentCaseId, agentResult, branchId, scopedCaseSessionKey, useAgentApi]);

  const forgetAgentCaseReference = () => {
    setAgentCaseId(undefined);
    setTab(useAgentApi ? 'chat' : 'overview');
    setCaseDetailsOpen(false);
    setAgentResult(undefined);
    setCaseError('');
    setCaseNeedsReconciliation(false);
    setSendOutcomeUnknown(true);
    setSendError(
      'Không thể tải yêu cầu cũ. Yêu cầu đó có thể vẫn tồn tại; hãy đối soát trước khi gửi yêu cầu khác.',
    );
    if (scopedCaseSessionKey) window.sessionStorage.removeItem(scopedCaseSessionKey);
    if (uncertainInitialSendSessionKey)
      window.sessionStorage.setItem(uncertainInitialSendSessionKey, '1');
  };

  const openCaseDetails = () => {
    setCaseDetailsOpen(true);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.requestAnimationFrame(() => {
      caseDetailsRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    });
    if (!agentResult) void reloadAgentCase();
  };

  const runAgentCaseAction = async (action: AgentCaseAction) => {
    if (
      !agentCaseId ||
      !branchId ||
      !agentResult ||
      agentCaseScopeRef.current !== scopedCaseSessionKey ||
      requiresOpsAgentStateReview(agentResult) ||
      caseActionLoading ||
      caseNeedsReconciliation ||
      caseLoading ||
      caseLoadInFlight.current ||
      caseActionInFlight.current
    )
      return;
    const operationGeneration = caseScopeGeneration.current;
    caseActionInFlight.current = true;
    setCaseActionLoading(true);
    setCaseError('');
    try {
      let result: OpsAgentCaseResult;
      switch (action) {
        case 'confirm':
          if (!agentResult.pendingConfirmation) return;
          result = await confirmOpsAgentCase(
            agentCaseId,
            agentResult.pendingConfirmation.confirmationId,
            branchId,
          );
          break;
        case 'reject-confirmation':
          if (!agentResult.pendingConfirmation) return;
          result = await rejectOpsAgentConfirmation(
            agentCaseId,
            agentResult.pendingConfirmation.confirmationId,
            branchId,
          );
          break;
        case 'approve':
          if (!agentResult.pendingApproval) return;
          result = await approveOpsAgentAction(agentResult.pendingApproval.approvalId, branchId);
          break;
        case 'reject-approval':
          if (!agentResult.pendingApproval) return;
          result = await rejectOpsAgentAction(agentResult.pendingApproval.approvalId, branchId);
          break;
        case 'cancel':
          result = await cancelOpsAgentCase(agentCaseId, branchId);
          break;
      }
      if (operationGeneration !== caseScopeGeneration.current) return;
      focusCaseAfterAction.current = true;
      setAgentResult(result);
      setCaseNeedsReconciliation(false);
      setCaseDialogAction(undefined);
      const nextMessage: ChatMessage = {
        id: messageSequence.current++,
        role: 'assistant',
        text: result.message,
        sourceIds: [],
        evidence: result.evidence,
      };
      setMessages((current) => [...current, nextMessage]);
    } catch (actionError) {
      if (operationGeneration !== caseScopeGeneration.current) return;
      setCaseDialogAction(undefined);
      setCaseNeedsReconciliation(true);
      focusCaseErrorAfterAction.current = true;
      setCaseError(opsAgentErrorMessage(actionError, 'Không hoàn tất được thao tác Agent.'));
    } finally {
      if (operationGeneration === caseScopeGeneration.current) {
        caseActionInFlight.current = false;
        setCaseActionLoading(false);
      }
    }
  };

  const loadKnowledgeAnswer = async (query = knowledgeQuery.trim()) => {
    if (query.length < 2 || knowledgeLoading) return undefined;
    setKnowledgeAnswer(undefined);
    setKnowledgeLoading(true);
    setKnowledgeError('');
    try {
      const result = await answerOpsKnowledge(query, 5);
      setKnowledgeAnswer({ query, result });
      return result;
    } catch (lookupError) {
      setKnowledgeError(knowledgeRequestError(lookupError));
      return undefined;
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const submitKnowledgeLookup = async (query = chatDraft.trim()) => {
    if (query.length < 2 || knowledgeLoading || sendingMessage) return;
    setKnowledgeQuery(query);
    const result = await loadKnowledgeAnswer(query);
    if (!result) return;
    const userMessage: ChatMessage = {
      id: messageSequence.current++,
      role: 'user',
      text: query,
      sourceIds: [],
    };
    const assistantMessage: ChatMessage = {
      id: messageSequence.current++,
      role: 'assistant',
      text: opsKnowledgeAnswerText(result),
      question: query,
      sourceIds: [],
      knowledgeAnswer: result,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setChatDraft('');
  };

  const openTask = (task: QueueTask) => {
    if (useAgentApi) return;
    if (scenario === 'conflict' && !conflictCleared) {
      setSelectedTask(task);
      return;
    }
    go('orders', { order: task.orderId });
  };

  const askAboutTask = (task: QueueTask) => {
    const questionByKind: Record<QueueTask['kind'], string> = {
      pending: 'Tôi nên đối chiếu yêu cầu thuê thế nào?',
      handover: 'Checklist giao nhận trang phục gồm gì?',
      return: 'Checklist nhận đồ trả và tiền cọc cần lưu ý gì?',
      overdue: 'Tôi nên kiểm tra công việc quá hạn thế nào?',
      payment: 'Tôi nên đối chiếu chuyển khoản thế nào?',
    };
    setSelectedTask(useAgentApi ? undefined : task);
    setChatDraft(
      useAgentApi
        ? questionByKind[task.kind]
        : questionByKind[task.kind] + ' Mã đơn ' + task.orderId + '.',
    );
    setTab('chat');
  };

  const openChatForWorkflow = (workflowId: string) => {
    const questionByWorkflow: Record<string, string> = {
      request: 'Tôi nên đối chiếu yêu cầu thuê thế nào?',
      payment: 'Tôi nên đối chiếu chuyển khoản thế nào?',
      handover: 'Checklist giao nhận trang phục gồm gì?',
      return: 'Checklist nhận đồ trả và tiền cọc cần lưu ý gì?',
    };
    setSelectedTask(undefined);
    setChatDraft(questionByWorkflow[workflowId] ?? '');
    setTab('chat');
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = chatDraft.trim();
    if (
      !question ||
      (useAgentApi && !branchId) ||
      sendingMessage ||
      messageSendInFlight.current ||
      (useAgentApi && agentCaseScopeRef.current !== scopedCaseSessionKey) ||
      (useAgentApi && (sendOutcomeUnknown || currentCaseStateUnknown || currentCaseNeedsResolution))
    )
      return;
    const requestScopeGeneration = caseScopeGeneration.current;
    messageSendInFlight.current = true;
    setSendError('');
    setSendConflict(false);
    setPendingQuestion(question);
    setSendingMessage(true);
    const userMessage: ChatMessage = {
      id: 0,
      role: 'user',
      text: question,
      sourceIds: [],
    };
    try {
      let assistantMessage: ChatMessage;
      if (useAgentApi) {
        const reply = await sendOpsAgentMessage(question, branchId!, agentCaseId);
        if (caseScopeGeneration.current !== requestScopeGeneration) return;
        setAgentCaseId(reply.caseId);
        if (scopedCaseSessionKey) window.sessionStorage.setItem(scopedCaseSessionKey, reply.caseId);
        setAgentResult(reply);
        setSendOutcomeUnknown(false);
        if (uncertainInitialSendSessionKey)
          window.sessionStorage.removeItem(uncertainInitialSendSessionKey);
        const pendingSummary = reply.pendingApproval?.summary ?? reply.pendingConfirmation?.summary;
        assistantMessage = {
          id: 0,
          role: 'assistant',
          text: pendingSummary
            ? `${reply.message}\n\nĐang chờ xác nhận: ${pendingSummary}`
            : reply.message,
          sourceIds: [],
          evidence: reply.evidence,
        };
      } else {
        const reply = opsAgentFixtureAdapter.answer(question);
        assistantMessage = {
          id: 0,
          role: 'assistant',
          text: reply.text,
          sourceIds: reply.sourceIds,
        };
      }
      userMessage.id = messageSequence.current++;
      assistantMessage.id = messageSequence.current++;
      setMessages((current) => [...current, userMessage, assistantMessage]);
      setChatDraft('');
      if (scopedDraftSessionKey) {
        try {
          window.sessionStorage.removeItem(scopedDraftSessionKey);
        } catch {
          // Draft persistence is best-effort.
        }
      }
    } catch (error) {
      if (caseScopeGeneration.current !== requestScopeGeneration) return;
      const recovery = opsAgentSendRecovery(error, Boolean(agentCaseId));
      focusSendErrorAfterFailure.current = true;
      setSendOutcomeUnknown(recovery.outcomeUnknown);
      if (recovery.requiresCaseRefresh) setCaseNeedsReconciliation(true);
      if (recovery.outcomeUnknown && !agentCaseId && uncertainInitialSendSessionKey)
        window.sessionStorage.setItem(uncertainInitialSendSessionKey, '1');
      setSendConflict(recovery.conflict && Boolean(agentCaseId));
      setSendError(
        opsAgentErrorMessage(
          error,
          useAgentApi
            ? 'Không gửi được tình huống tới trợ lý.'
            : 'Không gửi được câu hỏi tới Ops Agent.',
        ),
      );
    } finally {
      if (caseScopeGeneration.current === requestScopeGeneration) {
        setPendingQuestion('');
        messageSendInFlight.current = false;
        setSendingMessage(false);
      }
    }
  };

  const newConversation = () => {
    if (
      sendingMessage ||
      (useAgentApi &&
        (sendOutcomeUnknown ||
          caseLoading ||
          caseNeedsReconciliation ||
          currentCaseStateUnknown ||
          (agentCaseId && !isOpsAgentCaseTerminal(agentResult))))
    )
      return;
    messageSequence.current = 1;
    if (useAgentApi) setTab('chat');
    setCaseDetailsOpen(false);
    setSelectedTask(undefined);
    setChatDraft('');
    setAgentCaseId(undefined);
    setAgentResult(undefined);
    if (scopedCaseSessionKey) window.sessionStorage.removeItem(scopedCaseSessionKey);
    setCaseError('');
    setCaseNeedsReconciliation(false);
    setSendError('');
    setSendOutcomeUnknown(false);
    setSendConflict(false);
    if (uncertainInitialSendSessionKey)
      window.sessionStorage.removeItem(uncertainInitialSendSessionKey);
    setMessages([
      {
        id: 0,
        role: 'assistant',
        text: useAgentApi
          ? 'Tình huống mới sẽ tạo một yêu cầu để theo dõi. Dùng mã đơn khi cần; không gửi mật khẩu, mã OTP hoặc thông tin thanh toán đầy đủ.'
          : 'Cuộc trò chuyện mới chỉ tồn tại trong trình duyệt này. Hãy chọn câu hỏi gợi ý; không gửi dữ liệu khách thật.',
        sourceIds: useAgentApi ? [] : ['product-scope'],
      },
    ]);
  };

  const suggestedQuestions = useAgentApi
    ? [
        'Quy trình kiểm tra trang phục khi giao cho khách gồm những gì?',
        'Khách chưa trả đồ nhưng lịch thuê kế tiếp sắp bắt đầu. Tôi nên làm gì?',
        'Khi nhận lại trang phục, cần kiểm tra những gì?',
        'Tôi phát hiện trang phục bị hỏng khi nhận lại. Bước tiếp theo là gì?',
      ]
    : [
        'Tôi nên đối chiếu yêu cầu thuê thế nào?',
        'Checklist chuẩn bị giao đồ gồm gì?',
        'Có thể xác nhận chuyển khoản ở đây không?',
        'Chính sách hoàn cọc đã được chốt chưa?',
      ];

  return (
    <div className="page staff-page ops-agent-page">
      <div className="staff-page-heading ops-agent-heading">
        <div>
          <p className="eyebrow">{useAgentApi ? 'KHU VẬN HÀNH' : 'HỖ TRỢ VẬN HÀNH'}</p>
          <h1>{useAgentApi ? 'Trợ lý vận hành' : 'Ops Agent'}</h1>
          <p>
            {useAgentApi
              ? 'Tra cứu quy trình hoặc mô tả tình huống ngay tại một màn hình.'
              : 'Tra cứu checklist và việc cần chú ý tại chi nhánh. Nhân viên vẫn xử lý trên màn hình Studio.'}
          </p>
        </div>
        {!useAgentApi && (
          <div className="ops-agent-heading-meta">
            <span className="ops-demo-badge">
              <span aria-hidden="true">●</span> DEMO · FIXTURE
            </span>
            <span className="date-pill">
              <Icon name="pin" size={17} />
              {branch || 'Chưa chọn chi nhánh'}
            </span>
            <span className="ops-fixture-time">
              <Icon name="clock" size={16} />
              Dữ liệu mẫu · {formatFixtureTime()}
            </span>
          </div>
        )}
      </div>

      {useAgentApi && !branchId && (
        <Feedback tone="warning" title="Chưa xác định được chi nhánh">
          Chọn chi nhánh được gán trước khi gửi tình huống cho trợ lý. Bạn vẫn có thể tra cứu tài
          liệu; nội dung chưa gửi sẽ được giữ trong ô nhập.
        </Feedback>
      )}

      {!useAgentApi && (
        <div className="ops-agent-notice" role="status">
          <Icon name="spark" size={18} />
          <p>
            <strong>Chỉ hướng dẫn tham khảo.</strong> Không có kết nối trợ lý trực tuyến, không ghi
            dữ liệu và không xác nhận nghiệp vụ.
          </p>
        </div>
      )}

      {!useAgentApi && (
        <div className="ops-tabs-wrap">
          <div className="ops-agent-tabs" role="tablist" aria-label="Các khu vực Ops Agent">
            {availableTabs.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={'ops-agent-tab-' + item.id}
                type="button"
                role="tab"
                aria-selected={visibleTab === item.id}
                aria-controls={'ops-agent-panel-' + item.id}
                tabIndex={visibleTab === item.id ? 0 : -1}
                className={visibleTab === item.id ? 'ops-agent-tab active' : 'ops-agent-tab'}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => handleTabKeyDown(event, item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!useAgentApi && scenario === 'conflict' && !conflictCleared && (
        <Feedback
          tone="warning"
          title="Tình huống xung đột fixture"
          className="ops-conflict-banner"
          action={
            <div className="ops-conflict-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setConflictCleared(true);
                  setSelectedTask(undefined);
                  retry();
                }}
              >
                Tải lại fixture
              </Button>
              {selectedTask && (
                <Button
                  variant="quiet"
                  onClick={() => go('orders', { order: selectedTask.orderId })}
                >
                  Mở đơn để đối chiếu
                </Button>
              )}
            </div>
          }
        >
          Một mục cần được đối chiếu lại với đơn gốc. Đây là trạng thái minh họa, chưa có thay đổi
          nghiệp vụ nào được thực hiện.
        </Feedback>
      )}

      <TabPanel
        tab={visibleTab}
        labelledBy={useAgentApi ? 'ops-agent-support-title' : undefined}
        hasTabs={!useAgentApi}
      >
        {visibleTab === 'overview' &&
          (useAgentApi ? (
            <div className="ops-live-home">
              <section className="ops-live-home-hero">
                <div>
                  <p className="eyebrow">HỖ TRỢ CA LÀM VIỆC</p>
                  <h2>Bạn cần tra cứu hay xử lý tình huống?</h2>
                  <p>
                    Tra cứu tài liệu để tìm quy trình và nguồn tham khảo. Nếu cần phân tích một việc
                    đang xảy ra, hãy gửi tình huống để tạo yêu cầu theo dõi riêng.
                  </p>
                </div>
                <Button onClick={() => setTab('chat')}>
                  Mô tả tình huống <Icon name="arrow" size={17} />
                </Button>
              </section>

              <div className="ops-live-home-actions" aria-label="Tác vụ nhanh">
                <button
                  type="button"
                  className="ops-live-home-action"
                  onClick={() => setTab('chat')}
                >
                  <span className="ops-live-home-action-icon">
                    <Icon name="spark" size={19} />
                  </span>
                  <strong>Hỗ trợ tình huống</strong>
                  <span>Trợ lý phân tích vấn đề và tạo yêu cầu để theo dõi kết quả.</span>
                  <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="ops-live-home-action"
                  onClick={() => setTab('knowledge')}
                >
                  <span className="ops-live-home-action-icon">
                    <Icon name="search" size={19} />
                  </span>
                  <strong>Tra cứu tài liệu</strong>
                  <span>
                    Tìm quy trình trong kho tri thức kèm nguồn; không tạo yêu cầu vận hành.
                  </span>
                  <Icon name="arrow" size={17} />
                </button>
              </div>

              <Feedback tone="neutral" title="Hàng đợi chưa được cung cấp qua API Agent">
                Không có dữ liệu công việc trực tiếp ở khu vực này. Hãy xử lý đơn thuê tại màn hình
                Studio; hệ thống không hiển thị hàng đợi mẫu trong chế độ API.
              </Feedback>

              {agentCaseId && (
                <section className="feature-panel ops-live-home-request">
                  <div className="feature-panel-head">
                    <div>
                      <p className="eyebrow">TRẠNG THÁI XỬ LÝ</p>
                      <h2>Theo dõi yêu cầu</h2>
                    </div>
                    {agentResult && (
                      <StatusLabel
                        text={agentStateLabel(agentResult.state, currentCaseStateUnknown)}
                        tone={agentStateTone(agentResult.state, currentCaseStateUnknown)}
                      />
                    )}
                  </div>
                  {caseLoading && !agentResult ? (
                    <div className="ops-queue-skeleton" role="status" aria-label="Đang tải yêu cầu">
                      <span />
                      <span />
                    </div>
                  ) : caseError && !agentResult ? (
                    <Feedback
                      tone="danger"
                      title="Chưa thể tải yêu cầu"
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => void reloadAgentCase()}
                          loading={caseLoading}
                        >
                          Thử lại
                        </Button>
                      }
                    >
                      {caseError}
                    </Feedback>
                  ) : agentResult ? (
                    <div className="ops-live-home-request-content">
                      <div>
                        <strong>{agentResult.goal?.summary ?? 'Yêu cầu hỗ trợ vận hành'}</strong>
                        <p>
                          {agentResult.pendingApproval?.summary ??
                            agentResult.pendingConfirmation?.summary ??
                            'Mở chi tiết để xem kết quả, căn cứ và bước tiếp theo.'}
                        </p>
                      </div>
                      <Button variant="secondary" onClick={() => setTab('case')}>
                        Xem chi tiết <Icon name="arrow" size={16} />
                      </Button>
                    </div>
                  ) : (
                    <EmptyState
                      title="Yêu cầu đang được tải"
                      action={
                        <Button variant="secondary" onClick={() => void reloadAgentCase()}>
                          Tải lại trạng thái
                        </Button>
                      }
                    >
                      Hệ thống đang lấy trạng thái mới nhất cho phiên này.
                    </EmptyState>
                  )}
                </section>
              )}

              {currentCaseStateUnknown && (
                <Feedback
                  tone="warning"
                  title="Trạng thái yêu cầu cần kiểm tra"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void reloadAgentCase()}
                      loading={caseLoading}
                    >
                      Cập nhật trạng thái
                    </Button>
                  }
                >
                  Không tiếp tục yêu cầu này cho đến khi trạng thái và dữ liệu chờ được xác nhận.
                  Nếu vẫn không khớp, hãy liên hệ người phụ trách. Yêu cầu chưa được xem là đã hoàn
                  tất.
                </Feedback>
              )}

              <p className="ops-live-home-note">
                Khi trợ lý đề xuất thao tác, hãy kiểm tra nội dung và nguồn trước khi xác nhận.
              </p>
            </div>
          ) : (
            <div className="ops-overview">
              <div className="ops-metric-grid">
                <article className="ops-metric-card">
                  <span>Việc tại chi nhánh</span>
                  <strong>{loading ? '—' : branchQueue.length}</strong>
                  <small>
                    {loading
                      ? 'Đang đọc dữ liệu mẫu'
                      : unassignedCount + ' việc chưa có người phụ trách'}
                  </small>
                </article>
                <article className="ops-metric-card">
                  <span>Cần nhân viên chú ý</span>
                  <strong>{loading ? '—' : attentionCount}</strong>
                  <small>Quá hạn, sắp đến hạn hoặc chờ lâu</small>
                </article>
                <article className="ops-metric-card">
                  <span>Quá hạn</span>
                  <strong>{loading ? '—' : overdueCount}</strong>
                  <small>Đối chiếu trên đơn gốc</small>
                </article>
                <article className="ops-metric-card">
                  <span>Nguồn cần xác minh</span>
                  <strong>{verificationCount}</strong>
                  <small>Chính sách và quy trình chưa duyệt</small>
                </article>
              </div>

              <div className="ops-overview-grid">
                <section className="feature-panel ops-overview-queue">
                  <div className="feature-panel-head">
                    <div>
                      <p className="eyebrow">ƯU TIÊN MẪU · FIXTURE</p>
                      <h2>Việc cần xem</h2>
                    </div>
                    <Button variant="quiet" onClick={() => setTab('queue')}>
                      Mở hàng đợi
                    </Button>
                  </div>
                  {loading ? (
                    <div
                      className="ops-queue-skeleton"
                      role="status"
                      aria-label="Đang tải hàng đợi"
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : error ? (
                    <Feedback
                      tone="danger"
                      title="Không tải được hàng đợi fixture"
                      action={
                        <Button variant="secondary" onClick={retry}>
                          Thử lại
                        </Button>
                      }
                    >
                      {error}
                    </Feedback>
                  ) : branchQueue.length === 0 ? (
                    <EmptyState title="Chưa có việc trong hàng đợi">
                      Không có dữ liệu mẫu cho chi nhánh này.
                    </EmptyState>
                  ) : (
                    <div className="ops-overview-task-list">
                      {branchQueue.slice(0, 3).map((task) => (
                        <button
                          type="button"
                          className="ops-overview-task"
                          key={task.id}
                          onClick={() => askAboutTask(task)}
                        >
                          <span className="ops-overview-task-time">{task.due}</span>
                          <span>
                            <strong>{task.task}</strong>
                            <small>
                              {task.orderId} · {task.customer}
                            </small>
                          </span>
                          <Icon name="arrow" size={17} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="feature-panel ops-runtime-card">
                  <div className="feature-panel-head">
                    <div>
                      <p className="eyebrow">TRẠNG THÁI HỆ THỐNG</p>
                      <h2>{useAgentApi ? 'Phạm vi API hiện có' : 'Bản thiết kế demo'}</h2>
                    </div>
                    <StatusLabel
                      text={useAgentApi ? 'API bật' : 'Fixture'}
                      tone={useAgentApi ? 'info' : 'neutral'}
                    />
                  </div>
                  {useAgentApi ? (
                    <dl className="key-facts">
                      <div>
                        <dt>Hỏi Agent</dt>
                        <dd>API Studio</dd>
                      </div>
                      <div>
                        <dt>Hồ sơ Agent</dt>
                        <dd>Đọc, xác nhận, từ chối, duyệt và hủy theo quyền máy chủ</dd>
                      </div>
                      <div>
                        <dt>Tra cứu tài liệu</dt>
                        <dd>API hỏi đáp có nguồn</dd>
                      </div>
                      <div>
                        <dt>Hàng đợi / checklist</dt>
                        <dd>Fixture, không phải dữ liệu live</dd>
                      </div>
                      <div>
                        <dt>Nhật ký tập trung</dt>
                        <dd>Chưa có API trên UI</dd>
                      </div>
                    </dl>
                  ) : (
                    <dl className="key-facts">
                      <div>
                        <dt>Hàng đợi</dt>
                        <dd>Fixture tĩnh từ Studio</dd>
                      </div>
                      <div>
                        <dt>Kết nối trực tuyến</dt>
                        <dd>Ngoại tuyến</dd>
                      </div>
                      <div>
                        <dt>Bộ điều phối</dt>
                        <dd>Chưa tích hợp</dd>
                      </div>
                      <div>
                        <dt>Mô hình / dịch vụ AI</dt>
                        <dd>Chưa kết nối</dd>
                      </div>
                      <div>
                        <dt>Thao tác ghi</dt>
                        <dd>Đang tắt</dd>
                      </div>
                      <div>
                        <dt>Lưu hội thoại</dt>
                        <dd>Chỉ trong trình duyệt</dd>
                      </div>
                    </dl>
                  )}
                  <p className="small-note">
                    API bật chỉ cho biết cấu hình tích hợp ở giao diện; mỗi yêu cầu vẫn có thể lỗi
                    hoặc bị từ chối theo quyền máy chủ.
                  </p>
                  <ol className="ops-flow">
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Đọc dữ liệu theo chi nhánh</strong>
                        <small>Fixture minh họa</small>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>Đối chiếu nguồn tài liệu</strong>
                        <small>Hiển thị nguồn và trạng thái</small>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>Gợi ý checklist</strong>
                        <small>Nhân viên tự kiểm tra</small>
                      </div>
                    </li>
                    <li>
                      <span>4</span>
                      <div>
                        <strong>Thực hiện trong Studio</strong>
                        <small>Hệ thống nghiệp vụ mới ghi nhận kết quả</small>
                      </div>
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          ))}

        {visibleTab === 'queue' && (
          <div className="ops-queue-view">
            <div className="feature-heading">
              <div>
                <h2>Hàng đợi công việc</h2>
                <p>
                  Các mục mẫu được lọc theo chi nhánh đang làm việc. Mở đơn để xử lý trong Studio.
                </p>
              </div>
              <Button variant="secondary" onClick={retry} loading={loading}>
                <Icon name="refresh" size={17} />
                Tải lại fixture
              </Button>
            </div>
            <div className="ops-queue-controls">
              <Field
                label="Tìm đơn, khách, công việc hoặc mã bộ"
                placeholder="Ví dụ: RT-1024, BC-028..."
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
              />
              <span className="ops-queue-branch">
                <Icon name="pin" size={16} />
                {branch}
              </span>
            </div>
            <div className="ops-filter-list" role="group" aria-label="Lọc loại công việc">
              {filters.map((filter) => (
                <button
                  type="button"
                  className={
                    queueFilter === filter.id ? 'ops-filter-chip active' : 'ops-filter-chip'
                  }
                  aria-pressed={queueFilter === filter.id}
                  key={filter.id}
                  onClick={() => setQueueFilter(filter.id)}
                >
                  {filter.label}
                  {filter.id === 'all' ? (
                    <span>{loading ? '—' : branchQueue.length}</span>
                  ) : (
                    <span>
                      {loading ? '—' : branchQueue.filter((task) => task.kind === filter.id).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div
                className="ops-queue-skeleton ops-queue-skeleton-large"
                role="status"
                aria-label="Đang tải hàng đợi"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : error ? (
              <Feedback
                tone="danger"
                title="Không tải được hàng đợi fixture"
                action={
                  <Button variant="secondary" onClick={retry}>
                    Thử lại
                  </Button>
                }
              >
                {error} Bộ lọc và nội dung tìm kiếm đang được giữ lại.
              </Feedback>
            ) : branchQueue.length === 0 ? (
              <EmptyState title="Hàng đợi đang trống">
                Chưa có công việc mẫu tại {branch}. Không có thao tác nghiệp vụ nào cần thực hiện ở
                đây.
              </EmptyState>
            ) : visibleQueue.length === 0 ? (
              <EmptyState
                title="Không tìm thấy công việc phù hợp"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQueueSearch('');
                      setQueueFilter('all');
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              >
                Hãy đổi từ khóa hoặc chọn một loại công việc khác.
              </EmptyState>
            ) : (
              <div className="ops-queue-list">
                {visibleQueue.map((task) => (
                  <QueueRow
                    key={task.id}
                    task={task}
                    onAsk={() => askAboutTask(task)}
                    onOpen={() => openTask(task)}
                    disableOpen={useAgentApi}
                  />
                ))}
              </div>
            )}
            <p className="ops-fixture-caption">
              DEMO · FIXTURE — danh sách minh họa, không tự cập nhật theo thay đổi tại quầy.
            </p>
          </div>
        )}

        {visibleTab === 'workflows' && (
          <div className="ops-workflows-view">
            <div className="feature-heading">
              <div>
                <h2>Quy trình tham khảo</h2>
                <p>
                  Checklist minh họa để nhóm rà soát. Chưa thay thế quy trình được Studio phê duyệt.
                </p>
              </div>
              <StatusLabel text="Cần chủ quy trình xác nhận" tone="warning" />
            </div>
            <div className="ops-workflow-grid">
              {opsAgentWorkflows.map((workflow) => (
                <article className="feature-panel ops-workflow-card" key={workflow.id}>
                  <div className="feature-panel-head">
                    <div>
                      <StatusLabel
                        text={workflow.status}
                        tone={sourceStatusTone(workflow.status)}
                      />
                      <h3>{workflow.title}</h3>
                    </div>
                    <span className="ops-workflow-index" aria-hidden="true">
                      {String(opsAgentWorkflows.indexOf(workflow) + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="muted">{workflow.summary}</p>
                  <ol className="ops-checklist">
                    {workflow.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {!useAgentApi ? (
                    <div className="ops-source-chips" aria-label="Nguồn tham khảo fixture">
                      {workflow.sources.map((sourceId) => {
                        const source = opsAgentSources.find((item) => item.id === sourceId);
                        return source ? (
                          <button
                            type="button"
                            className="ops-source-chip"
                            key={source.id}
                            onClick={() => {
                              setSelectedSourceId(source.id);
                              setTab('knowledge');
                            }}
                          >
                            {source.title}
                          </button>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p className="ops-fixture-caption">
                      Nguồn của checklist này chỉ là fixture, không phải tài liệu đã được Agent lập
                      chỉ mục.
                    </p>
                  )}
                  <Button variant="quiet" onClick={() => openChatForWorkflow(workflow.id)}>
                    Hỏi về checklist này
                  </Button>
                </article>
              ))}
            </div>
          </div>
        )}

        {visibleTab === 'knowledge' &&
          (useAgentApi ? (
            <div className="ops-live-knowledge">
              <div className="feature-heading">
                <div>
                  <h2>Tra cứu tài liệu</h2>
                  <p>
                    Tìm quy trình trong kho tri thức và kiểm tra nguồn trước khi áp dụng. Tra cứu
                    này chỉ đọc tài liệu, không tạo yêu cầu vận hành.
                  </p>
                </div>
                <StatusLabel text="Tra cứu chỉ đọc" tone="neutral" />
              </div>
              <section className="feature-panel ops-live-knowledge-panel">
                <form
                  className="ops-knowledge-query"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setChatDraft(knowledgeQuery);
                    void submitKnowledgeLookup(knowledgeQuery);
                  }}
                >
                  <TextAreaField
                    label="Bạn muốn tìm hiểu điều gì?"
                    hint="Không nhập mật khẩu, mã OTP hoặc toàn bộ thông tin thanh toán."
                    placeholder="Ví dụ: Khi nhận đồ trả cần kiểm tra những gì?"
                    value={knowledgeQuery}
                    disabled={knowledgeLoading}
                    maxLength={1000}
                    required
                    rows={3}
                    onChange={(event) => setKnowledgeQuery(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={knowledgeQuery.trim().length < 2 || knowledgeLoading}
                    loading={knowledgeLoading}
                  >
                    {knowledgeLoading ? 'Đang tìm…' : 'Tìm hướng dẫn'}
                  </Button>
                </form>
                {knowledgeLoading && (
                  <div className="ops-knowledge-loading" role="status" aria-live="polite">
                    <span className="button-spinner" aria-hidden="true" /> Đang tìm câu trả lời và
                    kiểm tra nguồn…
                  </div>
                )}
                {knowledgeError && (
                  <Feedback
                    tone="danger"
                    title="Không tra cứu được kho tri thức"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void loadKnowledgeAnswer();
                        }}
                        disabled={knowledgeLoading}
                      >
                        Thử lại
                      </Button>
                    }
                  >
                    {knowledgeError} Câu hỏi được giữ lại để bạn có thể thử lại.
                  </Feedback>
                )}
                {!knowledgeAnswer && !knowledgeError && !knowledgeLoading && (
                  <EmptyState title="Tìm hướng dẫn cho công việc">
                    Nhập một câu hỏi ngắn, ví dụ về quy trình nhận đồ, trả đồ hoặc xử lý yêu cầu
                    thuê.
                  </EmptyState>
                )}
                {knowledgeAnswer && (
                  <section
                    className="ops-knowledge-answer"
                    aria-live="polite"
                    aria-label="Kết quả tra cứu"
                  >
                    <div className="ops-knowledge-answer-head">
                      <div>
                        <p className="eyebrow">NỘI DUNG TRA CỨU</p>
                        <h3>{knowledgeAnswer.query}</h3>
                      </div>
                      <StatusLabel
                        text={
                          knowledgeAnswer.result.outcome === 'insufficient_context'
                            ? 'Chưa tìm thấy căn cứ'
                            : knowledgeAnswer.result.provisional
                              ? 'Câu trả lời tạm'
                              : 'Có câu trả lời'
                        }
                        tone={
                          knowledgeAnswer.result.outcome === 'insufficient_context' ||
                          knowledgeAnswer.result.provisional
                            ? 'warning'
                            : 'success'
                        }
                      />
                    </div>
                    <p className="ops-knowledge-answer-text">
                      {opsKnowledgeAnswerText(knowledgeAnswer.result)}
                    </p>
                    {knowledgeAnswer.result.outcome === 'insufficient_context' && (
                      <Feedback
                        tone="warning"
                        title="Đừng xử lý theo suy đoán"
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setChatDraft(knowledgeAnswer.query);
                              setTab('chat');
                            }}
                          >
                            Gửi tình huống cho trợ lý
                          </Button>
                        }
                      >
                        Chưa có hướng dẫn phù hợp để làm căn cứ. Hãy xác nhận quy định đang áp dụng
                        với người phụ trách trước khi xử lý.
                      </Feedback>
                    )}
                    {knowledgeAnswer.result.provisional && (
                      <Feedback tone="warning" title="Cần người có thẩm quyền đối chiếu">
                        API đánh dấu nội dung này là tạm thời. Không dùng làm chính sách đã duyệt
                        hoặc căn cứ tự động ghi nghiệp vụ.
                      </Feedback>
                    )}
                    <div className="ops-knowledge-citations">
                      <h3>Nguồn tham khảo</h3>
                      {knowledgeAnswer.result.sources.length === 0 ? (
                        <EmptyState title="Chưa có nguồn để đối chiếu">
                          Chỉ áp dụng câu trả lời khi có hướng dẫn phù hợp hoặc đã được người phụ
                          trách xác nhận.
                        </EmptyState>
                      ) : (
                        <ul>
                          {knowledgeAnswer.result.sources.map((source, index) => (
                            <li key={`${source.documentId}:${source.citation}:${index}`}>
                              <div>
                                <strong>{source.heading || 'Tài liệu tham khảo'}</strong>
                                <span>
                                  {source.citation.trim() || 'Chưa có vị trí trích dẫn cụ thể.'}
                                </span>
                              </div>
                              <div className="ops-knowledge-citation-meta">
                                <StatusLabel
                                  text={
                                    source.businessAuthority ? 'Nguồn nghiệp vụ' : 'Nguồn tham khảo'
                                  }
                                  tone={source.businessAuthority ? 'info' : 'neutral'}
                                />
                                <StatusLabel
                                  text={knowledgeSourceStatusLabel(source.status)}
                                  tone={knowledgeSourceStatusTone(source.status)}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )}
              </section>
            </div>
          ) : (
            <div className="ops-knowledge-view">
              <div className="feature-heading">
                <div>
                  <h2>Nguồn tri thức</h2>
                  <p>
                    Tài liệu thiết kế và checklist fixture. Chưa có tải lên, phê duyệt hoặc lập chỉ
                    mục tài liệu.
                  </p>
                </div>
                <StatusLabel text="Nguồn mẫu" tone="info" />
              </div>
              <div className="ops-knowledge-controls">
                <Field
                  label="Tìm tài liệu"
                  placeholder="Tìm theo tên, chủ đề..."
                  value={knowledgeSearch}
                  onChange={(event) => setKnowledgeSearch(event.target.value)}
                />
                <label className="field">
                  <span>Loại tài liệu</span>
                  <select
                    value={knowledgeType}
                    onChange={(event) => setKnowledgeType(event.target.value)}
                  >
                    <option value="all">Tất cả loại</option>
                    {[...new Set(opsAgentSources.map((source) => source.type))].map((type) => (
                      <option value={type} key={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Chủ đề</span>
                  <select
                    value={knowledgeTopic}
                    onChange={(event) => setKnowledgeTopic(event.target.value)}
                  >
                    <option value="all">Tất cả chủ đề</option>
                    {[...new Set(opsAgentSources.map((source) => source.topic))].map((topic) => (
                      <option value={topic} key={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Trạng thái nguồn</span>
                  <select
                    value={knowledgeStatus}
                    onChange={(event) => setKnowledgeStatus(event.target.value)}
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="needs-verification">Cần xác minh</option>
                  </select>
                </label>
              </div>
              {selectedSource && (
                <section className="ops-source-focus" aria-label="Chi tiết nguồn đã chọn">
                  <div>
                    <StatusLabel
                      text={selectedSource.status}
                      tone={sourceStatusTone(selectedSource.status)}
                    />
                    <h3>{selectedSource.title}</h3>
                    <p>{selectedSource.body}</p>
                  </div>
                  <Button variant="quiet" onClick={() => setSelectedSourceId(undefined)}>
                    Đóng chi tiết
                  </Button>
                </section>
              )}
              {visibleSources.length === 0 ? (
                <EmptyState
                  title="Không tìm thấy tài liệu"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setKnowledgeSearch('');
                        setKnowledgeTopic('all');
                        setKnowledgeType('all');
                        setKnowledgeStatus('all');
                      }}
                    >
                      Xóa bộ lọc
                    </Button>
                  }
                >
                  Hãy thử từ khóa hoặc chủ đề khác.
                </EmptyState>
              ) : (
                <div className="ops-source-grid">
                  {visibleSources.map((source) => (
                    <button
                      type="button"
                      className="ops-source-card"
                      key={source.id}
                      onClick={() => setSelectedSourceId(source.id)}
                      aria-pressed={selectedSourceId === source.id}
                    >
                      <div className="ops-source-card-top">
                        <span className="ops-source-type">{source.type}</span>
                        <StatusLabel text={source.status} tone={sourceStatusTone(source.status)} />
                      </div>
                      <strong>{source.title}</strong>
                      <span className="ops-source-summary">{source.summary}</span>
                      <span className="ops-source-topic">
                        {source.topic} <Icon name="arrow" size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="ops-fixture-caption">
                Nguồn hiển thị là dữ liệu tĩnh để xem trước giao diện; chưa có chủ sở hữu, phiên bản
                hay lịch sử phê duyệt.
              </p>
            </div>
          ))}

        {visibleTab === 'activity' && (
          <div className="ops-activity-view">
            <div className="feature-heading">
              <div>
                <h2>Nhật ký hoạt động</h2>
                <p>
                  Nhật ký có ý nghĩa khi runtime thật ghi được người thực hiện, phạm vi và kết quả
                  đã xác nhận.
                </p>
              </div>
              <StatusLabel
                text={useAgentApi ? 'Chưa có API nhật ký' : 'Chưa kết nối'}
                tone="neutral"
              />
            </div>
            <EmptyState
              title={useAgentApi ? 'API chưa cung cấp danh sách nhật ký' : 'Chưa có nhật ký'}
            >
              {useAgentApi
                ? 'Giao diện chưa thể đọc lịch sử hội thoại, sự kiện tool hoặc audit tập trung. Chỉ trạng thái hồ sơ hiện tại và bằng chứng của lượt trả lời được API trả về.'
                : 'Bản demo không lưu câu hỏi hay thao tác. Không tạo sự kiện mẫu để tránh hiểu nhầm rằng hệ thống đã xử lý đơn.'}
            </EmptyState>
            <section className="feature-panel ops-audit-fields">
              <div className="feature-panel-head">
                <div>
                  <p className="eyebrow">THÔNG TIN CẦN CÓ KHI TRIỂN KHAI</p>
                  <h2>Trường nhật ký dự kiến</h2>
                </div>
              </div>
              <div className="ops-audit-grid">
                <div>
                  <strong>Ai và phạm vi</strong>
                  <span>Người dùng, vai trò, chi nhánh</span>
                </div>
                <div>
                  <strong>Tham chiếu</strong>
                  <span>Mã yêu cầu, nguồn và phiên bản tài liệu</span>
                </div>
                <div>
                  <strong>Thao tác</strong>
                  <span>Công cụ, dữ liệu đích, thời điểm</span>
                </div>
                <div>
                  <strong>Kết quả</strong>
                  <span>Phản hồi đã xác nhận từ hệ thống nghiệp vụ</span>
                </div>
              </div>
              <p className="small-note">
                Cần API lịch sử/audit phân trang, lọc theo chi nhánh, quyền xem, che dữ liệu cá nhân
                và thời hạn lưu trước khi triển khai.
              </p>
            </section>
          </div>
        )}

        {visibleTab === 'chat' && (
          <div className={useAgentApi ? 'ops-chat-layout ops-chat-live' : 'ops-chat-layout'}>
            <section
              className="feature-panel ops-chat-main"
              aria-label={useAgentApi ? 'Hỗ trợ tình huống' : 'Hỏi Ops Agent'}
            >
              <div className="ops-chat-heading">
                <div>
                  <p className="eyebrow">
                    {useAgentApi ? 'TRỢ LÝ VẬN HÀNH' : 'TRẢ LỜI THEO TỪ KHÓA'}
                  </p>
                  <h2 id={useAgentApi ? 'ops-agent-support-title' : undefined}>
                    {useAgentApi ? 'Hỗ trợ vận hành' : 'Hỏi Agent'}
                  </h2>
                  <p>
                    {useAgentApi
                      ? 'Nhập nội dung một lần: tra cứu quy trình hoặc gửi tình huống để trợ lý phân tích và tạo yêu cầu theo dõi.'
                      : 'Không có mô hình AI. Câu trả lời mẫu chỉ dựa trên từ khóa và nguồn fixture.'}
                  </p>
                </div>
                {(!useAgentApi || agentCaseId) && (
                  <Button
                    variant="secondary"
                    onClick={newConversation}
                    disabled={
                      sendingMessage ||
                      (useAgentApi &&
                        (sendOutcomeUnknown ||
                          caseLoading ||
                          caseNeedsReconciliation ||
                          currentCaseStateUnknown ||
                          Boolean(agentCaseId && !isOpsAgentCaseTerminal(agentResult))))
                    }
                    title={
                      sendingMessage
                        ? 'Đang chờ kết quả của câu hỏi hiện tại.'
                        : useAgentApi && sendOutcomeUnknown
                          ? 'Hãy đối soát kết quả gửi chưa rõ trước khi tạo yêu cầu khác.'
                          : currentCaseStateUnknown
                            ? 'Cần cập nhật trạng thái hiện tại trước khi tạo yêu cầu mới.'
                            : caseNeedsReconciliation || caseLoading
                              ? 'Hãy cập nhật yêu cầu hiện tại trước khi tạo yêu cầu mới.'
                              : useAgentApi && agentCaseId && !isOpsAgentCaseTerminal(agentResult)
                                ? 'Hãy xử lý yêu cầu hiện tại trước khi tạo yêu cầu khác.'
                                : undefined
                    }
                  >
                    {useAgentApi ? 'Tình huống mới' : 'Cuộc trò chuyện mới'}
                  </Button>
                )}
              </div>
              {!useAgentApi && (
                <div className="ops-chat-context">
                  <Icon name="pin" size={16} />
                  <span>Phạm vi: {branch}</span>
                  {selectedTask && <span>· Đơn mẫu: {selectedTask.orderId}</span>}
                  <span className="ops-offline-label">Ngoại tuyến</span>
                </div>
              )}
              {useAgentApi && agentCaseId && caseLoading && !agentResult && (
                <Feedback tone="info" title="Đang kiểm tra yêu cầu hiện tại">
                  Gửi tình huống mới đang tạm khóa để tránh trùng yêu cầu; bạn vẫn có thể tra cứu
                  tài liệu.
                </Feedback>
              )}
              {useAgentApi && agentCaseId && caseError && !caseLoading && !agentResult && (
                <Feedback
                  tone="danger"
                  title="Không tải được yêu cầu hiện tại"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void reloadAgentCase()}
                      loading={caseLoading}
                    >
                      Tải lại trạng thái
                    </Button>
                  }
                >
                  {caseError} Yêu cầu cũ có thể vẫn tồn tại, vì vậy gửi tình huống mới đang tạm
                  khóa.
                </Feedback>
              )}
              {useAgentApi &&
                agentCaseId &&
                agentResult &&
                !isOpsAgentCaseTerminal(agentResult) &&
                !currentCaseStateUnknown &&
                !sendOutcomeUnknown && (
                  <p className="ops-chat-new-request-note" role="status">
                    Bạn đang làm việc trong yêu cầu hiện tại. Để mở yêu cầu mới, hãy chờ yêu cầu này
                    kết thúc.
                  </p>
                )}
              {useAgentApi &&
                agentResult &&
                (agentResult.pendingConfirmation ?? agentResult.pendingApproval) && (
                  <Feedback
                    tone="warning"
                    title="Yêu cầu cần bạn xem"
                    action={
                      <Button variant="secondary" onClick={openCaseDetails}>
                        Xem bước cần xử lý
                      </Button>
                    }
                  >
                    Kiểm tra nội dung và nguồn trước khi xác nhận hoặc từ chối. Bạn có thể tiếp tục
                    sau khi yêu cầu này được xử lý.
                  </Feedback>
                )}
              {useAgentApi && agentResult?.pendingInput && (
                <Feedback
                  tone="warning"
                  title="Trợ lý đang chờ bạn bổ sung thông tin"
                  action={
                    <Button variant="secondary" onClick={openCaseDetails}>
                      Xem yêu cầu
                    </Button>
                  }
                >
                  Hãy mở yêu cầu để xem nội dung cần bổ sung trước khi trả lời.
                </Feedback>
              )}
              {useAgentApi &&
                agentCaseId &&
                agentResult &&
                currentCaseNeedsResolution &&
                !currentCaseStateUnknown &&
                !agentResult.pendingInput &&
                !agentResult.pendingConfirmation &&
                !agentResult.pendingApproval && (
                  <Feedback
                    tone="info"
                    title="Yêu cầu chưa sẵn sàng để tiếp tục"
                    action={
                      <Button variant="secondary" onClick={openCaseDetails}>
                        Xem trạng thái
                      </Button>
                    }
                  >
                    Hãy chờ trợ lý xử lý hoặc cập nhật trạng thái. Tin nhắn mới sẽ không được gửi
                    vào lúc này.
                  </Feedback>
                )}
              {currentCaseStateUnknown && (
                <Feedback
                  tone="warning"
                  title="Trạng thái yêu cầu cần kiểm tra"
                  action={
                    <Button variant="secondary" onClick={openCaseDetails}>
                      Kiểm tra yêu cầu
                    </Button>
                  }
                >
                  Hãy cập nhật trạng thái trước khi gửi tiếp. Trạng thái lạ hoặc dữ liệu chờ không
                  khớp không được xem là đã hoàn tất.
                </Feedback>
              )}
              <div
                className="ops-chat-thread"
                role="log"
                aria-label="Nội dung trò chuyện"
                aria-live="polite"
                aria-relevant="additions"
                aria-atomic="false"
              >
                {messages.map((message) => (
                  <article
                    className={
                      'ops-chat-message ' + (message.role === 'user' ? 'user' : 'assistant')
                    }
                    key={message.id}
                  >
                    <span className="ops-chat-role">
                      {message.role === 'user'
                        ? 'Bạn'
                        : useAgentApi
                          ? 'Trợ lý vận hành'
                          : 'Ops Agent · DEMO'}
                    </span>
                    {message.role === 'assistant' && message.knowledgeAnswer ? (
                      <div className="ops-chat-knowledge-result">
                        <div className="ops-chat-knowledge-result-head">
                          <span className="eyebrow">TRA CỨU HƯỚNG DẪN</span>
                          <StatusLabel
                            text={
                              message.knowledgeAnswer.outcome === 'insufficient_context'
                                ? 'Chưa đủ căn cứ'
                                : message.knowledgeAnswer.provisional
                                  ? 'Câu trả lời tạm'
                                  : 'Có câu trả lời'
                            }
                            tone={
                              message.knowledgeAnswer.outcome === 'insufficient_context' ||
                              message.knowledgeAnswer.provisional
                                ? 'warning'
                                : 'success'
                            }
                          />
                        </div>
                        <AssistantMarkdown content={message.text} />
                        {message.knowledgeAnswer.provisional && (
                          <Feedback tone="warning" title="Cần người phụ trách đối chiếu">
                            Nội dung này là tạm thời, chưa phải chính sách đã duyệt.
                          </Feedback>
                        )}
                        <div className="ops-knowledge-citations">
                          <h3>Nguồn tham khảo</h3>
                          {message.knowledgeAnswer.sources.length > 0 ? (
                            <ul>
                              {message.knowledgeAnswer.sources.map((source, index) => (
                                <li key={`${source.documentId}:${source.citation}:${index}`}>
                                  <div>
                                    <strong>{source.heading || 'Tài liệu tham khảo'}</strong>
                                    <span>
                                      {source.citation.trim() || 'Chưa có vị trí trích dẫn cụ thể.'}
                                    </span>
                                  </div>
                                  <div className="ops-knowledge-citation-meta">
                                    <StatusLabel
                                      text={
                                        source.businessAuthority
                                          ? 'Nguồn nghiệp vụ'
                                          : 'Nguồn tham khảo'
                                      }
                                      tone={source.businessAuthority ? 'info' : 'neutral'}
                                    />
                                    <StatusLabel
                                      text={knowledgeSourceStatusLabel(source.status)}
                                      tone={knowledgeSourceStatusTone(source.status)}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>Chưa có nguồn cụ thể để đối chiếu.</p>
                          )}
                        </div>
                        {message.knowledgeAnswer.outcome === 'insufficient_context' && (
                          <Button
                            variant="secondary"
                            onClick={() => setChatDraft(message.question ?? '')}
                          >
                            Gửi tình huống cho trợ lý
                          </Button>
                        )}
                      </div>
                    ) : message.role === 'assistant' ? (
                      <AssistantMarkdown content={message.text} />
                    ) : (
                      <p>{message.text}</p>
                    )}
                    {message.sourceIds.length > 0 && (
                      <div className="ops-chat-citations" aria-label="Nguồn tham khảo">
                        <span>Nguồn:</span>
                        {message.sourceIds.map((sourceId) => {
                          const source = opsAgentSources.find((item) => item.id === sourceId);
                          return source ? (
                            <button
                              type="button"
                              key={source.id}
                              onClick={() => {
                                setSelectedSourceId(source.id);
                                setTab('knowledge');
                              }}
                            >
                              {source.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                    {message.role === 'assistant' && message.evidence && (
                      <div className="ops-chat-citations" aria-label="Bằng chứng Agent đã sử dụng">
                        <span>Nguồn đã dùng:</span>
                        {message.evidence.length > 0 ? (
                          message.evidence.map((item, index) => (
                            <span
                              className="ops-chat-evidence"
                              key={`${item.sourceType}:${item.sourceId}:${index}`}
                            >
                              <strong>
                                {item.sourceType === 'knowledge'
                                  ? 'Tài liệu tham khảo'
                                  : 'Thông tin từ Studio'}
                              </strong>
                              <span>{opsAgentEvidenceLabel(item)}</span>
                              {item.observedAt && (
                                <time dateTime={item.observedAt}>
                                  {new Date(item.observedAt).toLocaleString('vi-VN')}
                                </time>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="ops-chat-evidence">
                            Câu trả lời này chưa kèm nguồn để đối chiếu.
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {sendingMessage && (
                  <article className="ops-chat-message user" aria-live="polite">
                    <span className="ops-chat-role">Bạn · đang gửi</span>
                    <p>{pendingQuestion}</p>
                  </article>
                )}
                <div ref={messageEndRef} />
              </div>
              <div className="ops-chat-suggestions" aria-label="Câu hỏi gợi ý">
                {suggestedQuestions.map((question) => (
                  <button
                    type="button"
                    key={question}
                    onClick={() => setChatDraft(question)}
                    disabled={sendingMessage || knowledgeLoading}
                  >
                    {question}
                  </button>
                ))}
              </div>
              <form
                className="ops-chat-form"
                onSubmit={(event) => {
                  if (!useAgentApi) {
                    void sendMessage(event);
                    return;
                  }
                  const action = event.nativeEvent.submitter?.getAttribute('data-action');
                  if (action === 'situation') void sendMessage(event);
                  else {
                    event.preventDefault();
                    void submitKnowledgeLookup();
                  }
                }}
              >
                <div ref={chatInputContainerRef} className="ops-chat-input">
                  <TextAreaField
                    label={useAgentApi ? 'Nội dung cần hỗ trợ' : 'Câu hỏi'}
                    aria-describedby="ops-agent-chat-hint"
                    placeholder={
                      useAgentApi
                        ? 'Nhập câu hỏi quy trình hoặc mô tả tình huống…'
                        : 'Hỏi về checklist hoặc nguồn tài liệu...'
                    }
                    value={chatDraft}
                    disabled={sendingMessage || (useAgentApi && knowledgeLoading)}
                    maxLength={2000}
                    onChange={(event) => {
                      setChatDraft(event.target.value);
                      setKnowledgeError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                  />
                </div>
                {useAgentApi ? (
                  <div className="ops-chat-actions">
                    <Button
                      type="submit"
                      variant="secondary"
                      data-action="knowledge"
                      disabled={chatDraft.trim().length < 2 || knowledgeLoading || sendingMessage}
                      loading={knowledgeLoading}
                    >
                      Tra cứu hướng dẫn
                    </Button>
                    <Button
                      type="submit"
                      data-action="situation"
                      disabled={
                        !chatDraft.trim() ||
                        sendingMessage ||
                        knowledgeLoading ||
                        !branchId ||
                        sendOutcomeUnknown ||
                        currentCaseNeedsResolution
                      }
                      loading={sendingMessage}
                    >
                      Gửi tình huống
                    </Button>
                  </div>
                ) : (
                  <Button type="submit" disabled={!chatDraft.trim() || sendingMessage}>
                    {sendingMessage ? 'Đang gửi…' : 'Gửi câu hỏi'}
                  </Button>
                )}
                <p id="ops-agent-chat-hint" className="ops-chat-form-hint">
                  {useAgentApi
                    ? 'Enter để tra cứu · Shift + Enter để xuống dòng · “Gửi tình huống” tạo yêu cầu theo dõi. Dùng mã đơn; không gửi mật khẩu hay mã OTP.'
                    : 'Enter để gửi · Shift + Enter để xuống dòng. Không nhập thông tin khách thật.'}
                </p>
              </form>
              {knowledgeLoading && (
                <div className="ops-knowledge-loading" role="status" aria-live="polite">
                  <span className="button-spinner" aria-hidden="true" /> Đang tra cứu tài liệu…
                </div>
              )}
              {knowledgeError && (
                <Feedback
                  tone="danger"
                  title="Không tra cứu được tài liệu"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void submitKnowledgeLookup(knowledgeQuery)}
                      disabled={knowledgeLoading || !knowledgeQuery.trim()}
                      loading={knowledgeLoading}
                    >
                      Thử lại
                    </Button>
                  }
                >
                  {knowledgeError} Câu hỏi được giữ trong ô nhập nếu cần thử lại.
                </Feedback>
              )}
              {sendError && (
                <div ref={sendErrorPanelRef} tabIndex={-1} className="ops-agent-case-error-focus">
                  <Feedback
                    tone="danger"
                    title={
                      sendOutcomeUnknown
                        ? 'Chưa xác nhận được kết quả gửi'
                        : useAgentApi
                          ? 'Không gửi được tình huống'
                          : 'Không gửi được câu hỏi'
                    }
                    action={
                      sendOutcomeUnknown && agentCaseId ? (
                        <Button variant="secondary" onClick={openCaseDetails}>
                          Kiểm tra yêu cầu
                        </Button>
                      ) : sendOutcomeUnknown ? (
                        <Button variant="secondary" onClick={() => setShowUnknownSendDialog(true)}>
                          Đã đối soát, mở lại ô nhập
                        </Button>
                      ) : sendConflict && agentCaseId ? (
                        <Button variant="secondary" onClick={openCaseDetails}>
                          Cập nhật yêu cầu
                        </Button>
                      ) : undefined
                    }
                  >
                    {sendError}{' '}
                    {sendOutcomeUnknown
                      ? agentCaseId
                        ? 'Nội dung vẫn được giữ. Hãy kiểm tra yêu cầu hiện tại trước khi gửi lại để tránh tạo thao tác trùng.'
                        : chatDraft.trim()
                          ? 'Nội dung vẫn được giữ nhưng mã yêu cầu chưa được trả về. Đừng gửi lại cho đến khi người phụ trách đối soát kết quả tạo hồ sơ.'
                          : 'Nội dung được giữ trong ô nhập cho đến khi đối soát xong.'
                      : ''}
                  </Feedback>
                </div>
              )}
            </section>
            {!useAgentApi && (
              <aside className="feature-panel ops-chat-side">
                <div className="feature-panel-head">
                  <div>
                    <p className="eyebrow">HƯỚNG DẪN</p>
                    <h2>{useAgentApi ? 'Cách làm việc an toàn' : 'Giới hạn của bản demo'}</h2>
                  </div>
                </div>
                <ul className="ops-chat-limits">
                  {useAgentApi ? (
                    <>
                      <li>Mô tả rõ việc cần làm; dùng mã đơn nếu cần nhắc đến một hồ sơ cụ thể.</li>
                      <li>Kiểm tra câu trả lời và nguồn tham khảo trước khi làm theo.</li>
                      <li>
                        Khi có yêu cầu xác nhận, chỉ tiếp tục nếu nội dung và đối tượng đều chính
                        xác.
                      </li>
                      <li>Không gửi mật khẩu, mã OTP hoặc thông tin thanh toán đầy đủ.</li>
                    </>
                  ) : (
                    <>
                      <li>Chỉ dùng checklist và câu trả lời theo từ khóa.</li>
                      <li>Không đọc dữ liệu khách từ hội thoại.</li>
                      <li>Không xác nhận đơn, bộ, khoản thu hoặc hoàn cọc.</li>
                      <li>Lịch sử không được gửi lên máy chủ.</li>
                    </>
                  )}
                </ul>
                {!useAgentApi && (
                  <Button variant="quiet" onClick={() => setTab('knowledge')}>
                    Xem nguồn mẫu
                  </Button>
                )}
              </aside>
            )}
          </div>
        )}

        {useAgentApi &&
          agentCaseId &&
          activeCaseScopeKey === scopedCaseSessionKey &&
          visibleTab === 'chat' && (
            <details
              className="ops-agent-case-details"
              ref={caseDetailsRef}
              open={caseDetailsOpen}
              onToggle={(event) => setCaseDetailsOpen(event.currentTarget.open)}
            >
              <summary className="ops-agent-case-summary">
                <span>
                  <span className="eyebrow">YÊU CẦU ĐANG THEO DÕI</span>
                  <strong>{agentResult?.goal?.summary ?? 'Yêu cầu hỗ trợ vận hành'}</strong>
                </span>
                {agentResult ? (
                  <StatusLabel
                    text={agentStateLabel(agentResult.state, currentCaseStateUnknown)}
                    tone={agentStateTone(agentResult.state, currentCaseStateUnknown)}
                  />
                ) : (
                  <StatusLabel text="Đang tải" tone="neutral" />
                )}
              </summary>
              <div className="ops-agent-case-view">
                <div className="feature-heading">
                  <div>
                    <h2>Chi tiết yêu cầu</h2>
                    <p>Xem kết quả, nguồn tham khảo và bước cần xác nhận.</p>
                  </div>
                </div>

                {caseLoading && !agentResult ? (
                  <div className="ops-queue-skeleton" role="status" aria-label="Đang tải yêu cầu">
                    <span />
                    <span />
                  </div>
                ) : caseError && !agentResult ? (
                  <Feedback
                    tone="danger"
                    title="Không tải được yêu cầu"
                    action={
                      <div className="ops-agent-case-recovery-actions">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void reloadAgentCase();
                          }}
                          loading={caseLoading}
                        >
                          Thử tải lại
                        </Button>
                        <Button variant="quiet" onClick={forgetAgentCaseReference}>
                          Bỏ liên kết phiên
                        </Button>
                      </div>
                    }
                  >
                    {caseError} Bạn có thể thử lại hoặc bỏ liên kết với yêu cầu trong phiên này.
                    Việc bỏ liên kết không hủy yêu cầu đã gửi.
                  </Feedback>
                ) : !agentResult ? (
                  <EmptyState
                    title="Cần cập nhật trạng thái yêu cầu"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void reloadAgentCase();
                        }}
                        loading={caseLoading}
                      >
                        Cập nhật trạng thái
                      </Button>
                    }
                  >
                    Yêu cầu đã được ghi nhận trong phiên này, nhưng trạng thái mới nhất chưa hiển
                    thị.
                  </EmptyState>
                ) : (
                  <>
                    {currentCaseStateUnknown && (
                      <Feedback
                        tone="warning"
                        title="Trạng thái yêu cầu cần kiểm tra"
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => void reloadAgentCase()}
                            loading={caseLoading}
                            disabled={caseActionLoading}
                          >
                            Cập nhật trạng thái
                          </Button>
                        }
                      >
                        Không xác nhận, duyệt, hủy hoặc gửi tiếp khi trạng thái lạ hay dữ liệu đang
                        chờ không khớp. Hãy cập nhật trạng thái; nếu vẫn còn, chuyển người phụ trách
                        kiểm tra.
                      </Feedback>
                    )}
                    {caseError && (
                      <div
                        ref={caseErrorPanelRef}
                        tabIndex={-1}
                        className="ops-agent-case-error-focus"
                      >
                        <Feedback
                          tone="danger"
                          title="Không hoàn tất được thao tác"
                          action={
                            <Button
                              variant="secondary"
                              onClick={() => {
                                void reloadAgentCase();
                              }}
                              loading={caseLoading}
                            >
                              Cập nhật trạng thái
                            </Button>
                          }
                        >
                          {caseError} Tải lại trước khi thử thao tác lần nữa; kết quả của yêu cầu
                          trước có thể chưa xác định.
                        </Feedback>
                      </div>
                    )}
                    <section className="feature-panel ops-agent-case-card">
                      <div className="feature-panel-head">
                        <div>
                          <p className="eyebrow">YÊU CẦU HỖ TRỢ</p>
                          <h3 ref={caseResultHeadingRef} tabIndex={-1}>
                            {agentResult.goal?.summary ?? 'Yêu cầu hỗ trợ vận hành'}
                          </h3>
                        </div>
                        <StatusLabel
                          text={agentStateLabel(agentResult.state, currentCaseStateUnknown)}
                          tone={agentStateTone(agentResult.state, currentCaseStateUnknown)}
                        />
                      </div>
                      <div className="ops-agent-case-message">
                        <h4>Kết quả gần nhất</h4>
                        <p>{agentResult.message || 'Chưa có nội dung kết quả.'}</p>
                      </div>
                      {agentResult.pendingInput && (
                        <Feedback tone="warning" title="Agent cần bạn bổ sung thông tin">
                          {agentResult.pendingInput}
                        </Feedback>
                      )}
                      {agentResult.pendingConfirmation && (
                        <section
                          className="ops-agent-pending-action"
                          aria-label="Yêu cầu đang chờ xác nhận"
                        >
                          <div>
                            <StatusLabel text="Chờ xác nhận" tone="warning" />
                            <h4>{agentResult.pendingConfirmation.summary}</h4>
                            <p>
                              Hạn xác nhận:{' '}
                              {formatAgentTime(agentResult.pendingConfirmation.expiresAt)}
                            </p>
                          </div>
                          <div className="ops-agent-pending-actions">
                            <Button
                              variant="secondary"
                              onClick={() => setCaseDialogAction('reject-confirmation')}
                              disabled={
                                caseActionLoading ||
                                !branchId ||
                                caseLoading ||
                                caseNeedsReconciliation ||
                                currentCaseStateUnknown
                              }
                            >
                              Từ chối
                            </Button>
                            <Button
                              onClick={() => setCaseDialogAction('confirm')}
                              disabled={
                                caseActionLoading ||
                                !branchId ||
                                caseLoading ||
                                caseNeedsReconciliation ||
                                currentCaseStateUnknown
                              }
                            >
                              Xác nhận yêu cầu
                            </Button>
                          </div>
                        </section>
                      )}
                      {agentResult.pendingApproval && (
                        <section
                          className="ops-agent-pending-action"
                          aria-label="Thao tác đang chờ người có quyền duyệt"
                        >
                          <div>
                            <StatusLabel text="Cần quyền duyệt" tone="warning" />
                            <h4>{agentResult.pendingApproval.summary}</h4>
                            <p>
                              Quyền cần có:{' '}
                              {agentPermissionLabel(agentResult.pendingApproval.requiredPermission)}
                            </p>
                            <p>
                              Hạn duyệt: {formatAgentTime(agentResult.pendingApproval.expiresAt)}
                            </p>
                          </div>
                          <div className="ops-agent-pending-actions">
                            <Button
                              variant="secondary"
                              onClick={() => setCaseDialogAction('reject-approval')}
                              disabled={
                                caseActionLoading ||
                                !branchId ||
                                caseLoading ||
                                caseNeedsReconciliation ||
                                currentCaseStateUnknown
                              }
                            >
                              Từ chối
                            </Button>
                            <Button
                              onClick={() => setCaseDialogAction('approve')}
                              disabled={
                                caseActionLoading ||
                                !branchId ||
                                caseLoading ||
                                caseNeedsReconciliation ||
                                currentCaseStateUnknown
                              }
                            >
                              Duyệt thao tác
                            </Button>
                          </div>
                        </section>
                      )}
                      {agentResult.evidence.length > 0 && (
                        <div className="ops-agent-case-evidence">
                          <h4>Nguồn đã đối chiếu</h4>
                          <ul>
                            {agentResult.evidence.map((evidence, index) => (
                              <li key={`${evidence.sourceType}:${evidence.sourceId}:${index}`}>
                                <StatusLabel
                                  text={
                                    evidence.sourceType === 'knowledge'
                                      ? 'Tài liệu'
                                      : 'Dữ liệu nghiệp vụ'
                                  }
                                  tone={evidence.sourceType === 'knowledge' ? 'info' : 'success'}
                                />
                                <span>{opsAgentEvidenceLabel(evidence)}</span>
                                {evidence.observedAt && (
                                  <time dateTime={evidence.observedAt}>
                                    {formatAgentTime(evidence.observedAt)}
                                  </time>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {agentResult.handoff && (
                        <Feedback tone="info" title="Agent bàn giao cho nhân viên">
                          {agentResult.handoff.nextAction} {agentResult.handoff.sideEffects}
                        </Feedback>
                      )}
                      <div className="ops-agent-case-footer">
                        <p>
                          Yêu cầu này thuộc phiên làm việc hiện tại. Thao tác cần quyền sẽ được kiểm
                          tra trước khi thực hiện.
                        </p>
                        <div>
                          {!isOpsAgentCaseTerminal(agentResult) && !currentCaseStateUnknown && (
                            <Button
                              variant="danger"
                              onClick={() => setCaseDialogAction('cancel')}
                              disabled={
                                caseActionLoading ||
                                !branchId ||
                                caseLoading ||
                                caseNeedsReconciliation ||
                                currentCaseStateUnknown
                              }
                            >
                              Hủy yêu cầu
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => {
                              void reloadAgentCase();
                            }}
                            loading={caseLoading}
                            disabled={caseActionLoading || !branchId}
                          >
                            Cập nhật trạng thái
                          </Button>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </details>
          )}

        {!useAgentApi && visibleTab === 'case' && (
          <div className="ops-agent-case-view">
            <div className="feature-heading">
              <div>
                <h2>Hồ sơ Agent</h2>
                <p>Theo dõi hồ sơ được tạo trong bản demo.</p>
              </div>
            </div>
            <Feedback tone="info" title="Hồ sơ Agent chỉ có ở chế độ API">
              Chế độ fixture không tạo hay lưu hồ sơ trên máy chủ.
            </Feedback>
          </div>
        )}
      </TabPanel>
      {showUnknownSendDialog && (
        <ConfirmDialog
          title="Đã đối soát lần gửi trước chưa?"
          confirmText="Đã đối soát, mở lại ô nhập"
          onConfirm={() => {
            if (uncertainInitialSendSessionKey)
              window.sessionStorage.removeItem(uncertainInitialSendSessionKey);
            setSendOutcomeUnknown(false);
            setSendConflict(false);
            setSendError('');
            setShowUnknownSendDialog(false);
            window.requestAnimationFrame(() => {
              chatInputContainerRef.current
                ?.querySelector<HTMLTextAreaElement>('textarea')
                ?.focus();
            });
          }}
          onClose={() => setShowUnknownSendDialog(false)}
        >
          <p>
            Chỉ tiếp tục sau khi đã kiểm tra với người phụ trách rằng yêu cầu trước chưa được tạo.
            Nội dung đang nhập sẽ được giữ lại để bạn xem và quyết định gửi lại.
          </p>
        </ConfirmDialog>
      )}
      {caseDialogAction && (
        <ConfirmDialog
          title={agentActionCopy[caseDialogAction].title}
          confirmText={agentActionCopy[caseDialogAction].confirmText}
          danger={agentActionCopy[caseDialogAction].danger}
          onConfirm={() => {
            void runAgentCaseAction(caseDialogAction);
          }}
          onClose={() => setCaseDialogAction(undefined)}
          loading={caseActionLoading}
        >
          <p>{agentActionCopy[caseDialogAction].description}</p>
          {caseDialogAction === 'confirm' && agentResult?.pendingConfirmation && (
            <div className="ops-agent-dialog-summary">
              <strong>Yêu cầu:</strong>
              <p>{agentResult.pendingConfirmation.summary}</p>
            </div>
          )}
          {caseDialogAction === 'approve' && agentResult?.pendingApproval && (
            <div className="ops-agent-dialog-summary">
              <strong>Thao tác:</strong>
              <p>{agentResult.pendingApproval.summary}</p>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
