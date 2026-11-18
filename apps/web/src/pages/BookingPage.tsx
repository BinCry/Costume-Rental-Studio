import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Navigate } from '../App';
import { ImageWithFallback } from '../components/ImageWithFallback';
import {
  Button,
  EmptyState,
  Feedback,
  DateTimeField,
  Field,
  Icon,
  SelectField,
  SkeletonGrid,
  TextAreaField,
} from '../components/ui';
import { defaultRentalDate, money } from '../components/support';
import { useFixtureResource } from '../components/useFixtureResource';
import { branches, fixtureAdapter, fixtureCatalog, fixturePeriod } from '../fixtures/adapter';
import { studioAdapter } from '../fixtures/studio';
import type { BookingDraft, DemoScenario, QuoteSnapshot } from '../fixtures/types';
import { apiEnabled, getOwnCustomerProfile, hasAccessToken } from '../api/client';
import { formatLocalDateTime } from '../utils/date-format';
import { isValidPhone } from '../utils/phone';
import { rentalPeriodIssues } from '../utils/rental-period';
import { useBranchOptions } from '../components/useBranchOptions';
import { quoteNeedsConfirmation } from './quoteConfirmation';

const steps = ['Chọn bộ, lịch & báo giá', 'Liên hệ & gửi'];
type BookingLine = NonNullable<BookingDraft['items']>[number];
const bookingDraftStorageKey = 'costume-rental.booking-draft.v1';
function storeBookingDraft(draft: BookingDraft) {
  window.sessionStorage.setItem(
    bookingDraftStorageKey,
    JSON.stringify({ savedAt: Date.now(), draft }),
  );
}
const loadCatalog = (scenario: DemoScenario) => fixtureAdapter.listCatalog(scenario);
function toLocalDateTimeInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function minimumPickupDateTime(now: number) {
  return toLocalDateTimeInput(new Date(now + 2 * 60_000));
}
function lateReturnPolicyText(quote: QuoteSnapshot | undefined, apiMode: boolean) {
  const dueRule =
    'Hạn trả là thời điểm ghi trên đơn; đệm lịch nội bộ không kéo dài thời gian thuê.';
  if (quote?.lateFeePercentPerDay === undefined) {
    return apiMode
      ? 'Báo giá chưa trả về mức phí trả trễ. Hãy xác nhận với studio trước khi gửi yêu cầu. ' +
          dueRule
      : 'Bản minh họa không mô phỏng phí trả trễ; studio cần xác nhận chính sách trước khi áp dụng. ' +
          dueRule;
  }
  const rate = Math.max(0, quote.lateFeePercentPerDay);
  if (rate === 0) return 'Chính sách trong báo giá hiện không cấu hình phí trả trễ. ' + dueRule;
  const grace = Math.max(0, quote.lateGraceMinutes ?? 0);
  return `Sau ${grace} phút ân hạn, phụ phí là ${rate}% giá thuê của từng bộ cho mỗi 24 giờ trễ đã bắt đầu, tối đa 100% tiền thuê của bộ đó. Tiền cọc được quyết toán riêng sau khi nhận và kiểm tra đồ. ${dueRule}`;
}
const baseDraft: BookingDraft = {
  costumeId: 'ao-dai-lina',
  variant: 'M / Hồng phấn',
  quantity: 1,
  branch: branches[0],
  pickup: fixturePeriod.pickup,
  returnAt: fixturePeriod.returnAt,
  name: '',
  phone: '',
  note: '',
};

function resumedDraft(context?: URLSearchParams): BookingDraft | undefined {
  if (context?.get('resume') !== '1' || typeof window === 'undefined') return undefined;
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(bookingDraftStorageKey) ?? 'null',
    );
    if (!stored || typeof stored !== 'object') return undefined;
    const envelope = stored as { savedAt?: unknown; draft?: unknown };
    if (
      typeof envelope.savedAt !== 'number' ||
      Date.now() - envelope.savedAt > 24 * 60 * 60 * 1000 ||
      !envelope.draft ||
      typeof envelope.draft !== 'object'
    )
      return undefined;
    const value = envelope.draft as Partial<BookingDraft>;
    if (
      typeof value.costumeId !== 'string' ||
      typeof value.variant !== 'string' ||
      typeof value.branch !== 'string' ||
      typeof value.pickup !== 'string' ||
      typeof value.returnAt !== 'string' ||
      !Number.isInteger(value.quantity) ||
      (value.quantity ?? 0) < 1 || (value.quantity ?? 0) > 50 ||
      typeof value.name !== 'string' ||
      typeof value.phone !== 'string' ||
      typeof value.note !== 'string'
    )
      return undefined;
    const savedItems = value.items;
    const items = Array.isArray(savedItems) && savedItems.length > 0 &&
      savedItems.length <= 50 && savedItems.every((line) =>
        typeof line.costumeId === 'string' && typeof line.variant === 'string' &&
        Number.isInteger(line.quantity) && line.quantity > 0)
      ? savedItems
      : [{ costumeId: value.costumeId, variant: value.variant, quantity: value.quantity! }];
    return { ...baseDraft, ...value, quantity: value.quantity!, items };
  } catch {
    return undefined;
  }
}
const initialDraft = (costumeId?: string, context?: URLSearchParams): BookingDraft => {
  const selected = fixtureCatalog.find((entry) => entry.id === costumeId);
  const variants = selected?.sizes.map((size) => `${size} / ${selected.colors[0]}`) ?? [];
  const requestedVariant = context?.get('variant') ?? '';
  const requestedBranch = context?.get('branch');
  const requestedPickup = context?.get('pickup');
  const requestedReturn = context?.get('returnAt');
  const apiMode = apiEnabled && (hasAccessToken() || !import.meta.env.DEV);
  const resume = resumedDraft(context);
  if (resume) return resume;
  const selectedVariant = variants.includes(requestedVariant)
    ? requestedVariant
    : apiMode
      ? costumeId ? requestedVariant : ''
      : (variants[0] ?? baseDraft.variant);
  return {
      ...baseDraft,
      // Live mode must never start from the sample costume: it is not in the real catalog.
      costumeId: costumeId ?? (apiMode ? '' : baseDraft.costumeId),
      variant: selectedVariant,
      items: costumeId || !apiMode
        ? [{ costumeId: costumeId ?? baseDraft.costumeId, variant: selectedVariant, quantity: 1 }]
        : [],
      branch: requestedBranch?.trim() ? requestedBranch : apiMode ? '' : baseDraft.branch,
      pickup: requestedPickup?.trim()
        ? requestedPickup
        : apiMode
          ? defaultRentalDate(1)
          : baseDraft.pickup,
      returnAt: requestedReturn?.trim()
        ? requestedReturn
        : apiMode
          ? defaultRentalDate(3)
          : baseDraft.returnAt,
    };
};

