import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Feedback,
  DetailDialog,
  Field,
  SelectField,
  TextAreaField,
} from '../components/ui';
import {
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
  listCustomerRentalHistory,
  listCustomerInteractions,
} from '../api/client';
import { studioAdapter, type Customer } from '../fixtures/studio';
import type { DemoScenario } from '../fixtures/types';
import { visibleBranchCustomers } from '../utils/crm-customers';
import { isValidPhone, samePhone } from '../utils/phone';

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
  const { loading, error, data, retry } = useFixtureResource(scenario, loadCustomers, branch);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('KH-004');
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionDiscardOpen, setInteractionDiscardOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Customer>();
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiInteractions, setApiInteractions] = useState<Record<string, string[]>>({});
  const [apiRentalHistory, setApiRentalHistory] = useState<Record<string, string[]>>({});
  const [apiRentalHistoryErrors, setApiRentalHistoryErrors] = useState<Record<string, boolean>>({});
  const [rentalHistoryRetry, setRentalHistoryRetry] = useState(0);
  const [apiInteractionErrors, setApiInteractionErrors] = useState<Record<string, boolean>>({});
  const [interactionRetry, setInteractionRetry] = useState(0);
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionType, setInteractionType] = useState<
    'INQUIRY' | 'CONSULTATION' | 'COMPLAINT' | 'FOLLOW_UP' | 'NOTE'
  >('NOTE');
  const [interactionChannel, setInteractionChannel] = useState<
    'IN_PERSON' | 'PHONE' | 'EMAIL' | 'CHAT' | 'SOCIAL'
  >('IN_PERSON');
  const visibleApiCustomers = visibleBranchCustomers(data ?? [], branch, search, realApiMode);
  const activeCustomer = realApiMode
    ? (visibleApiCustomers.find((customer) => customer.code === selected) ?? visibleApiCustomers[0])
    : undefined;
  const activeCustomerCode = activeCustomer?.code ?? selected;
  useEffect(() => {
    if (!realApiMode || !activeCustomer || !customerDetailOpen) return;
    let active = true;
    void listCustomerRentalHistory(activeCustomerCode)
      .then((items) => {
        if (active) setApiRentalHistory((current) => ({ ...current, [activeCustomerCode]: items }));
      })
      .catch(() => {
        if (active)
          setApiRentalHistoryErrors((current) => ({ ...current, [activeCustomerCode]: true }));
      });
    return () => {
      active = false;
    };
  }, [activeCustomer, activeCustomerCode, customerDetailOpen, rentalHistoryRetry, realApiMode]);
  useEffect(() => {
    if (!realApiMode || !activeCustomer || !customerDetailOpen) return;
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
  }, [
    activeCustomer,
    activeCustomerCode,
    branch,
    customerDetailOpen,
    interactionRetry,
    realApiMode,
  ]);
  const openCustomer = (code: string) => {
    setSelected(code);
    setCustomerDetailOpen(true);
    setApiRentalHistoryErrors((current) => ({ ...current, [code]: false }));
    setApiInteractionErrors((current) => ({ ...current, [JSON.stringify([code, branch])]: false }));
    setIssue('');
    setNotice('');
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
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có hồ sơ khách"
      allowEmpty
    >
      {(customers) => {
        const visible = visibleBranchCustomers(customers, branch, search, realApiMode);
        const person = visible.find((c) => c.code === activeCustomerCode) ?? visible[0];
        const personInteractions = person
          ? (apiInteractions[JSON.stringify([person.code, branch])] ??
            (realApiMode ? [] : person.interactions))
          : [];
        return (
          <div className="page">
            <PageHeading
              title="Khách hàng"
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
              <Feedback title="Chỉ xem thông tin khách">
                Tài khoản của bạn chưa được cấp quyền cập nhật hồ sơ hoặc ghi nhận liên hệ.
              </Feedback>
            )}
            <div className="crm-customer-table-workspace">
              <Panel title="Danh sách khách hàng">
                <SearchField
                  label="Tìm tên, mã, số điện thoại"
                  value={search}
                  onChange={setSearch}
                />
                {visible.length > 0 && (
                  <div
                    className="responsive-table catalog-admin-table crm-customer-table"
                    role="region"
                    aria-label="Danh sách khách hàng"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Khách hàng</th>
                          <th scope="col">Điện thoại</th>
                          <th scope="col">Email</th>
                          <th scope="col">Chi nhánh ưu tiên</th>
                          <th scope="col">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((customer) => {
                          return (
                            <tr
                              key={customer.code}
                              className={
                                customerDetailOpen && selected === customer.code ? 'selected' : ''
                              }
                            >
                              <td data-label="Khách hàng">
                                <span className="crm-customer-identity">
                                  <strong>{customer.name}</strong>
                                  <small>{customer.code}</small>
                                </span>
                              </td>
                              <td data-label="Điện thoại">{customer.phone || '—'}</td>
                              <td data-label="Email">{customer.email || '—'}</td>
                              <td data-label="Chi nhánh ưu tiên">
                                {customer.preferredBranch || '—'}
                              </td>
                              <td data-label="Chi tiết">
                                <Button
                                  type="button"
                                  variant="quiet"
                                  aria-label={`Xem hồ sơ ${customer.name}`}
                                  onClick={() => openCustomer(customer.code)}
                                >
                                  Chi tiết
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!visible.length && (
                  <p className="muted crm-customer-empty" role="status">
                    {search
                      ? `Không tìm thấy khách hàng phù hợp tại ${branch}.`
                      : `Chưa có hồ sơ khách tại ${branch}.`}
                  </p>
                )}
              </Panel>
              {customerDetailOpen && person && !interactionOpen && (
                <DetailDialog
                  title={`Hồ sơ khách · ${person.name}`}
                  closeLabel="Đóng hồ sơ khách"
                  className="crm-customer-detail-dialog"
                  onClose={() => setCustomerDetailOpen(false)}
                >
                  <div className="crm-customer-detail">
                    <Panel
                      title="Thông tin khách hàng"
                      action={
                        realApiMode && canManage ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setIssue('');
                              setNotice('');
                              setInteractionOpen(true);
                            }}
                          >
                            + Ghi nhận trao đổi
                          </Button>
                        ) : undefined
                      }
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
                        {realApiMode &&
                        apiRentalHistory[person.code] === undefined &&
                        !apiRentalHistoryErrors[person.code] ? (
                          <p className="muted" role="status">
                            Đang tải lịch sử thuê…
                          </p>
                        ) : realApiMode && apiRentalHistoryErrors[person.code] ? (
                          <Feedback
                            tone="danger"
                            title="Chưa tải được lịch sử thuê"
                            action={
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setApiRentalHistoryErrors((current) => ({
                                    ...current,
                                    [person.code]: false,
                                  }));
                                  setRentalHistoryRetry((value) => value + 1);
                                }}
                              >
                                Thử lại
                              </Button>
                            }
                          >
                            Kiểm tra quyền xem đơn thuê của tài khoản rồi thử tải lại.
                          </Feedback>
                        ) : (
                          <Timeline
                            items={
                              realApiMode ? (apiRentalHistory[person.code] ?? []) : person.history
                            }
                          />
                        )}
                      </details>
                      <details className="crm-history-section">
                        <summary>Lịch sử liên hệ</summary>
                        {realApiMode &&
                        apiInteractions[JSON.stringify([person.code, branch])] === undefined &&
                        !apiInteractionErrors[JSON.stringify([person.code, branch])] ? (
                          <p className="muted" role="status">
                            Đang tải tương tác…
                          </p>
                        ) : realApiMode &&
                          apiInteractionErrors[JSON.stringify([person.code, branch])] ? (
                          <Feedback
                            tone="danger"
                            title="Chưa tải được lịch sử tương tác"
                            action={
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setApiInteractionErrors((current) => ({
                                    ...current,
                                    [JSON.stringify([person.code, branch])]: false,
                                  }));
                                  setInteractionRetry((value) => value + 1);
                                }}
                              >
                                Thử lại
                              </Button>
                            }
                          >
                            Dữ liệu chưa được xác minh; thử tải lại để xem lịch sử mới nhất.
                          </Feedback>
                        ) : (
                          <Timeline items={personInteractions} />
                        )}
                      </details>
                    </Panel>
                  </div>
                </DetailDialog>
              )}
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
                      onChange={(event) =>
                        setInteractionType(event.target.value as typeof interactionType)
                      }
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
                      onChange={(event) =>
                        setInteractionChannel(event.target.value as typeof interactionChannel)
                      }
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
                    {notice && (
                      <Feedback tone="success" title="Đã lưu ghi nhận">
                        {notice}
                      </Feedback>
                    )}
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
                    if (
                      customers.some((customer) => samePhone(customer.phone, newCustomer.phone))
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
          </div>
        );
      }}
    </StateGate>
  );
}
