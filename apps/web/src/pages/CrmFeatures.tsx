import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Feedback,
  DateTimeField,
  DetailDialog,
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
import {
  apiEnabled,
  createCustomerInteraction,
  hasAccessToken,
  listCrmCaseHistory,
  listCustomerRentalHistory,
  listCrmAssignees,
  listCustomerInteractions,
} from '../api/client';
import { studioAdapter, type Case, type Customer } from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';
import { nextCaseStatuses } from '../utils/crm-cases';
import { caseStatusLabels } from '../utils/crm-labels';
import { formatLocalDateTime, formatVietnamDateTime } from '../utils/date-format';
import { visibleBranchCustomers } from '../utils/crm-customers';
import { isValidPhone, samePhone } from '../utils/phone';

const priorityLabels: Record<Case['priority'], string> = {
  LOW: 'Thấp',
  NORMAL: 'Bình thường',
  HIGH: 'Cao',
  URGENT: 'Khẩn',
};
function caseIsOverdue(value: Case) {
  return !!value.dueAt && Date.parse(value.dueAt) < Date.now() &&
    (value.status === 'OPEN' || value.status === 'IN_PROGRESS');
}

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
  const [caseDetailOpen, setCaseDetailOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionDiscardOpen, setInteractionDiscardOpen] = useState(false);
  const [draft, setDraft] = useState<Case>();
  const [newCustomer, setNewCustomer] = useState<Customer>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiInteractions, setApiInteractions] = useState<Record<string, string[]>>({});
  const [apiCaseHistory, setApiCaseHistory] = useState<Record<string, string[]>>({});
  const [apiRentalHistory, setApiRentalHistory] = useState<Record<string, string[]>>({});
  const [apiRentalHistoryErrors, setApiRentalHistoryErrors] = useState<Record<string, boolean>>({});
  const [rentalHistoryRetry, setRentalHistoryRetry] = useState(0);
  const [apiInteractionErrors, setApiInteractionErrors] = useState<Record<string, boolean>>({});
  const [apiCaseHistoryErrors, setApiCaseHistoryErrors] = useState<Record<string, boolean>>({});
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
    { kind: 'customer' | 'case' | 'newCase' | 'closeCase'; code: string } | undefined
  >();
  const visibleApiCustomers = visibleBranchCustomers(data ?? [], branch, search, realApiMode);
  const activeCustomer = realApiMode
    ? visibleApiCustomers.find((customer) => customer.code === selected) ?? visibleApiCustomers[0]
    : undefined;
  const activeCustomerCode = activeCustomer?.code ?? selected;
  const activeCaseCode = (casesResource.data ?? []).find(
    (item) => item.customerCode === activeCustomerCode && item.code === caseCode,
  )?.code ?? (casesResource.data ?? []).find(
    (item) => item.customerCode === activeCustomerCode,
  )?.code;
  useEffect(() => {
    if (!realApiMode || !activeCustomer) return;
    let active = true;
    void listCustomerRentalHistory(activeCustomerCode)
      .then((items) => {
        if (active) setApiRentalHistory((current) => ({ ...current, [activeCustomerCode]: items }));
      })
      .catch(() => {
        if (active) setApiRentalHistoryErrors((current) => ({ ...current, [activeCustomerCode]: true }));
      });
    return () => {
      active = false;
    };
  }, [activeCustomer, activeCustomerCode, rentalHistoryRetry, realApiMode]);
  useEffect(() => {
    if (!realApiMode || !activeCustomer) return;
    let active = true;
    const interactionKey = JSON.stringify([activeCustomerCode, branch]);
    void listCustomerInteractions(activeCustomerCode, branch)
      .then((items) => {
        if (active) setApiInteractions((current) => ({ ...current, [interactionKey]: items }));
      })
      .catch(() => {
        if (active) setApiInteractionErrors((current) => ({ ...current, [interactionKey]: true }));
      });
    return () => {
      active = false;
    };
  }, [activeCustomer, activeCustomerCode, branch, interactionRetry, realApiMode]);
  useEffect(() => {
    if (!realApiMode || !activeCaseCode || !caseDetailOpen) return;
    let active = true;
    void listCrmCaseHistory(activeCaseCode)
      .then((items) => {
        if (active) setApiCaseHistory((current) => ({ ...current, [activeCaseCode]: items }));
      })
      .catch(() => {
        if (active) setApiCaseHistoryErrors((current) => ({ ...current, [activeCaseCode]: true }));
      });
    return () => {
      active = false;
    };
  }, [activeCaseCode, caseDetailOpen, caseHistoryRetry, realApiMode]);
  const switchView = (kind: 'customer' | 'case' | 'newCase', code: string) => {
    if (draft) {
      setPendingView({ kind, code });
      return;
    }
    if (kind === 'customer') {
      setSelected(code);
      setApiRentalHistoryErrors((current) => ({ ...current, [code]: false }));
      setApiInteractionErrors((current) => ({ ...current, [JSON.stringify([code, branch])]: false }));
      setCaseCode('');
      setCaseDetailOpen(false);
    } else if (kind === 'case') {
      const selectedCase = (casesResource.data ?? []).find((item) => item.code === code);
      if (selectedCase) setSelected(selectedCase.customerCode);
      setApiCaseHistoryErrors((current) => ({ ...current, [code]: false }));
      setCaseCode(code);
      setCaseDetailOpen(true);
    }
    setIssue('');
    setNotice('');
  };
  const startNewCase = (customerCode: string) => {
    if (draft) {
      setPendingView({ kind: 'newCase', code: customerCode });
      return;
    }
    const value: Case = {
      code: `CS-DEMO-${(casesResource.data ?? []).length + 1}`,
      customerCode,
      branch,
      subject: '',
      description: '',
      priority: 'NORMAL',
      status: 'OPEN',
      history: [],
    };
    setSelected(customerCode);
    setCaseCode(value.code);
    setDraft(value);
    setCaseDetailOpen(true);
    setIssue('');
    setNotice('');
  };
  const saveCase = async (value: Case) => {
    if (!canManage) return;
    if (!value.subject.trim()) {
      setIssue('Nhập tiêu đề yêu cầu trước khi lưu hoặc nhận xử lý.');
      return;
    }
    const isNewCase = !(casesResource.data ?? []).some((item) => item.code === value.code);
    if (isNewCase && (!value.dueAt || !Number.isFinite(Date.parse(value.dueAt)) || Date.parse(value.dueAt) <= Date.now())) {
      setIssue('Chọn hạn xử lý trong tương lai cho yêu cầu mới.');
      return;
    }
    if (value.dueAt && !Number.isFinite(Date.parse(value.dueAt))) {
      setIssue('Hạn xử lý chưa hợp lệ.');
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
          ? [`${formatVietnamDateTime(new Date())} · Cập nhật yêu cầu`, ...value.history]
          : value.history
        : value.history.length
          ? value.history
          : [`${formatVietnamDateTime(new Date())} · Tạo yêu cầu`];
      const saved = await studioAdapter.saveCase({ ...value, history }, scenario);
      setCaseCode(saved.code);
      setDraft(undefined);
      setNotice(realApiMode ? 'Yêu cầu hỗ trợ đã được lưu.' : 'Yêu cầu hỗ trợ đã được lưu trong dữ liệu mẫu.');
      casesResource.retry();
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Chưa thể lưu yêu cầu hỗ trợ.');
    } finally {
      setBusy(false);
    }
  };
  const saveInteraction = async (customerCode: string) => {
    if (!interactionNote.trim()) {
      setIssue('Nhập nội dung trao đổi trước khi lưu.');
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
      const interactionKey = JSON.stringify([customerCode, branch]);
      setApiInteractionErrors((current) => ({ ...current, [interactionKey]: false }));
      setApiInteractions((current) => ({
        ...current,
        [interactionKey]: [line, ...(current[interactionKey] ?? [])],
      }));
      setInteractionNote('');
      setNotice('Đã ghi nhận trao đổi vào hồ sơ khách.');
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Chưa thể lưu trao đổi.');
    } finally {
      setBusy(false);
    }
  };
  const closeInteraction = () => {
    if (busy) return;
    if (interactionNote.trim()) {
      setInteractionDiscardOpen(true);
      return;
    }
    setInteractionOpen(false);
    setIssue('');
    setNotice('');
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
        const visible = visibleBranchCustomers(customers, branch, search, realApiMode);
        const person = visible.find((c) => c.code === activeCustomerCode) ?? visible[0];
        const allCases = casesResource.data ?? [];
        const related = allCases
          .filter((c) => c.customerCode === person?.code)
          .sort((left, right) =>
            (left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY) -
              (right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY));
        const current = allCases.find((c) => c.code === activeCaseCode) ?? related[0];
        const editing = draft ?? current;
        const personInteractions = person
          ? apiInteractions[JSON.stringify([person.code, branch])] ?? (realApiMode ? [] : person.interactions)
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
              title="Khách hàng và yêu cầu hỗ trợ"
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
              <Feedback title="Chỉ xem thông tin khách hàng">
                Tài khoản của bạn chưa được cấp quyền tạo hoặc cập nhật yêu cầu hỗ trợ.
              </Feedback>
            )}
            <div className="crm-layout independent-scroll-workspace">
              <Panel title="Hồ sơ khách">
                <SearchField
                  label="Tìm tên, mã, số điện thoại"
                  value={search}
                  onChange={setSearch}
                />
                <div className="feature-card-list">
                  {visible.map((c) => {
                    const customerCases = allCases.filter((item) => item.customerCode === c.code);
                    const openCases = customerCases.filter(
                      (item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS',
                    );
                    const overdueCases = openCases.filter(caseIsOverdue);
                    return (
                      <button
                        className={`feature-list-row selectable ${person?.code === c.code ? 'selected' : ''}`}
                        aria-pressed={person?.code === c.code}
                        key={c.code}
                        onClick={() => switchView('customer', c.code)}
                      >
                        <strong>{c.name}</strong>
                        <span>{c.phone}</span>
                        <small>{c.code}</small>
                        <span
                          className={`crm-customer-case-indicator${overdueCases.length ? ' overdue' : ''}`}
                        >
                          {openCases.length} yêu cầu đang mở
                          {overdueCases.length > 0 ? ` · ${overdueCases.length} quá hạn` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!visible.length && (
                  <p className="muted">
                    Không tìm thấy khách tại {branch}. Kiểm tra từ khóa và chi nhánh đang làm việc.
                  </p>
                )}
              </Panel>
              <div className="crm-detail-workspace" role="region" aria-label="Thông tin khách hàng và yêu cầu hỗ trợ" tabIndex={0}>
              {person ? (
                <div className="crm-selected-customer">
                  <Panel
                    title={person.name}
                    action={realApiMode && canManage ? (
                      <Button variant="secondary" onClick={() => {
                        setIssue('');
                        setNotice('');
                        setInteractionOpen(true);
                      }}>
                        + Ghi nhận trao đổi
                      </Button>
                    ) : undefined}
                  >
                    <KeyFacts
                      rows={[
                        { label: 'Mã khách', value: person.code },
                        { label: 'Điện thoại', value: person.phone },
                        { label: 'Email', value: person.email },
                        { label: 'Chi nhánh ưu tiên', value: person.preferredBranch },
                      ]}
                    />
                    <details className="crm-history-section">
                      <summary>Lịch sử thuê</summary>
                    {realApiMode && (apiRentalHistory[person.code] === undefined && !apiRentalHistoryErrors[person.code]) ? (
                      <p className="muted" role="status">Đang tải lịch sử thuê…</p>
                    ) : realApiMode && apiRentalHistoryErrors[person.code] ? (
                      <Feedback
                        tone="danger"
                        title="Chưa tải được lịch sử thuê"
                        action={<Button variant="secondary" onClick={() => {
                          setApiRentalHistoryErrors((current) => ({ ...current, [person.code]: false }));
                          setRentalHistoryRetry((value) => value + 1);
                        }}>Thử lại</Button>}
                      >
                        Kiểm tra quyền xem đơn thuê của tài khoản rồi thử tải lại.
                      </Feedback>
                    ) : (
                      <Timeline items={realApiMode ? apiRentalHistory[person.code] ?? [] : person.history} />
                    )}
                    </details>
                    <details className="crm-history-section">
                      <summary>Lịch sử liên hệ</summary>
                    {realApiMode && (apiInteractions[JSON.stringify([person.code, branch])] === undefined && !apiInteractionErrors[JSON.stringify([person.code, branch])]) ? (
                      <p className="muted" role="status">Đang tải tương tác…</p>
                    ) : realApiMode && apiInteractionErrors[JSON.stringify([person.code, branch])] ? (
                      <Feedback
                        tone="danger"
                        title="Chưa tải được lịch sử tương tác"
                        action={<Button variant="secondary" onClick={() => {
                          setApiInteractionErrors((current) => ({ ...current, [JSON.stringify([person.code, branch])]: false }));
                          setInteractionRetry((value) => value + 1);
                        }}>Thử lại</Button>}
                      >
                        Dữ liệu chưa được xác minh; thử tải lại để xem lịch sử mới nhất.
                      </Feedback>
                    ) : (
                      <Timeline items={personInteractions} />
                    )}
                    </details>
                  </Panel>
                  <Panel
                    title="Yêu cầu hỗ trợ"
                    action={
                      canManage ? (
                        <Button
                          variant="quiet"
                          onClick={() => startNewCase(person.code)}
                        >
                          + Tạo yêu cầu
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="responsive-table crm-case-table" role="region" aria-label="Danh sách yêu cầu hỗ trợ của khách" tabIndex={0}>
                      <table>
                        <thead><tr><th>Mã</th><th>Nội dung</th><th>Ưu tiên</th><th>Hạn xử lý</th><th>Trạng thái</th><th>Người xử lý</th></tr></thead>
                        <tbody>
                          {related.map((item) => (
                            <tr key={item.code}>
                              <td><button className="text-link" aria-pressed={current?.code === item.code} onClick={() => switchView('case', item.code)}>{item.code}</button></td>
                              <td className="crm-case-subject" title={item.subject}>{item.subject}</td>
                              <td>{priorityLabels[item.priority]}</td>
                              <td className={caseIsOverdue(item) ? 'crm-case-overdue' : undefined}>
                                {item.dueAt ? formatLocalDateTime(item.dueAt) : 'Chưa đặt'}
                                {caseIsOverdue(item) && <small> · Quá hạn</small>}
                              </td>
                              <td>{caseStatusLabels[item.status]}</td>
                              <td>{item.owner ?? 'Chưa phân công'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="feature-card-list crm-case-mobile-list">
                      {related.map((c) => (
                        <button
                          className={`feature-list-row selectable ${current?.code === c.code ? 'selected' : ''}`}
                          aria-pressed={current?.code === c.code}
                          key={c.code}
                          onClick={() => switchView('case', c.code)}
                        >
                          <strong>
                            {c.code} · {c.subject}
                          </strong>
                          <span>
                            {caseStatusLabels[c.status]} · {priorityLabels[c.priority]}
                          </span>
                          <small>
                            {caseIsOverdue(c) ? 'Quá hạn' : 'Hạn'}{' '}
                            {c.dueAt ? formatLocalDateTime(c.dueAt) : 'chưa đặt'} · {c.owner ?? 'Chưa phân công'}
                          </small>
                        </button>
                      ))}
                    </div>
                    {!related.length && <p className="muted">Khách hàng chưa có yêu cầu hỗ trợ.</p>}
                  </Panel>
                </div>
              ) : (
                <Panel title="Hồ sơ khách">
                  <p className="muted">Chọn khách ở cột bên trái.</p>
                </Panel>
              )}
              {caseDetailOpen && editing && (
                <DetailDialog
                  title={draft ? 'Tạo yêu cầu hỗ trợ' : 'Yêu cầu ' + editing.code}
                  closeLabel="Đóng yêu cầu hỗ trợ"
                  onClose={() => {
                    if (draft) setPendingView({ kind: 'closeCase', code: draft.code });
                    else setCaseDetailOpen(false);
                  }}
                >
                  <div className="crm-case-dialog-context">
                    <span>Khách hàng<strong>{person?.name ?? editing.customerCode}</strong></span>
                    <span>Chi nhánh xử lý<strong>{editing.branch}</strong></span>
                  </div>
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
                        label="Tiêu đề yêu cầu"
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
                      <DateTimeField
                        label="Hạn xử lý"
                        value={editing.dueAt ?? ''}
                        required={current?.code !== editing.code}
                        onChange={(value) => {
                          setIssue('');
                          setDraft({ ...editing, dueAt: value || undefined });
                        }}
                        error={issue.startsWith('Chọn hạn xử lý') || issue.startsWith('Hạn xử lý') ? issue : undefined}
                      />
                      <SelectField
                        label="Người phụ trách tại chi nhánh"
                        value={editing.owner ?? ''}
                        onChange={(e) => {
                          setIssue('');
                          setDraft({
                            ...editing,
                            owner: e.target.value || undefined,
                            history: [
                              `${formatVietnamDateTime(new Date())} · Chuyển yêu cầu cho ${e.target.value || 'chưa phân công'}`,
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
                        <Feedback tone="warning" title="Cần phân công lại yêu cầu">
                          Người phụ trách hiện tại không còn tài khoản hoặc phân công đang hoạt động
                          tại {editing.branch}. Lịch sử cũ vẫn được giữ.
                        </Feedback>
                      )}
                      {realApiMode && (
                        <div className="field">
                          <span>Chi nhánh xử lý yêu cầu</span>
                          <strong>{editing.branch}</strong>
                          <p className="field-hint">
                            Yêu cầu được xử lý tại chi nhánh đã chọn và hiện chưa thể chuyển sang chi nhánh khác.
                          </p>
                        </div>
                      )}
                      {!realApiMode && (
                        <BranchSelector
                          label="Chi nhánh xử lý yêu cầu"
                          value={editing.branch}
                          onChange={(v) => {
                            setIssue('');
                            setDraft({
                              ...editing,
                              branch: v,
                              history: [`${formatVietnamDateTime(new Date())} · Chuyển yêu cầu sang ${v}`, ...editing.history],
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
                            history: [`${formatVietnamDateTime(new Date())} · Chuyển sang ${caseStatusLabels[e.target.value]}`, ...editing.history],
                          })
                        }
                      >
                        {nextCaseStatuses(
                          (current?.code === editing.code ? current.status : undefined) ?? 'OPEN',
                        ).map((x) => (
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
                              setIssue('Nhập tiêu đề yêu cầu.');
                              return;
                            }
                            void saveCase({
                              ...editing,
                              history: editing.history.length
                                ? editing.history
                                : [`${formatVietnamDateTime(new Date())} · Tạo yêu cầu`],
                            });
                          }}
                        >
                          Lưu yêu cầu
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
                                  `${formatVietnamDateTime(new Date())} · ${editing.owner} bắt đầu xử lý yêu cầu`,
                                  ...editing.history,
                                ],
                              })
                            }
                          >
                            Bắt đầu xử lý
                          </Button>
                        )}
                        {draft && (
                          <Button
                            variant="quiet"
                            onClick={() => {
                              const isNew = current?.code !== editing.code;
                              setDraft(undefined);
                              if (isNew) setCaseDetailOpen(false);
                            }}
                          >
                            Bỏ thay đổi
                          </Button>
                        )}
                      </div>
                      {draft && (
                        <p className="field-hint" role="status">
                          Yêu cầu có thay đổi chưa lưu.
                        </p>
                      )}
                    </fieldset>
                    <details className="crm-history-section">
                      <summary>Lịch sử xử lý</summary>
                    {realApiMode && editing === current && current && apiCaseHistoryErrors[current.code] ? (
                      <Feedback
                        tone="danger"
                        title="Chưa tải được lịch sử yêu cầu"
                        action={<Button variant="secondary" onClick={() => {
                          setApiCaseHistoryErrors((errors) => ({ ...errors, [current.code]: false }));
                          setCaseHistoryRetry((value) => value + 1);
                        }}>Thử lại</Button>}
                      >
                        Chưa tải được lịch sử cập nhật.
                      </Feedback>
                    ) : realApiMode && editing === current && current && (apiCaseHistory[current.code] === undefined && !apiCaseHistoryErrors[current.code]) ? (
                      <p className="muted" role="status">Đang tải lịch sử…</p>
                    ) : (
                      <Timeline items={editing === current ? currentHistory : editing.history} />
                    )}
                    </details>
                  </Panel>
                  <InlineIssue text={issue} conflict={scenario === 'version'} />
                  {notice && (
                    <Feedback tone="success" title="Đã lưu">
                      {notice}
                    </Feedback>
                  )}
                </DetailDialog>
              )}
              </div>
            </div>
            {interactionOpen && person && (
              <DetailDialog
                title={'Ghi nhận trao đổi · ' + person.name}
                closeLabel="Đóng ghi nhận trao đổi"
                  onClose={closeInteraction}
              >
                <div className="crm-interaction-dialog">
                  <KeyFacts
                    rows={[
                      { label: 'Mã khách', value: person.code },
                      { label: 'Điện thoại', value: person.phone },
                    ]}
                  />
                  <div className="stack-form">
                    <SelectField
                      label="Loại trao đổi"
                      value={interactionType}
                      onChange={(event) => setInteractionType(event.target.value as typeof interactionType)}
                    >
                      <option value="NOTE">Ghi chú</option>
                      <option value="INQUIRY">Hỏi thông tin</option>
                      <option value="CONSULTATION">Tư vấn</option>
                      <option value="COMPLAINT">Khiếu nại</option>
                      <option value="FOLLOW_UP">Theo dõi sau thuê</option>
                    </SelectField>
                    <SelectField
                      label="Kênh liên hệ"
                      value={interactionChannel}
                      onChange={(event) => setInteractionChannel(event.target.value as typeof interactionChannel)}
                    >
                      <option value="IN_PERSON">Tại quầy</option>
                      <option value="PHONE">Điện thoại</option>
                      <option value="EMAIL">Email</option>
                      <option value="CHAT">Chat</option>
                      <option value="SOCIAL">Mạng xã hội</option>
                    </SelectField>
                    <TextAreaField
                      label="Nội dung trao đổi"
                      value={interactionNote}
                      onChange={(event) => setInteractionNote(event.target.value)}
                      placeholder="Tóm tắt nhu cầu hoặc kết quả trao đổi"
                    />
                    <InlineIssue text={issue} />
                    {notice && <Feedback tone="success" title="Đã lưu ghi nhận">{notice}</Feedback>}
                    <div className="feature-actions">
                      <Button
                        loading={busy}
                        disabled={!interactionNote.trim()}
                        onClick={() => void saveInteraction(person.code)}
                      >
                        Lưu ghi nhận
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={closeInteraction}>
                        Hủy
                      </Button>
                    </div>
                  </div>
                </div>
              </DetailDialog>
            )}
            {interactionDiscardOpen && (
              <ConfirmDialog
                title="Bỏ nội dung chưa lưu?"
                confirmText="Bỏ nội dung"
                onClose={() => setInteractionDiscardOpen(false)}
                onConfirm={() => {
                  setInteractionDiscardOpen(false);
                  setInteractionOpen(false);
                  setInteractionNote('');
                  setIssue('');
                  setNotice('');
                }}
              >
                <p>Nội dung trao đổi đang nhập sẽ bị xóa.</p>
              </ConfirmDialog>
            )}
            {newCustomer && (
              <ConfirmDialog
                title="Tạo hồ sơ khách"
                confirmText="Lưu hồ sơ"
                onClose={() => setNewCustomer(undefined)}
                onConfirm={() => {
                  void (async () => {
                    if (!newCustomer.name.trim() || !isValidPhone(newCustomer.phone)) {
                      setIssue('Nhập họ tên và số điện thoại hợp lệ.');
                      return;
                    }
                    if (realApiMode && !/^\S+@\S+\.\S+$/.test(newCustomer.email.trim())) {
                      setIssue('Nhập email hợp lệ để tạo hồ sơ khách trên hệ thống.');
                      return;
                    }
                    if (customers.some((customer) => samePhone(customer.phone, newCustomer.phone))) {
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
                title={pendingView.kind === 'closeCase' ? 'Bỏ nội dung chưa lưu?' : 'Yêu cầu có thay đổi chưa lưu'}
                confirmText={pendingView.kind === 'closeCase' ? 'Bỏ nội dung' : 'Bỏ thay đổi và tiếp tục'}
                onClose={() => setPendingView(undefined)}
                onConfirm={() => {
                  const next = pendingView;
                  setDraft(undefined);
                  setPendingView(undefined);
                  if (next.kind === 'closeCase') {
                    setCaseDetailOpen(false);
                    return;
                  }
                  if (next.kind === 'customer') {
                    setSelected(next.code);
                    setCaseCode('');
                    setCaseDetailOpen(false);
                  } else if (next.kind === 'case') {
                    const selectedCase = (casesResource.data ?? []).find((item) => item.code === next.code);
                    if (selectedCase) setSelected(selectedCase.customerCode);
                    setCaseCode(next.code);
                    setCaseDetailOpen(true);
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
                    setSelected(next.code);
                    setCaseCode(value.code);
                    setDraft(value);
                    setCaseDetailOpen(true);
                  }
                }}
              >
                <p>
                  {pendingView.kind === 'closeCase'
                    ? 'Nội dung yêu cầu đang nhập sẽ bị xóa nếu bạn đóng cửa sổ.'
                    : 'Nếu tiếp tục, nội dung yêu cầu chưa lưu sẽ bị mất. Bạn có thể quay lại để lưu trước.'}
                </p>
              </ConfirmDialog>
            )}
          </div>
        );
      }}
    </StateGate>
  );
}
