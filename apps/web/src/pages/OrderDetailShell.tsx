import { useEffect, useRef, useState } from 'react';
import type { Navigate } from '../App';
import {
  Button,
  EmptyState,
  Feedback,
  Field,
  Icon,
  MoneyBreakdown,
  SelectField,
  StatusLabel,
  TextAreaField,
} from '../components/ui';
import { money, orderStatus } from '../components/support';
import { useFixtureResource } from '../components/useFixtureResource';
import { branches, fixtureAdapter, returnSnapshots } from '../fixtures/adapter';
import type { DemoScenario, Order } from '../fixtures/types';
import {
  ApiClientError,
  apiEnabled,
  getOrderSettlement,
  hasAccessToken,
  listOrderPayments,
  pickupOrder as pickupApiOrder,
  recordBankTransferPayment,
  recordCashPayment,
  returnOrder as returnApiOrder,
  validatePickupOrder,
  type SettlementSnapshot,
  uploadRentalEvidence,
} from '../api/client';

function parseVndAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function settlementMoney(value: unknown): string {
  const amount = parseVndAmount(value);
  return amount === null ? 'Chưa có dữ liệu' : money(amount);
}

const loadOrders = (scenario: DemoScenario) => fixtureAdapter.listOrders(scenario);

export function OrderDetailShell({
  scenario,
  mode,
  go,
  initialOrderId,
  initialBranch,
  canReadPayments = true,
  canCollectPayments = true,
}: {
  scenario: DemoScenario;
  mode: 'handover' | 'return';
  go: Navigate;
  initialOrderId: string;
  initialBranch: string;
  canReadPayments?: boolean;
  canCollectPayments?: boolean;
}) {
  const realApiMode = apiEnabled && hasAccessToken();
  const [branch, setBranch] = useState(initialBranch);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [barcode, setBarcode] = useState('');
  const [matchedCode, setMatchedCode] = useState('');
  const [matchedCodes, setMatchedCodes] = useState<string[]>([]);
  const [scanIssue, setScanIssue] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [returnConditions, setReturnConditions] = useState<
    Record<string, 'PASSED' | 'PENDING_ASSESSMENT' | 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED'>
  >({});
  const [repairBlockedUntil, setRepairBlockedUntil] = useState<Record<string, string>>({});
  const [returnAccessories, setReturnAccessories] = useState<
    Record<string, { quantityReturned: string; conditionIn: string }>
  >({});
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [rentPreview, setRentPreview] = useState(false);
  const [depositPreview, setDepositPreview] = useState(false);
  const [note, setNote] = useState('');
  const [transactionReferences, setTransactionReferences] = useState({ rental: '', deposit: '' });
  const [evidenceFiles, setEvidenceFiles] = useState<Record<string, File[]>>({});
  const evidenceCache = useRef(new Map<string, { files: File[]; evidence: Awaited<ReturnType<typeof uploadRentalEvidence>>[] }>());
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationIssue, setOperationIssue] = useState('');
  const [operationIssueCode, setOperationIssueCode] = useState('');
  const [settlementResource, setSettlementResource] = useState<
    | { orderId: string; status: 'loading' }
    | { orderId: string; status: 'success'; snapshot: SettlementSnapshot }
    | { orderId: string; status: 'error'; message: string }
  >();
  const [result, setResult] = useState<{ text: string; signature: string } | null>(null);
  const { loading, data, error, retry } = useFixtureResource(scenario, loadOrders);
  const eligible = (data ?? []).filter(
    (entry) =>
      entry.branch === branch &&
      (mode === 'handover'
        ? entry.status === 'READY_FOR_PICKUP'
        : ['ACTIVE', 'RETURN_INSPECTION'].includes(entry.status)),
  );
  const order: Order | undefined = eligible.find((entry) => entry.id === orderId);
  const activeOrderId = order?.id;
  const settlementRequestEnabled = realApiMode && !!activeOrderId && canReadPayments;
  const currentSettlementResource = settlementRequestEnabled && settlementResource?.orderId === activeOrderId
    ? settlementResource
    : undefined;
  const backendSettlement = currentSettlementResource?.status === 'success'
    ? currentSettlementResource.snapshot
    : undefined;
  const settlementLoading = settlementRequestEnabled &&
    (!currentSettlementResource || currentSettlementResource.status === 'loading');
  const settlementError = currentSettlementResource?.status === 'error'
    ? currentSettlementResource.message
    : '';
  const rental = order?.money.find((line) => line.label === 'Tiền thuê');
  const deposit = order?.money.find((line) => line.label === 'Tiền cọc');
  const settlement = realApiMode ? undefined : order ? returnSnapshots[order.id] : undefined;
  const returnableItems = mode === 'return' && realApiMode
    ? (order?.items ?? []).filter((item) => ['ACTIVE', 'CONFIRMED'].includes(item.apiAllocationStatus ?? ''))
    : order?.items ?? [];
  const operationItems = mode === 'return' ? returnableItems : order?.items ?? [];
  const scannedItems = operationItems.filter((item) => !!item.unitCode && matchedCodes.includes(item.unitCode));
  const allReturnItemsScanned = !!order && (
    order.status === 'RETURN_INSPECTION' || scannedItems.length === returnableItems.length
  );
  const requiresChecks = order
    ? (mode === 'return' ? scannedItems : order.items).flatMap((item) =>
        mode === 'return'
          ? [`${item.id}-accessories`]
          : [`${item.id}-condition`, `${item.id}-accessories`],
      )
    : [];
  const accessoryReviewComplete = !realApiMode || mode !== 'return' || scannedItems.every((item) =>
    (item.accessories ?? []).every((accessory) => {
      if (!accessory.id) return false;
      const review = returnAccessories[`${item.id}:${accessory.id}`];
      if (!review || review.quantityReturned.trim() === '') return false;
      const quantity = Number(review.quantityReturned);
      return Number.isInteger(quantity) && quantity >= 0 && quantity <= accessory.quantityOut &&
        (quantity === 0 || !!review.conditionIn);
    }),
  );
  const accessoryNeedsAssessment = realApiMode && mode === 'return' && scannedItems.some((item) =>
    (item.accessories ?? []).some((accessory) => {
      const review = returnAccessories[`${item.id}:${accessory.id}`];
      return !!review && Number(review.quantityReturned) < accessory.quantityOut ||
        (!!review?.conditionIn && ['FAIR', 'POOR', 'DAMAGED'].includes(review.conditionIn));
    }),
  );
  const repairScheduleComplete = !realApiMode || mode !== 'return' || scannedItems.every((item) => {
    if (!['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')) return true;
    const value = repairBlockedUntil[item.id];
    return !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
  });
  const allChecked =
    requiresChecks.length > 0 &&
    requiresChecks.every((key) => checks[key]) &&
    (mode === 'handover' || scannedItems.every((item) => !!returnConditions[item.id])) &&
    accessoryReviewComplete && repairScheduleComplete;
  const needsAssessment =
    mode === 'return' &&
    (accessoryNeedsAssessment || scannedItems.some((item) =>
      realApiMode
        ? ['FAIR', 'POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
        : returnConditions[item.id] === 'PENDING_ASSESSMENT',
    ));
  const needsAssessmentNote = needsAssessment && !note.trim();
  const evidenceItems = mode === 'handover' ? order?.items ?? [] : scannedItems;
  const allEvidenceSelected =
    !realApiMode || evidenceItems.every((item) => (evidenceFiles[item.id]?.length ?? 0) > 0);
  const backendReturnReady = realApiMode && mode === 'return' && order?.status === 'RETURN_INSPECTION';
  const settlementReady = realApiMode ? !!backendSettlement : !!settlement;
  const settlementAmountsValid =
    !!backendSettlement &&
    [
      backendSettlement.rental.dueVnd,
      backendSettlement.rental.paidVnd,
      backendSettlement.rental.remainingVnd,
      backendSettlement.deposit.dueVnd,
      backendSettlement.deposit.paidVnd,
      backendSettlement.deposit.remainingVnd,
      backendSettlement.deposit.deductionVnd,
      backendSettlement.deposit.refundedVnd,
      backendSettlement.deposit.refundAvailableVnd ??
        backendSettlement.deposit.refundRemainingVnd,
      backendSettlement.extra.remainingVnd,
      backendSettlement.outstandingVnd,
    ].every((value) => parseVndAmount(value) !== null);
  const rentalRemaining = realApiMode
    ? (parseVndAmount(backendSettlement?.rental.remainingVnd) ?? 0)
    : (rental?.amount ?? 0);
  const depositRemaining = realApiMode
    ? (parseVndAmount(backendSettlement?.deposit.remainingVnd) ?? 0)
    : (deposit?.amount ?? 0);
  const pendingRental = (order?.apiPayments ?? []).some((payment) =>
    payment.purpose === 'RENTAL' && ['PENDING', 'PROCESSING'].includes(payment.status),
  );
  const pendingDeposit = (order?.apiPayments ?? []).some((payment) =>
    payment.purpose === 'DEPOSIT' && ['PENDING', 'PROCESSING'].includes(payment.status),
  );
  const pendingCollection = pendingRental || pendingDeposit;
  const handoverPaymentReady = !realApiMode || (
    canReadPayments && settlementAmountsValid && !settlementLoading && !settlementError && !pendingCollection
  );
  const cashChecksComplete = (rentalRemaining <= 0 || rentPreview) && (depositRemaining <= 0 || depositPreview);
  const bankReferencesComplete =
    (rentalRemaining <= 0 || !!transactionReferences.rental.trim()) &&
    (depositRemaining <= 0 || !!transactionReferences.deposit.trim());
  const backendSettlementCanComplete =
    settlementAmountsValid && backendSettlement?.canComplete === true;
  const snapshotConditionMismatch =
    mode === 'return' &&
    !!settlement &&
    allReturnItemsScanned &&
    allChecked &&
    scannedItems.every((item) => ['PASSED', 'NEW', 'GOOD'].includes(returnConditions[item.id] ?? '')) &&
    (settlement.damageFee > 0 || settlement.missingFee > 0);
  const refreshSettlement = async () => {
    if (!settlementRequestEnabled || !activeOrderId) return;
    const targetOrderId = activeOrderId;
    setSettlementResource({ orderId: targetOrderId, status: 'loading' });
    try {
      const snapshot = await getOrderSettlement(targetOrderId);
      if (orderId === targetOrderId)
        setSettlementResource({ orderId: targetOrderId, status: 'success', snapshot });
    } catch (caught: unknown) {
      if (orderId === targetOrderId)
        setSettlementResource({
          orderId: targetOrderId,
          status: 'error',
          message: caught instanceof Error ? caught.message : 'Không tải được quyết toán.',
        });
    }
  };
  useEffect(() => {
    if (!settlementRequestEnabled || !activeOrderId) return;
    let active = true;
    void getOrderSettlement(activeOrderId)
      .then((snapshot) => {
        if (active) setSettlementResource({ orderId: activeOrderId, status: 'success', snapshot });
      })
      .catch((caught: unknown) => {
        if (active)
          setSettlementResource({
            orderId: activeOrderId,
            status: 'error',
            message: caught instanceof Error ? caught.message : 'Không tải được quyết toán.',
          });
      });
    return () => {
      active = false;
    };
  }, [activeOrderId, settlementRequestEnabled]);
  const onOrderChange = (id: string) => {
    setOrderId(id);
    setBarcode('');
    setMatchedCode('');
    setMatchedCodes([]);
    setChecks({});
    setReturnConditions({});
    setRepairBlockedUntil({});
    setReturnAccessories({});
    setRentPreview(false);
    setDepositPreview(false);
    setNote('');
    setTransactionReferences({ rental: '', deposit: '' });
    setEvidenceFiles({});
    setOperationIssue('');
    setOperationIssueCode('');
    setSettlementResource(undefined);
    setScanIssue('');
    setResult(null);
    if (id)
      window.history.replaceState(
        null,
        '',
        `/van-hanh/don-thue/${encodeURIComponent(id)}/${mode === 'handover' ? 'giao' : 'tra'}`,
      );
  };
  const lookup = async () => {
    setScanBusy(true);
    setScanIssue('');
    setMatchedCode('');
    setResult(null);
    try {
      const normalizedBarcode = barcode.trim().toUpperCase();
      const hit = realApiMode
        ? (() => {
            const hitOrder = (data ?? []).find((entry) =>
              entry.items.some((item) => item.unitCode === normalizedBarcode),
            );
            if (!hitOrder) throw new ApiClientError(404, 'BARCODE_NOT_FOUND', 'Không tìm thấy mã bộ trong dữ liệu đơn đang tải.');
            return {
              order: hitOrder,
              itemIndex: hitOrder.items.findIndex((item) => item.unitCode === normalizedBarcode),
            };
          })()
        : await fixtureAdapter.lookupBarcode(barcode, branch, scenario);
      if (hit.order.branch !== branch) {
        setScanIssue(
          `Mã ${barcode.toUpperCase()} thuộc ${hit.order.branch}, không thuộc chi nhánh đang mở. Chưa ghi nhận giao/trả.`,
        );
      } else if (hit.order.id !== order?.id) {
        setScanIssue(
          `Mã ${barcode.toUpperCase()} thuộc đơn ${hit.order.id}, không khớp đơn ${order?.id}. Chưa ghi nhận giao/trả.`,
        );
      } else {
        const hitItem = hit.order.items[hit.itemIndex];
        const code = hitItem.unitCode ?? '';
        if (mode === 'return' && realApiMode && !['ACTIVE', 'CONFIRMED'].includes(hitItem.apiAllocationStatus ?? '')) {
          setScanIssue(`Bộ ${code} đã được ghi nhận trả trước đó, không cần quét lại.`);
        } else {
          setMatchedCode(code);
          setMatchedCodes((current) => (current.includes(code) ? current : [...current, code]));
        }
      }
    } catch (caught) {
      setScanIssue(caught instanceof Error ? caught.message : 'Chưa tra cứu được mã bộ.');
    } finally {
      setScanBusy(false);
    }
  };
  const restricted =
    ['permission', 'version', 'cancelled', 'conflict', 'unitBlocked'].includes(scenario) ||
    (mode === 'return' && scenario === 'refundFailed' && order?.id === 'RT-1033');
  const effectiveMethod = scenario === 'bankPending' ? 'BANK_TRANSFER' : method;
  const allScanned =
    !!order && order.items.every((item) => !!item.unitCode && matchedCodes.includes(item.unitCode));
  const scannedEnough = mode === 'handover' ? allScanned : scannedItems.length > 0;
  const previewSignature = JSON.stringify([
    scenario,
    mode,
    branch,
    order?.id,
    order?.version,
    matchedCodes,
    checks,
    returnConditions,
    repairBlockedUntil,
    transactionReferences,
    effectiveMethod,
    rentPreview,
    depositPreview,
    note,
  ]);
  const previewHandover = () => {
    if (
      !order ||
      !allScanned ||
      !allChecked ||
      !rentPreview ||
      !depositPreview ||
      effectiveMethod !== 'CASH' ||
      restricted
    )
      return;
    setResult({
      text: 'Checklist và tiền mặt đã đủ trong bản xem trước. Chỉ backend mới có thể xác nhận giao, thu tiền và chuyển đơn sang Đang thuê. Chưa có thay đổi nào được lưu.',
      signature: previewSignature,
    });
  };
  const previewReturn = () => {
    if (!order || !scannedEnough || !allChecked || needsAssessmentNote || restricted) return;
    setResult({
      text: needsAssessment
        ? `Đã xem trước nhận ${scannedItems.length}/${returnableItems.length} bộ có vấn đề cần đánh giá. Ghi chú được giữ trong phiên demo; cọc vẫn đang giữ, chưa tính phí hoặc hoàn tiền. Backend cần tạo biên bản PENDING_ASSESSMENT và phân công xử lý.`
        : order.status === 'ACTIVE'
          ? scannedItems.length < returnableItems.length
            ? `Đã xem trước nhận ${scannedItems.length}/${returnableItems.length} bộ còn ở khách. Các bộ đã nhận lần trước không cần quét lại; chưa quyết toán hoặc hoàn cọc.`
            : 'Đã xem trước kết quả kiểm tra. Backend cần ghi nhận trả để chuyển đơn sang Đang kiểm tra đồ trả; chưa hoàn cọc.'
          : 'Đã xem trước quyết toán. Backend cần xác nhận cấn trừ, hoàn cọc và điều kiện hoàn tất; bản demo chưa ghi giao dịch.',
      signature: previewSignature,
    });
  };
  const uploadEvidence = async (itemId: string, phase: 'PICKUP' | 'RETURN') => {
    const files = evidenceFiles[itemId] ?? [];
    if (files.length === 0) throw new ApiClientError(400, 'EVIDENCE_REQUIRED', 'Mỗi bộ cần ít nhất một ảnh bằng chứng.');
    const cacheKey = `${order?.id ?? orderId}:${itemId}:${phase}`;
    const cached = evidenceCache.current.get(cacheKey);
    if (cached && cached.files.length === files.length && cached.files.every((file, index) => file === files[index]))
      return cached.evidence;
    const evidence = await Promise.all(files.slice(0, 10).map((file) => uploadRentalEvidence(itemId, phase, file)));
    evidenceCache.current.set(cacheKey, { files: files.slice(0, 10), evidence });
    return evidence;
  };
  const ensurePayment = async (
    purpose: 'RENTAL' | 'DEPOSIT',
    amount: number,
    transactionRef?: string,
  ) => {
    if (amount <= 0) return;
    const existing = (await listOrderPayments(order?.id ?? '')).filter((payment) => payment.purpose === purpose);
    const pending = existing.some((payment) => payment.status === 'PENDING' || payment.status === 'PROCESSING');
    if (pending)
      throw new ApiClientError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Có khoản thu đang chờ xác minh. Đối soát giao dịch trước khi thử lại.');
    const paid = existing
      .filter((payment) => ['SUCCEEDED', 'PAID'].includes(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amountVnd), 0);
    const remaining = Math.max(0, Math.round(amount) - paid);
    if (remaining <= 0) return;
    if (effectiveMethod === 'CASH') await recordCashPayment(order?.id ?? '', purpose, remaining);
    else await recordBankTransferPayment(order?.id ?? '', purpose, remaining, transactionRef ?? '');
  };
  const performHandover = async () => {
    if (!realApiMode) {
      previewHandover();
      return;
    }
    if (!order || !allScanned || !allChecked || !allEvidenceSelected || !canCollectPayments || !handoverPaymentReady || restricted) return;
    if (effectiveMethod === 'BANK_TRANSFER' && !bankReferencesComplete) {
      setOperationIssue('Nhập mã giao dịch riêng cho từng khoản còn phải thu trước khi xác nhận.');
      return;
    }
    setOperationBusy(true);
    setOperationIssue('');
    setOperationIssueCode('');
    setResult(null);
    try {
      await validatePickupOrder(order.id, order.version);
      const evidence = await Promise.all(
        order.items.map(async (item) => ({
          orderItemId: item.id,
          conditionGrade: 'GOOD' as const,
          conditionNotes: note.trim() || undefined,
          evidence: await uploadEvidence(item.id, 'PICKUP'),
        })),
      );
      await ensurePayment('RENTAL', parseVndAmount(backendSettlement?.rental.dueVnd) ?? rental?.amount ?? 0, transactionReferences.rental.trim());
      await ensurePayment('DEPOSIT', parseVndAmount(backendSettlement?.deposit.dueVnd) ?? deposit?.amount ?? 0, transactionReferences.deposit.trim());
      await pickupApiOrder(order.id, order.version, evidence);
      setResult({
        text: 'Đã ghi nhận bằng chứng, thanh toán và giao trang phục. Đơn đã được chuyển sang trạng thái đang thuê.',
        signature: previewSignature,
      });
      retry();
    } catch (caught) {
      const code = caught instanceof ApiClientError ? caught.code : '';
      setOperationIssueCode(code);
      retry();
      void refreshSettlement();
      if (code === 'ORDER_VERSION_CONFLICT' || code === 'INVALID_ORDER_TRANSITION') {
        setMatchedCodes([]);
        setMatchedCode('');
        setChecks({});
        setEvidenceFiles({});
      }
      setOperationIssue(
        code === 'UNIT_STILL_WITH_CUSTOMER'
          ? 'Không thể giao: bộ vẫn đang ở khách trước hoặc chưa được xác nhận trả. Mọi khoản đã ghi nhận vẫn nằm trên đơn; hãy mở đơn để phân công bộ READY khác.'
          : code === 'UNIT_NOT_READY'
            ? 'Bộ được phân công chưa sẵn sàng tại chi nhánh. Các khoản đã ghi nhận vẫn nằm trên đơn; mở đơn để kiểm tra trạng thái và chọn bộ READY khác.'
            : caught instanceof Error
              ? caught.message
              : 'Không thể hoàn tất giao trang phục.',
      );
    } finally {
      setOperationBusy(false);
    }
  };
  const performReturn = async () => {
    if (!realApiMode) {
      previewReturn();
      return;
    }
    if (!order || !scannedEnough || !allChecked || !allEvidenceSelected || restricted) return;
    if (order.status !== 'ACTIVE') {
      setOperationIssue('Đơn đã ở bước kiểm tra/quyết toán. Không gửi lại thao tác nhận trả; hãy xử lý biên bản và hoàn cọc theo quyền được cấp.');
      return;
    }
    setOperationBusy(true);
    setOperationIssue('');
    setResult(null);
    try {
      const items = await Promise.all(
        scannedItems.map(async (item) => ({
          orderItemId: item.id,
          returnConditionGrade: (['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
            ? returnConditions[item.id]
            : returnConditions[item.id] === 'PENDING_ASSESSMENT' ? 'FAIR' : 'GOOD') as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED',
          isMissing: false,
          damageNotes: needsAssessment ? note.trim() : undefined,
          nextOperationalStatus: ['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '') ? 'REPAIR' as const : 'CLEANING' as const,
          repairBlockedUntil: ['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
            ? new Date(repairBlockedUntil[item.id]).toISOString()
            : undefined,
          evidence: await uploadEvidence(item.id, 'RETURN'),
          accessories: (item.accessories ?? []).map((accessory) => {
            const review = returnAccessories[`${item.id}:${accessory.id}`];
            const quantityReturned = Number(review?.quantityReturned);
            return {
              accessoryId: accessory.id,
              quantityReturned,
              conditionIn: quantityReturned > 0 ? review?.conditionIn as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED' : null,
            };
          }),
        })),
      );
      await returnApiOrder(order.id, order.version, scannedItems.length < returnableItems.length, note.trim(), items);
      setResult({
        text:
          scannedItems.length < returnableItems.length
            ? `Đã ghi nhận trả ${scannedItems.length}/${returnableItems.length} bộ còn ở khách. Cọc vẫn được giữ để xử lý phần còn lại hoặc quyết toán.`
            : 'Đã ghi nhận trả đủ bộ. Đơn đang chờ kiểm tra và quyết toán cọc theo quy trình.',
        signature: previewSignature,
      });
      retry();
    } catch (caught) {
      const code = caught instanceof ApiClientError ? caught.code : '';
      setOperationIssueCode(code);
      if (code === 'ORDER_VERSION_CONFLICT' || code === 'INVALID_ORDER_TRANSITION') {
        setMatchedCodes([]);
        setMatchedCode('');
        setChecks({});
        setReturnConditions({});
        setReturnAccessories({});
        setRepairBlockedUntil({});
        setEvidenceFiles({});
      }
      retry();
      void refreshSettlement();
      setOperationIssue(caught instanceof Error ? caught.message : 'Không thể hoàn tất nhận trả.');
    } finally {
      setOperationBusy(false);
    }
  };
  return (
    <div className="page staff-page task-page">
      <div className="staff-page-heading">
        <div>
          <p className="eyebrow">
            {mode === 'handover' ? 'UI-09 · GIAO TRANG PHỤC' : 'UI-11 · NHẬN TRẢ TRANG PHỤC'}
          </p>
          <h1>{mode === 'handover' ? 'Giao trang phục' : 'Nhận trả trang phục'}</h1>
          <p>
            {mode === 'handover'
              ? 'Đối chiếu từng bộ và từng khoản thu trước khi giao.'
              : 'Kiểm từng bộ, đối chiếu phí và quyết toán cọc.'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => go('orders', { order: order?.id ?? orderId })}>
          <Icon name="arrow" size={17} /> Về đơn thuê
        </Button>
      </div>
      <div className="task-toolbar">
        {!realApiMode && (
          <SelectField
            label="Chi nhánh thao tác"
            value={branch}
            onChange={(event) => {
              setBranch(event.target.value);
              onOrderChange('');
            }}
          >
            {branches.map((entry) => <option key={entry}>{entry}</option>)}
          </SelectField>
        )}
        <SelectField
          label="Đơn đang xử lý"
          value={order?.id ?? ''}
          onChange={(event) => onOrderChange(event.target.value)}
        >
          <option value="">{eligible.length === 0 ? 'Không có đơn' : 'Chọn đơn'}</option>
          {eligible.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id} · {entry.customer}
            </option>
          ))}
        </SelectField>
      </div>
      {order && (
        <nav className="task-jump-nav" aria-label="Các bước xử lý đơn">
          <a href="#task-scan">
            1. Quét mã · {matchedCodes.length}/{operationItems.length}
          </a>
          <a href="#task-check">2. Kiểm tình trạng</a>
          <a href="#task-money">3. {mode === 'handover' ? 'Thu tiền' : 'Quyết toán'}</a>
        </nav>
      )}
      {scenario === 'permission' && (
        <Feedback tone="danger" title="Bạn không còn quyền xử lý đơn tại chi nhánh này">
          Không gửi thao tác cũ. Chuyển chi nhánh có quyền hoặc về tổng quan.
        </Feedback>
      )}
      {scenario === 'cancelled' && (
        <Feedback tone="danger" title="Đơn đã hủy trong lúc bạn thao tác">
          Mở lịch sử đơn và về hàng đợi; không giao hoặc nhận trả theo dữ liệu cũ.
        </Feedback>
      )}
      {scenario === 'version' && (
        <Feedback tone="warning" title="Đơn đã thay đổi từ lúc bạn mở">
          Kiểm tra phiên bản và trạng thái mới trước khi tiếp tục. Checklist chưa gửi vẫn được giữ.
        </Feedback>
      )}
      {scenario === 'conflict' && (
        <Feedback tone="warning" title="Bộ vừa thay đổi khả dụng">
          Mã bộ cần được kiểm tra lại trên đơn; không tự thay bộ và không ghi giao/trả.
        </Feedback>
      )}
      {scenario === 'unitBlocked' && (
        <Feedback tone="warning" title="Bộ đang vệ sinh hoặc sửa chữa">
          Bộ chưa sẵn sàng cho giao/nhận tiếp theo. Báo quản lý hoặc chọn bộ/kỳ khác trên đơn.
        </Feedback>
      )}
      {error && (
        <Feedback
          tone="danger"
          title="Không tải được đơn"
          action={
            <Button variant="secondary" onClick={retry}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Feedback>
      )}
      {loading && (
        <div className="task-skeleton">
          <div className="shimmer" />
          <div className="shimmer" />
        </div>
      )}
      {!loading && !error && !order && (
        <EmptyState
          title={
            orderId
              ? `Không tìm thấy đơn ${orderId} phù hợp tại ${branch}`
              : mode === 'handover'
                ? 'Chưa có đơn sẵn sàng giao tại chi nhánh này'
                : 'Chưa có đơn cần nhận trả tại chi nhánh này'
          }
          action={
            <Button variant="secondary" onClick={() => go('orders')}>
              Mở danh sách đơn
            </Button>
          }
        />
      )}
      {!loading && !error && order && (
        <div className="task-layout">
          <div className="task-main">
            <section className="task-order-card">
              <div className="task-order-top">
                <div>
                  <p className="eyebrow">ĐƠN ĐANG MỞ · {order.id}</p>
                  <h2>{order.customer}</h2>
                  <p>
                    {order.phone} · {order.branch}
                  </p>
                </div>
                <StatusLabel
                  text={orderStatus[order.status].text}
                  tone={orderStatus[order.status].tone}
                />
              </div>
              <div className="task-order-meta">
                <span>
                  <Icon name="calendar" size={17} /> Nhận: {order.pickup}
                </span>
                <span>
                  <Icon name="clock" size={17} /> Hẹn trả: {order.returnAt}
                </span>
              </div>
            </section>
            <section className="task-card" id="task-scan">
              <div className="task-card-heading">
                <span className="round-step">01</span>
                <div>
                  <p className="eyebrow">TRA CỨU BỘ VẬT LÝ</p>
                  <h2>Quét hoặc nhập barcode</h2>
                </div>
              </div>
              <p className="section-help">
                Quét chỉ tra cứu; không tự ghi nhận giao hoặc trả. Mã phải khớp đơn và chi nhánh
                đang mở.
              </p>
              <div className="scan-form">
                <Field
                  label="Barcode bộ trang phục"
                  placeholder={mode === 'handover' ? 'Ví dụ: BC-028' : 'Ví dụ: BC-031'}
                  value={barcode}
                  onChange={(event) => {
                    setBarcode(event.target.value);
                    setScanIssue('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void lookup();
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    void lookup();
                  }}
                  loading={scanBusy}
                >
                  <Icon name="scan" size={18} /> Tra cứu
                </Button>
              </div>
              {scanIssue && (
                <Feedback
                  tone="danger"
                  title={
                    scenario === 'barcodeOtherBranch'
                      ? 'Mã thuộc chi nhánh khác'
                      : 'Chưa tìm thấy bộ phù hợp'
                  }
                >
                  {scanIssue}
                </Feedback>
              )}
              {matchedCode && (
                <Feedback tone="success" title={`${matchedCode} khớp đơn ${order.id}`}>
                  <span>
                    {order.items.find((item) => item.unitCode === matchedCode)?.costume} ·{' '}
                    {order.items.find((item) => item.unitCode === matchedCode)?.variant} ·{' '}
                    {order.customer} · hạn trả {order.returnAt}
                  </span>
                </Feedback>
              )}
              <div className="expected-units">
                <span>Mã cần đối chiếu:</span>
                {operationItems.map((item) => (
                  <span
                    className={
                      'barcode-chip' +
                      (matchedCodes.includes(item.unitCode ?? '') ? ' scanned' : '')
                    }
                    key={item.id}
                  >
                    {matchedCodes.includes(item.unitCode ?? '') ? '✓ ' : ''}
                    {item.unitCode ?? 'Chưa gán mã'}
                  </span>
                ))}
              </div>
              {mode === 'return' && returnableItems.length > 0 && (
                <p className="section-help" role="status">
                  Đã quét {scannedItems.length}/{returnableItems.length} bộ còn ở khách. Bộ đã ghi nhận ở lần trước không cần quét lại;
                  cọc chỉ được quyết toán khi backend xác nhận điều kiện trả.
                </p>
              )}
            </section>
            <section className="task-card" id="task-check">
              <div className="task-card-heading">
                <span className="round-step">02</span>
                <div>
                  <p className="eyebrow">
                    {mode === 'handover' ? 'TRƯỚC KHI GIAO' : 'KHI NHẬN TRẢ'}
                  </p>
                  <h2>{mode === 'handover' ? 'Tình trạng và phụ kiện' : 'Kiểm tra từng bộ'}</h2>
                </div>
              </div>
              {operationItems.map((item) => (
                <div className="check-unit" key={item.id}>
                  <div className="check-unit-head">
                    <strong>
                      {item.costume} · {item.variant}
                    </strong>
                    <span>{item.unitCode}</span>
                  </div>
                  {mode === 'handover' && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        aria-label={`Kiểm tra tình trạng xuất ${item.unitCode ?? item.costume}`}
                        checked={!!checks[`${item.id}-condition`]}
                        disabled={!matchedCodes.includes(item.unitCode ?? '')}
                        onChange={(event) =>
                          setChecks((current) => ({
                            ...current,
                            [`${item.id}-condition`]: event.target.checked,
                          }))
                        }
                      />
                      <span>Đã kiểm tra tình trạng xuất của bộ</span>
                    </label>
                  )}
                  <label className="check-row">
                    <input
                      type="checkbox"
                      aria-label={`Đối chiếu phụ kiện ${item.unitCode ?? item.costume}`}
                      checked={!!checks[`${item.id}-accessories`]}
                      disabled={!matchedCodes.includes(item.unitCode ?? '')}
                      onChange={(event) =>
                        setChecks((current) => ({
                          ...current,
                          [`${item.id}-accessories`]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {mode === 'handover'
                        ? 'Đã đối chiếu phụ kiện thực giao'
                        : 'Đã đối chiếu phụ kiện thiếu/hỏng'}
                    </span>
                  </label>
                  {((mode === 'handover' && matchedCodes.includes(item.unitCode ?? '')) ||
                    (mode === 'return' && matchedCodes.includes(item.unitCode ?? ''))) && (
                    <label className="field file-field">
                      <span>Ảnh bằng chứng {realApiMode ? '(bắt buộc)' : '(tuỳ chọn)'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) =>
                          setEvidenceFiles((current) => ({
                            ...current,
                            [item.id]: Array.from(event.target.files ?? []).slice(0, 10),
                          }))
                        }
                      />
                      <small>
                        {(evidenceFiles[item.id]?.length ?? 0) > 0
                          ? `Đã chọn ${evidenceFiles[item.id]?.length ?? 0} ảnh`
                          : 'Chọn ảnh tình trạng thực tế của bộ'}
                      </small>
                    </label>
                  )}
                  {mode === 'return' && matchedCodes.includes(item.unitCode ?? '') && (
                    <>
                      <SelectField
                        label={`Tình trạng thực tế ${item.unitCode ?? item.costume}`}
                        value={returnConditions[item.id] ?? ''}
                        onChange={(event) =>
                          setReturnConditions((current) => ({
                            ...current,
                            [item.id]: event.target.value as 'PASSED' | 'PENDING_ASSESSMENT' | 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED',
                          }))
                        }
                      >
                        <option value="">Chọn tình trạng sau khi kiểm</option>
                        {realApiMode ? (
                          <>
                            <option value="NEW">Mới</option>
                            <option value="GOOD">Tốt, đủ điều kiện vệ sinh</option>
                            <option value="FAIR">Trầy xước / cần đánh giá</option>
                            <option value="POOR">Hư hỏng nặng / cần đánh giá</option>
                            <option value="DAMAGED">Hư hỏng / cần đánh giá</option>
                          </>
                        ) : (
                          <>
                            <option value="PASSED">Đạt · không thấy vấn đề</option>
                            <option value="PENDING_ASSESSMENT">Cần đánh giá hư hỏng hoặc thiếu</option>
                          </>
                        )}
                      </SelectField>
                      {realApiMode && ['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '') && (
                        <Field
                          label="Dự kiến sẵn sàng sau sửa chữa"
                          type="datetime-local"
                          value={repairBlockedUntil[item.id] ?? ''}
                          onChange={(event) => setRepairBlockedUntil((current) => ({ ...current, [item.id]: event.target.value }))}
                          error={repairBlockedUntil[item.id] && Date.parse(repairBlockedUntil[item.id]) <= Date.now()
                            ? 'Chọn thời điểm trong tương lai.'
                            : undefined}
                        />
                      )}
                      {realApiMode && (item.accessories ?? []).length > 0 && (
                        <div className="stack-form" aria-label="Đối chiếu phụ kiện trả">
                          <strong>Đếm phụ kiện thực nhận</strong>
                          {(item.accessories ?? []).map((accessory, index) => {
                            const key = `${item.id}:${accessory.id}`;
                            const review = returnAccessories[key] ?? { quantityReturned: '', conditionIn: '' };
                            return (
                              <div className="two-fields" key={key || index}>
                                <Field
                                  label={`${accessory.name || `Phụ kiện ${index + 1}`} · trả ${accessory.quantityOut}`}
                                  type="number"
                                  min={0}
                                  max={accessory.quantityOut}
                                  step={1}
                                  value={review.quantityReturned}
                                  onChange={(event) => setReturnAccessories((current) => ({
                                    ...current,
                                    [key]: { ...review, quantityReturned: event.target.value },
                                  }))}
                                  error={!accessory.id ? 'Thiếu mã phụ kiện từ máy chủ; chưa thể ghi nhận trả.' : undefined}
                                />
                                <SelectField
                                  label="Tình trạng phụ kiện"
                                  value={review.conditionIn}
                                  disabled={!review.quantityReturned || Number(review.quantityReturned) === 0}
                                  onChange={(event) => setReturnAccessories((current) => ({
                                    ...current,
                                    [key]: { ...review, conditionIn: event.target.value },
                                  }))}
                                >
                                  <option value="">Chọn tình trạng</option>
                                  <option value="NEW">Mới</option>
                                  <option value="GOOD">Tốt</option>
                                  <option value="FAIR">Trầy xước</option>
                                  <option value="POOR">Hư hỏng nặng</option>
                                  <option value="DAMAGED">Hỏng</option>
                                </SelectField>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              <TextAreaField
                label={
                  needsAssessment
                    ? 'Mô tả vấn đề cần đánh giá (bắt buộc)'
                    : 'Ghi chú tình trạng / lý do phí'
                }
                rows={3}
                required={needsAssessment}
                placeholder="Ghi lại điều cần xử lý; nội dung chỉ tồn tại trong phiên demo"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {needsAssessment && (
                <Feedback tone="warning" title="Chờ đánh giá, tiếp tục giữ cọc">
                  Ghi rõ dấu hiệu và bộ liên quan. Chưa chốt phí, cấn trừ hoặc hoàn cọc từ lựa chọn
                  này; cần biên bản và người xử lý ở backend.
                </Feedback>
              )}
              <p className="section-help">
                {realApiMode
                  ? 'Ảnh sẽ được tải lên kho lưu trữ của hệ thống và gắn với từng bộ khi xác nhận thao tác.'
                  : 'Ảnh bằng chứng chỉ là lựa chọn xem trước; khi có API, ảnh sẽ được gắn với từng bộ.'}
              </p>
            </section>
            <section className="task-card" id="task-money">
              <div className="task-card-heading">
                <span className="round-step">03</span>
                <div>
                  <p className="eyebrow">{mode === 'handover' ? 'THU TẠI QUẦY' : 'QUYẾT TOÁN'}</p>
                  <h2>
                    {mode === 'handover' ? 'Tiền thuê và tiền cọc' : 'Phí, cấn trừ và hoàn cọc'}
                  </h2>
                </div>
              </div>
              {mode === 'handover' ? (
                <>
                  {realApiMode && settlementLoading && (
                    <Feedback title="Đang tải số dư thanh toán">
                      Đang đối chiếu số phải thu, khoản đã ghi nhận và giao dịch chờ xác minh.
                    </Feedback>
                  )}
                  {realApiMode && settlementError && (
                    <Feedback tone="danger" title="Không tải được số dư thanh toán"
                      action={<Button variant="secondary" onClick={() => void refreshSettlement()}>Tải lại</Button>}>
                      {settlementError}
                    </Feedback>
                  )}
                  {realApiMode && !canReadPayments && (
                    <Feedback tone="warning" title="Bạn chưa có quyền xem khoản thu">
                      Cần quyền đọc thanh toán tại chi nhánh trước khi xác nhận giao đồ.
                    </Feedback>
                  )}
                  {realApiMode && pendingCollection && (
                    <Feedback tone="warning" title="Có khoản thu đang chờ đối soát">
                      Chưa thu lại hoặc giao đồ cho đến khi giao dịch được xác minh.
                    </Feedback>
                  )}
                  {realApiMode && !settlementLoading && !settlementError && canReadPayments && !settlementAmountsValid && (
                    <Feedback tone="danger" title="Số dư thanh toán chưa đầy đủ">
                      Không xác nhận giao đồ cho đến khi máy chủ trả đủ tiền thuê, cọc và số còn phải thu.
                      <Button variant="secondary" onClick={() => void refreshSettlement()}>Tải lại số dư</Button>
                    </Feedback>
                  )}
                  <SelectField
                    label={`Phương thức thu ${realApiMode ? '' : '(bản xem trước)'}`}
                    value={effectiveMethod}
                    disabled={scenario === 'bankPending' || (realApiMode && !canCollectPayments)}
                    onChange={(event) => {
                      setMethod(event.target.value as 'CASH' | 'BANK_TRANSFER');
                      setRentPreview(false);
                      setDepositPreview(false);
                    }}
                  >
                    <option value="CASH">Tiền mặt</option>
                    <option value="BANK_TRANSFER">Chuyển khoản</option>
                  </SelectField>
                  <div className="collection-table">
                    <div className="collection-head">
                      <span>Khoản</span>
                      <span>Cần thu</span>
                      <span>{realApiMode ? 'Đã ghi nhận' : 'Đánh dấu nhận (demo)'}</span>
                      <span>Còn thiếu</span>
                    </div>
                    <div>
                      <strong>Tiền thuê</strong>
                      <span>
                        <span className="collection-mobile-label">Cần thu</span>
                        {money(realApiMode ? parseVndAmount(backendSettlement?.rental.dueVnd) ?? 0 : rental?.amount ?? 0)}
                      </span>
                      <span>
                        <span className="collection-mobile-label">Đã đánh dấu nhận</span>
                        {realApiMode
                          ? settlementMoney(backendSettlement?.rental.paidVnd)
                          : effectiveMethod === 'CASH' && rentPreview ? money(rental?.amount ?? 0) : money(0)}
                      </span>
                      <span>
                        <span className="collection-mobile-label">Còn thiếu</span>
                        {realApiMode
                          ? settlementMoney(backendSettlement?.rental.remainingVnd)
                          : effectiveMethod === 'CASH' && rentPreview ? money(0) : money(rental?.amount ?? 0)}
                      </span>
                    </div>
                    <div>
                      <strong>Tiền cọc</strong>
                      <span>
                        <span className="collection-mobile-label">Cần thu</span>
                        {money(realApiMode ? parseVndAmount(backendSettlement?.deposit.dueVnd) ?? 0 : deposit?.amount ?? 0)}
                      </span>
                      <span>
                        <span className="collection-mobile-label">Đã đánh dấu nhận</span>
                        {realApiMode
                          ? settlementMoney(backendSettlement?.deposit.paidVnd)
                          : effectiveMethod === 'CASH' && depositPreview ? money(deposit?.amount ?? 0) : money(0)}
                      </span>
                      <span>
                        <span className="collection-mobile-label">Còn thiếu</span>
                        {realApiMode
                          ? settlementMoney(backendSettlement?.deposit.remainingVnd)
                          : effectiveMethod === 'CASH' && depositPreview ? money(0) : money(deposit?.amount ?? 0)}
                      </span>
                    </div>
                  </div>
                  {effectiveMethod === 'CASH' ? (
                    <div className="cash-checks">
                      <p className="section-help">
                        {realApiMode
                          ? 'Đánh dấu sau khi đã nhận đủ từng khoản tiền mặt tại quầy.'
                          : 'Chỉ xem trước việc đối chiếu tiền mặt; chưa ghi giao dịch hoặc giao bộ.'}
                      </p>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={rentPreview}
                          disabled={realApiMode && (!canCollectPayments || !handoverPaymentReady || rentalRemaining <= 0)}
                          onChange={(event) => setRentPreview(event.target.checked)}
                        />
                        <span>{realApiMode ? 'Đã nhận phần tiền thuê còn phải thu bằng tiền mặt' : 'Xem trước: đã nhận tiền thuê bằng tiền mặt'}</span>
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={depositPreview}
                          disabled={realApiMode && (!canCollectPayments || !handoverPaymentReady || depositRemaining <= 0)}
                          onChange={(event) => setDepositPreview(event.target.checked)}
                        />
                        <span>{realApiMode ? 'Đã nhận phần tiền cọc còn phải thu bằng tiền mặt' : 'Xem trước: đã nhận tiền cọc bằng tiền mặt'}</span>
                      </label>
                    </div>
                  ) : (
                    <>
                      {realApiMode && rentalRemaining > 0 && (
                        <Field
                          label="Mã giao dịch tiền thuê"
                          placeholder="Ví dụ: FT240930001"
                          value={transactionReferences.rental}
                          onChange={(event) => setTransactionReferences((current) => ({ ...current, rental: event.target.value }))}
                          required
                        />
                      )}
                      {realApiMode && depositRemaining > 0 && (
                        <Field
                          label="Mã giao dịch tiền cọc"
                          placeholder="Mã giao dịch riêng cho khoản cọc"
                          value={transactionReferences.deposit}
                          onChange={(event) => setTransactionReferences((current) => ({ ...current, deposit: event.target.value }))}
                          required
                        />
                      )}
                      <Feedback tone="warning" title="Chuyển khoản cần mã đối soát">
                        {realApiMode
                          ? 'Mỗi khoản thu chuyển khoản cần mã giao dịch riêng để đối soát. Chỉ nhập mã sau khi đã kiểm tra giao dịch thành công.'
                          : 'Chưa xác nhận tiền đã nhận. Kiểm tra giao dịch và chỉ ghi nhận sau đối soát; bản demo không kết nối ngân hàng.'}
                      </Feedback>
                    </>
                  )}
                  {scenario === 'bankPending' && (
                    <Feedback tone="warning" title="Giao dịch đang chờ xác minh">
                      Không đánh dấu Đã thu hoặc giao bộ cho đến khi đối soát xong.
                    </Feedback>
                  )}
                  {realApiMode && !canCollectPayments && (
                    <Feedback tone="warning" title="Bạn chưa có quyền thu tiền cho đơn này">
                      Cần quyền đọc và thu tiền tại chi nhánh nhận đồ. Liên hệ quản trị viên để được phân quyền.
                    </Feedback>
                  )}
                </>
              ) : (
                <>
                  {realApiMode && !canReadPayments && (
                    <Feedback tone="warning" title="Bạn chưa có quyền xem quyết toán">
                      Số tiền và trạng thái hoàn cọc chỉ hiển thị cho nhân viên có quyền đọc thanh toán tại chi nhánh.
                    </Feedback>
                  )}
                  {realApiMode && settlementLoading && (
                    <Feedback title="Đang tải quyết toán từ máy chủ">
                      Đang đối chiếu khoản đã thu, cấn trừ và trạng thái hoàn cọc.
                    </Feedback>
                  )}
                  {realApiMode && settlementError && (
                    <Feedback tone="danger" title="Không tải được quyết toán">
                      {settlementError}
                    </Feedback>
                  )}
                  {realApiMode && backendSettlement && (
                    <>
                      <div className="settlement-table">
                        <div>
                          <span>Cọc phải thu</span>
                          <strong>{settlementMoney(backendSettlement.deposit.dueVnd)}</strong>
                        </div>
                        <div>
                          <span>Cọc đã cấn trừ</span>
                          <strong>{settlementMoney(backendSettlement.deposit.deductionVnd)}</strong>
                        </div>
                        <div>
                          <span>Đã hoàn / còn có thể hoàn</span>
                          <strong>
                            {settlementMoney(backendSettlement.deposit.refundedVnd)} /{' '}
                            {settlementMoney(backendSettlement.deposit.refundAvailableVnd ?? backendSettlement.deposit.refundRemainingVnd)}
                          </strong>
                        </div>
                        <div>
                          <span>Còn phải thu khác</span>
                          <strong>{settlementMoney(backendSettlement.extra.remainingVnd)}</strong>
                        </div>
                        <div className="settlement-total">
                          <span>Trạng thái máy chủ</span>
                          <strong>{backendSettlement.status}</strong>
                        </div>
                      </div>
                      <Feedback
                        tone={
                          !settlementAmountsValid
                            ? 'warning'
                            : backendSettlementCanComplete
                              ? 'success'
                              : 'info'
                        }
                        title={
                          !settlementAmountsValid
                            ? 'Thiếu dữ liệu quyết toán'
                            : backendSettlementCanComplete
                              ? 'Đủ điều kiện hoàn tất'
                              : 'Chưa đủ điều kiện hoàn tất'
                        }
                        action={
                          !settlementAmountsValid ? (
                            <Button
                              variant="secondary"
                              disabled={settlementLoading}
                              onClick={() => void refreshSettlement()}
                            >
                              {settlementLoading ? 'Đang tải...' : 'Tải lại quyết toán'}
                            </Button>
                          ) : undefined
                        }
                      >
                        {settlementAmountsValid ? (
                          <>
                            Còn phải thu: {settlementMoney(backendSettlement.outstandingVnd)}. Việc hoàn cọc
                            qua SePay chỉ được thực hiện theo giao dịch và quyền được cấp; giao diện không
                            tự suy ra đã hoàn từ số dự kiến.
                          </>
                        ) : (
                          'Máy chủ chưa trả đủ hoặc trả sai dữ liệu tiền. Chưa thể xác nhận điều kiện hoàn tất; hãy tải lại sau khi dịch vụ quyết toán được cập nhật.'
                        )}
                      </Feedback>
                    </>
                  )}
                  {!realApiMode &&
                    settlement &&
                allReturnItemsScanned &&
                allChecked &&
                !needsAssessment && (
                  <>
                    <div className="settlement-table">
                      <div>
                        <span>Cọc đang giữ</span>
                        <strong>{money(settlement.heldDeposit)}</strong>
                      </div>
                      <div>
                        <span>Phí trễ / hỏng / thiếu</span>
                        <strong>
                          {money(settlement.lateFee)} / {money(settlement.damageFee)} /{' '}
                          {money(settlement.missingFee)}
                        </strong>
                      </div>
                      <div>
                        <span>Cấn trừ</span>
                        <strong>{money(settlement.offset)}</strong>
                      </div>
                      <div>
                        <span>Đã hoàn</span>
                        <strong>{money(settlement.refunded)}</strong>
                      </div>
                      <div className="settlement-total">
                        <span>Còn dự kiến hoàn</span>
                        <strong>{money(settlement.remainingRefund)}</strong>
                      </div>
                    </div>
                    <p className="section-help">
                      Đây là snapshot fixture. Phí và số hoàn thực tế phải do backend quyết toán;
                      giao diện không tự tính.
                    </p>
                    {snapshotConditionMismatch && (
                      <Feedback tone="warning" title="Kết quả kiểm khác snapshot phí">
                        Bộ được chọn là Đạt nhưng snapshot vẫn có phí hỏng hoặc thiếu. Đối chiếu
                        chứng từ trước khi quyết toán; giao diện không tự sửa số tiền.
                      </Feedback>
                    )}
                    {scenario === 'refundFailed' && (
                      <Feedback tone="danger" title="Hoàn cọc chưa thành công">
                        Giao dịch RF-DEMO-01 chưa hoàn tất. Giữ nguyên lịch sử refund; xem lý do và
                        thử lại theo quyền sau khi kiểm tra, tránh hoàn trùng.
                      </Feedback>
                    )}
                  </>
                )}
                </>
              )}
              {mode === 'return' &&
                !needsAssessment &&
                (!settlementReady || !allReturnItemsScanned || !allChecked) && (
                  <Feedback
                    title={
                      !allReturnItemsScanned
                        ? 'Chưa đối chiếu đủ barcode để xem quyết toán'
                        : !allChecked
                          ? 'Chưa hoàn tất kiểm từng bộ'
                          : 'Chưa có snapshot quyết toán'
                    }
                  >
                    {!allReturnItemsScanned
                      ? scannedItems.length === 0
                        ? 'Chưa quét bộ nào trong phiên này. Đối chiếu barcode trước khi xem số quyết toán; cọc vẫn đang giữ.'
                        : 'Còn barcode chưa quét trong phiên này. Theo dõi tình trạng từng bộ và tiếp tục giữ cọc; chưa dùng số dự kiến hoàn để chốt tiền.'
                      : !allChecked
                        ? 'Đối chiếu số lượng, tình trạng phụ kiện và chọn tình trạng thực tế cho từng bộ đã quét trước khi xem số tiền.'
                        : 'Cần backend trả số phí, cấn trừ và khoản còn hoàn từ chứng từ trước khi quyết toán.'}
                  </Feedback>
                )}
              {mode === 'return' && (
                <p className="section-help">
                  Phương thức hoàn cọc qua SePay chưa chốt. Chỉ hiển thị trạng thái giao dịch thực
                  tế; không suy ra đã hoàn từ số dự kiến hoàn.
                </p>
              )}
              {result?.signature === previewSignature && !restricted && (
                <Feedback tone="success" title={realApiMode ? 'Đã cập nhật đơn trên máy chủ' : 'Đã kiểm tra điều kiện trong phiên demo'}>
                  {result.text}
                </Feedback>
              )}
              {operationIssue && (
                <Feedback
                  tone="danger"
                  title="Chưa hoàn tất thao tác"
                  action={['ORDER_VERSION_CONFLICT', 'INVALID_ORDER_TRANSITION'].includes(operationIssueCode) ? (
                    <Button variant="secondary" onClick={() => {
                      retry();
                      void refreshSettlement();
                      setOperationIssue('');
                      setOperationIssueCode('');
                    }}>Tải lại đơn và quét lại</Button>
                  ) : undefined}
                >{operationIssue}</Feedback>
              )}
              {mode === 'handover' && ['UNIT_STILL_WITH_CUSTOMER', 'UNIT_NOT_READY'].includes(operationIssueCode) && (
                <Button
                  variant="secondary"
                  onClick={() => go('orders', { order: order?.id ?? orderId, filter: 'Sắp giao' })}
                >
                  Mở đơn để phân công bộ thay thế
                </Button>
              )}
              {mode === 'return' && result?.signature === previewSignature && !restricted && (
                <div
                  className="return-review"
                  aria-label={realApiMode ? 'Tóm tắt các bộ đã cập nhật' : 'Tóm tắt các bộ đã kiểm trong bản xem trước'}
                >
                  <strong>
                    Đã kiểm {scannedItems.length}/{returnableItems.length} bộ
                  </strong>
                  <ul>
                    {scannedItems.map((item) => (
                      <li key={item.id}>
                        {item.unitCode} ·{' '}
                        {returnConditions[item.id] === 'PASSED' || returnConditions[item.id] === 'NEW' || returnConditions[item.id] === 'GOOD'
                          ? 'Đạt'
                          : returnConditions[item.id] === 'FAIR' || returnConditions[item.id] === 'POOR' || returnConditions[item.id] === 'DAMAGED' || returnConditions[item.id] === 'PENDING_ASSESSMENT'
                            ? 'Cần đánh giá'
                            : 'Chưa chọn tình trạng'}
                      </li>
                    ))}
                  </ul>
                  {scannedItems.length < returnableItems.length && (
                    <p>
                      Còn ở khách:{' '}
                      {operationItems
                        .filter((item) => !matchedCodes.includes(item.unitCode ?? ''))
                        .map((item) => item.unitCode)
                        .join(', ')}
                    </p>
                  )}
                </div>
              )}
              <div className="task-final">
                <Button
                  onClick={() => { void (mode === 'handover' ? performHandover() : performReturn()); }}
                  loading={operationBusy}
                  disabled={
                    !scannedEnough ||
                    !allChecked ||
                    !allEvidenceSelected ||
                    needsAssessmentNote ||
                    restricted ||
                    backendReturnReady ||
                    (realApiMode && mode === 'handover' && (!canCollectPayments || !handoverPaymentReady)) ||
                    (mode === 'handover' &&
                      ((effectiveMethod === 'CASH' && !cashChecksComplete) ||
                        (!realApiMode && effectiveMethod === 'BANK_TRANSFER') ||
                        (realApiMode && effectiveMethod === 'BANK_TRANSFER' && !bankReferencesComplete)))
                  }
                >
                  {mode === 'handover'
                    ? realApiMode
                      ? 'Xác nhận thu tiền và giao đồ'
                      : 'Kiểm tra điều kiện giao'
                    : order.status === 'ACTIVE'
                      ? realApiMode
                        ? `Xác nhận nhận ${scannedItems.length}/${returnableItems.length} bộ`
                        : `Xem trước nhận ${scannedItems.length}/${returnableItems.length} bộ`
                      : realApiMode
                        ? 'Đang chờ xử lý quyết toán'
                        : 'Xem trước quyết toán'}
                </Button>
                {!scannedEnough && (
                  <p role="status">
                    {mode === 'handover'
                      ? 'Quét đủ các mã bộ của đơn trước khi kiểm tra.'
                      : 'Quét ít nhất một mã bộ của đơn trước khi kiểm tra.'}
                  </p>
                )}
                {scannedEnough && !allChecked && (
                  <p role="status">
                    {mode === 'return'
                      ? 'Đối chiếu phụ kiện và chọn kết quả kiểm cho các bộ đã quét.'
                      : 'Đánh dấu tình trạng và phụ kiện cho mọi bộ của đơn.'}
                  </p>
                )}
                {needsAssessmentNote && (
                  <p role="status">Mô tả vấn đề cần đánh giá trước khi xem kết quả nhận trả.</p>
                )}
                {realApiMode && !allEvidenceSelected && (
                  <p role="status">Chọn ít nhất một ảnh bằng chứng cho mỗi bộ đã đối chiếu trước khi xác nhận.</p>
                )}
                {realApiMode && backendReturnReady && (
                  <p role="status">Đơn đã ở bước kiểm tra trả. Hãy dùng quyền quyết toán/hoàn cọc riêng; không gửi lại nhận trả.</p>
                )}
                {mode === 'handover' &&
                  scannedEnough &&
                  allChecked &&
                  effectiveMethod === 'CASH' &&
                  (!rentPreview || !depositPreview) && (
                    <p role="status">
                      Đối chiếu riêng tiền thuê và tiền cọc trước khi xem điều kiện giao.
                    </p>
                  )}
                <p>
                  {mode === 'handover'
                    ? realApiMode
                      ? 'Hệ thống sẽ lưu ảnh, khoản thu và phiên bản đơn trong một quy trình có kiểm tra xung đột.'
                      : 'Chỉ backend có thể xác nhận thu tiền và chuyển đơn sang Đang thuê.'
                    : realApiMode
                      ? 'Sau khi nhận trả, đơn chuyển sang kiểm tra và chờ quyết toán cọc theo quyền được cấp.'
                      : 'Cọc chỉ hoàn sau kiểm tra và quyết toán được xác nhận.'}
                </p>
              </div>
            </section>
          </div>
          <aside className="task-side">
            <MoneyBreakdown lines={order.money} title="Trạng thái tiền của đơn" />
            <div className="task-side-note">
              <p className="eyebrow">TRẠNG THÁI NHIỀU CHIỀU</p>
              <p>
                <strong>Đơn:</strong> {orderStatus[order.status].text}
              </p>
              <p>
                <strong>Bộ:</strong>{' '}
                {order.items.map((item) => `${item.unitCode} · ${item.unitStatus}`).join(', ')}
              </p>
              <p>
                <strong>Cọc:</strong> {deposit?.status}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
