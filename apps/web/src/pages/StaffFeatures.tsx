import { useState } from 'react';
import type { Navigate } from '../App';
import { Button, Feedback, Field, SelectField, StatusLabel } from '../components/ui';
import { money } from '../components/support';
import {
  BarcodeLookup,
  BranchSelector,
  DateTimeField,
  FilterBar,
  InlineIssue,
  KeyFacts,
  PageHeading,
  Panel,
  SearchField,
  StateGate,
} from '../components/studio';
import { useFixtureResource } from '../components/useFixtureResource';
import { fixtureAdapter, fixtureCatalog, fixturePeriod } from '../fixtures/adapter';
import { studioAdapter, type ActiveUnit } from '../fixtures/studio';
import type { DemoScenario, QuoteSnapshot } from '../fixtures/types';

export function CounterRentalPage({
  scenario,
  go,
  branch,
  canConfirm,
}: {
  scenario: DemoScenario;
  go: Navigate;
  branch: string;
  canConfirm: boolean;
}) {
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.customers);
  const [customerCode, setCustomerCode] = useState('KH-001');
  const [customerSearch, setCustomerSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [costume, setCostume] = useState('ao-dai-lina');
  const [variant, setVariant] = useState('M / Hồng phấn');
  const [rentalBranch, setRentalBranch] = useState(branch);
  const [pickup, setPickup] = useState(fixturePeriod.pickup);
  const [due, setDue] = useState(fixturePeriod.returnAt);
  const [quote, setQuote] = useState<QuoteSnapshot>();
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState('');
  const item = fixtureCatalog.find((c) => c.id === costume);
  const clearQuote = () => setQuote(undefined);
  const getQuote = async () => {
    setBusy(true);
    setIssue('');
    try {
      setQuote(
        await fixtureAdapter.getQuote(
          {
            costumeId: costume,
            variant,
            quantity: 1,
            branch: rentalBranch,
            pickup,
            returnAt: due,
            name: '',
            phone: '',
            note: '',
          },
          scenario,
        ),
      );
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không tải được báo giá.');
    } finally {
      setBusy(false);
    }
  };
  const create = async (name: string, phone: string) => {
    if (!quote) {
      setIssue('Tải báo giá trước khi tạo yêu cầu.');
      return;
    }
    if (!name.trim() || !/^0[0-9 ]{8,12}$/.test(phone.trim())) {
      setIssue('Chọn hoặc tạo hồ sơ khách hợp lệ.');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      if (creating) {
        await studioAdapter.saveCustomer(
          {
            code: `KH-DEMO-${(data?.length ?? 0) + 1}`,
            name,
            phone,
            email: '',
            preferredBranch: rentalBranch,
            history: [],
            interactions: ['03/10 · Tạo tại quầy'],
          },
          scenario,
        );
        retry();
      }
      const id = await fixtureAdapter.submitBooking(
        {
          costumeId: costume,
          variant,
          quantity: 1,
          branch: rentalBranch,
          pickup,
          returnAt: due,
          name,
          phone,
          note: '',
        },
        quote,
        scenario,
      );
      studioAdapter.recordBooking(
        id,
        {
          costumeId: costume,
          variant,
          quantity: 1,
          branch: rentalBranch,
          pickup,
          returnAt: due,
          name,
          phone,
          note: '',
        },
        quote,
      );
      setCreated(id);
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không thể tạo yêu cầu.');
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
      emptyTitle="Chưa có hồ sơ khách"
    >
      {(customers) => {
        const matches = customers.filter((c) =>
          `${c.name} ${c.phone} ${c.code}`.toLowerCase().includes(customerSearch.toLowerCase()),
        );
        const customer =
          matches.find((c) => c.code === customerCode) ??
          (matches.length === 1 ? matches[0] : undefined);
        return (
          <div className="page">
            <PageHeading
              eyebrow="VẬN HÀNH / TẠI QUẦY"
              title="Tạo yêu cầu thuê"
              description="Luồng tại quầy dùng cùng báo giá và quy tắc xác nhận với yêu cầu online."
            />
            <div className="feature-two-column">
              <div>
                <Panel
                  title="1. Khách thuê"
                  action={
                    <Button variant="quiet" onClick={() => setCreating(!creating)}>
                      {creating ? 'Chọn khách có sẵn' : '+ Tạo hồ sơ'}
                    </Button>
                  }
                >
                  {creating ? (
                    <div className="stack-form">
                      <Field
                        label="Họ tên"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Field
                        label="Số điện thoại"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                      />
                      <p className="muted">
                        Hồ sơ mới chỉ được ghi trong fixture sau khi tạo; chưa liên kết tài khoản
                        Google.
                      </p>
                    </div>
                  ) : (
                    <>
                      <SearchField
                        label="Tìm tên, số điện thoại hoặc mã khách"
                        value={customerSearch}
                        onChange={setCustomerSearch}
                      />
                      <SelectField
                        label="Chọn khách"
                        value={customer?.code ?? ''}
                        onChange={(e) => setCustomerCode(e.target.value)}
                      >
                        {!customer && <option value="">Chọn đúng khách trong kết quả</option>}
                        {matches.map((c) => (
                          <option value={c.code} key={c.code}>
                            {c.name} · {c.phone}
                          </option>
                        ))}
                      </SelectField>
                      {customer && (
                        <p className="muted">
                          {customer.code} · {customer.preferredBranch}
                        </p>
                      )}
                      {!customer && customerSearch && (
                        <p className="field-hint" role="status">
                          {matches.length
                            ? 'Chọn một khách trong kết quả trước khi tạo yêu cầu.'
                            : 'Không tìm thấy khách; có thể tạo hồ sơ mới.'}
                        </p>
                      )}
                    </>
                  )}
                </Panel>
                <Panel title="2. Trang phục và thời gian">
                  <div className="feature-filters">
                    <SelectField
                      label="Mẫu trang phục"
                      value={costume}
                      onChange={(e) => {
                        const next = fixtureCatalog.find((c) => c.id === e.target.value);
                        setCostume(e.target.value);
                        setVariant(next ? `${next.sizes[0]} / ${next.colors[0]}` : '');
                        clearQuote();
                      }}
                    >
                      {fixtureCatalog.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Biến thể"
                      value={variant}
                      onChange={(e) => {
                        setVariant(e.target.value);
                        clearQuote();
                      }}
                    >
                      {item?.sizes.map((size) => (
                        <option key={size}>
                          {size} / {item.colors[0]}
                        </option>
                      ))}
                    </SelectField>
                    <BranchSelector
                      label="Chi nhánh nhận và trả"
                      value={rentalBranch}
                      onChange={(v) => {
                        setRentalBranch(v);
                        clearQuote();
                      }}
                    />
                    <DateTimeField
                      label="Nhận"
                      value={pickup}
                      onChange={(v) => {
                        setPickup(v);
                        clearQuote();
                      }}
                    />
                    <DateTimeField
                      label="Trả"
                      value={due}
                      onChange={(v) => {
                        setDue(v);
                        clearQuote();
                      }}
                    />
                  </div>
                  <Feedback title="Chưa giữ bộ">
                    Tạo yêu cầu tại quầy chưa tự gán bộ. Nhân viên có quyền xử lý sẽ kiểm tra từng
                    barcode trước khi xác nhận.
                  </Feedback>
                  <Button variant="secondary" loading={busy} onClick={() => void getQuote()}>
                    Kiểm tra khả dụng & báo giá
                  </Button>
                </Panel>
                <InlineIssue
                  text={issue}
                  conflict={scenario === 'conflict' || scenario === 'version'}
                />
              </div>
              <div>
                <Panel title="3. Báo giá & xác nhận">
                  {quote ? (
                    <>
                      <KeyFacts
                        rows={[
                          { label: 'Số ngày tính tiền', value: quote.daysLabel },
                          { label: 'Chính sách', value: quote.policy },
                          { label: 'Giá/ngày', value: money(quote.pricePerDay) },
                          { label: 'Tiền thuê', value: money(quote.rental) },
                          { label: 'Cọc', value: money(quote.deposit) },
                          { label: 'Cần thu khi nhận', value: money(quote.amountDueAtPickup) },
                        ]}
                      />
                      <p className="muted">
                        Báo giá fixture hết hạn: {quote.expiresAt}. Cọc không phải doanh thu.
                      </p>
                    </>
                  ) : (
                    <p className="muted">Chọn khách, trang phục và thời gian rồi tải báo giá.</p>
                  )}
                  {created ? (
                    <Feedback tone="success" title={`Đã tạo ${created}`}>
                      Yêu cầu đang chờ xác nhận; chưa giữ bộ.{' '}
                      {canConfirm
                        ? 'Mở không gian đơn để chọn từng bộ và xác nhận.'
                        : 'Vai trò hiện tại chưa có quyền xác nhận.'}
                    </Feedback>
                  ) : (
                    <Button
                      disabled={!quote || (!creating && !customer) || busy}
                      loading={busy}
                      onClick={() =>
                        void create(
                          creating ? newName : (customer?.name ?? ''),
                          creating ? newPhone : (customer?.phone ?? ''),
                        )
                      }
                    >
                      Tạo yêu cầu tại quầy
                    </Button>
                  )}
                  {created && canConfirm && (
                    <Button variant="secondary" onClick={() => go('orders', { order: created })}>
                      Xem đơn vừa tạo
                    </Button>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}

export function ActiveRentalsPage({
  scenario,
  go,
  branch,
}: {
  scenario: DemoScenario;
  go: Navigate;
  branch: string;
}) {
  const { loading, error, data, retry } = useFixtureResource(scenario, studioAdapter.activeUnits);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ActiveUnit>();
  const [issue, setIssue] = useState('');
  const openActiveUnit = (code: string) => {
    setIssue('');
    const unit = data?.find((x) => x.barcode === code.toUpperCase() && x.branch === branch);
    if (unit) setSelected(unit);
    else setIssue('Barcode tồn tại nhưng không thuộc bộ đang thuê ACTIVE tại chi nhánh này.');
  };
  return (
    <StateGate
      loading={loading}
      error={error}
      data={data}
      retry={retry}
      emptyTitle="Chưa có bộ đang ở khách"
    >
      {(items) => {
        const filtered = items.filter(
          (x) =>
            x.branch === branch &&
            `${x.barcode} ${x.phone} ${x.orderId} ${x.customer}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        );
        return (
          <div className="page">
            <PageHeading
              eyebrow="VẬN HÀNH / THEO DÕI BỘ"
              title="Đang thuê"
              description="Mỗi dòng là một bộ từ dòng đơn có phân bổ ACTIVE; trạng thái vận hành kho được giữ riêng."
            />
            <div className="feature-two-column">
              <div>
                <Panel title="Tra cứu nhanh">
                  <BarcodeLookup
                    branch={branch}
                    scenario={scenario}
                    onFound={(unit) => openActiveUnit(unit.barcode)}
                    onError={() => setSelected(undefined)}
                    autoFocus
                  />
                  <FilterBar>
                    <SearchField
                      label="Tìm barcode, điện thoại hoặc mã đơn"
                      value={query}
                      onChange={setQuery}
                    />
                  </FilterBar>
                </Panel>
                <Panel title={`${filtered.length} bộ đang ở khách`}>
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Barcode</th>
                          <th>Trang phục / size</th>
                          <th>Khách</th>
                          <th>Đơn</th>
                          <th>Đã giao</th>
                          <th>Hạn trả</th>
                          <th>Quá hạn</th>
                          <th>Chi nhánh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => (
                          <tr key={row.barcode} onClick={() => setSelected(row)}>
                            <td>
                              <button className="text-link" onClick={() => setSelected(row)}>
                                {row.barcode}
                              </button>
                            </td>
                            <td>
                              {row.costume}
                              <small>{row.variant}</small>
                            </td>
                            <td>
                              {row.customer}
                              <small>{row.phone}</small>
                            </td>
                            <td>{row.orderId}</td>
                            <td>{row.pickedUp}</td>
                            <td>{row.due}</td>
                            <td>
                              <StatusLabel
                                text={row.overdue ? 'Quá hạn' : 'Trong hạn'}
                                tone={row.overdue ? 'danger' : 'success'}
                              />
                            </td>
                            <td>{row.branch}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!filtered.length && (
                    <p className="muted">Không có bộ khớp bộ lọc tại chi nhánh này.</p>
                  )}
                </Panel>
                <InlineIssue
                  text={issue}
                  conflict={scenario === 'barcodeOtherBranch' || scenario === 'unitBlocked'}
                />
              </div>
              <div>
                {selected ? (
                  <Panel title={`${selected.barcode} · ${selected.costume}`}>
                    <StatusLabel
                      text={selected.overdue ? 'Quá hạn trả' : 'Đang thuê'}
                      tone={selected.overdue ? 'danger' : 'info'}
                    />
                    <KeyFacts
                      rows={[
                        {
                          label: 'Người đang giữ',
                          value: `${selected.customer} · ${selected.phone}`,
                        },
                        { label: 'Đơn', value: selected.orderId },
                        { label: 'Đã giao', value: selected.pickedUp },
                        { label: 'Hạn trả', value: selected.due },
                        { label: 'Chi nhánh', value: selected.branch },
                        { label: 'Phụ kiện', value: selected.accessories.join(', ') },
                      ]}
                    />
                    <Button onClick={() => go('return', { order: selected.orderId })}>
                      Mở nhận trả
                    </Button>
                  </Panel>
                ) : (
                  <Panel title="Chi tiết bộ đang thuê">
                    <p className="muted">
                      Quét barcode hoặc chọn một dòng để xem ai đang giữ bộ và hạn trả.
                    </p>
                  </Panel>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </StateGate>
  );
}
