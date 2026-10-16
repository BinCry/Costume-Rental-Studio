import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, FormEvent, ReactNode } from 'react';
import type { Navigate } from '../app/routes';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Feedback,
  Field,
  Icon,
  SelectField,
  StatusLabel,
  TextAreaField,
} from '../components/ui';
import { useFixtureResource } from '../components/useFixtureResource';
import { fixtureAdapter, fixtureClock } from '../fixtures/adapter';
import type { DemoScenario, QueueTask } from '../fixtures/types';
import { opsAgentFixtureAdapter, opsAgentSources, opsAgentWorkflows } from '../fixtures/opsAgent';
import {
  answerOpsKnowledge,
  apiEnabled,
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
  sourceIds: string[];
  evidence?: OpsAgentEvidence[];
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

const agentActionCopy: Record<
  AgentCaseAction,
  { title: string; confirmText: string; description: string; danger?: boolean }
> = {
  confirm: {
    title: 'Xác nhận yêu cầu của Agent',
    confirmText: 'Xác nhận và tiếp tục',
    description:
      'Agent sẽ tiếp tục đúng yêu cầu đang chờ. Kiểm tra nội dung và quyền của bạn trước khi xác nhận.',
  },
  'reject-confirmation': {
    title: 'Từ chối yêu cầu đang chờ',
    confirmText: 'Từ chối yêu cầu',
    description:
      'Agent sẽ dừng yêu cầu đang chờ xác nhận. Việc từ chối không thay đổi dữ liệu nghiệp vụ khác.',
    danger: true,
  },
  approve: {
    title: 'Duyệt thao tác của Agent',
    confirmText: 'Duyệt thao tác',
    description:
      'Đây là thao tác cần quyền cao. Khi được duyệt, Agent sẽ gọi công cụ tương ứng và đọc lại kết quả từ Studio.',
  },
  'reject-approval': {
    title: 'Từ chối thao tác của Agent',
    confirmText: 'Từ chối thao tác',
    description: 'Agent sẽ ghi nhận quyết định từ chối và không thực hiện thao tác đang chờ duyệt.',
    danger: true,
  },
  cancel: {
    title: 'Hủy hồ sơ Agent',
    confirmText: 'Hủy hồ sơ',
    description:
      'Hồ sơ sẽ không thể tiếp tục. Thao tác nghiệp vụ đã hoàn thành trước đó không bị hoàn tác.',
    danger: true,
  },
};

function agentStateLabel(state: string) {
  const labels: Record<string, string> = {
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
  return labels[state.toUpperCase()] ?? state.toLocaleLowerCase('vi').replaceAll('_', ' ');
}

function agentStateTone(state: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const normalized = state.toUpperCase();
  if (['SUCCEEDED', 'COMPLETED'].includes(normalized)) return 'success';
  if (
    [
      'WAITING_CONFIRMATION',
      'PENDING_CONFIRMATION',
      'AWAITING_CONFIRMATION',
      'WAITING_APPROVAL',
      'PENDING_APPROVAL',
      'AWAITING_APPROVAL',
      'NEEDS_INPUT',
      'WAITING_FOR_INPUT',
      'NEEDS_MORE_INFO',
    ].includes(normalized)
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

function evidenceLabel(evidence: OpsAgentEvidence) {
  return (
    evidence.citation?.trim() ??
    (evidence.sourceType === 'knowledge' ? 'Tài liệu được truy xuất' : 'Dữ liệu nghiệp vụ đã đọc')
  );
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

function TabPanel({ tab, children }: { tab: AgentTab; children: ReactNode }) {
  return (
    <>
      <section
        className="ops-agent-panel"
        id={'ops-agent-panel-' + tab}
        role="tabpanel"
        aria-labelledby={'ops-agent-tab-' + tab}
        tabIndex={0}
      >
        {children}
      </section>
      {tabs
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
  go,
}: {
  scenario: DemoScenario;
  branch: string;
  go: Navigate;
}) {
  const useAgentApi = import.meta.env.VITE_OPS_AGENT_MODE === 'api';
  const [tab, setTab] = useState<AgentTab>('overview');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [queueSearch, setQueueSearch] = useState('');
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeTopic, setKnowledgeTopic] = useState('all');
  const [knowledgeType, setKnowledgeType] = useState('all');
  const [knowledgeStatus, setKnowledgeStatus] = useState('all');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [knowledgeTopK, setKnowledgeTopK] = useState('5');
  const [knowledgeAnswer, setKnowledgeAnswer] = useState<{
    query: string;
    result: OpsKnowledgeAnswer;
  }>();
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [agentCaseId, setAgentCaseId] = useState<string | undefined>(() => {
    if (!useAgentApi || typeof window === 'undefined') return undefined;
    return window.sessionStorage.getItem(agentCaseSessionKey) ?? undefined;
  });
  const [agentResult, setAgentResult] = useState<OpsAgentCaseResult>();
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseActionLoading, setCaseActionLoading] = useState(false);
  const [caseError, setCaseError] = useState('');
  const [caseDialogAction, setCaseDialogAction] = useState<AgentCaseAction>();
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendOutcomeUnknown, setSendOutcomeUnknown] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [sendError, setSendError] = useState('');
  const [selectedTask, setSelectedTask] = useState<QueueTask>();
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  const [conflictCleared, setConflictCleared] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text:
        import.meta.env.VITE_OPS_AGENT_MODE === 'api'
          ? 'Đặt câu hỏi để chuyển qua API Agent. Hãy xem phần nguồn trong câu trả lời để phân biệt tài liệu và dữ liệu nghiệp vụ.'
          : 'Mình có thể gợi ý checklist từ nội dung demo. Câu trả lời không thay đổi đơn, xác nhận thanh toán hay ghi vào nhật ký.',
      sourceIds:
        import.meta.env.VITE_OPS_AGENT_MODE === 'api' ? [] : ['product-scope', 'safety-direction'],
    },
  ]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(1);
  const loadQueue = useCallback(
    (currentScenario: DemoScenario) => fixtureAdapter.listQueue(currentScenario),
    [],
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

  useEffect(() => {
    if (!useAgentApi) return;
    if (agentCaseId) window.sessionStorage.setItem(agentCaseSessionKey, agentCaseId);
    else window.sessionStorage.removeItem(agentCaseSessionKey);
  }, [agentCaseId, useAgentApi]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    messageEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [messages]);

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

  const focusTab = (next: AgentTab) => {
    setTab(next);
    const index = tabs.findIndex((item) => item.id === next);
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: AgentTab) => {
    const index = tabs.findIndex((item) => item.id === current);
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : undefined;
    if (nextIndex === undefined) return;
    event.preventDefault();
    focusTab(tabs[nextIndex].id);
  };

  const reloadAgentCase = async () => {
    if (!agentCaseId || caseLoading) return;
    setCaseLoading(true);
    setCaseError('');
    try {
      setAgentResult(await getOpsAgentCase(agentCaseId));
    } catch (loadError) {
      setCaseError(loadError instanceof Error ? loadError.message : 'Không tải được hồ sơ Agent.');
    } finally {
      setCaseLoading(false);
    }
  };

  const forgetAgentCaseReference = () => {
    setAgentCaseId(undefined);
    setAgentResult(undefined);
    setCaseError('');
  };

  const runAgentCaseAction = async (action: AgentCaseAction) => {
    if (!agentCaseId || !agentResult || caseActionLoading) return;
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
          );
          break;
        case 'reject-confirmation':
          if (!agentResult.pendingConfirmation) return;
          result = await rejectOpsAgentConfirmation(
            agentCaseId,
            agentResult.pendingConfirmation.confirmationId,
          );
          break;
        case 'approve':
          if (!agentResult.pendingApproval) return;
          result = await approveOpsAgentAction(agentResult.pendingApproval.approvalId);
          break;
        case 'reject-approval':
          if (!agentResult.pendingApproval) return;
          result = await rejectOpsAgentAction(agentResult.pendingApproval.approvalId);
          break;
        case 'cancel':
          result = await cancelOpsAgentCase(agentCaseId);
          break;
      }
      setAgentResult(result);
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
      setCaseDialogAction(undefined);
      setCaseError(
        actionError instanceof Error ? actionError.message : 'Không hoàn tất được thao tác Agent.',
      );
    } finally {
      setCaseActionLoading(false);
    }
  };

  const loadKnowledgeAnswer = async (query = knowledgeQuery.trim()) => {
    if (query.length < 2 || knowledgeLoading) return;
    setKnowledgeLoading(true);
    setKnowledgeError('');
    try {
      const result = await answerOpsKnowledge(query, Number(knowledgeTopK));
      setKnowledgeAnswer({ query, result });
    } catch (lookupError) {
      setKnowledgeError(knowledgeRequestError(lookupError));
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const askKnowledge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadKnowledgeAnswer();
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
    if (!question || sendingMessage) return;
    setSendError('');
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
        const reply = await sendOpsAgentMessage(question, agentCaseId);
        setAgentCaseId(reply.caseId);
        setAgentResult(reply);
        setSendOutcomeUnknown(false);
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
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setSendOutcomeUnknown(
        ['AI_SERVICE_TIMEOUT', 'AI_SERVICE_UNAVAILABLE', 'NETWORK_ERROR'].includes(code),
      );
      setSendError(
        error instanceof Error ? error.message : 'Không gửi được câu hỏi tới Ops Agent.',
      );
    } finally {
      setPendingQuestion('');
      setSendingMessage(false);
    }
  };

  const newConversation = () => {
    if (useAgentApi && agentCaseId && !agentResult?.completed) return;
    messageSequence.current = 1;
    setSelectedTask(undefined);
    setChatDraft('');
    setAgentCaseId(undefined);
    setAgentResult(undefined);
    setCaseError('');
    setSendError('');
    setSendOutcomeUnknown(false);
    setMessages([
      {
        id: 0,
        role: 'assistant',
        text: useAgentApi
          ? 'Cuộc trò chuyện mới sẽ được gửi tới API Agent khi bạn đặt câu hỏi. Không đưa thông tin nhạy cảm của khách vào môi trường thử nghiệm.'
          : 'Cuộc trò chuyện mới chỉ tồn tại trong trình duyệt này. Hãy chọn câu hỏi gợi ý; không gửi dữ liệu khách thật.',
        sourceIds: useAgentApi ? [] : ['product-scope'],
      },
    ]);
  };

  const suggestedQuestions = [
    'Tôi nên đối chiếu yêu cầu thuê thế nào?',
    'Checklist chuẩn bị giao đồ gồm gì?',
    'Có thể xác nhận chuyển khoản ở đây không?',
    'Chính sách hoàn cọc đã được chốt chưa?',
  ];

  return (
    <div className="page staff-page ops-agent-page">
      <div className="staff-page-heading ops-agent-heading">
        <div>
          <p className="eyebrow">HỖ TRỢ VẬN HÀNH</p>
          <h1>Ops Agent</h1>
          <p>
            {useAgentApi
              ? 'Tra cứu tài liệu, hỏi Agent và xử lý yêu cầu có API hỗ trợ. Hàng đợi mẫu không thay thế dữ liệu vận hành.'
              : 'Tra cứu checklist và việc cần chú ý tại chi nhánh. Nhân viên vẫn xử lý trên màn hình Studio.'}
          </p>
        </div>
        <div className="ops-agent-heading-meta">
          <span className="ops-demo-badge">
            <span aria-hidden="true">●</span>{' '}
            {useAgentApi ? 'AGENT API · HÀNG ĐỢI FIXTURE' : 'DEMO · FIXTURE'}
          </span>
          <span className="date-pill">
            <Icon name="pin" size={17} />
            {branch || 'Chưa chọn chi nhánh'}
          </span>
          <span className="ops-fixture-time">
            <Icon name="clock" size={16} />
            {useAgentApi ? 'Mốc giờ fixture · ' : 'Dữ liệu mẫu · '}
            {formatFixtureTime()}
          </span>
        </div>
      </div>

      <div className="ops-agent-notice" role="status">
        <Icon name="spark" size={18} />
        <p>
          {useAgentApi ? (
            <>
              <strong>Đang dùng chế độ API Studio.</strong> Tra cứu tài liệu và hồ sơ/tác vụ đang mở
              gọi API; danh sách hàng đợi, checklist và danh mục nguồn vẫn là fixture. Thao tác ghi
              chỉ thực hiện sau xác nhận và kiểm tra quyền ở máy chủ.
            </>
          ) : (
            <>
              <strong>Chỉ hướng dẫn tham khảo.</strong> Không có kết nối trợ lý trực tuyến, không
              ghi dữ liệu và không xác nhận nghiệp vụ.
            </>
          )}
        </p>
      </div>

      <div className="ops-tabs-wrap">
        <div className="ops-agent-tabs" role="tablist" aria-label="Các khu vực Ops Agent">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={'ops-agent-tab-' + item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={'ops-agent-panel-' + item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'ops-agent-tab active' : 'ops-agent-tab'}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {scenario === 'conflict' && !conflictCleared && (
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

      <TabPanel tab={tab}>
        {tab === 'overview' && (
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
                  <div className="ops-queue-skeleton" role="status" aria-label="Đang tải hàng đợi">
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
        )}

        {tab === 'queue' && (
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

        {tab === 'workflows' && (
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

        {tab === 'knowledge' &&
          (useAgentApi ? (
            <div className="ops-live-knowledge">
              <div className="feature-heading">
                <div>
                  <h2>Hỏi kho tri thức</h2>
                  <p>
                    API trả lời dựa trên tài liệu được phép và kèm trích dẫn. Kết quả chưa đủ căn cứ
                    sẽ được nêu rõ.
                  </p>
                </div>
                <StatusLabel text="API · có nguồn" tone="info" />
              </div>
              <section className="feature-panel ops-live-knowledge-panel">
                <form
                  className="ops-knowledge-query"
                  onSubmit={(event) => {
                    void askKnowledge(event);
                  }}
                >
                  <TextAreaField
                    label="Câu hỏi về tài liệu hoặc chính sách"
                    hint="Không nhập thông tin cá nhân khách hàng. Tối đa 1.000 ký tự."
                    placeholder="Ví dụ: Quy trình nhận đồ trả cần kiểm tra những gì?"
                    value={knowledgeQuery}
                    maxLength={1000}
                    required
                    rows={3}
                    onChange={(event) => setKnowledgeQuery(event.target.value)}
                  />
                  <SelectField
                    label="Số đoạn nguồn tối đa"
                    value={knowledgeTopK}
                    onChange={(event) => setKnowledgeTopK(event.target.value)}
                  >
                    <option value="3">3 nguồn</option>
                    <option value="5">5 nguồn</option>
                    <option value="6">6 nguồn</option>
                  </SelectField>
                  <Button
                    type="submit"
                    disabled={knowledgeQuery.trim().length < 2 || knowledgeLoading}
                    loading={knowledgeLoading}
                  >
                    {knowledgeLoading ? 'Đang tra cứu…' : 'Tra cứu'}
                  </Button>
                </form>
                {knowledgeLoading && (
                  <div className="ops-knowledge-loading" role="status" aria-live="polite">
                    <span className="button-spinner" aria-hidden="true" /> Đang tìm câu trả lời và
                    đối chiếu nguồn được phép…
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
                  <EmptyState title="Chưa có kết quả tra cứu">
                    Nhập câu hỏi để nhận nội dung trả lời và các trích dẫn mà API Agent cung cấp.
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
                        <p className="eyebrow">CÂU HỎI</p>
                        <h3>{knowledgeAnswer.query}</h3>
                      </div>
                      <StatusLabel
                        text={
                          knowledgeAnswer.result.outcome === 'insufficient_context'
                            ? 'Chưa đủ căn cứ'
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
                    <p className="ops-knowledge-answer-text">{knowledgeAnswer.result.answer}</p>
                    {knowledgeAnswer.result.provisional && (
                      <Feedback tone="warning" title="Cần người có thẩm quyền đối chiếu">
                        API đánh dấu nội dung này là tạm thời. Không dùng làm chính sách đã duyệt
                        hoặc căn cứ tự động ghi nghiệp vụ.
                      </Feedback>
                    )}
                    <div className="ops-knowledge-citations">
                      <h3>Nguồn được API trả về</h3>
                      {knowledgeAnswer.result.sources.length === 0 ? (
                        <EmptyState title="Không có nguồn trích dẫn">
                          Kết quả hiện chưa có tài liệu đủ liên quan. Hãy kiểm tra chính sách gốc
                          trong Studio.
                        </EmptyState>
                      ) : (
                        <ul>
                          {knowledgeAnswer.result.sources.map((source, index) => (
                            <li key={`${source.documentId}:${source.citation}:${index}`}>
                              <div>
                                <strong>{source.heading || 'Tài liệu tham khảo'}</strong>
                                <span>{source.citation}</span>
                              </div>
                              <div className="ops-knowledge-citation-meta">
                                <StatusLabel
                                  text={
                                    source.businessAuthority ? 'Nguồn nghiệp vụ' : 'Nguồn tham khảo'
                                  }
                                  tone={source.businessAuthority ? 'info' : 'neutral'}
                                />
                                <span>{knowledgeSourceStatusLabel(source.status)}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )}
              </section>
              <Feedback tone="info" title="Phần quản lý kho tri thức đang chờ API">
                API hiện chỉ có hỏi đáp kèm nguồn. Danh sách tài liệu, tìm kiếm thuần, tải lên, lập
                chỉ mục, phiên bản và duyệt tài liệu chưa có endpoint để giao diện kết nối.
              </Feedback>
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

        {tab === 'activity' && (
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

        {tab === 'chat' && (
          <div className="ops-chat-layout">
            <section className="feature-panel ops-chat-main" aria-label="Hỏi Ops Agent">
              <div className="ops-chat-heading">
                <div>
                  <p className="eyebrow">
                    {useAgentApi ? 'API AGENT · BẰNG CHỨNG RAG / TOOL' : 'TRẢ LỜI THEO TỪ KHÓA'}
                  </p>
                  <h2>Hỏi Agent</h2>
                  <p>
                    {useAgentApi
                      ? 'Câu hỏi đi qua backend Studio; xem bằng chứng để biết Agent dùng tài liệu hay công cụ nghiệp vụ.'
                      : 'Không có mô hình AI. Câu trả lời mẫu chỉ dựa trên từ khóa và nguồn fixture.'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={newConversation}
                  disabled={useAgentApi && !!agentCaseId && !agentResult?.completed}
                  title={
                    useAgentApi && agentCaseId && !agentResult?.completed
                      ? 'Hãy xử lý hoặc hủy hồ sơ Agent hiện tại trước.'
                      : undefined
                  }
                >
                  Cuộc trò chuyện mới
                </Button>
              </div>
              <div className="ops-chat-context">
                <Icon name="pin" size={16} />
                <span>Phạm vi: {branch}</span>
                {!useAgentApi && selectedTask && <span>· Đơn mẫu: {selectedTask.orderId}</span>}
                <span className="ops-offline-label">
                  {useAgentApi
                    ? apiEnabled
                      ? 'API được cấu hình'
                      : 'Thiếu VITE_API_URL'
                    : 'Ngoại tuyến'}
                </span>
                {useAgentApi && agentCaseId && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setTab('case');
                      if (!agentResult) void reloadAgentCase();
                    }}
                  >
                    Xem hồ sơ{agentResult ? ` · ${agentStateLabel(agentResult.state)}` : ''}
                  </Button>
                )}
              </div>
              {useAgentApi &&
                agentResult &&
                (agentResult.pendingConfirmation ?? agentResult.pendingApproval) && (
                  <Feedback
                    tone="warning"
                    title="Cần xử lý yêu cầu đang chờ"
                    action={
                      <Button variant="secondary" onClick={() => setTab('case')}>
                        Mở hồ sơ Agent
                      </Button>
                    }
                  >
                    Mở hồ sơ Agent để xác nhận hoặc từ chối trước khi gửi tin nhắn tiếp theo.
                  </Feedback>
                )}
              <div className="ops-chat-thread" aria-label="Nội dung trò chuyện" aria-live="polite">
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
                          ? 'Ops Agent · API'
                          : 'Ops Agent · DEMO'}
                    </span>
                    <p>{message.text}</p>
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
                                  ? 'Tài liệu · RAG'
                                  : 'Dữ liệu · tool'}
                              </strong>
                              <span>{evidenceLabel(item)}</span>
                              {item.observedAt && (
                                <time dateTime={item.observedAt}>
                                  {new Date(item.observedAt).toLocaleString('vi-VN')}
                                </time>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="ops-chat-evidence">
                            Agent không trả bằng chứng nguồn cho câu trả lời này.
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
                  <button type="button" key={question} onClick={() => setChatDraft(question)}>
                    {question}
                  </button>
                ))}
              </div>
              <form
                className="ops-chat-form"
                onSubmit={(event) => {
                  void sendMessage(event);
                }}
              >
                <div className="ops-chat-input">
                  <TextAreaField
                    label="Câu hỏi"
                    hint="Enter để gửi · Shift + Enter để xuống dòng. Không nhập thông tin khách thật."
                    placeholder="Hỏi về checklist hoặc nguồn tài liệu..."
                    value={chatDraft}
                    maxLength={2000}
                    onChange={(event) => setChatDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    !chatDraft.trim() ||
                    sendingMessage ||
                    (useAgentApi &&
                      !!agentResult &&
                      (agentResult.completed ||
                        !!agentResult.pendingConfirmation ||
                        !!agentResult.pendingApproval))
                  }
                >
                  {sendingMessage ? 'Đang gửi…' : 'Gửi câu hỏi'}
                </Button>
              </form>
              {sendError && (
                <Feedback
                  tone="danger"
                  title={
                    sendOutcomeUnknown ? 'Kết quả gửi chưa xác định' : 'Không gửi được câu hỏi'
                  }
                >
                  {sendError}
                  {sendOutcomeUnknown
                    ? ' API chưa có cách tra hồ sơ vừa tạo khi phản hồi bị mất. Câu hỏi vẫn được giữ; hãy đối chiếu trạng thái trước khi chủ động gửi lại.'
                    : ''}
                </Feedback>
              )}
            </section>
            <aside className="feature-panel ops-chat-side">
              <div className="feature-panel-head">
                <div>
                  <p className="eyebrow">HƯỚNG DẪN</p>
                  <h2>{useAgentApi ? 'Giới hạn khi thử API' : 'Giới hạn của bản demo'}</h2>
                </div>
              </div>
              <ul className="ops-chat-limits">
                {useAgentApi ? (
                  <>
                    <li>
                      Câu hỏi được gửi tới backend Agent; không nhập thông tin khách thật vào môi
                      trường thử nghiệm.
                    </li>
                    <li>
                      Hàng đợi và checklist vẫn là dữ liệu fixture, không phải trạng thái live.
                    </li>
                    <li>
                      Bằng chứng hiển thị loại nguồn do backend trả về: tài liệu hoặc tool nghiệp
                      vụ.
                    </li>
                    <li>
                      Backend kiểm tra quyền của tài khoản trước mỗi lần xác nhận hoặc duyệt thao
                      tác Agent.
                    </li>
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
              <Button variant="quiet" onClick={() => setTab('knowledge')}>
                {useAgentApi ? 'Hỏi kho tri thức' : 'Xem nguồn mẫu'}
              </Button>
            </aside>
          </div>
        )}

        {tab === 'case' && (
          <div className="ops-agent-case-view">
            <div className="feature-heading">
              <div>
                <h2>Hồ sơ Agent hiện tại</h2>
                <p>
                  API hỗ trợ đọc lại trạng thái hồ sơ đang mở. Hiện chưa có danh sách hồ sơ hoặc
                  lịch sử hội thoại để tra cứu.
                </p>
              </div>
              {agentResult && (
                <StatusLabel
                  text={agentStateLabel(agentResult.state)}
                  tone={agentStateTone(agentResult.state)}
                />
              )}
            </div>

            {!useAgentApi ? (
              <Feedback tone="info" title="Hồ sơ Agent chỉ có ở chế độ API">
                Chế độ fixture không tạo hay lưu hồ sơ trên máy chủ.
              </Feedback>
            ) : !agentCaseId ? (
              <EmptyState
                title="Chưa có hồ sơ Agent đang mở"
                action={
                  <Button variant="secondary" onClick={() => setTab('chat')}>
                    Mở Hỏi Agent
                  </Button>
                }
              >
                Gửi câu hỏi trong mục Hỏi Agent để tạo hồ sơ. Hồ sơ mới tạo sẽ xuất hiện ở đây cùng
                trạng thái và các bước cần bạn xử lý.
              </EmptyState>
            ) : caseLoading && !agentResult ? (
              <div className="ops-queue-skeleton" role="status" aria-label="Đang tải hồ sơ Agent">
                <span />
                <span />
              </div>
            ) : caseError && !agentResult ? (
              <Feedback
                tone="danger"
                title="Không tải được hồ sơ Agent"
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
                      Bỏ tham chiếu trong tab
                    </Button>
                  </div>
                }
              >
                {caseError} Có thể thử lại hoặc xóa mã tham chiếu đang lưu trong tab này. Xóa tham
                chiếu không hủy hồ sơ trên máy chủ.
              </Feedback>
            ) : !agentResult ? (
              <EmptyState
                title="Cần tải trạng thái hồ sơ"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void reloadAgentCase();
                    }}
                    loading={caseLoading}
                  >
                    Tải hồ sơ
                  </Button>
                }
              >
                Có mã hồ sơ trong phiên hiện tại nhưng chưa tải được dữ liệu hiển thị.
              </EmptyState>
            ) : (
              <>
                {caseError && (
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
                        Tải lại trạng thái
                      </Button>
                    }
                  >
                    {caseError} Tải lại trước khi thử thao tác lần nữa; kết quả của yêu cầu trước có
                    thể chưa xác định.
                  </Feedback>
                )}
                <section className="feature-panel ops-agent-case-card">
                  <div className="feature-panel-head">
                    <div>
                      <p className="eyebrow">TRẠNG THÁI TỪ API STUDIO</p>
                      <h3>{agentResult.goal?.summary ?? 'Hồ sơ hỗ trợ vận hành'}</h3>
                    </div>
                    <StatusLabel
                      text={agentStateLabel(agentResult.state)}
                      tone={agentStateTone(agentResult.state)}
                    />
                  </div>
                  <div className="ops-agent-case-facts">
                    <div>
                      <span>Trạng thái xử lý</span>
                      <strong>{agentStateLabel(agentResult.runStatus ?? agentResult.state)}</strong>
                    </div>
                    {typeof agentResult.stepsUsed === 'number' && (
                      <div>
                        <span>Bước đã chạy</span>
                        <strong>{agentResult.stepsUsed}</strong>
                      </div>
                    )}
                    {agentResult.terminationReason && (
                      <div>
                        <span>Kết thúc vì</span>
                        <strong>{agentResult.terminationReason}</strong>
                      </div>
                    )}
                  </div>
                  <div className="ops-agent-case-message">
                    <h4>Kết quả gần nhất</h4>
                    <p>{agentResult.message || 'API chưa trả nội dung kết quả.'}</p>
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
                          Hạn xác nhận: {formatAgentTime(agentResult.pendingConfirmation.expiresAt)}
                        </p>
                      </div>
                      <div className="ops-agent-pending-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setCaseDialogAction('reject-confirmation')}
                          disabled={caseActionLoading}
                        >
                          Từ chối
                        </Button>
                        <Button
                          onClick={() => setCaseDialogAction('confirm')}
                          disabled={caseActionLoading}
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
                        <p>Hạn duyệt: {formatAgentTime(agentResult.pendingApproval.expiresAt)}</p>
                      </div>
                      <div className="ops-agent-pending-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setCaseDialogAction('reject-approval')}
                          disabled={caseActionLoading}
                        >
                          Từ chối
                        </Button>
                        <Button
                          onClick={() => setCaseDialogAction('approve')}
                          disabled={caseActionLoading}
                        >
                          Duyệt thao tác
                        </Button>
                      </div>
                    </section>
                  )}
                  {agentResult.evidence.length > 0 && (
                    <div className="ops-agent-case-evidence">
                      <h4>Bằng chứng</h4>
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
                            <span>{evidenceLabel(evidence)}</span>
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
                      Hồ sơ này thuộc tài khoản đang đăng nhập. API kiểm tra quyền ở mỗi lần đọc và
                      thao tác.
                    </p>
                    <div>
                      {!agentResult.completed && (
                        <Button
                          variant="danger"
                          onClick={() => setCaseDialogAction('cancel')}
                          disabled={caseActionLoading}
                        >
                          Hủy hồ sơ Agent
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void reloadAgentCase();
                        }}
                        loading={caseLoading}
                      >
                        Tải lại trạng thái
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </TabPanel>
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