export function BookingPage({
  scenario,
  go,
  costumeId,
  initialContext,
  onCustomerCreated,
  customerAuthenticated = false,
}: {
  scenario: DemoScenario;
  go: Navigate;
  costumeId?: string;
  initialContext: URLSearchParams;
  onCustomerCreated?: (code: string) => void;
  customerAuthenticated?: boolean;
}) {
  const apiMode = apiEnabled && (hasAccessToken() || !import.meta.env.DEV);
  const {
    options: branchOptions,
    ready: branchOptionsReady,
    error: branchOptionsError,
    retry: retryBranches,
  } = useBranchOptions();
  const [step, setStep] = useState(0);
  const [draftState, setDraft] = useState<BookingDraft>(() =>
    initialDraft(costumeId, initialContext),
  );
  const [quote, setQuote] = useState<QuoteSnapshot>();
  const [promotionCode, setPromotionCode] = useState('');
  const [appliedPromotionCode, setAppliedPromotionCode] = useState('');
  const [promotionIssue, setPromotionIssue] = useState('');
  const [quoteIssue, setQuoteIssue] = useState('');
  const [quoteIssueCode, setQuoteIssueCode] = useState('');
  const [issue, setIssue] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submittedId, setSubmittedId] = useState('');
  const quoteRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const issueRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef(step);
  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    const initialTimer = window.setTimeout(updateTime, 0);
    const interval = window.setInterval(updateTime, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    stepHeadingRef.current?.focus();
    stepHeadingRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [step]);
  useEffect(() => {
    if (!issue) return;
    const invalidField = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalidField ?? issueRef.current)?.focus();
  }, [issue]);
  useEffect(() => {
    if (submittedId) successHeadingRef.current?.focus();
  }, [submittedId]);
  const { loading, data, error, retry } = useFixtureResource(scenario, loadCatalog);
  useEffect(() => {
    if (!apiMode || !hasAccessToken()) return;
    let active = true;
    void getOwnCustomerProfile()
      .then((profile) => {
        if (!active) return;
        setDraft((current) => ({
          ...current,
          name: current.name.trim() ? current.name : profile.displayName,
          phone: current.phone.trim() ? current.phone : (profile.phone ?? ''),
        }));
      })
      .catch(() => {
        // The order form remains editable when a profile is unavailable.
      });
    return () => {
      active = false;
    };
  }, [apiMode]);
  const catalog = data ?? (apiMode ? [] : fixtureCatalog);
  const choicesFor = (costumeId: string) => {
    const costume = catalog.find((entry) => entry.id === costumeId);
    return costume?.apiVariants?.length
    ? costume.apiVariants.map((variant) => ({
        value: variant.code,
        label: `${variant.size} / ${variant.color}${variant.edition ? ` · ${variant.edition}` : ''}`,
      }))
    : costume
      ? costume.sizes.map((size) => ({
          value: `${size} / ${costume.colors[0]}`,
          label: `${size} / ${costume.colors[0]}`,
        }))
      : [];
  };
  const rawLines = draftState.items ?? (draftState.costumeId
    ? [{ costumeId: draftState.costumeId, variant: draftState.variant, quantity: draftState.quantity }]
    : []);
  const lines = rawLines.map((line) => {
    const options = choicesFor(line.costumeId);
    return {
      ...line,
      variant: options.length && !options.some((option) => option.value === line.variant)
        ? (apiMode ? '' : options[0].value) : line.variant,
    };
  });
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const summaryLines = lines.map((line) => ({
    name: catalog.find((entry) => entry.id === line.costumeId)?.name ?? 'Mẫu chưa tải',
    variant: choicesFor(line.costumeId).find((option) => option.value === line.variant)?.label ??
      (line.variant || 'Chưa chọn size/màu'),
    quantity: line.quantity,
  }));
  const draft = {
    ...draftState,
    items: lines,
    costumeId: lines[0]?.costumeId ?? '',
    variant: lines[0]?.variant ?? '',
    quantity: totalQuantity,
    branch: branchOptions.includes(draftState.branch)
      ? draftState.branch
      : (branchOptions[0] ?? (apiMode ? '' : draftState.branch)),
  };
  const backToCatalog = () => go('catalog', {
    ...Object.fromEntries(
      [...initialContext.entries()].filter(([key]) =>
        ['category', 'size', 'color', 'search', 'sort'].includes(key)),
    ),
    branch: draft.branch,
    pickup: draft.pickup,
    returnAt: draft.returnAt,
  });
  const invalidateQuote = () => {
    quoteRequestRef.current += 1;
    setQuote(undefined);
    setQuoteIssue('');
    setQuoteIssueCode('');
    if (!submittingRef.current) setBusy(false);
  };
  const update = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (['branch', 'pickup', 'returnAt'].includes(key)) invalidateQuote();
    setIssue('');
  };
  const updateLines = (nextLines: BookingLine[]) => {
    setDraft((current) => ({
      ...current,
      items: nextLines,
      costumeId: nextLines[0]?.costumeId ?? '',
      variant: nextLines[0]?.variant ?? '',
      quantity: nextLines.reduce((sum, line) => sum + line.quantity, 0),
    }));
    invalidateQuote();
    setIssue('');
  };
  const { pickupIssue, returnIssue } = rentalPeriodIssues(draft.pickup, draft.returnAt);
  const canContinue = () => {
    const dates = rentalPeriodIssues(draft.pickup, draft.returnAt);
    const dateIssue = dates.pickupIssue ?? dates.returnIssue;
    if (dateIssue) return dateIssue;
    if (step === 0 || step === 1) {
      if (!lines.length) return 'Hãy thêm ít nhất một mẫu trang phục.';
      if (lines.some((line) => !line.variant)) return 'Chọn size và màu cho từng bộ.';
      if (totalQuantity < 1 || totalQuantity > 50 || lines.some((line) =>
        !Number.isInteger(line.quantity) || line.quantity < 1 ||
        !catalog.some((entry) => entry.id === line.costumeId) ||
        !choicesFor(line.costumeId).some((choice) => choice.value === line.variant)))
        return 'Kiểm tra mẫu, size và số bộ ở từng dòng (tối đa 50 bộ).';
      if (!draft.branch || !draft.pickup || !draft.returnAt)
        return 'Chọn cùng chi nhánh và kỳ nhận/trả hợp lệ.';
      if (currentTime > 0 && new Date(draft.pickup).getTime() <= currentTime)
        return 'Giờ nhận đã qua. Hãy chọn thời điểm nhận trong tương lai.';
    }
    if (step === 0 && quote?.available === false)
      return 'Không đủ bộ cho kỳ thuê này. Hãy đổi size, mẫu, chi nhánh hoặc thời gian.';
    if (step === 0 && quote && promotionCode.trim().toUpperCase() !== appliedPromotionCode)
      return 'Áp dụng mã ưu đãi để cập nhật báo giá trước khi tiếp tục.';
    if (step === 1) {
      if (!quote) return 'Cần xem báo giá trước khi tiếp tục.';
      if (quote.available === false) return 'Không đủ bộ cho kỳ thuê này. Hãy đổi size, mẫu, chi nhánh hoặc thời gian.';
      if (promotionCode.trim().toUpperCase() !== appliedPromotionCode)
        return 'Hãy áp dụng hoặc bỏ mã ưu đãi để cập nhật báo giá trước khi tiếp tục.';
      if (!draft.name.trim() || !isValidPhone(draft.phone))
        return 'Nhập tên và số điện thoại liên hệ hợp lệ.';
    }
    return '';
  };
  const next = () => {
    const message = canContinue();
    if (message) {
      setIssue(message);
      return;
    }
    setIssue('');
    if (step === 0) {
      if (!quote) {
        void loadQuote();
        return;
      }
      setStep(1);
      return;
    }
  };
  const loadQuote = async (requestedPromotionCode = appliedPromotionCode) => {
    const dates = rentalPeriodIssues(draft.pickup, draft.returnAt);
    const dateIssue = dates.pickupIssue ?? dates.returnIssue;
    if (dateIssue || !draft.pickup || !draft.returnAt) {
      setIssue(dateIssue ?? 'Chọn thời điểm nhận và trả đồ trước khi tải báo giá.');
      return;
    }
    const requestId = ++quoteRequestRef.current;
    const normalizedCode = requestedPromotionCode.trim().toUpperCase();
    setBusy(true);
    setIssue('');
    setPromotionIssue('');
    setQuoteIssue('');
    setQuoteIssueCode('');
    setQuote(undefined);
    try {
      const result = await fixtureAdapter.getQuote(draft, scenario, {
        promotionCode: normalizedCode || undefined,
        publicEstimate: apiMode && !customerAuthenticated,
      });
      if (requestId === quoteRequestRef.current) {
        setQuote(result);
        setAppliedPromotionCode(result.promotionCode ?? '');
        setPromotionCode(result.promotionCode ?? '');
        if (normalizedCode && !result.promotionCode) {
          setPromotionIssue('Mã ưu đãi chưa được áp dụng vào báo giá này.');
          return false;
        }
        return true;
      }
      return false;
    } catch (caught) {
      if (requestId === quoteRequestRef.current) {
        const message = caught instanceof Error ? caught.message : 'Chưa tải được báo giá.';
        setQuote(undefined);
        setAppliedPromotionCode('');
        if (normalizedCode) {
          setPromotionIssue(message);
          try {
            const withoutCode = await fixtureAdapter.getQuote(draft, scenario, {
              publicEstimate: apiMode && !customerAuthenticated,
            });
            if (requestId === quoteRequestRef.current) setQuote(withoutCode);
          } catch {
            // Keep the rejection reason; the quote stays empty when it cannot be loaded either.
          }
        } else {
          const caughtCode =
            caught && typeof caught === 'object' && 'code' in caught
              ? (caught as { code?: unknown }).code
              : undefined;
          const code = typeof caughtCode === 'string' ? caughtCode : '';
          setQuoteIssue(message);
          setQuoteIssueCode(code);
        }
      }
      return false;
    } finally {
      if (requestId === quoteRequestRef.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (submittingRef.current || submittedId) return;
    if (apiMode && !customerAuthenticated) {
      continueToAuth('login');
      return;
    }
    const message = canContinue();
    if (message || !quote) {
      setIssue(message || 'Cần báo giá hợp lệ.');
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setIssue('');
    try {
      const refreshedQuote = await fixtureAdapter.getQuote(draft, scenario, {
        promotionCode: appliedPromotionCode || undefined,
      });
      if (quoteNeedsConfirmation(quote, refreshedQuote)) {
        setQuote(refreshedQuote);
        setAppliedPromotionCode(refreshedQuote.promotionCode ?? '');
        setPromotionCode(refreshedQuote.promotionCode ?? '');
        setStep(0);
        setIssue(refreshedQuote.available === false
          ? 'Một bộ đã hết trong kỳ thuê này. Hãy đổi size, mẫu, chi nhánh hoặc lịch.'
          : 'Báo giá hoặc điều kiện thuê đã đổi. Hãy xem lại trước khi gửi.');
        return;
      }
      const id = await fixtureAdapter.submitBooking(draft, refreshedQuote, scenario);
      try {
        window.sessionStorage.removeItem(bookingDraftStorageKey);
      } catch {
        // Ignore unavailable session storage after the request has completed.
      }
      if (apiMode) onCustomerCreated?.('');
      else onCustomerCreated?.(studioAdapter.recordBooking(id, draft, quote));
      setSubmittedId(id);
    } catch (caught) {
      setIssue(caught instanceof Error ? caught.message : 'Chưa gửi được yêu cầu.');
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };
  const continueToAuth = (destination: 'login' | 'register') => {
    try {
      storeBookingDraft(draftState);
      go(destination, { next: '/dat-thue?resume=1' });
    } catch {
      setIssue(
        `Chưa thể lưu lựa chọn để tiếp tục sau khi ${destination === 'login' ? 'đăng nhập' : 'đăng ký'}. Hãy thử lại hoặc giữ nguyên trang này.`,
      );
    }
  };
  const requiresAuthentication = /AUTH|SESSION|UNAUTHORIZED/i.test(quoteIssueCode);
  if (submittedId)
    return (
      <div className="page booking-page">
        <div className="booking-success">
          <span className="success-symbol">
            <Icon name="check" size={32} />
          </span>
          <p className="eyebrow">YÊU CẦU ĐÃ GỬI</p>
          <h1 tabIndex={-1} ref={successHeadingRef}>
            {apiMode ? 'Yêu cầu đã được tạo' : 'Yêu cầu xem thử đã được tạo'}
          </h1>
          <p className="success-code">
            Mã yêu cầu <strong>{submittedId}</strong>
          </p>
          <Feedback
            tone={apiMode ? 'info' : 'warning'}
            title={
              apiMode
                ? 'Studio sẽ duyệt yêu cầu và xác nhận từng bộ.'
                : 'Đây là bản xem thử; studio chưa nhận yêu cầu này.'
            }
          >
            {apiMode
              ? 'Tình trạng trang phục sẽ được studio xác nhận trước khi giữ lịch.'
              : 'Thông tin chỉ được lưu tạm trong trình duyệt này, không tạo đơn thật.'}
          </Feedback>
          <Button onClick={() => go('myRentalDetail', { order: submittedId })}>
            Theo dõi yêu cầu <Icon name="arrow" size={18} />
          </Button>
        </div>
      </div>
    );
  return (
    <div className="page booking-page">
      <div className="booking-heading">
        <div>
          <h1>Gửi yêu cầu thuê</h1>
        </div>
      </div>
      <div className="step-progress" aria-label="Tiến độ đặt thuê">
        {steps.map((label, index) => (
          <button
            key={label}
            className={index === step ? 'active' : index < step ? 'done' : ''}
            onClick={() => {
              if (index < step) {
                setIssue('');
                setStep(index);
              }
            }}
            disabled={index > step}
            aria-current={index === step ? 'step' : undefined}
            aria-label={`Bước ${index + 1}: ${label}`}
          >
            <span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
            <small>{label}</small>
          </button>
        ))}
      </div>
      <div className="booking-layout">
        <details className="booking-mobile-summary">
          <summary>
            <span>{totalQuantity} bộ · {lines.length} lựa chọn</span>
            <strong>{quote ? money(quote.amountDueAtPickup) : 'Chưa có báo giá'}</strong>
          </summary>
          <BookingSummaryContent
            lines={summaryLines}
            branch={draft.branch}
            pickup={draft.pickup}
            returnAt={draft.returnAt}
            quote={quote}
            apiMode={apiMode}
          />
        </details>
        <aside
          className={`booking-sidebar ${step === 0 ? 'booking-sidebar-selection' : 'booking-sidebar-summary'}`}
        >
          {step === 0 ? (
            <div className="booking-selection-card">
              <div className="booking-selection-heading">
                <h2>Trang phục thuê</h2>
              </div>
              {loading ? (
                <p className="booking-selection-status">Đang tải bộ sưu tập…</p>
              ) : error ? (
                <p className="booking-selection-status" role="status">
                  Chưa tải được danh sách. Hãy thử lại ở phần thông tin thuê.
                </p>
              ) : data?.length ? (
                <div className="booking-costumes">
                  {data.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`booking-costume ${lines.some((line) => line.costumeId === entry.id) ? 'selected' : ''}`}
                      aria-label={`Thêm ${entry.name} vào yêu cầu`}
                      disabled={totalQuantity >= 50}
                      onClick={() => {
                        updateLines([...lines, {
                          costumeId: entry.id,
                          variant: apiMode ? '' : `${entry.sizes[0]} / ${entry.colors[0]}`,
                          quantity: 1,
                        }]);
                      }}
                    >
                      <span
                        className={`booking-costume-image costume-${entry.imagePosition}`}
                        role="img"
                        aria-label={entry.imageAlt ?? `Ảnh ${entry.name}`}
                      >
                        <ImageWithFallback
                          src={entry.imageUrl}
                          alt=""
                          compact
                          missingText="Chưa có ảnh"
                          failedText="Ảnh chưa tải được"
                        />
                      </span>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.category} · Từ {money(entry.priceFrom)}/ngày
                        </small>
                      </span>
                      <span className="booking-add-icon" aria-hidden="true">+</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="booking-selection-status">Chưa có mẫu trang phục để chọn.</p>
              )}
            </div>
          ) : (
            <BookingSummaryContent
              lines={summaryLines}
              branch={draft.branch}
              pickup={draft.pickup}
              returnAt={draft.returnAt}
              quote={quote}
              apiMode={apiMode}
            />
          )}
        </aside>
        <section className="booking-panel" ref={panelRef}>
          <div className="panel-intro">
            <span className="step-number">0{step + 1}</span>
            <div>
              <p className="eyebrow">CHẶNG {step + 1} / 2</p>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="booking-step-heading">
                {steps[step]}
              </h2>
            </div>
          </div>
          {error && (
            <Feedback
              tone="danger"
              title="Không tải được mẫu trang phục"
              action={
                <Button variant="secondary" onClick={retry}>
                  Thử lại
                </Button>
              }
            >
              {error}
            </Feedback>
          )}
          {scenario === 'empty' && !loading && (
            <EmptyState
              title="Chưa có trang phục để hiển thị"
              action={
                <Button variant="secondary" onClick={backToCatalog}>
                  Về bộ sưu tập
                </Button>
              }
            />
          )}
          {loading && <SkeletonGrid count={2} />}
          {!loading && !error && scenario !== 'empty' && (
            <>
              {step === 0 && (
                <div className="form-stack">
                  <h3 className="booking-subheading">Chi nhánh và lịch thuê</h3>
                  <SelectField
                    label="Chi nhánh nhận và trả"
                    value={draft.branch}
                    disabled={!branchOptionsReady || branchOptions.length === 0}
                    onChange={(event) => update('branch', event.target.value)}
                  >
                    {branchOptions.length === 0 && (
                      <option value="">
                        {branchOptionsReady ? 'Chưa có chi nhánh khả dụng' : 'Đang tải chi nhánh…'}
                      </option>
                    )}
                    {branchOptions.map((entry) => (
                      <option key={entry}>{entry}</option>
                    ))}
                  </SelectField>
                  {branchOptionsError && (
                    <Feedback tone="danger" title="Chưa tải được danh sách chi nhánh">
                      Hãy thử lại trước khi tiếp tục đặt thuê.{' '}
                      <button type="button" className="text-button" onClick={retryBranches}>
                        Thử lại
                      </button>
                    </Feedback>
                  )}
                  <div className="two-fields">
                    <DateTimeField
                      label="Nhận đồ"
                      value={draft.pickup}
                      min={currentTime > 0 ? minimumPickupDateTime(currentTime) : undefined}
                      onChange={(value) => update('pickup', value)}
                      error={
                        pickupIssue ??
                        (issue && !draft.pickup
                          ? 'Chọn thời điểm nhận đồ.'
                          : issue &&
                              currentTime > 0 &&
                              draft.pickup &&
                              new Date(draft.pickup).getTime() <= currentTime
                            ? 'Thời điểm này đã qua. Hãy chọn ngày giờ nhận trong tương lai.'
                            : undefined)
                      }
                    />
                    <DateTimeField
                      label="Trả đồ"
                      value={draft.returnAt}
                      onChange={(value) => update('returnAt', value)}
                      error={
                        returnIssue ??
                        (issue && !draft.returnAt ? 'Chọn thời điểm trả đồ.' : undefined)
                      }
                    />
                  </div>
                  <p className="inline-note">
                    <Icon name="pin" size={17} /> Nhận và trả cùng chi nhánh. Số ngày tính thuê theo
                    chính sách trong báo giá.
                  </p>
                  {Boolean(data?.length) && (
                    <>
                      <h3 className="booking-subheading">Bộ đã chọn · {totalQuantity}</h3>
                      {lines.length ? (
                        <div className="booking-lines">
                          {lines.map((line, index) => {
                            const costume = catalog.find((entry) => entry.id === line.costumeId);
                            const quotedLine = quote?.lines?.find((entry) =>
                              entry.variantId === `${line.costumeId}:${line.variant}` ||
                              costume?.apiVariants?.some((variant) =>
                                variant.code === line.variant && variant.id === entry.variantId));
                            return (
                              <div className="booking-line" key={`${line.costumeId}-${index}`}>
                                <div className="booking-line-title">
                                  <strong>{costume?.name ?? 'Mẫu chưa tải'}</strong>
                                  <button type="button" className="text-button" onClick={() => updateLines(lines.filter((_, row) => row !== index))}>
                                    Xóa
                                  </button>
                                </div>
                                <div className="booking-line-fields">
                                  <SelectField
                                    label={`Size / màu · dòng ${index + 1}`}
                                    value={line.variant}
                                    error={issue && !line.variant ? 'Chọn size và màu cho bộ này.' : undefined}
                                    onChange={(event) => updateLines(lines.map((entry, row) => row === index
                                      ? { ...entry, variant: event.target.value } : entry))}
                                  >
                                    {apiMode && <option value="">Chọn size / màu</option>}
                                    {choicesFor(line.costumeId).map((choice) => (
                                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                                    ))}
                                  </SelectField>
                                  <Field
                                    label="Số bộ"
                                    type="number"
                                    min="1"
                                    max={String(50 - totalQuantity + line.quantity)}
                                    step="1"
                                    value={line.quantity}
                                    onChange={(event) => updateLines(lines.map((entry, row) => row === index
                                      ? { ...entry, quantity: Number(event.target.value) } : entry))}
                                  />
                                </div>
                                {quote?.available === false && quotedLine && quotedLine.availableUnits < quotedLine.quantity && (
                                  <p className="field-error" role="status">
                                    Cần {quotedLine.quantity} bộ, hiện còn {quotedLine.availableUnits} bộ cho kỳ thuê này.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="inline-note">Chọn mẫu ở cột bên phải để thêm vào yêu cầu.</p>}
                    </>
                  )}
                </div>
              )}
              {step === 0 && (
                <div className="form-stack">
                  <div className="booking-quote-status" aria-live="polite">
                      {quoteIssue ? (
                        <Feedback
                          tone="danger"
                          className="booking-quote-error"
                          title={
                            quoteIssueCode === 'RENTAL_START_IN_PAST'
                              ? 'Giờ nhận không còn hợp lệ'
                              : requiresAuthentication
                                ? 'Phiên đăng nhập cần được làm mới'
                                : 'Chưa tải được báo giá'
                          }
                          action={
                            quoteIssueCode === 'RENTAL_START_IN_PAST' ? (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setStep(0);
                                  setIssue(
                                    'Giờ nhận đã qua. Hãy chọn thời điểm nhận trong tương lai.',
                                  );
                                  setQuoteIssue('');
                                  setQuoteIssueCode('');
                                }}
                              >
                                Chọn lại giờ nhận
                              </Button>
                            ) : requiresAuthentication ? (
                              <Button variant="secondary" onClick={() => continueToAuth('login')}>
                                Đăng nhập lại
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                loading={busy}
                                onClick={() => void loadQuote()}
                              >
                                Thử tải lại
                              </Button>
                            )
                          }
                        >
                          {quoteIssue}
                        </Feedback>
                      ) : (
                        <div className="booking-quote-status__summary">
                          <div>
                            <span>Dự kiến thu khi nhận</span>
                            <strong>
                              {quote?.available === false
                                ? 'Không đủ bộ'
                                : quote
                                  ? money(quote.amountDueAtPickup)
                                  : busy
                                    ? 'Đang tải báo giá…'
                                    : 'Chưa có báo giá'}
                            </strong>
                          </div>
                          {quote && (
                            <Button variant="secondary" onClick={() => void loadQuote()} loading={busy}>
                              <Icon name="refresh" size={18} /> Cập nhật báo giá
                            </Button>
                          )}
                        </div>
                      )}
                  </div>
                  {apiMode && customerAuthenticated && (
                    <details className="booking-promotion-details">
                      <summary>Mã ưu đãi {quote?.promotionCode ? `· ${quote.promotionCode}` : '(nếu có)'}</summary>
                    <div className="promotion-entry">
                      <div className="promotion-entry__field">
                        <Field
                          label="Mã ưu đãi"
                          autoCapitalize="characters"
                          maxLength={100}
                          placeholder="Nhập mã ưu đãi nếu có"
                          value={promotionCode}
                          onChange={(event) => {
                            setPromotionCode(event.target.value.toUpperCase());
                            setPromotionIssue('');
                          }}
                        />
                        {promotionIssue && (
                          <p className="field-error" role="alert">
                            {promotionIssue}
                          </p>
                        )}
                        {quote?.promotionCode &&
                          appliedPromotionCode === promotionCode.trim().toUpperCase() && (
                            <p className="field-hint">Đã giảm {money(quote.discount)}.</p>
                          )}
                        {promotionCode.trim() &&
                          promotionCode.trim().toUpperCase() !== appliedPromotionCode && (
                            <p className="field-hint" role="status">
                              Áp dụng mã để cập nhật báo giá.
                            </p>
                          )}
                      </div>
                      <Button
                        variant="secondary"
                        type="button"
                        loading={busy}
                        disabled={
                          busy ||
                          (promotionCode.trim().toUpperCase() === appliedPromotionCode &&
                            Boolean(quote) &&
                            !promotionIssue) ||
                          (!promotionCode.trim() &&
                            !appliedPromotionCode &&
                            Boolean(quote) &&
                            !promotionIssue)
                        }
                        onClick={() => void loadQuote(promotionCode.trim().toUpperCase())}
                      >
                        {!promotionCode.trim() && appliedPromotionCode
                          ? 'Bỏ mã'
                          : promotionCode.trim().toUpperCase() === appliedPromotionCode && quote
                            ? 'Đã cập nhật'
                            : promotionCode.trim()
                              ? 'Áp dụng mã'
                              : 'Tính lại báo giá'}
                      </Button>
                    </div>
                    </details>
                  )}
                  {quote && (
                    <div className="quote-card">
                      {quote.available === false && (
                        <Feedback tone="danger" title="Không đủ bộ trong kỳ thuê này" action={
                          <Button variant="secondary" onClick={() => setStep(0)}>Đổi lựa chọn</Button>
                        }>
                          {quote.lines?.filter((line) => line.availableUnits < line.quantity)
                            .map((line) => `${line.variantLabel}: cần ${line.quantity}, còn ${line.availableUnits}`)
                            .join(' · ') ?? 'Hãy đổi size, mẫu, chi nhánh hoặc thời gian.'}
                        </Feedback>
                      )}
                      <div>
                        <span>Thời gian tính thuê</span>
                        <strong>{quote.daysLabel}</strong>
                      </div>
                      {quote.lines?.map((line) => (
                        <div key={line.variantId}>
                          <span>{line.variantLabel} · {line.quantity} bộ</span>
                          <strong>{money(line.pricePerDay)}/ngày mỗi bộ</strong>
                        </div>
                      )) ?? <div>
                        <span>Giá/ngày × số bộ</span>
                        <strong>{money(quote.pricePerDay)} × {quote.quantity}</strong>
                      </div>}
                      <div>
                        <span>Tiền thuê</span>
                        <strong>{money(quote.rental)}</strong>
                      </div>
                      <div>
                        <span>Tiền cọc</span>
                        <strong>{money(quote.deposit)}</strong>
                      </div>
                      {quote.promotionCode && (
                        <div>
                          <span>Mã ưu đãi</span>
                          <strong>{quote.promotionCode}</strong>
                        </div>
                      )}
                      <div>
                        <span>Giảm giá</span>
                        <strong>{money(quote.discount)}</strong>
                      </div>
                      <div className="quote-total">
                        <span>Dự kiến thu khi nhận</span>
                        <strong>{money(quote.amountDueAtPickup)}</strong>
                      </div>
                      <small>
                        Báo giá có hiệu lực đến: {quote.expiresAt} · {quote.policy}
                      </small>
                      <PolicyDetails title="Chính sách trả trễ và cọc">
                        <p className="inline-note">{lateReturnPolicyText(quote, apiMode)}</p>
                      </PolicyDetails>
                    </div>
                  )}
                </div>
              )}
              {step === 1 && (
                <div className="form-stack">
                  {apiMode && !customerAuthenticated && (
                    <Feedback tone="info" title="Đăng nhập để gửi yêu cầu">
                      Lựa chọn và thông tin đã nhập được giữ lại. Giá sẽ được xác nhận lại sau khi đăng nhập.{' '}
                      <button type="button" className="text-button" onClick={() => continueToAuth('register')}>
                        Tạo tài khoản
                      </button>
                    </Feedback>
                  )}
                  <div className="two-fields">
                    <Field
                      label="Tên liên hệ"
                      placeholder="Ví dụ: Nguyễn An"
                      autoComplete="name"
                      value={draft.name}
                      onChange={(event) => update('name', event.target.value)}
                      error={issue && !draft.name.trim() ? 'Nhập tên người thuê.' : undefined}
                    />
                    <Field
                      label="Số điện thoại"
                      placeholder="09xx xxx xxx"
                      type="tel"
                      autoComplete="tel"
                      value={draft.phone}
                      onChange={(event) => update('phone', event.target.value)}
                      error={
                        issue && !isValidPhone(draft.phone)
                          ? 'Nhập số điện thoại hợp lệ.'
                          : undefined
                      }
                    />
                  </div>
                  {apiMode && customerAuthenticated && (
                    <p className="inline-note">Liên hệ này chỉ áp dụng cho yêu cầu đang gửi.</p>
                  )}
                  <TextAreaField
                    label="Ghi chú cho studio (không bắt buộc)"
                    rows={4}
                    placeholder="Thông tin cần lưu ý khi nhận đồ"
                    value={draft.note}
                    onChange={(event) => update('note', event.target.value)}
                  />
                </div>
              )}
              {step === 1 && (
                <div className="confirm-summary">
                  <h3>Phiếu tạm tính</h3>
                  <div>
                    <span>Trang phục · {totalQuantity} bộ</span>
                    <strong>{summaryLines.map((line) => `${line.name} · ${line.variant} × ${line.quantity}`).join('; ')}</strong>
                  </div>
                  <div>
                    <span>Chi nhánh</span>
                    <strong>{draft.branch}</strong>
                  </div>
                  <div>
                    <span>Nhận / trả</span>
                    <strong>
                      {formatLocalDateTime(draft.pickup)} → {formatLocalDateTime(draft.returnAt)}
                    </strong>
                  </div>
                  <div>
                      <span>Liên hệ</span>
                    <strong>
                      {draft.name} · {draft.phone}
                    </strong>
                  </div>
                  <div>
                    <span>Tiền thuê / cọc</span>
                    <strong>
                      {money(quote?.rental ?? 0)} / {money(quote?.deposit ?? 0)}
                    </strong>
                  </div>
                  {quote?.promotionCode && (
                    <div>
                      <span>Mã ưu đãi / tiền giảm</span>
                      <strong>
                        {quote.promotionCode} · {money(quote.discount)}
                      </strong>
                    </div>
                  )}
                  <div>
                    <span>Tổng dự kiến khi nhận đồ</span>
                    <strong>{money(quote?.amountDueAtPickup ?? 0)}</strong>
                  </div>
                  <PolicyDetails title="Chính sách trả trễ, cọc và hủy đơn">
                    <p className="inline-note">{lateReturnPolicyText(quote, apiMode)}</p>
                    <p className="inline-note">
                      Thông tin về phí hủy chưa có trong báo giá. Hãy liên hệ studio để xác nhận
                      trước khi gửi yêu cầu.
                    </p>
                  </PolicyDetails>
                  <Feedback
                    tone="warning"
                    title="Yêu cầu chưa giữ trang phục cho đến khi studio xác nhận."
                  >
                    Đây là số tiền dự kiến. Studio xác nhận đơn trước khi phát hành chứng từ và thu tiền.
                  </Feedback>
                </div>
              )}
            </>
          )}
          {issue && (
            <div ref={issueRef} tabIndex={-1}>
              <Feedback tone="danger" title="Chưa thể tiếp tục">
                {issue}
              </Feedback>
            </div>
          )}
          <div className="step-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setIssue('');
                if (step === 0) backToCatalog();
                else setStep(step - 1);
              }}
            >
              {step === 0 ? 'Về catalog' : 'Quay lại'}
            </Button>
            {step === 0 ? (
              <Button onClick={next} loading={busy} disabled={loading || !!error || scenario === 'empty' || !lines.length || quote?.available === false}>
                {quote ? 'Liên hệ & gửi' : 'Xem báo giá'} <Icon name="arrow" size={18} />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (apiMode && !customerAuthenticated) continueToAuth('login');
                  else void submit();
                }}
                loading={busy}
                disabled={!quote}
              >
                {apiMode && !customerAuthenticated ? 'Đăng nhập để gửi' : 'Gửi yêu cầu thuê'} <Icon name="arrow" size={18} />
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PolicyDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="policy-details">
      <summary>{title}</summary>
      <div className="policy-details-body">{children}</div>
    </details>
  );
}

function BookingSummaryContent({
  lines,
  branch,
  pickup,
  returnAt,
  quote,
  apiMode,
}: {
  lines: { name: string; variant: string; quantity: number }[];
  branch: string;
  pickup: string;
  returnAt: string;
  quote?: QuoteSnapshot;
  apiMode: boolean;
}) {
  return (
    <div className="sidebar-note">
      <span className="eyebrow">TÓM TẮT YÊU CẦU</span>
      <h3>{lines.length ? `${lines.reduce((sum, line) => sum + line.quantity, 0)} bộ đã chọn` : 'Chưa chọn mẫu'}</h3>
      {lines.map((line, index) => (
        <p key={`${line.name}-${index}`}>{line.name} · {line.variant} × {line.quantity}</p>
      ))}
      <div className="sidebar-divider" />
      <p>
        <Icon name="pin" size={16} /> {branch || 'Chưa chọn chi nhánh'}
      </p>
      <p>
        <Icon name="calendar" size={16} /> Nhận:{' '}
        {pickup ? formatLocalDateTime(pickup) : 'Chưa chọn'}
      </p>
      <p>
        <Icon name="calendar" size={16} /> Trả:{' '}
        {returnAt ? formatLocalDateTime(returnAt) : 'Chưa chọn'}
      </p>
      {quote ? (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-money">
            <span>Tiền thuê</span>
            <strong>{money(quote.rental)}</strong>
          </div>
          <div className="sidebar-money">
            <span>Tiền cọc</span>
            <strong>{money(quote.deposit)}</strong>
          </div>
          {quote.promotionCode && (
            <div className="sidebar-money">
              <span>Giảm giá · {quote.promotionCode}</span>
              <strong>−{money(quote.discount)}</strong>
            </div>
          )}
          <div className="sidebar-money">
            <span>Dự kiến thu khi nhận</span>
            <strong>{money(quote.amountDueAtPickup)}</strong>
          </div>
          <small>Chưa thu tiền · Báo giá {apiMode ? 'từ hệ thống' : 'xem thử'}</small>
        </>
      ) : (
        <small>Chưa có báo giá cho lựa chọn hiện tại.</small>
      )}
    </div>
  );
}
