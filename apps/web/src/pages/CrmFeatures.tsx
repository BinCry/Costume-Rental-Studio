import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Feedback,
  Field,
  SelectField,
  TextAreaField,
  StatusLabel,
} from '../components/ui';
import {
  BranchSelector,
  InlineIssue,
  KeyFacts,
  PageHeading,
  Panel,
  SearchField,
  StateGate,
  Timeline,
} from '../components/studio';
import { useFixtureResource } from '../components/useFixtureResource';
import { useMobileDetailReveal } from '../components/useMobileDetailReveal';
import {
  apiEnabled,
  createCustomerInteraction,
  hasAccessToken,
  listCrmCaseHistory,
  listCrmAssignees,
  listCustomerInteractions,
} from '../api/client';
import { studioAdapter, type Case, type Customer } from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';

const caseStatusLabels: Record<Case['status'], string> = {
  OPEN: 'Mới mở',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
};
const priorityLabels: Record<Case['priority'], string> = {
  LOW: 'Thấp',
  NORMAL: 'Bình thường',
  HIGH: 'Cao',
  URGENT: 'Khẩn',
};

export function CrmPage({
  scenario,
  branch,
  canManage,
}: {
  scenario: DemoScenario;
  branch: string;
  canManage: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const loadCustomers = useCallback(
    (currentScenario: DemoScenario) => studioAdapter.customers(currentScenario, branch),
    [branch],
  );
  const loadCases = useCallback(
    (currentScenario: DemoScenario) => studioAdapter.cases(currentScenario, branch),
    [branch],
  );
  const { loading, error, data, retry } = useFixtureResource(scenario, loadCustomers, branch);
  const casesResource = useFixtureResource(scenario, loadCases, branch);
  const loadEmployees = useCallback(
    (currentScenario: DemoScenario) =>
      realApiMode ? listCrmAssignees(branch) : studioAdapter.employees(currentScenario),
    [branch, realApiMode],
  );
  const employeesResource = useFixtureResource(scenario, loadEmployees, branch);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('KH-004');
  const [caseCode, setCaseCode] = useState('CS-001');
  const [draft, setDraft] = useState<Case>();
  const [newCustomer, setNewCustomer] = useState<Customer>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiInteractions, setApiInteractions] = useState<Record<string, string[]>>({});
  const [apiCaseHistory, setApiCaseHistory] = useState<Record<string, string[]>>({});
  const [apiInteractionErrors, setApiInteractionErrors] = useState<Record<string, boolean>>({});
  const [apiCaseHistoryErrors, setApiCaseHistoryErrors] = useState<Record<string, boolean>>({});
  const [apiInteractionLoading, setApiInteractionLoading] = useState<Record<string, boolean>>({});
  const [apiCaseHistoryLoading, setApiCaseHistoryLoading] = useState<Record<string, boolean>>({});
  const [interactionRetry, setInteractionRetry] = useState(0);
  const [caseHistoryRetry, setCaseHistoryRetry] = useState(0);
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionType, setInteractionType] = useState<
    'INQUIRY' | 'CONSULTATION' | 'COMPLAINT' | 'FOLLOW_UP' | 'NOTE'
  >('NOTE');
  const [interactionChannel, setInteractionChannel] = useState<
    'IN_PERSON' | 'PHONE' | 'EMAIL' | 'CHAT' | 'SOCIAL'
  >('IN_PERSON');
  const [pendingView, setPendingView] = useState<
    { kind: 'customer' | 'case' | 'newCase'; code: string } | undefined
  >();
  const { detailRef: customerDetailRef, revealDetail: revealCustomer } =
    useMobileDetailReveal<HTMLDivElement>();
  const { detailRef: caseDetailRef, revealDetail: revealCase } =
    useMobileDetailReveal<HTMLDivElement>();
  const activeCustomer = realApiMode && data?.length
    ? data.find((customer) => customer.code === selected) ?? data[0]
    : undefined;
  const activeCustomerCode = activeCustomer?.code ?? selected;
  useEffect(() => {
    if (!realApiMode || !activeCustomer) return;
    let active = true;
    setApiInteractionLoading((current) => ({ ...current, [activeCustomerCode]: true }));
    setApiInteractionErrors((current) => ({ ...current, [activeCustomerCode]: false }));
    void listCustomerInteractions(activeCustomerCode, branch)
      .then((items) => {
        if (active) setApiInteractions((current) => ({ ...current, [activeCustomerCode]: items }));
      })
      .catch(() => {
        if (active) setApiInteractionErrors((current) => ({ ...current, [activeCustomerCode]: true }));
      })
      .finally(() => {
        if (active) setApiInteractionLoading((current) => ({ ...current, [activeCustomerCode]: false }));
      });
    return () => {
      active = false;
    };
  }, [activeCustomer, activeCustomerCode, branch, interactionRetry, realApiMode]);
  useEffect(() => {
    if (!realApiMode || !caseCode || !casesResource.data?.some((item) => item.code === caseCode)) return;
    let active = true;
    setApiCaseHistoryLoading((current) => ({ ...current, [caseCode]: true }));
    setApiCaseHistoryErrors((current) => ({ ...current, [caseCode]: false }));
    void listCrmCaseHistory(caseCode)
      .then((items) => {
        if (active) setApiCaseHistory((current) => ({ ...current, [caseCode]: items }));
      })
      .catch(() => {
        if (active) setApiCaseHistoryErrors((current) => ({ ...current, [caseCode]: true }));
      })
      .finally(() => {
        if (active) setApiCaseHistoryLoading((current) => ({ ...current, [caseCode]: false }));
      });
    return () => {
      active = false;
    };
  }, [caseCode, caseHistoryRetry, casesResource.data, realApiMode]);
  const switchView = (kind: 'customer' | 'case' | 'newCase', code: string) => {
    if (draft) {
      setPendingView({ kind, code });
      return;
    }
    if (kind === 'customer') {
      setSelected(code);
      setCaseCode('');
      revealCustomer();
    } else if (kind === 'case') {
      setCaseCode(code);
      revealCase();
    }
    setIssue('');
    setNotice('');
  };
  const saveCase = async (value: Case) => {
    if (!canManage) return;
    if (!value.subject.trim()) {
      setIssue('Nhập tiêu đề case trước khi lưu hoặc nhận xử lý.');
      return;
    }
    if (
      value.owner &&
      !employeesResource.data?.some(
        (employee) =>
          employee.name === value.owner &&
          employee.employmentStatus === 'ACTIVE' &&
          employee.accountStatus === 'ACTIVE' &&
          employee.assignments.some((assignment) => assignment.branch === value.branch),
      )
    ) {
      setIssue(
        'Người phụ trách chưa hoạt động tại chi nhánh xử lý. Chọn nhân viên đang hoạt động hoặc để chưa phân công.',
      );
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      const previous = casesResource.data?.find((item) => item.code === value.code);
      const history = previous
        ? value.history[0] === previous.history[0]
          ? ['03/10 · Cập nhật case', ...value.history]
          : value.history
        : value.history.length
          ? value.history
          : ['03/10 · Tạo case'];
      const saved = await studioAdapter.saveCase({ ...value, history }, scenario);
      setCaseCode(saved.code);
      setDraft(undefined);
      setNotice(realApiMode ? 'Case đã được lưu vào hệ thống CRM.' : 'Case đã được lưu trong dữ liệu mẫu và ghi lịch sử.');
      casesResource.retry();
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Chưa thể lưu case.');
    } finally {
      setBusy(false);
    }
  };
  const saveInteraction = async (customerCode: string) => {
    if (!interactionNote.trim()) {
      setIssue('Nhập nội dung tương tác trước khi ghi.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      const line = await createCustomerInteraction(customerCode, branch, {
        summary: interactionNote.trim(),
        interactionType,
        channel: interactionChannel,
      });
      setApiInteractions((current) => ({
        ...current,
        [customerCode]: [line, ...(current[customerCode] ?? [])],
      }));
      setInteractionNote('');
      setNotice('Đã ghi tương tác vào hồ sơ khách.');
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Chưa thể ghi tương tác.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <StateGate
      loading={loading || casesResource.loading || employeesResource.loading}
      error={error ?? casesResource.error ?? employeesResource.error}
      data={data}
      retry={() => {
        retry();
        casesResource.retry();
        employeesResource.retry();
      }}
      emptyTitle="Chưa có hồ sơ khách"
    >
      {(customers) => {
        const visible = customers.filter(
          (c) =>
            c.preferredBranch === branch &&
            `${c.name} ${c.phone} ${c.code}`.toLowerCase().includes(search.toLowerCase()),
        );
        const person = visible.find((c) => c.code === activeCustomerCode) ?? visible[0];
        const related = (casesResource.data ?? []).filter((c) => c.customerCode === person?.code);
        const current = related.find((c) => c.code === caseCode) ?? related[0];
        const editing = draft ?? current;
        const personInteractions = person
          ? apiInteractions[person.code] ?? (realApiMode ? [] : person.interactions)
          : [];
        const currentHistory = current
          ? apiCaseHistory[current.code] ?? (realApiMode ? [] : current.history)
          : [];
        const eligibleOwners = (employeesResource.data ?? []).filter(
          (employee) =>
            employee.employmentStatus === 'ACTIVE' &&
            employee.accountStatus === 'ACTIVE' &&
            employee.assignments.some((assignment) => assignment.branch === editing?.branch),
        );
        const ownerUnavailable =
          !!editing?.owner && !eligibleOwners.some((employee) => employee.name === editing.owner);
        return (
          <div className="page">
            <PageHeading
              eyebrow="CRM / KHÁCH HÀNG"
              title="Khách hàng & case"
              description="Hồ sơ, lịch sử thuê, tương tác và xử lý case theo chi nhánh."
              action={
                canManage ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setNewCustomer({
                        code: `KH-DEMO-${customers.length + 1}`,
                        name: '',
                        phone: '',
                        email: '',
                        preferredBranch: branch,
                        history: [],
                        interactions: [],
                      })
                    }
                  >
                    + Hồ sơ khách
                  </Button>
                ) : undefined
              }
            />
            {!canManage && (
              <Feedback title="Chỉ xem hồ sơ và case">
                Vai trò hiện tại chưa có mã quyền cập nhật CRM tại chi nhánh này.
              </Feedback>
            )}
            <div className="crm-layout">
              <Panel title="Hồ sơ khách">
                <SearchField
                  label="Tìm tên, mã, số điện thoại"
                  value={search}
                  onChange={setSearch}
                />
                <div className="feature-card-list">
                  {visible.map((c) => (
                    <button
                      className={`feature-list-row selectable ${person?.code === c.code ? 'selected' : ''}`}
                      key={c.code}
                      onClick={() => switchView('customer', c.code)}
                    >
                      <strong>{c.name}</strong>
                      <span>{c.phone}</span>
                      <small>{c.code}</small>
                    </button>
                  ))}
                </div>
                {!visible.length && <p className="muted">Không có khách phù hợp ở {branch}.</p>}
              </Panel>
              {person ? (
                <div
                  ref={customerDetailRef}
                  tabIndex={-1}
                  role="region"
                  aria-label="Hồ sơ khách đang chọn"
                >
                  <Panel title={person.name}>
                    <KeyFacts
                      rows={[
                        { label: 'Mã khách', value: person.code },
                        { label: 'Điện thoại', value: person.phone },
                        { label: 'Email', value: person.email },
                        { label: 'Chi nhánh ưu tiên', value: person.preferredBranch },
                      ]}
                    />
                    <h3>Lịch sử thuê</h3>
                    <Timeline items={person.history} />
                    <h3>Tương tác</h3>
                    {realApiMode && apiInteractionLoading[person.code] ? (
                      <p className="muted" role="status">Đang tải tương tác…</p>
                    ) : realApiMode && apiInteractionErrors[person.code] ? (
                      <Feedback
                        tone="danger"
                        title="Chưa tải được lịch sử tương tác"
                        action={<Button variant="secondary" onClick={() => setInteractionRetry((value) => value + 1)}>Thử lại</Button>}
                      >
                        Dữ liệu chưa được xác minh; thử tải lại để xem lịch sử mới nhất.
                      </Feedback>
                    ) : (
                      <Timeline items={personInteractions} />
                    )}
                    {realApiMode && canManage && (
                      <div className="stack-form">
                        <SelectField
                          label="Loại tương tác"
                          value={interactionType}
                          onChange={(e) => setInteractionType(e.target.value as typeof interactionType)}
                        >
                          <option value="NOTE">Ghi chú</option>
                          <option value="INQUIRY">Hỏi thông tin</option>
                          <option value="CONSULTATION">Tư vấn</option>
                          <option value="COMPLAINT">Khiếu nại</option>
                          <option value="FOLLOW_UP">Theo dõi sau thuê</option>
                        </SelectField>
                        <SelectField
                          label="Kênh"
                          value={interactionChannel}
                          onChange={(e) => setInteractionChannel(e.target.value as typeof interactionChannel)}
                        >
                          <option value="IN_PERSON">Tại quầy</option>
                          <option value="PHONE">Điện thoại</option>
                          <option value="EMAIL">Email</option>
                          <option value="CHAT">Chat</option>
                          <option value="SOCIAL">Mạng xã hội</option>
                        </SelectField>
                        <TextAreaField
                          label="Nội dung tương tác"
                          value={interactionNote}
                          onChange={(e) => setInteractionNote(e.target.value)}
                          placeholder="Ghi ngắn gọn nhu cầu hoặc kết quả trao đổi"
                        />
                        <Button loading={busy} onClick={() => void saveInteraction(person.code)}>
                          Ghi tương tác
                        </Button>
                      </div>
                    )}
                  </Panel>
                  <Panel
                    title="Case liên quan"
                    action={
                      canManage ? (
                        <Button
                          variant="quiet"
                          onClick={() => {
                            if (draft) {
                              setPendingView({ kind: 'newCase', code: person.code });
                              return;
                            }
                            const value: Case = {
                              code: `CS-DEMO-${(casesResource.data ?? []).length + 1}`,
                              customerCode: person.code,
                              branch,
                              subject: '',
                              description: '',
                              priority: 'NORMAL',
                              status: 'OPEN',
                              history: [],
                            };
                            setDraft(value);
                            setCaseCode(value.code);
                            revealCase();
                          }}
                        >
                          + Tạo case
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="feature-card-list">
                      {related.map((c) => (
                        <button
                          className={`feature-list-row selectable ${current?.code === c.code ? 'selected' : ''}`}
                          key={c.code}
                          onClick={() => switchView('case', c.code)}
                        >
                          <strong>
                            {c.code} · {c.subject}
                          </strong>
                          <span>
                            {caseStatusLabels[c.status]} · {priorityLabels[c.priority]}
                          </span>
                          <small>{c.owner ?? 'Chưa phân công'}</small>
                        </button>
                      ))}
                    </div>
                    {!related.length && <p className="muted">Chưa có case.</p>}
                  </Panel>
                </div>
              ) : (
                <Panel title="Hồ sơ khách">
                  <p className="muted">Chọn khách ở cột bên trái.</p>
                </Panel>
              )}
              <div
                ref={caseDetailRef}
                tabIndex={-1}
                role="region"
                aria-label="Chi tiết case đang chọn"
              >
                {editing ? (
                  <Panel title={editing.code}>
                    <StatusLabel
                      text={caseStatusLabels[editing.status]}
                      tone={
                        editing.status === 'CLOSED'
                          ? 'success'
                          : editing.priority === 'HIGH'
                            ? 'warning'
                            : 'info'
                      }
                    />
                    <fieldset className="fieldset-reset stack-form" disabled={!canManage}>
                      <Field
                        label="Tiêu đề case"
                        value={editing.subject}
                        onChange={(e) => setDraft({ ...editing, subject: e.target.value })}
                      />
                      <TextAreaField
                        label="Mô tả / cập nhật"
                        value={editing.description}
                        onChange={(e) => setDraft({ ...editing, description: e.target.value })}
                      />
                      <SelectField
                        label="Ưu tiên"
                        value={editing.priority}
                        onChange={(e) =>
                          setDraft({ ...editing, priority: e.target.value as Case['priority'] })
                        }
                      >
                        {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((x) => (
                          <option value={x} key={x}>
                            {priorityLabels[x]}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        label="Người phụ trách tại chi nhánh"
                        value={editing.owner ?? ''}
                        onChange={(e) => {
                          setIssue('');
                          setDraft({
                            ...editing,
                            owner: e.target.value || undefined,
                            history: [
                              `03/10 · Chuyển case cho ${e.target.value || 'chưa phân công'}`,
                              ...editing.history,
                            ],
                          });
                        }}
                      >
                        <option value="">Chưa phân công</option>
                        {ownerUnavailable && (
                          <option value={editing.owner} disabled>
                            {editing.owner} · không còn hiệu lực tại chi nhánh
                          </option>
                        )}
                        {eligibleOwners.map((employee) => (
                          <option key={employee.code} value={employee.name}>
                            {employee.name}
                          </option>
                        ))}
                      </SelectField>
                      {ownerUnavailable && (
                        <Feedback tone="warning" title="Cần phân công lại case">
                          Người phụ trách hiện tại không còn tài khoản hoặc phân công đang hoạt động
                          tại {editing.branch}. Lịch sử cũ vẫn được giữ.
                        </Feedback>
                      )}
                      {realApiMode && (
                        <div className="field">
                          <span>Chi nhánh xử lý case</span>
                          <strong>{editing.branch}</strong>
                          <p className="field-hint">
                            Chi nhánh được khóa theo case trên máy chủ; API hiện chưa hỗ trợ chuyển case giữa chi nhánh.
                          </p>
                        </div>
                      )}
                      {!realApiMode && (
                        <BranchSelector
                          label="Chi nhánh xử lý case"
                          value={editing.branch}
                          onChange={(v) => {
                            setIssue('');
                            setDraft({
                              ...editing,
                              branch: v,
                              history: [`03/10 · Chuyển case sang ${v}`, ...editing.history],
                            });
                          }}
                        />
                      )}
                      <SelectField
                        label="Trạng thái"
                        value={editing.status}
                        onChange={(e) =>
                          setDraft({
                            ...editing,
                            status: e.target.value as Case['status'],
                            history: [`03/10 · Cập nhật ${e.target.value}`, ...editing.history],
                          })
                        }
                      >
                        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((x) => (
                          <option value={x} key={x}>
                            {caseStatusLabels[x]}
                          </option>
                        ))}
                      </SelectField>
                      <div className="feature-actions">
                        <Button
                          loading={busy}
                          onClick={() => {
                            if (!editing.subject.trim()) {
                              setIssue('Nhập tiêu đề case.');
                              return;
                            }
                            void saveCase({
                              ...editing,
                              history: editing.history.length
                                ? editing.history
                                : ['03/10 · Tạo case'],
                            });
                          }}
                        >
                          Lưu case
                        </Button>
                        {editing.status === 'OPEN' && (
                          <Button
                            variant="secondary"
                            disabled={!editing.owner || ownerUnavailable || busy}
                            onClick={() =>
                              void saveCase({
                                ...editing,
                                status: 'IN_PROGRESS',
                                history: [
                                  `03/10 · ${editing.owner} bắt đầu xử lý case`,
                                  ...editing.history,
                                ],
                              })
                            }
                          >
                            Bắt đầu xử lý
                          </Button>
                        )}
                        {draft && (
                          <Button variant="quiet" onClick={() => setDraft(undefined)}>
                            Bỏ thay đổi
                          </Button>
                        )}
                      </div>
                      {draft && (
                        <p className="field-hint" role="status">
                          Case có thay đổi chưa lưu.
                        </p>
                      )}
                    </fieldset>
                    <h3>Lịch sử case</h3>
                    {realApiMode && editing === current && apiCaseHistoryLoading[current?.code ?? ''] ? (
                      <p className="muted" role="status">Đang tải lịch sử case…</p>
                    ) : realApiMode && editing === current && current && apiCaseHistoryErrors[current.code] ? (
                      <Feedback
                        tone="danger"
                        title="Chưa tải được lịch sử case"
                        action={<Button variant="secondary" onClick={() => setCaseHistoryRetry((value) => value + 1)}>Thử lại</Button>}
                      >
                        Timeline chưa được tải từ máy chủ.
                      </Feedback>
                    ) : (
                      <Timeline items={editing === current ? currentHistory : editing.history} />
                    )}
                  </Panel>
                ) : (
                  <Panel title="Chi tiết case">
                    <p className="muted">Chọn case hoặc tạo case mới cho khách đang xem.</p>
                  </Panel>
                )}
                <InlineIssue text={issue} conflict={scenario === 'version'} />
                {notice && (
                  <Feedback tone="success" title="Đã lưu">
                    {notice}
                  </Feedback>
                )}
              </div>
            </div>
            {newCustomer && (
              <ConfirmDialog
                title="Tạo hồ sơ khách"
                confirmText="Lưu hồ sơ"
                onClose={() => setNewCustomer(undefined)}
                onConfirm={() => {
                  void (async () => {
                    if (
                      !newCustomer.name.trim() ||
                      !/^0[0-9 ]{8,12}$/.test(newCustomer.phone.trim())
                    ) {
                      setIssue('Nhập họ tên và số điện thoại hợp lệ.');
                      return;
                    }
                    if (realApiMode && !/^\S+@\S+\.\S+$/.test(newCustomer.email.trim())) {
                      setIssue('Nhập email hợp lệ để tạo hồ sơ khách trên hệ thống.');
                      return;
                    }
                    if (
                      customers.some(
                        (customer) =>
                          customer.phone.replaceAll(' ', '') ===
                          newCustomer.phone.replaceAll(' ', ''),
                      )
                    ) {
                      setIssue(
                        'Số điện thoại đã có hồ sơ. Kiểm tra khách hiện có trước khi tạo hồ sơ khác.',
                      );
                      return;
                    }
                    setBusy(true);
                    setIssue('');
                    try {
                      const saved = await studioAdapter.saveCustomer(newCustomer, scenario);
                      setSelected(saved.code);
                      setNewCustomer(undefined);
                      retry();
                    } catch (e) {
                      setIssue(e instanceof Error ? e.message : 'Không lưu được khách.');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                loading={busy}
              >
                <div className="stack-form">
                  <Field
                    label="Họ tên"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                  <Field
                    label="Số điện thoại"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                  <Field
                    label="Email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                  <InlineIssue text={issue} />
                </div>
              </ConfirmDialog>
            )}
            {pendingView && (
              <ConfirmDialog
                title="Case có thay đổi chưa lưu"
                confirmText="Bỏ thay đổi và tiếp tục"
                onClose={() => setPendingView(undefined)}
                onConfirm={() => {
                  const next = pendingView;
                  setDraft(undefined);
                  setPendingView(undefined);
                  if (next.kind === 'customer') {
                    setSelected(next.code);
                    setCaseCode('');
                    revealCustomer();
                  } else if (next.kind === 'case') {
                    setCaseCode(next.code);
                    revealCase();
                  } else {
                    const value: Case = {
                      code: `CS-DEMO-${(casesResource.data ?? []).length + 1}`,
                      customerCode: next.code,
                      branch,
                      subject: '',
                      description: '',
                      priority: 'NORMAL',
                      status: 'OPEN',
                      history: [],
                    };
                    setCaseCode(value.code);
                    setDraft(value);
                    revealCase();
                  }
                }}
              >
                <p>Nội dung case đang nhập sẽ mất. Bạn có thể quay lại để lưu trước.</p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}
