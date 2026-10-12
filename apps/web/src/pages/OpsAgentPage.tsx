import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, FormEvent, ReactNode } from 'react';
import type { Navigate } from '../app/routes';
import { Button, EmptyState, Feedback, Field, Icon, StatusLabel, TextAreaField } from '../components/ui';
import { useFixtureResource } from '../components/useFixtureResource';
import { fixtureAdapter, fixtureClock } from '../fixtures/adapter';
import type { DemoScenario, QueueTask } from '../fixtures/types';
import { opsAgentFixtureAdapter, opsAgentSources, opsAgentWorkflows } from '../fixtures/opsAgent';

type AgentTab = 'overview' | 'queue' | 'workflows' | 'knowledge' | 'activity' | 'chat';
type QueueFilter = 'all' | QueueTask['kind'];
type ChatMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  sourceIds: string[];
};
type QueueFilterOption = { id: QueueFilter; label: string };

const tabs: { id: AgentTab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'queue', label: 'Hàng đợi' },
  { id: 'workflows', label: 'Quy trình' },
  { id: 'knowledge', label: 'Nguồn tri thức' },
  { id: 'activity', label: 'Nhật ký' },
  { id: 'chat', label: 'Hỏi Agent' },
];

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
      {tabs.filter((item) => item.id !== tab).map((item) => (
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
}: {
  task: QueueTask;
  onAsk: () => void;
  onOpen: () => void;
}) {
  const tone = task.group === 'Quá hạn' ? 'danger' : task.group === 'Trong 2 giờ tới' || task.group === 'Chờ xác nhận lâu' ? 'warning' : 'info';
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
          <span>{task.owner === 'Chưa gán' ? 'Chưa có người phụ trách' : 'Phụ trách: ' + task.owner}</span>
        </p>
        <div className="ops-queue-card-meta">
          <span>{kindLabel[task.kind]}</span>
          {task.barcode && <span>Mã bộ {task.barcode}</span>}
          <span>{task.branch}</span>
        </div>
      </div>
      <div className="ops-queue-card-actions">
        <Button variant="quiet" onClick={onAsk}>Hỏi Agent</Button>
        <Button variant="secondary" onClick={onOpen}>Mở đơn</Button>
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
  const [tab, setTab] = useState<AgentTab>('overview');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [queueSearch, setQueueSearch] = useState('');
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeTopic, setKnowledgeTopic] = useState('all');
  const [knowledgeType, setKnowledgeType] = useState('all');
  const [knowledgeStatus, setKnowledgeStatus] = useState('all');
  const [chatDraft, setChatDraft] = useState('');
  const [selectedTask, setSelectedTask] = useState<QueueTask>();
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  const [conflictCleared, setConflictCleared] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text: 'Mình có thể gợi ý checklist từ nội dung demo. Câu trả lời không thay đổi đơn, xác nhận thanh toán hay ghi vào nhật ký.',
      sourceIds: ['product-scope', 'safety-direction'],
    },
  ]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(1);
  const loadQueue = useCallback((currentScenario: DemoScenario) => fixtureAdapter.listQueue(currentScenario), []);
  const { loading, data, error, retry } = useFixtureResource(
    scenario,
    loadQueue,
    branch + ':ops-agent-fixture',
  );

  useEffect(() => {
    setConflictCleared(false);
  }, [scenario, branch]);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    messageEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [messages]);

  const branchQueue = useMemo(
    () => (data ?? []).filter((task) => task.branch === branch).sort((a, b) => priorityRank[a.group] - priorityRank[b.group]),
    [data, branch],
  );
  const visibleQueue = useMemo(() => {
    const query = queueSearch.trim().toLocaleLowerCase('vi');
    return branchQueue.filter((task) => {
      const matchesKind = queueFilter === 'all' || task.kind === queueFilter;
      const matchesText = !query || [
        task.orderId,
        task.customer,
        task.barcode ?? '',
        task.task,
        task.owner,
      ].join(' ').toLocaleLowerCase('vi').includes(query);
      return matchesKind && matchesText;
    });
  }, [branchQueue, queueFilter, queueSearch]);
  const visibleSources = useMemo(() => {
    const query = knowledgeSearch.trim().toLocaleLowerCase('vi');
    return opsAgentSources.filter((source) => {
      const matchesTopic = knowledgeTopic === 'all' || source.topic === knowledgeTopic;
      const matchesType = knowledgeType === 'all' || source.type === knowledgeType;
      const matchesStatus = knowledgeStatus !== 'needs-verification' || source.status === 'Cần xác minh';
      const matchesText = !query || [source.title, source.type, source.topic, source.summary]
        .join(' ').toLocaleLowerCase('vi').includes(query);
      return matchesTopic && matchesType && matchesStatus && matchesText;
    });
  }, [knowledgeSearch, knowledgeTopic, knowledgeType, knowledgeStatus]);
  const selectedSource = opsAgentSources.find((source) => source.id === selectedSourceId);
  const attentionCount = branchQueue.filter((task) => task.group !== 'Hôm nay').length;
  const overdueCount = branchQueue.filter((task) => task.group === 'Quá hạn').length;
  const unassignedCount = branchQueue.filter((task) => task.owner === 'Chưa gán').length;
  const verificationCount = opsAgentSources.filter((source) => source.status === 'Cần xác minh').length;

  const focusTab = (next: AgentTab) => {
    setTab(next);
    const index = tabs.findIndex((item) => item.id === next);
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: AgentTab) => {
    const index = tabs.findIndex((item) => item.id === current);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    focusTab(tabs[nextIndex].id);
  };

  const openTask = (task: QueueTask) => {
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
    setSelectedTask(task);
    setChatDraft(questionByKind[task.kind] + ' Mã đơn ' + task.orderId + '.');
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

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = chatDraft.trim();
    if (!question) return;
    const reply = opsAgentFixtureAdapter.answer(question);
    const userMessage: ChatMessage = {
      id: messageSequence.current++,
      role: 'user',
      text: question,
      sourceIds: [],
    };
    const assistantMessage: ChatMessage = {
      id: messageSequence.current++,
      role: 'assistant',
      text: reply.text,
      sourceIds: reply.sourceIds,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setChatDraft('');
  };

  const newConversation = () => {
    messageSequence.current = 1;
    setSelectedTask(undefined);
    setChatDraft('');
    setMessages([
      {
        id: 0,
        role: 'assistant',
        text: 'Cuộc trò chuyện mới chỉ tồn tại trong trình duyệt này. Hãy chọn câu hỏi gợi ý; không gửi dữ liệu khách thật.',
        sourceIds: ['product-scope'],
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
          <p>Tra cứu checklist và việc cần chú ý tại chi nhánh. Nhân viên vẫn xử lý trên màn hình Studio.</p>
        </div>
        <div className="ops-agent-heading-meta">
          <span className="ops-demo-badge"><span aria-hidden="true">●</span> DEMO · FIXTURE</span>
          <span className="date-pill"><Icon name="pin" size={17} />{branch || 'Chưa chọn chi nhánh'}</span>
          <span className="ops-fixture-time"><Icon name="clock" size={16} />Dữ liệu mẫu · {formatFixtureTime()}</span>
        </div>
      </div>

      <div className="ops-agent-notice" role="status">
        <Icon name="spark" size={18} />
        <p><strong>Chỉ hướng dẫn tham khảo.</strong> Không có kết nối trợ lý trực tuyến, không ghi dữ liệu và không xác nhận nghiệp vụ.</p>
      </div>

      <div className="ops-tabs-wrap">
        <div className="ops-agent-tabs" role="tablist" aria-label="Các khu vực Ops Agent">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => { tabRefs.current[index] = element; }}
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
                <Button variant="quiet" onClick={() => go('orders', { order: selectedTask.orderId })}>
                  Mở đơn để đối chiếu
                </Button>
              )}
            </div>
          }
        >
          Một mục cần được đối chiếu lại với đơn gốc. Đây là trạng thái minh họa, chưa có thay đổi nghiệp vụ nào được thực hiện.
        </Feedback>
      )}

      <TabPanel tab={tab}>
        {tab === 'overview' && (
          <div className="ops-overview">
            <div className="ops-metric-grid">
              <article className="ops-metric-card">
                <span>Việc tại chi nhánh</span>
                <strong>{loading ? '—' : branchQueue.length}</strong>
                <small>Hàng đợi fixture</small>
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
                    <p className="eyebrow">ƯU TIÊN TẠI CHI NHÁNH</p>
                    <h2>Việc cần xem</h2>
                  </div>
                  <Button variant="quiet" onClick={() => setTab('queue')}>Mở hàng đợi</Button>
                </div>
                {loading ? (
                  <div className="ops-queue-skeleton" role="status" aria-label="Đang tải hàng đợi">
                    <span /><span /><span />
                  </div>
                ) : error ? (
                  <Feedback
                    tone="danger"
                    title="Không tải được hàng đợi fixture"
                    action={<Button variant="secondary" onClick={retry}>Thử lại</Button>}
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
                        <span><strong>{task.task}</strong><small>{task.orderId} · {task.customer}</small></span>
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
                    <h2>Bản thiết kế demo</h2>
                  </div>
                  <StatusLabel text="Chưa kết nối" tone="neutral" />
                </div>
                <dl className="key-facts">
                  <div><dt>Hàng đợi</dt><dd>Fixture tĩnh từ Studio</dd></div>
                  <div><dt>Kết nối trực tuyến</dt><dd>Ngoại tuyến</dd></div>
                  <div><dt>Bộ điều phối</dt><dd>Chưa tích hợp</dd></div>
                  <div><dt>Mô hình / dịch vụ AI</dt><dd>Chưa kết nối</dd></div>
                  <div><dt>Thao tác ghi</dt><dd>Đang tắt</dd></div>
                  <div><dt>Lưu hội thoại</dt><dd>Chỉ trong trình duyệt</dd></div>
                </dl>
                <p className="small-note">Sơ đồ dưới đây mô tả hướng thiết kế, chưa phải luồng chạy thật.</p>
                <ol className="ops-flow">
                  <li><span>1</span><div><strong>Đọc dữ liệu theo chi nhánh</strong><small>Fixture minh họa</small></div></li>
                  <li><span>2</span><div><strong>Đối chiếu nguồn tài liệu</strong><small>Hiển thị nguồn và trạng thái</small></div></li>
                  <li><span>3</span><div><strong>Gợi ý checklist</strong><small>Nhân viên tự kiểm tra</small></div></li>
                  <li><span>4</span><div><strong>Thực hiện trong Studio</strong><small>Hệ thống nghiệp vụ mới ghi nhận kết quả</small></div></li>
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
                <p>Các mục mẫu được lọc theo chi nhánh đang làm việc. Mở đơn để xử lý trong Studio.</p>
              </div>
              <Button variant="secondary" onClick={retry} loading={loading}><Icon name="refresh" size={17} />Tải lại fixture</Button>
            </div>
            <div className="ops-queue-controls">
              <Field
                label="Tìm đơn, khách, công việc hoặc mã bộ"
                placeholder="Ví dụ: RT-1024, BC-028..."
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
              />
              <span className="ops-queue-branch"><Icon name="pin" size={16} />{branch}</span>
            </div>
            <div className="ops-filter-list" role="group" aria-label="Lọc loại công việc">
              {filters.map((filter) => (
                <button
                  type="button"
                  className={queueFilter === filter.id ? 'ops-filter-chip active' : 'ops-filter-chip'}
                  aria-pressed={queueFilter === filter.id}
                  key={filter.id}
                  onClick={() => setQueueFilter(filter.id)}
                >
                  {filter.label}
                  {filter.id === 'all' ? (
                    <span>{loading ? '—' : branchQueue.length}</span>
                  ) : (
                    <span>{loading ? '—' : branchQueue.filter((task) => task.kind === filter.id).length}</span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="ops-queue-skeleton ops-queue-skeleton-large" role="status" aria-label="Đang tải hàng đợi">
                <span /><span /><span /><span />
              </div>
            ) : error ? (
              <Feedback
                tone="danger"
                title="Không tải được hàng đợi fixture"
                action={<Button variant="secondary" onClick={retry}>Thử lại</Button>}
              >
                {error} Bộ lọc và nội dung tìm kiếm đang được giữ lại.
              </Feedback>
            ) : branchQueue.length === 0 ? (
              <EmptyState title="Hàng đợi đang trống">
                Chưa có công việc mẫu tại {branch}. Không có thao tác nghiệp vụ nào cần thực hiện ở đây.
              </EmptyState>
            ) : visibleQueue.length === 0 ? (
              <EmptyState
                title="Không tìm thấy công việc phù hợp"
                action={<Button variant="secondary" onClick={() => { setQueueSearch(''); setQueueFilter('all'); }}>Xóa bộ lọc</Button>}
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
                  />
                ))}
              </div>
            )}
            <p className="ops-fixture-caption">DEMO · FIXTURE — danh sách minh họa, không tự cập nhật theo thay đổi tại quầy.</p>
          </div>
        )}

        {tab === 'workflows' && (
          <div className="ops-workflows-view">
            <div className="feature-heading">
              <div>
                <h2>Quy trình tham khảo</h2>
                <p>Checklist minh họa để nhóm rà soát. Chưa thay thế quy trình được Studio phê duyệt.</p>
              </div>
              <StatusLabel text="Cần chủ quy trình xác nhận" tone="warning" />
            </div>
            <div className="ops-workflow-grid">
              {opsAgentWorkflows.map((workflow) => (
                <article className="feature-panel ops-workflow-card" key={workflow.id}>
                  <div className="feature-panel-head">
                    <div>
                      <StatusLabel text={workflow.status} tone={sourceStatusTone(workflow.status)} />
                      <h3>{workflow.title}</h3>
                    </div>
                    <span className="ops-workflow-index" aria-hidden="true">{String(opsAgentWorkflows.indexOf(workflow) + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="muted">{workflow.summary}</p>
                  <ol className="ops-checklist">
                    {workflow.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <div className="ops-source-chips" aria-label="Nguồn tham khảo">
                    {workflow.sources.map((sourceId) => {
                      const source = opsAgentSources.find((item) => item.id === sourceId);
                      return source ? (
                        <button
                          type="button"
                          className="ops-source-chip"
                          key={source.id}
                          onClick={() => { setSelectedSourceId(source.id); setTab('knowledge'); }}
                        >
                          {source.title}
                        </button>
                      ) : null;
                    })}
                  </div>
                  <Button variant="quiet" onClick={() => openChatForWorkflow(workflow.id)}>Hỏi về checklist này</Button>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="ops-knowledge-view">
            <div className="feature-heading">
              <div>
                <h2>Nguồn tri thức</h2>
                <p>Tài liệu thiết kế và checklist fixture. Chưa có tải lên, phê duyệt hoặc lập chỉ mục tài liệu.</p>
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
                <select value={knowledgeType} onChange={(event) => setKnowledgeType(event.target.value)}>
                  <option value="all">Tất cả loại</option>
                  {[...new Set(opsAgentSources.map((source) => source.type))].map((type) => (
                    <option value={type} key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Chủ đề</span>
                <select value={knowledgeTopic} onChange={(event) => setKnowledgeTopic(event.target.value)}>
                  <option value="all">Tất cả chủ đề</option>
                  {[...new Set(opsAgentSources.map((source) => source.topic))].map((topic) => (
                    <option value={topic} key={topic}>{topic}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Trạng thái nguồn</span>
                <select value={knowledgeStatus} onChange={(event) => setKnowledgeStatus(event.target.value)}>
                  <option value="all">Tất cả trạng thái</option>
                  <option value="needs-verification">Cần xác minh</option>
                </select>
              </label>
            </div>
            {selectedSource && (
              <section className="ops-source-focus" aria-label="Chi tiết nguồn đã chọn">
                <div>
                  <StatusLabel text={selectedSource.status} tone={sourceStatusTone(selectedSource.status)} />
                  <h3>{selectedSource.title}</h3>
                  <p>{selectedSource.body}</p>
                </div>
                <Button variant="quiet" onClick={() => setSelectedSourceId(undefined)}>Đóng chi tiết</Button>
              </section>
            )}
            {visibleSources.length === 0 ? (
              <EmptyState
                title="Không tìm thấy tài liệu"
                action={<Button variant="secondary" onClick={() => { setKnowledgeSearch(''); setKnowledgeTopic('all'); setKnowledgeType('all'); setKnowledgeStatus('all'); }}>Xóa bộ lọc</Button>}
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
                    <span className="ops-source-topic">{source.topic} <Icon name="arrow" size={15} /></span>
                  </button>
                ))}
              </div>
            )}
            <p className="ops-fixture-caption">Nguồn hiển thị là dữ liệu tĩnh để xem trước giao diện; chưa có chủ sở hữu, phiên bản hay lịch sử phê duyệt.</p>
          </div>
        )}

        {tab === 'activity' && (
          <div className="ops-activity-view">
            <div className="feature-heading">
              <div>
                <h2>Nhật ký hoạt động</h2>
                <p>Nhật ký có ý nghĩa khi runtime thật ghi được người thực hiện, phạm vi và kết quả đã xác nhận.</p>
              </div>
              <StatusLabel text="Chưa kết nối" tone="neutral" />
            </div>
            <EmptyState title="Chưa có nhật ký">
              Bản demo không lưu câu hỏi hay thao tác. Không tạo sự kiện mẫu để tránh hiểu nhầm rằng hệ thống đã xử lý đơn.
            </EmptyState>
            <section className="feature-panel ops-audit-fields">
              <div className="feature-panel-head">
                <div>
                  <p className="eyebrow">THÔNG TIN CẦN CÓ KHI TRIỂN KHAI</p>
                  <h2>Trường nhật ký dự kiến</h2>
                </div>
              </div>
              <div className="ops-audit-grid">
                <div><strong>Ai và phạm vi</strong><span>Người dùng, vai trò, chi nhánh</span></div>
                <div><strong>Tham chiếu</strong><span>Mã yêu cầu, nguồn và phiên bản tài liệu</span></div>
                <div><strong>Thao tác</strong><span>Công cụ, dữ liệu đích, thời điểm</span></div>
                <div><strong>Kết quả</strong><span>Phản hồi đã xác nhận từ hệ thống nghiệp vụ</span></div>
              </div>
              <p className="small-note">Quyền xem nhật ký, dữ liệu cá nhân và thời hạn lưu vẫn cần quyết định trước khi nối dịch vụ thật.</p>
            </section>
          </div>
        )}

        {tab === 'chat' && (
          <div className="ops-chat-layout">
            <section className="feature-panel ops-chat-main" aria-label="Hỏi Ops Agent">
              <div className="ops-chat-heading">
                <div>
                  <p className="eyebrow">TRẢ LỜI THEO TỪ KHÓA</p>
                  <h2>Hỏi Agent</h2>
                  <p>Không có mô hình AI. Câu trả lời mẫu chỉ dựa trên từ khóa và nguồn fixture.</p>
                </div>
                <Button variant="secondary" onClick={newConversation}>Cuộc trò chuyện mới</Button>
              </div>
              <div className="ops-chat-context">
                <Icon name="pin" size={16} />
                <span>Phạm vi: {branch}</span>
                {selectedTask && <span>· Đơn mẫu: {selectedTask.orderId}</span>}
                <span className="ops-offline-label">Ngoại tuyến</span>
              </div>
              <div className="ops-chat-thread" aria-label="Nội dung trò chuyện" aria-live="polite">
                {messages.map((message) => (
                  <article
                    className={'ops-chat-message ' + (message.role === 'user' ? 'user' : 'assistant')}
                    key={message.id}
                  >
                    <span className="ops-chat-role">{message.role === 'user' ? 'Bạn' : 'Ops Agent · DEMO'}</span>
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
                              onClick={() => { setSelectedSourceId(source.id); setTab('knowledge'); }}
                            >
                              {source.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </article>
                ))}
                <div ref={messageEndRef} />
              </div>
              <div className="ops-chat-suggestions" aria-label="Câu hỏi gợi ý">
                {suggestedQuestions.map((question) => (
                  <button
                    type="button"
                    key={question}
                    onClick={() => setChatDraft(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
              <form className="ops-chat-form" onSubmit={sendMessage}>
                <div className="ops-chat-input">
                  <TextAreaField
                    label="Câu hỏi"
                    hint="Enter để gửi · Shift + Enter để xuống dòng. Không nhập thông tin khách thật."
                    placeholder="Hỏi về checklist hoặc nguồn tài liệu..."
                    value={chatDraft}
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
                <Button type="submit" disabled={!chatDraft.trim()}>Gửi câu hỏi</Button>
              </form>
            </section>
            <aside className="feature-panel ops-chat-side">
              <div className="feature-panel-head">
                <div>
                  <p className="eyebrow">HƯỚNG DẪN</p>
                  <h2>Giới hạn của bản demo</h2>
                </div>
              </div>
              <ul className="ops-chat-limits">
                <li>Chỉ dùng checklist và câu trả lời theo từ khóa.</li>
                <li>Không đọc dữ liệu khách từ hội thoại.</li>
                <li>Không xác nhận đơn, bộ, khoản thu hoặc hoàn cọc.</li>
                <li>Lịch sử không được gửi lên máy chủ.</li>
              </ul>
              <Button variant="quiet" onClick={() => setTab('knowledge')}>Xem nguồn tri thức</Button>
            </aside>
          </div>
        )}
      </TabPanel>
    </div>
  );
}
