import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Navigate } from '../App';
import { Button, Feedback, Field, SelectField, StatusLabel } from '../components/ui';
import { defaultRentalDate, money } from '../components/support';
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
import { useMobileDetailReveal } from '../components/useMobileDetailReveal';
import { branches, fixtureAdapter, fixtureCatalog, fixturePeriod } from '../fixtures/adapter';
import { studioAdapter, type ActiveUnit, type Customer, type Unit } from '../fixtures/studio';
import type { BookingDraft, CatalogItem, DemoScenario, QuoteSnapshot } from '../fixtures/types';
import { apiEnabled, hasAccessToken } from '../api/client';
import { isValidPhone, samePhone } from '../utils/phone';
import { rentalPeriodIssues } from '../utils/rental-period';
import { matchesCustomerSearch } from '../utils/customer-search';

interface CounterVariantOption {
  value: string;
  label: string;
  apiId?: string;
}

interface CounterRentalLine {
  id: number;
  costumeId: string;
  variant: string;
}

function CounterCustomerPicker({
  customers,
  selectedCustomer,
  search,
  canReadAllCustomers,
  onSearchChange,
  onSelect,
}: {
  customers: Customer[];
  selectedCustomer?: Customer;
  search: string;
  canReadAllCustomers: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (customer: Customer) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const visibleCustomers = customers
    .filter((customer) => matchesCustomerSearch(customer, search))
    .slice(0, 8);
  const inputValue = selectedCustomer
    ? `${selectedCustomer.name} · ${
        selectedCustomer.phone.trim() ? selectedCustomer.phone : selectedCustomer.email
      }`
    : search;

  const choose = (customer: Customer) => {
    onSelect(customer);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div
      className="field counter-customer-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={inputId}>Tìm và chọn khách thuê</label>
      <div className="counter-customer-picker-control">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && activeIndex >= 0 && visibleCustomers.length
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={inputValue}
          placeholder="Tên, số điện thoại, email hoặc mã khách"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onSearchChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                Math.min(current + 1, Math.max(visibleCustomers.length - 1, 0)),
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                current <= 0 ? Math.max(visibleCustomers.length - 1, 0) : current - 1,
              );
            } else if (
              event.key === 'Enter' &&
              open &&
              activeIndex >= 0 &&
              visibleCustomers[activeIndex]
            ) {
              event.preventDefault();
              choose(visibleCustomers[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {(selectedCustomer ?? search) && (
          <button
            className="counter-customer-picker-clear"
            type="button"
            aria-label={selectedCustomer ? 'Bỏ chọn khách thuê' : 'Xóa nội dung tìm kiếm'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSearchChange('');
              setOpen(true);
              setActiveIndex(-1);
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
        {open && (
          <div className="counter-customer-picker-results" id={listId} role="listbox">
            {visibleCustomers.length ? (
              visibleCustomers.map((customer, index) => (
                <div
                  className={`counter-customer-picker-option ${
                    index === activeIndex ? 'is-active' : ''
                  }`}
                  id={`${listId}-option-${index}`}
                  key={customer.code}
                  role="option"
                  aria-selected={selectedCustomer?.code === customer.code}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(customer)}
                >
                  <span className="counter-customer-picker-option-name">{customer.name}</span>
                  <span className="counter-customer-picker-option-meta">
                    {[
                      customer.phone.trim() ? customer.phone : customer.email,
                      customer.code,
                      customer.preferredBranch,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))
            ) : (
              <p className="counter-customer-picker-empty" role="status">
                {search
                  ? canReadAllCustomers
                    ? 'Không tìm thấy khách phù hợp. Có thể tạo hồ sơ mới.'
                    : 'Không tìm thấy khách trong phạm vi chi nhánh này. Có thể tạo hồ sơ mới.'
                  : 'Chưa có hồ sơ khách để chọn.'}
              </p>
            )}
            {visibleCustomers.length === 8 && (
              <p className="counter-customer-picker-footnote">Nhập thêm để thu hẹp kết quả.</p>
            )}
          </div>
        )}
      </div>
      {selectedCustomer && (
        <p className="field-hint" role="status">
          {selectedCustomer.code} · {selectedCustomer.preferredBranch}
        </p>
      )}
    </div>
  );
}

function counterVariantOptions(item?: CatalogItem): CounterVariantOption[] {
  if (!item) return [];
  if (item.apiVariants?.length) {
    return item.apiVariants.map((variant) => ({
      value: variant.id,
      label: `${variant.size} / ${variant.color}`,
      apiId: variant.id,
    }));
  }
  const color = item.colors[0] ?? '';
  return item.sizes.map((size) => {
    const label = [size, color].filter(Boolean).join(' / ');
    return { value: label, label };
  });
}

export function CounterRentalPage({
  scenario,
  go,
  branch,
  canConfirm,
  canCreateCustomer,
  canReadAllCustomers,
}: {
  scenario: DemoScenario;
  go: Navigate;
  branch: string;
  canConfirm: boolean;
  canCreateCustomer: boolean;
  canReadAllCustomers: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const [rentalBranch, setRentalBranch] = useState(branch);
  const selectedBranch = realApiMode
    ? branch
    : branches.includes(rentalBranch)
      ? rentalBranch
      : branches.includes(branch)
        ? branch
        : (branches[0] ?? rentalBranch);
  const loadCustomers = useCallback(
    (currentScenario: DemoScenario) =>
      studioAdapter.customers(
        currentScenario,
        realApiMode && canReadAllCustomers ? undefined : selectedBranch,
      ),
    [canReadAllCustomers, realApiMode, selectedBranch],
  );
  const { loading, error, data, retry } = useFixtureResource(
    scenario,
    loadCustomers,
    `${selectedBranch}:${realApiMode ? 'api' : 'fixture'}:${canReadAllCustomers ? 'all' : 'branch'}`,
  );
  const loadCatalog = useCallback(
    (currentScenario: DemoScenario) => fixtureAdapter.listCatalog(currentScenario),
    [],
  );
  const {
    loading: catalogLoading,
    error: catalogError,
    data: catalogData,
    retry: retryCatalog,
  } = useFixtureResource(scenario, loadCatalog, realApiMode ? 'api' : 'fixture');
  const catalog = useMemo(
    () => catalogData ?? (realApiMode ? [] : fixtureCatalog),
    [catalogData, realApiMode],
  );
  const [customerCode, setCustomerCode] = useState('KH-001');
  const [customerSearch, setCustomerSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [customerNotice, setCustomerNotice] = useState('');
  const [resolvedCustomer, setResolvedCustomer] = useState<Customer | null>(null);
  const [rentalLines, setRentalLines] = useState<CounterRentalLine[]>([
    { id: 1, costumeId: 'ao-dai-lina', variant: '' },
  ]);
  const [pickup, setPickup] = useState(() =>
    realApiMode ? defaultRentalDate(1) : fixturePeriod.pickup,
  );
  const [due, setDue] = useState(() =>
    realApiMode ? defaultRentalDate(3) : fixturePeriod.returnAt,
  );
  const [quote, setQuote] = useState<QuoteSnapshot>();
  const [quoteClock, setQuoteClock] = useState(Date.now);
  const [eligibleUnits, setEligibleUnits] = useState<Unit[][]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState('');
  const [createdMode, setCreatedMode] = useState<'pending' | 'confirmed'>('pending');
  const submittingRef = useRef(false);
  const newCustomerSequenceRef = useRef(0);
  const rentalLineSequenceRef = useRef(1);
  const quoteRequestRef = useRef(0);
  const issueRef = useRef<HTMLDivElement>(null);
  const createdRef = useRef<HTMLDivElement>(null);
  const { detailRef: quotePanelRef, revealDetail: revealQuote } =
    useMobileDetailReveal<HTMLDivElement>();
  useEffect(() => {
    if (!issue) return;
    issueRef.current?.focus();
    issueRef.current?.scrollIntoView({ block: 'nearest' });
  }, [issue]);
  useEffect(() => {
    if (!created) return;
    createdRef.current?.focus();
    createdRef.current?.scrollIntoView({ block: 'nearest' });
  }, [created]);
  const selectedLines = rentalLines.map((line) => {
    const selectedCostume = catalog.some((entry) => entry.id === line.costumeId)
      ? line.costumeId
      : (catalog[0]?.id ?? '');
    const item = catalog.find((entry) => entry.id === selectedCostume);
    const variantOptions = counterVariantOptions(item);
    const selectedVariantOption =
      variantOptions.find((option) => option.value === line.variant) ??
      variantOptions.find((option) => option.label === line.variant) ??
      variantOptions[0];
    return {
      ...line,
      costumeId: selectedCostume,
      item,
      variantOptions,
      selectedVariantValue: selectedVariantOption?.value ?? '',
      selectedVariant: selectedVariantOption?.apiId ?? selectedVariantOption?.label ?? '',
      selectedApiVariantId: selectedVariantOption?.apiId,
    };
  });
  const selectedUnitSummary = selectedUnits.filter(Boolean).join(', ');
  const canConfirmAllLines =
    selectedLines.length > 0 &&
    new Set(selectedUnits.filter(Boolean)).size === selectedLines.length &&
    selectedLines.every((_, index) => {
      const unit = eligibleUnits[index]?.find(
        (candidate) => candidate.barcode === selectedUnits[index],
      );
      return Boolean(unit?.status === 'READY' && unit.available && (!realApiMode || unit.apiId));
    });
  const missingReadyLine = selectedLines.findIndex(
    (_, index) =>
      !(eligibleUnits[index] ?? []).some((unit) => unit.status === 'READY' && unit.available),
  );
  const expiresAt = quote?.expiresAtIso ? Date.parse(quote.expiresAtIso) : undefined;
  const quoteExpired =
    realApiMode &&
    expiresAt !== undefined &&
    (!Number.isFinite(expiresAt) || expiresAt <= quoteClock);
  useEffect(() => {
    if (!realApiMode || expiresAt === undefined || !Number.isFinite(expiresAt)) return;
    const timeout = window.setTimeout(
      () => setQuoteClock(Date.now()),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [expiresAt, realApiMode]);
  const { pickupIssue, returnIssue } = rentalPeriodIssues(pickup, due);
  const validatePeriod = () => {
    const dates = rentalPeriodIssues(pickup, due);
    return (
      dates.pickupIssue ??
      dates.returnIssue ??
      (!pickup || !due ? 'Chọn thời điểm nhận và trả đồ.' : undefined)
    );
  };
  const clearQuote = useCallback(() => {
    quoteRequestRef.current += 1;
    setQuote(undefined);
    setEligibleUnits([]);
    setSelectedUnits([]);
    if (!submittingRef.current) setBusy(false);
  }, []);
  const updateRentalLine = (index: number, updates: Partial<CounterRentalLine>) => {
    setRentalLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...updates } : line)),
    );
    clearQuote();
  };
  const addRentalLine = () => {
    const firstItem = catalog[0];
    setRentalLines((current) => [
      ...current,
      {
        id: ++rentalLineSequenceRef.current,
        costumeId: firstItem?.id ?? '',
        variant: counterVariantOptions(firstItem)[0]?.value ?? '',
      },
    ]);
    clearQuote();
  };
  const removeRentalLine = (lineId: number) => {
    setRentalLines((current) => current.filter((line) => line.id !== lineId));
    clearQuote();
  };
  const counterDraft = (name: string, phone: string): BookingDraft => {
    const items = selectedLines.map((line) => ({
      costumeId: line.costumeId,
      variant: line.selectedVariant,
      quantity: 1,
    }));
    const firstLine = items[0] ?? { costumeId: '', variant: '', quantity: 0 };
    return {
      ...firstLine,
      quantity: items.length,
      items,
      branch: selectedBranch,
      pickup,
      returnAt: due,
      name,
      phone,
      note: '',
    };
  };
  const getQuote = async () => {
    const dateIssue = validatePeriod();
    if (dateIssue) {
      setIssue(dateIssue);
      return;
    }
    if (creating) {
      setIssue('Lưu hồ sơ khách mới trước khi tải báo giá.');
      return;
    }
    const selectedCustomer =
      data?.find((entry) => entry.code === customerCode) ??
      (resolvedCustomer?.code === customerCode ? resolvedCustomer : undefined);
    if (!selectedCustomer) {
      setIssue('Chọn đúng hồ sơ khách trước khi tải báo giá.');
      return;
    }
    if (
      !selectedLines.length ||
      selectedLines.some((line) => !line.item || !line.selectedVariant) ||
      catalogLoading
    ) {
      setIssue('Đợi danh mục trang phục tải xong rồi thử lại.');
      return;
    }
    const requestId = ++quoteRequestRef.current;
    setBusy(true);
    setIssue('');
    try {
      const [nextQuote, units] = await Promise.all([
        fixtureAdapter.getQuote(counterDraft('', ''), scenario, {
          customerCode: selectedCustomer.code,
          channel: 'IN_STORE',
        }),
        realApiMode
          ? Promise.all(
              selectedLines.map((line) =>
                line.selectedApiVariantId
                  ? fixtureAdapter.rentalAvailability(
                      line.selectedApiVariantId,
                      selectedBranch,
                      pickup,
                      due,
                    )
                  : Promise.reject(
                      new Error(
                        'Không tìm thấy mã biến thể trên máy chủ. Tải lại danh mục rồi thử lại.',
                      ),
                    ),
              ),
            )
          : studioAdapter
              .units(scenario)
              .then((allUnits) =>
                selectedLines.map((line) =>
                  allUnits.filter(
                    (unit) =>
                      unit.branch === selectedBranch &&
                      unit.model === line.item?.name &&
                      unit.variant === line.selectedVariant,
                  ),
                ),
              ),
      ]);
      if (requestId === quoteRequestRef.current) {
        setQuote(nextQuote);
        setEligibleUnits(units);
        setSelectedUnits(selectedLines.map(() => ''));
        revealQuote();
      }
    } catch (e) {
      if (requestId === quoteRequestRef.current) {
        clearQuote();
        setIssue(e instanceof Error ? e.message : 'Không tải được báo giá.');
      }
    } finally {
      if (requestId === quoteRequestRef.current) setBusy(false);
    }
  };
  const saveNewCustomer = async (customers: Customer[]) => {
    if (busy) return;
    if (!canCreateCustomer) {
      setIssue('Tài khoản chưa có quyền tạo hồ sơ khách tại chi nhánh này.');
      return;
    }
    if (!newName.trim() || !isValidPhone(newPhone)) {
      setIssue('Nhập họ tên và số điện thoại hợp lệ.');
      return;
    }
    if (realApiMode && !/^\S+@\S+\.\S+$/.test(newEmail.trim())) {
      setIssue('Nhập email hợp lệ để lưu hồ sơ khách trên hệ thống.');
      return;
    }
    const email = newEmail.trim().toLocaleLowerCase('vi');
    const phoneMatch = customers.find((customer) => samePhone(customer.phone, newPhone));
    const emailMatch = email
      ? customers.find((customer) => customer.email.trim().toLocaleLowerCase('vi') === email)
      : undefined;
    if (phoneMatch && emailMatch && phoneMatch.code !== emailMatch.code) {
      setIssue(
        'Số điện thoại và email thuộc hai hồ sơ khác nhau. Kiểm tra thông tin trước khi tiếp tục.',
      );
      return;
    }
    const existing = emailMatch ?? phoneMatch;
    if (existing) {
      setCustomerCode(existing.code);
      setCreating(false);
      setCustomerSearch('');
      setCustomerNotice('Thông tin này đã có hồ sơ. Đã chọn khách hiện có, không tạo hồ sơ trùng.');
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      clearQuote();
      setIssue('');
      return;
    }
    setBusy(true);
    setIssue('');
    try {
      const result = await studioAdapter.createCustomer(
        {
          code: `KH-DEMO-${++newCustomerSequenceRef.current}`,
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim(),
          preferredBranch: selectedBranch,
          history: [],
          interactions: [],
        },
        scenario,
      );
      const saved = result.customer;
      setResolvedCustomer(saved);
      setCustomerCode(saved.code);
      setCreating(false);
      setCustomerSearch('');
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      clearQuote();
      setCustomerNotice(
        result.created
          ? 'Đã lưu hồ sơ khách. Có thể tiếp tục tải báo giá.'
          : 'Email hoặc số điện thoại đã thuộc hồ sơ có sẵn. Hệ thống không tạo trùng và đã chọn hồ sơ đó.',
      );
      retry();
    } catch (caught) {
      setIssue(caught instanceof Error ? caught.message : 'Không lưu được hồ sơ khách.');
    } finally {
      setBusy(false);
    }
  };
  const create = async (name: string, phone: string, confirmNow: boolean) => {
    if (submittingRef.current || created) return;
    const dateIssue = validatePeriod();
    if (dateIssue) {
      setIssue(dateIssue);
      return;
    }
    if (!quote) {
      setIssue('Tải báo giá trước khi tạo yêu cầu.');
      return;
    }
    if (
      realApiMode &&
      quote.expiresAtIso &&
      (!Number.isFinite(Date.parse(quote.expiresAtIso)) ||
        Date.parse(quote.expiresAtIso) <= Date.now())
    ) {
      setIssue('Báo giá đã hết hạn. Xem báo giá mới trước khi tạo yêu cầu.');
      return;
    }
    const selectedCustomer =
      data?.find((entry) => entry.code === customerCode) ??
      (resolvedCustomer?.code === customerCode ? resolvedCustomer : undefined);
    if (creating || !selectedCustomer || !name.trim() || !isValidPhone(phone)) {
      setIssue('Lưu hoặc chọn đúng hồ sơ khách trước khi tạo đơn.');
      return;
    }
    if (quote.available === false) {
      setIssue('Báo giá hiện không đủ bộ. Chọn lại mẫu hoặc kỳ thuê rồi tải báo giá mới.');
      return;
    }
    const chosenUnits = selectedLines.map((_, index) =>
      eligibleUnits[index]?.find((candidate) => candidate.barcode === selectedUnits[index]),
    );
    if (confirmNow && (!canConfirm || !canConfirmAllLines)) {
      setIssue('Chọn một barcode READY còn khả dụng cho từng bộ trước khi xác nhận.');
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setIssue('');
    try {
      const draft = counterDraft(name, phone);
      const id = await fixtureAdapter.submitBooking(
        draft,
        quote,
        scenario,
        confirmNow && realApiMode
          ? selectedLines.map((line, index) => ({
              code: selectedUnits[index],
              id: chosenUnits[index]!.apiId!,
              variantId: line.selectedApiVariantId!,
            }))
          : undefined,
      );
      if (!realApiMode) studioAdapter.recordBooking(id, draft, quote);
      setCreated(id);
      setCreatedMode('pending');
      if (confirmNow) {
        try {
          await fixtureAdapter.confirmOrder(id, 1, selectedUnits, scenario);
          if (!realApiMode) studioAdapter.reflectConfirmation(id, selectedUnits);
          setCreatedMode('confirmed');
        } catch (caught) {
          setIssue(
            `${caught instanceof Error ? caught.message : 'Chưa xác nhận được bộ.'} Yêu cầu ${id} đã tạo và đang chờ xử lý; mở đơn để kiểm tra, không gửi lại yêu cầu.`,
          );
        }
      }
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Không thể tạo yêu cầu.');
    } finally {
      submittingRef.current = false;
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
      allowEmpty
    >
      {(customers) => {
        const availableCustomers =
          resolvedCustomer && !customers.some((c) => c.code === resolvedCustomer.code)
            ? [resolvedCustomer, ...customers]
            : customers;
        const customer = availableCustomers.find((entry) => entry.code === customerCode);
        return (
          <div className="page">
            <PageHeading title="Tạo đơn thuê tại quầy" />
            <div className="feature-two-column">
              <div>
                <fieldset
                  className="fieldset-reset"
                  disabled={!!created || (busy && submittingRef.current)}
                >
                  <Panel
                    title="1. Khách thuê"
                    action={
                      canCreateCustomer ? (
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setCreating(!creating);
                            setCustomerNotice('');
                            clearQuote();
                            setIssue('');
                          }}
                        >
                          {creating ? 'Chọn khách có sẵn' : '+ Tạo hồ sơ'}
                        </Button>
                      ) : (
                        <span className="muted">Chỉ chọn hồ sơ có sẵn</span>
                      )
                    }
                  >
                    {creating ? (
                      <div className="stack-form">
                        <Field
                          label="Họ tên"
                          required
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                        <Field
                          label="Số điện thoại"
                          required
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                        />
                        {realApiMode && (
                          <Field
                            label="Email"
                            type="email"
                            required
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                          />
                        )}
                        {realApiMode && (
                          <p className="field-hint">
                            Email cần có để lưu hồ sơ trên hệ thống. Việc lưu không tạo tài khoản
                            đăng nhập.
                          </p>
                        )}
                        <Button
                          loading={busy}
                          disabled={
                            busy ||
                            !newName.trim() ||
                            !isValidPhone(newPhone) ||
                            (realApiMode && !/^\S+@\S+\.\S+$/.test(newEmail.trim()))
                          }
                          onClick={() => void saveNewCustomer(customers)}
                        >
                          Lưu hồ sơ khách
                        </Button>
                      </div>
                    ) : (
                      <>
                        <CounterCustomerPicker
                          customers={availableCustomers}
                          selectedCustomer={customer}
                          search={customerSearch}
                          canReadAllCustomers={canReadAllCustomers}
                          onSearchChange={(value) => {
                            setCustomerSearch(value);
                            setCustomerNotice('');
                            if (customerCode) {
                              setCustomerCode('');
                              clearQuote();
                            }
                          }}
                          onSelect={(nextCustomer) => {
                            if (nextCustomer.code !== customerCode) clearQuote();
                            setCustomerCode(nextCustomer.code);
                            setCustomerSearch('');
                            setCustomerNotice('');
                          }}
                        />
                        {customerNotice && (
                          <p className="field-hint" role="status">
                            {customerNotice}
                          </p>
                        )}
                      </>
                    )}
                  </Panel>
                  <Panel title="2. Trang phục và thời gian">
                    <p className="field-hint">
                      Mỗi dòng là một bộ; chọn size riêng nếu khách thuê nhiều bộ.
                    </p>
                    <div className="counter-rental-lines">
                      {selectedLines.map((line, index) => (
                        <div className="counter-rental-line" key={line.id}>
                          <div className="counter-rental-line-head">
                            <strong>Bộ {index + 1}</strong>
                            <Button
                              type="button"
                              variant="quiet"
                              disabled={rentalLines.length === 1 || !!created || busy}
                              aria-label={`Xóa bộ ${index + 1}`}
                              onClick={() => removeRentalLine(line.id)}
                            >
                              Xóa
                            </Button>
                          </div>
                          <div className="feature-filters">
                            <SelectField
                              label="Mẫu trang phục"
                              value={line.costumeId}
                              disabled={catalogLoading || !catalog.length}
                              onChange={(event) => {
                                const next = catalog.find(
                                  (entry) => entry.id === event.target.value,
                                );
                                updateRentalLine(index, {
                                  costumeId: event.target.value,
                                  variant: counterVariantOptions(next)[0]?.value ?? '',
                                });
                              }}
                            >
                              {!catalog.length && <option value="">Chưa có mẫu trang phục</option>}
                              {catalog.map((entry) => (
                                <option value={entry.id} key={entry.id}>
                                  {entry.name}
                                </option>
                              ))}
                            </SelectField>
                            <SelectField
                              label="Size / màu"
                              value={line.selectedVariantValue}
                              disabled={!line.item || catalogLoading}
                              onChange={(event) =>
                                updateRentalLine(index, { variant: event.target.value })
                              }
                            >
                              {line.variantOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SelectField>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={catalogLoading || !catalog.length || !!created || busy}
                      onClick={addRentalLine}
                    >
                      ＋ Thêm bộ
                    </Button>
                    <div className="feature-filters counter-rental-period">
                      {!realApiMode && (
                        <BranchSelector
                          label="Chi nhánh nhận và trả"
                          value={selectedBranch}
                          options={branches}
                          onChange={(v) => {
                            setRentalBranch(v);
                            clearQuote();
                          }}
                        />
                      )}
                      <DateTimeField
                        label="Nhận"
                        value={pickup}
                        error={pickupIssue}
                        onChange={(v) => {
                          setPickup(v);
                          clearQuote();
                        }}
                      />
                      <DateTimeField
                        label="Trả"
                        value={due}
                        error={returnIssue}
                        onChange={(v) => {
                          setDue(v);
                          clearQuote();
                        }}
                      />
                    </div>
                    {catalogLoading && (
                      <p className="muted" role="status">
                        Đang tải danh mục trang phục…
                      </p>
                    )}
                    {catalogError && (
                      <Feedback
                        tone="danger"
                        title="Không tải được danh mục trang phục"
                        action={
                          <Button variant="secondary" onClick={retryCatalog}>
                            Thử tải lại
                          </Button>
                        }
                      >
                        {catalogError}
                      </Feedback>
                    )}
                    <Button
                      variant="secondary"
                      loading={busy}
                      disabled={catalogLoading || !catalog.length || creating || !customer}
                      onClick={() => void getQuote()}
                    >
                      Xem báo giá
                    </Button>
                  </Panel>
                </fieldset>
                {issue && (
                  <div ref={issueRef} tabIndex={-1}>
                    <InlineIssue
                      text={issue}
                      conflict={scenario === 'conflict' || scenario === 'version'}
                    />
                  </div>
                )}
              </div>
              <div
                ref={quotePanelRef}
                className={`counter-quote-workspace ${quote ? 'has-quote' : ''}`}
                tabIndex={-1}
                role="region"
                aria-label="Báo giá và xác nhận đơn tại quầy"
              >
                <Panel title="3. Báo giá & xác nhận">
                  {quote ? (
                    <>
                      <KeyFacts
                        rows={[
                          { label: 'Số ngày tính tiền', value: quote.daysLabel },
                          { label: 'Giá/ngày', value: money(quote.pricePerDay) },
                          { label: 'Tiền thuê', value: money(quote.rental) },
                          { label: 'Cọc', value: money(quote.deposit) },
                          { label: 'Cần thu khi nhận', value: money(quote.amountDueAtPickup) },
                        ]}
                      />
                      {quote.lines?.length ? (
                        <ul className="counter-quote-lines" aria-label="Chi tiết bộ trong báo giá">
                          {quote.lines.map((line) => (
                            <li key={line.variantId}>
                              <span>
                                {line.variantLabel}
                                {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                              </span>
                              <strong>{line.availableUnits} bộ khả dụng</strong>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="field-hint">
                        Hết hạn: {quote.expiresAt} · {quote.policy} · Chưa thu tiền.
                      </p>
                      {quoteExpired && (
                        <Feedback
                          tone="warning"
                          title="Báo giá đã hết hạn"
                          action={
                            <Button
                              variant="secondary"
                              loading={busy}
                              onClick={() => void getQuote()}
                            >
                              Xem báo giá mới
                            </Button>
                          }
                        >
                          Giá và tình trạng bộ có thể đã thay đổi. Xem lại trước khi tạo yêu cầu.
                        </Feedback>
                      )}
                      {canConfirm && (
                        <div className="counter-unit-assignments">
                          {selectedLines.map((line, index) => {
                            const unavailableCodes = new Set(
                              selectedUnits.filter(
                                (code, otherIndex) => code && otherIndex !== index,
                              ),
                            );
                            const options = (eligibleUnits[index] ?? []).filter(
                              (unit) =>
                                unit.barcode === selectedUnits[index] ||
                                !unavailableCodes.has(unit.barcode),
                            );
                            return (
                              <SelectField
                                key={line.id}
                                label={`Barcode cho bộ ${index + 1} · ${line.selectedVariant}`}
                                value={selectedUnits[index] ?? ''}
                                disabled={!!created || busy}
                                onChange={(event) =>
                                  setSelectedUnits((current) =>
                                    selectedLines.map((_, lineIndex) =>
                                      lineIndex === index
                                        ? event.target.value
                                        : (current[lineIndex] ?? ''),
                                    ),
                                  )
                                }
                              >
                                <option value="">Chọn bộ khả dụng</option>
                                {options.map((unit) => (
                                  <option
                                    key={unit.barcode}
                                    value={unit.barcode}
                                    disabled={unit.status !== 'READY' || !unit.available}
                                  >
                                    {unit.barcode} ·{' '}
                                    {unit.status === 'READY' && unit.available
                                      ? 'Sẵn sàng'
                                      : unit.status === 'CLEANING'
                                        ? 'Đang vệ sinh'
                                        : unit.status === 'REPAIR'
                                          ? 'Đang sửa chữa'
                                          : 'Không khả dụng'}
                                  </option>
                                ))}
                              </SelectField>
                            );
                          })}
                        </div>
                      )}
                      {quote.available === false && (
                        <Feedback tone="warning" title="Không đủ bộ cho kỳ thuê này">
                          Chọn lại mẫu hoặc kỳ thuê rồi tải báo giá mới. Đơn chưa được tạo.
                        </Feedback>
                      )}
                      {quote.available !== false && canConfirm && missingReadyLine >= 0 && (
                        <Feedback
                          tone="warning"
                          title={`Chưa có barcode READY cho bộ ${missingReadyLine + 1}`}
                        >
                          Có thể tạo yêu cầu chờ để xử lý tiếp; hiện chưa thể xác nhận và giữ bộ.
                        </Feedback>
                      )}
                    </>
                  ) : (
                    <p className="muted">Chọn khách, trang phục và thời gian rồi tải báo giá.</p>
                  )}
                  {created ? (
                    <div ref={createdRef} tabIndex={-1}>
                      <Feedback
                        tone="success"
                        title={`${createdMode === 'confirmed' ? 'Đã xác nhận' : 'Đã tạo'} ${created}`}
                      >
                        {createdMode === 'confirmed'
                          ? realApiMode
                            ? `Đã gán ${selectedUnitSummary} trên hệ thống. Kiểm bộ và phụ kiện trên chi tiết đơn trước khi giao; tiền thuê và cọc chưa thu.`
                            : `Đã gán ${selectedUnitSummary} trong dữ liệu demo. Kiểm bộ và phụ kiện trên chi tiết đơn trước khi giao; tiền thuê và cọc chưa thu.`
                          : realApiMode
                            ? 'Đơn đã được tạo trên hệ thống. Mở chi tiết đơn để kiểm tra trạng thái và tiếp tục xử lý.'
                            : 'Yêu cầu đang chờ xác nhận trong dữ liệu demo. Mở chi tiết đơn để tiếp tục.'}
                      </Feedback>
                    </div>
                  ) : (
                    <div className="counter-actions">
                      {quote && (
                        <div className="counter-quote-sticky-total">
                          <span>Tiền thuê và cọc</span>
                          <strong>{money(quote.amountDueAtPickup)}</strong>
                        </div>
                      )}
                      {canConfirm && (
                        <Button
                          disabled={
                            !quote ||
                            quote.available === false ||
                            quoteExpired ||
                            !canConfirmAllLines ||
                            creating ||
                            !customer ||
                            busy
                          }
                          loading={busy}
                          onClick={() =>
                            void create(customer?.name ?? '', customer?.phone ?? '', true)
                          }
                        >
                          Tạo và xác nhận{selectedUnitSummary ? ` · ${selectedUnitSummary}` : ''}
                        </Button>
                      )}
                      <Button
                        variant={canConfirm ? 'secondary' : 'primary'}
                        disabled={
                          !quote ||
                          quote.available === false ||
                          quoteExpired ||
                          creating ||
                          !customer ||
                          busy
                        }
                        loading={busy}
                        onClick={() =>
                          void create(customer?.name ?? '', customer?.phone ?? '', false)
                        }
                      >
                        Chỉ tạo yêu cầu chờ
                      </Button>
                    </div>
                  )}
                  {created && (
                    <div className="counter-actions">
                      <Button variant="secondary" onClick={() => go('orders', { order: created })}>
                        Xem đơn vừa tạo
                      </Button>
                      <Button
                        variant="quiet"
                        onClick={() => {
                          setCreated('');
                          setCreatedMode('pending');
                          setIssue('');
                          setCreating(false);
                          setNewName('');
                          setNewPhone('');
                          setNewEmail('');
                          clearQuote();
                        }}
                      >
                        Tạo đơn khác
                      </Button>
                    </div>
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
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue'>('all');
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [issue, setIssue] = useState('');
  const { detailRef, revealDetail } = useMobileDetailReveal<HTMLDivElement>();
  const selected = data?.find((unit) => unit.barcode === selectedBarcode && unit.branch === branch);
  const selectUnit = (unit: ActiveUnit) => {
    setIssue('');
    setSelectedBarcode(unit.barcode);
    revealDetail();
  };
  const openActiveUnit = (code: string) => {
    setIssue('');
    const unit = data?.find((x) => x.barcode === code.toUpperCase() && x.branch === branch);
    if (unit) selectUnit(unit);
    else {
      setSelectedBarcode('');
      setIssue('Barcode tồn tại nhưng không thuộc bộ đang thuê ACTIVE tại chi nhánh này.');
    }
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
        const filtered = items
          .filter(
            (x) =>
              x.branch === branch &&
              (dueFilter === 'all' || x.overdue) &&
              `${x.barcode} ${x.phone} ${x.orderId} ${x.customer}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .sort((left, right) => Number(right.overdue) - Number(left.overdue));
        return (
          <div className="page">
            <PageHeading title="Đang thuê" />
            <div className="feature-two-column independent-scroll-workspace">
              <div role="region" aria-label="Cuộn danh sách bộ đang thuê" tabIndex={0}>
                <Panel title="Tra bộ đang ở khách">
                  <BarcodeLookup
                    branch={branch}
                    scenario={scenario}
                    onFound={(unit) => openActiveUnit(unit.barcode)}
                    onError={() => setSelectedBarcode('')}
                    autoFocus
                  />
                  <FilterBar>
                    <SearchField
                      label="Lọc theo barcode, khách hoặc mã đơn"
                      value={query}
                      onChange={setQuery}
                    />
                    <SelectField
                      label="Hạn trả"
                      value={dueFilter}
                      onChange={(event) => setDueFilter(event.target.value as 'all' | 'overdue')}
                    >
                      <option value="all">Tất cả</option>
                      <option value="overdue">Quá hạn</option>
                    </SelectField>
                  </FilterBar>
                </Panel>
                <Panel title={`${filtered.length} bộ`}>
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Barcode</th>
                          <th>Khách</th>
                          <th>Đơn</th>
                          <th>Hạn trả</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => (
                          <tr key={row.barcode}>
                            <td>
                              <button
                                className="text-link"
                                aria-pressed={selected?.barcode === row.barcode}
                                onClick={() => selectUnit(row)}
                              >
                                {row.barcode}
                              </button>
                            </td>
                            <td>{row.customer}</td>
                            <td>{row.orderId}</td>
                            <td>{row.due}</td>
                            <td>
                              <StatusLabel
                                text={row.overdue ? 'Quá hạn' : 'Trong hạn'}
                                tone={row.overdue ? 'danger' : 'success'}
                              />
                            </td>
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
              <div
                ref={detailRef}
                tabIndex={0}
                role="region"
                aria-label="Chi tiết bộ đang thuê được chọn"
                key={selected?.barcode ?? 'none'}
              >
                {selected ? (
                  <Panel title={`${selected.barcode} · ${selected.costume}`}>
                    <StatusLabel
                      text={selected.overdue ? 'Quá hạn trả' : 'Đang thuê'}
                      tone={selected.overdue ? 'danger' : 'info'}
                    />
                    <KeyFacts
                      rows={[
                        {
                          label: 'Trang phục / size',
                          value: `${selected.costume} · ${selected.variant}`,
                        },
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
                    <Button
                      variant="secondary"
                      onClick={() => go('orders', { order: selected.orderId })}
                    >
                      Xem đơn và yêu cầu gia hạn
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
