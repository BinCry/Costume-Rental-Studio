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
  getReturnSettlementOrder,
  completeOrderSettlement,
  assessOrderReturn,
  prepareOrderSettlement,
  listOrderRefunds,
  hasAccessToken,
  listOrderPayments,
  pickupOrder as pickupApiOrder,
  recordBankTransferPayment,
  recordCashPayment,
  returnOrder as returnApiOrder,
  validatePickupOrder,
  type SettlementSnapshot,
  type ReturnSettlementOrderDetails,
  type OrderRefundRecord,
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

type ReturnWorkflowDetailsResource =
  | { orderId: string; requestKey: string; status: 'loading' }
  | { orderId: string; requestKey: string; status: 'success'; details: ReturnSettlementOrderDetails }
  | { orderId: string; requestKey: string; status: 'error'; message: string };
type RefundsResource =
  | { orderId: string; requestKey: string; status: 'loading' }
  | { orderId: string; requestKey: string; status: 'success'; refunds: OrderRefundRecord[] }
  | { orderId: string; requestKey: string; status: 'error'; message: string };

function amountText(value: string | number | bigint | null | undefined) {
  return String(value ?? '0');
}
function validVndInput(value: string) {
  return /^\d+$/.test(value);
}
function inspectionLabel(status: string | null | undefined) {
  if (status === 'PENDING_ASSESSMENT') return 'Chờ đánh giá';
  if (status === 'PASSED') return 'Đã đánh giá · không có phí';
  if (status === 'HAS_DAMAGE') return 'Đã đánh giá · có hư hỏng/thiếu';
  if (status === 'HAS_MISSING_ITEM') return 'Đã đánh giá · có đồ thiếu';
  return status ?? 'Chưa có trạng thái';
}
function returnConditionLabel(conditionIn: string | null | undefined) {
  const labels: Record<string, string> = {
    NEW: 'Mới',
    GOOD: 'Tốt',
    FAIR: 'Khá',
    POOR: 'Kém',
    DAMAGED: 'Hư hỏng',
  };
  return conditionIn ? labels[conditionIn] ?? 'Chưa ghi nhận' : 'Chưa ghi nhận';
}
function refundLabel(status: string) {
  if (status === 'COMPLETED') return 'Máy chủ ghi nhận hoàn tất';
  if (status === 'PROCESSING' || status === 'REQUESTED' || status === 'PENDING') return 'Đang chờ xử lý';
  if (status === 'FAILED') return 'Thất bại';
  if (status === 'CANCELLED') return 'Đã hủy';
  return status;
}

function ReturnSettlementWorkflow({
  order,
  snapshot,
  canReadPayments,
  canAssess,
  canPrepare,
  canCollect,
  canComplete,
  onRefresh,
  onCompleted,
}: {
  order: Order;
  snapshot?: SettlementSnapshot;
  canReadPayments: boolean;
  canAssess: boolean;
  canPrepare: boolean;
  canCollect: boolean;
  canComplete: boolean;
  onRefresh: () => void;
  onCompleted: () => void;
}) {
  const [reloadRevision, setReloadRevision] = useState(0);
  const workflowKey = JSON.stringify([order.id, order.version, canReadPayments, reloadRevision]);
  const [detailsResource, setDetailsResource] = useState<ReturnWorkflowDetailsResource>({
    orderId: order.id,
    requestKey: workflowKey,
    status: 'loading',
  });
  const [refundsResource, setRefundsResource] = useState<RefundsResource>({
    orderId: order.id,
    requestKey: workflowKey,
    status: 'loading',
  });
  const [assessmentDraft, setAssessmentDraft] = useState<Record<string, { damage: string; missing: string }>>({});
  const [settlementDraft, setSettlementDraft] = useState({ depositDeduction: '0', otherFee: '0', note: '' });
  const [busy, setBusy] = useState(false);
  const [extraMethod, setExtraMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [extraTransferReference, setExtraTransferReference] = useState('');
  const [extraAttemptKey, setExtraAttemptKey] = useState(() => crypto.randomUUID());
  const [issue, setIssue] = useState('');
  const [message, setMessage] = useState('');
  const currentDetailsResource =
    detailsResource.orderId === order.id && detailsResource.requestKey === workflowKey
      ? detailsResource
      : undefined;
  const details = currentDetailsResource?.status === 'success' ? currentDetailsResource.details : undefined;
  const currentRefundsResource =
    refundsResource.orderId === order.id && refundsResource.requestKey === workflowKey
      ? refundsResource
      : undefined;
  const refunds = currentRefundsResource?.status === 'success' ? currentRefundsResource.refunds : undefined;
  const detailsLoading = !currentDetailsResource || currentDetailsResource.status === 'loading';
  const detailsError = currentDetailsResource?.status === 'error' ? currentDetailsResource.message : '';
  const refundsLoading = canReadPayments && (!currentRefundsResource || currentRefundsResource.status === 'loading');
  const refundsError = currentRefundsResource?.status === 'error' ? currentRefundsResource.message : '';
  const assessmentComplete = !!details && ['PASSED', 'HAS_DAMAGE', 'HAS_MISSING_ITEM'].includes(details.inspectionStatus ?? '');

  useEffect(() => {
    let active = true;
    void getReturnSettlementOrder(order.id)
      .then((loaded) => {
        if (!active) return;
        setDetailsResource({ orderId: order.id, requestKey: workflowKey, status: 'success', details: loaded });
        setAssessmentDraft(Object.fromEntries(loaded.items.map((item) => [
          item.id,
          { damage: amountText(item.damageFeeVnd), missing: amountText(item.missingFeeVnd) },
        ])));
        setSettlementDraft({
          depositDeduction: amountText(loaded.depositDeductionVnd),
          otherFee: amountText(loaded.otherFeeVnd),
          note: loaded.settlementNote ?? '',
        });
      })
      .catch((caught: unknown) => {
        if (active) setDetailsResource({
          orderId: order.id,
          requestKey: workflowKey,
          status: 'error',
          message: caught instanceof Error ? caught.message : 'Không tải được biên bản kiểm tra.',
        });
      });
    if (canReadPayments) {
      void listOrderRefunds(order.id)
        .then((loaded) => {
          if (active) setRefundsResource({ orderId: order.id, requestKey: workflowKey, status: 'success', refunds: loaded });
        })
        .catch((caught: unknown) => {
          if (active) setRefundsResource({
            orderId: order.id,
            requestKey: workflowKey,
            status: 'error',
            message: caught instanceof Error ? caught.message : 'Không tải được trạng thái hoàn cọc.',
          });
        });
    }
    return () => { active = false; };
  }, [workflowKey, order.id, order.version, canReadPayments, reloadRevision]);

  const refreshWorkflow = () => {
    setMessage('');
    setReloadRevision((revision) => revision + 1);
    onRefresh();
  };
  const assess = async () => {
    if (details?.status !== 'RETURN_INSPECTION' || !canAssess || busy) return;
    const items = details.items.map((item) => {
      const fee = assessmentDraft[item.id] ?? {
        damage: amountText(item.damageFeeVnd),
        missing: amountText(item.missingFeeVnd),
      };
      return {
        orderItemId: item.id,
        damageFeeVnd: fee.damage,
        missingFeeVnd: fee.missing,
        accessories: item.accessories.map((accessory) => {
          const feeKey = `${item.id}:${accessory.id}`;
          const accessoryFee = assessmentDraft[feeKey] ?? {
            damage: amountText(accessory.damageFeeVnd),
            missing: amountText(accessory.missingFeeVnd),
          };
          return {
            accessoryId: accessory.id,
            damageFeeVnd: accessoryFee.damage,
            missingFeeVnd: accessoryFee.missing,
          };
        }),
      };
    });
    if (items.some((item) =>
      !validVndInput(item.damageFeeVnd) ||
      !validVndInput(item.missingFeeVnd) ||
      item.accessories.some((accessory) =>
        !validVndInput(accessory.damageFeeVnd) || !validVndInput(accessory.missingFeeVnd),
      ),
    )) {
      setIssue('Nhập phí bằng số nguyên VND không âm cho từng bộ và phụ kiện.');
      return;
    }
    setBusy(true);
    setIssue('');
    setMessage('');
    try {
      await assessOrderReturn(order.id, details.version, items);
      setMessage('Đã lưu đánh giá trên máy chủ. Đang tải lại version và số liệu mới nhất.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } catch (caught: unknown) {
      setIssue(caught instanceof Error ? caught.message : 'Không lưu được đánh giá.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const prepare = async () => {
    if (details?.status !== 'RETURN_INSPECTION' ||
      !assessmentComplete || !canPrepare || busy) return;
    if (!validVndInput(settlementDraft.depositDeduction) || !validVndInput(settlementDraft.otherFee)) {
      setIssue('Nhập khoản cấn trừ và phí khác bằng số nguyên VND không âm.');
      return;
    }
    setBusy(true);
    setIssue('');
    setMessage('');
    try {
      await prepareOrderSettlement(
        order.id,
        details.version,
        settlementDraft.depositDeduction,
        settlementDraft.otherFee,
        settlementDraft.note,
      );
      setMessage('Đã lưu khoản cấn trừ và phí khác trên máy chủ; đang tải lại quyết toán.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } catch (caught: unknown) {
      setIssue(caught instanceof Error ? caught.message : 'Không lưu được quyết toán.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const collectExtra = async () => {
    if (!canCollect || !canReadPayments || busy || !details || !assessmentComplete) return;
    if (extraMethod === 'BANK_TRANSFER' && !extraTransferReference.trim()) {
      setIssue('Nhập mã giao dịch ngân hàng để đối chiếu trước khi ghi nhận.');
      return;
    }
    setBusy(true);
    setIssue('');
    setMessage('');
    try {
      const current = await getOrderSettlement(order.id);
      const amount = parseVndAmount(current.extra.remainingVnd);
      if (current.orderId !== order.id || current.status !== 'RETURN_INSPECTION' || amount === null || amount <= 0)
        throw new ApiClientError(409, 'SETTLEMENT_SNAPSHOT_STALE', 'Số phí còn phải thu đã thay đổi. Tải lại quyết toán trước khi tiếp tục.');
      const payments = await listOrderPayments(order.id);
      if (payments.some((payment) => payment.purpose === 'EXTRA' && ['PENDING', 'PROCESSING'].includes(payment.status)))
        throw new ApiClientError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Đang có khoản thu bổ sung chờ xác minh. Đối soát khoản đó trước khi thử lại.');
      if (extraMethod === 'CASH')
        await recordCashPayment(order.id, 'EXTRA', amount, extraAttemptKey);
      else
        await recordBankTransferPayment(order.id, 'EXTRA', amount, extraTransferReference.trim());
      setExtraAttemptKey(crypto.randomUUID());
      setMessage('Đã gửi khoản thu bổ sung. Đang tải lại số dư và trạng thái từ máy chủ.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } catch (caught: unknown) {
      setIssue(caught instanceof Error ? caught.message : 'Không ghi nhận được khoản thu bổ sung.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!canComplete || !canReadPayments || busy || !details) return;
    setBusy(true);
    setIssue('');
    setMessage('');
    try {
      await completeOrderSettlement(order.id);
      setMessage('Máy chủ đã hoàn tất đơn sau khi lấy snapshot và version mới nhất; đang tải lại danh sách.');
      onCompleted();
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } catch (caught: unknown) {
      setIssue(caught instanceof Error ? caught.message : 'Không thể hoàn tất đơn.');
      setReloadRevision((revision) => revision + 1);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const setFee = (key: string, field: 'damage' | 'missing', value: string) => {
    setAssessmentDraft((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { damage: '0', missing: '0' }), [field]: value },
    }));
  };

  return (
    <section className="task-card return-settlement-workflow" aria-labelledby="return-workflow-title">
      <div className="task-card-heading">
        <span className="round-step">04</span>
        <div>
          <p className="eyebrow">KIỂM TRA VÀ QUYẾT TOÁN</p>
          <h2 id="return-workflow-title">Biên bản trả và bước tiếp theo</h2>
        </div>
      </div>
      {busy && (
        <p className="section-help" role="status" aria-live="polite">
          Đang gửi thao tác đến máy chủ. Vui lòng đợi phản hồi và không gửi lại.
        </p>
      )}
      {detailsLoading && <Feedback title="Đang tải biên bản từ máy chủ">Đang đọc version đơn, trạng thái kiểm tra và phí đã lưu.</Feedback>}
      {detailsError && (
        <Feedback tone="danger" title="Không tải được biên bản">
          {detailsError}
          <Button variant="secondary" disabled={busy} onClick={refreshWorkflow}>Tải lại trạng thái</Button>
        </Feedback>
      )}
      {details && (
        <>
          <Feedback tone={details.inspectionStatus === 'PENDING_ASSESSMENT' ? 'warning' : 'info'} title={inspectionLabel(details.inspectionStatus)}>
            Đơn đang ở bước kiểm tra trả · version {details.version}. Phí và điều kiện hoàn tất do máy chủ xác nhận.
          </Feedback>
          <div className="return-assessment-list">
            {details.items.map((item, index) => {
              const mappedItem = order.items.find((entry) => entry.id === item.id);
              const draft = assessmentDraft[item.id] ?? {
                damage: amountText(item.damageFeeVnd),
                missing: amountText(item.missingFeeVnd),
              };
              return (
                <fieldset className="check-unit" key={item.id}>
                  <legend>{mappedItem?.costume ?? `Bộ ${index + 1}`} · {mappedItem?.variant ?? item.id}</legend>
                  <p className="section-help">
                    {mappedItem?.unitCode ? `Mã bộ ${mappedItem.unitCode} · ` : ''}
                    Tình trạng trả: {item.returnConditionGrade ?? 'Chưa có dữ liệu'} · {item.isMissing === true ? 'Ghi nhận thiếu' : item.isMissing === false ? 'Không ghi nhận thiếu' : 'Chưa có dữ liệu'}
                  </p>
                  <div className="two-fields">
                    <Field
                      label="Phí hư hỏng theo policy hiện hành (VND)"
                      type="text"
                      inputMode="numeric"
                      value={draft.damage}
                      disabled={!canAssess || busy}
                      aria-label={`Phí hư hỏng bộ ${mappedItem?.unitCode ?? item.id} VND`}
                      onChange={(event) => setFee(item.id, 'damage', event.target.value)}
                    />
                    <Field
                      label="Phí thiếu theo policy hiện hành (VND)"
                      type="text"
                      inputMode="numeric"
                      value={draft.missing}
                      disabled={!canAssess || busy}
                      aria-label={`Phí thiếu bộ ${mappedItem?.unitCode ?? item.id} VND`}
                      onChange={(event) => setFee(item.id, 'missing', event.target.value)}
                    />
                  </div>
                  {item.accessories.map((accessory) => {
                    const key = `${item.id}:${accessory.id}`;
                    const accessoryDraft = assessmentDraft[key] ?? {
                      damage: amountText(accessory.damageFeeVnd),
                      missing: amountText(accessory.missingFeeVnd),
                    };
                    return (
                      <div className="return-accessory-assessment" key={accessory.id}>
                        <strong>
                          {accessory.accessoryName ?? 'Phụ kiện'} · đã trả{' '}
                          {accessory.quantityReturned === null || accessory.quantityReturned === undefined
                            ? 'Chưa ghi nhận'
                            : String(accessory.quantityReturned) + '/' + String(accessory.quantityOut)}
                        </strong>
                        <p className="section-help">
                          Tình trạng khi nhận trả: {returnConditionLabel(accessory.conditionIn)}
                        </p>
                        <div className="two-fields">
                          <Field
                            label="Phí hư hỏng phụ kiện (VND)"
                            type="text"
                            inputMode="numeric"
                            value={accessoryDraft.damage}
                            disabled={!canAssess || busy}
                            aria-label={`Phí hư hỏng phụ kiện ${accessory.accessoryName ?? accessory.id} VND`}
                            onChange={(event) => setFee(key, 'damage', event.target.value)}
                          />
                          <Field
                            label="Phí thiếu phụ kiện (VND)"
                            type="text"
                            inputMode="numeric"
                            value={accessoryDraft.missing}
                            disabled={!canAssess || busy}
                            aria-label={`Phí thiếu phụ kiện ${accessory.accessoryName ?? accessory.id} VND`}
                            onChange={(event) => setFee(key, 'missing', event.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </fieldset>
              );
            })}
          </div>
          {canAssess ? (
            <div className="task-final">
              <p className="section-help">
                Nhập mức phí theo policy do Studio phê duyệt. Máy chủ là nơi kiểm tra và tính số liệu quyết toán.
              </p>
              <Button disabled={busy || details.items.length === 0} loading={busy} onClick={() => void assess()}>
                {details.inspectionStatus === 'PENDING_ASSESSMENT' ? 'Lưu đánh giá' : 'Cập nhật đánh giá'}
              </Button>
            </div>
          ) : (
            <Feedback tone="warning" title="Bạn chưa có quyền đánh giá">
              Cần quyền rentals.assessment hoặc rentals.manage tại phạm vi chi nhánh.
            </Feedback>
          )}
          {!assessmentComplete ? (
            <Feedback tone="warning" title="Chưa thể chuẩn bị quyết toán">
              Lưu đánh giá đủ tất cả bộ và phụ kiện trước. Không tạo khoản thu hoặc hoàn cọc tại bước này.
            </Feedback>
          ) : (
            <div className="return-settlement-form">
              <h3>Chuẩn bị quyết toán</h3>
              <p className="section-help">Các khoản phí theo policy hiện hành; máy chủ kiểm tra giới hạn và số dư. Không tự tính tổng tại giao diện.</p>
              <div className="two-fields">
                <Field
                  label="Cấn trừ từ tiền cọc (VND)"
                  type="text"
                  inputMode="numeric"
                  value={settlementDraft.depositDeduction}
                  disabled={!canPrepare || busy}
                  onChange={(event) => setSettlementDraft((current) => ({ ...current, depositDeduction: event.target.value }))}
                />
                <Field
                  label="Phí khác đã được duyệt (VND)"
                  type="text"
                  inputMode="numeric"
                  value={settlementDraft.otherFee}
                  disabled={!canPrepare || busy}
                  onChange={(event) => setSettlementDraft((current) => ({ ...current, otherFee: event.target.value }))}
                />
              </div>
              <TextAreaField
                label="Ghi chú quyết toán"
                rows={3}
                value={settlementDraft.note}
                disabled={!canPrepare || busy}
                onChange={(event) => setSettlementDraft((current) => ({ ...current, note: event.target.value }))}
              />
              {canPrepare ? (
                <Button disabled={busy || details.status !== 'RETURN_INSPECTION' || !assessmentComplete} loading={busy} onClick={() => void prepare()}>Lưu quyết toán trên máy chủ</Button>
              ) : (
                <Feedback tone="warning" title="Bạn chưa có quyền chuẩn bị quyết toán">
                  Cần quyền payments.manage tại phạm vi chi nhánh.
                </Feedback>
              )}
            </div>
          )}
          {assessmentComplete && canReadPayments && (
            <div className="return-settlement-form">
              <h3>Thu phí còn thiếu</h3>
              <p className="section-help">
                Số tiền lấy từ snapshot quyết toán mới nhất của máy chủ. Nhân viên không nhập lại số tiền;
                nếu có khoản thu đang chờ đối soát, cần xử lý khoản đó trước khi thu tiếp.
              </p>
              {snapshot && (
                <p role="status">
                  Còn phải thu bổ sung: <strong>{settlementMoney(snapshot.extra.remainingVnd)}</strong>
                </p>
              )}
              <SelectField
                label="Phương thức thu"
                value={extraMethod}
                disabled={!canCollect || busy}
                onChange={(event) => setExtraMethod(event.target.value as 'CASH' | 'BANK_TRANSFER')}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="BANK_TRANSFER">Chuyển khoản đã đối soát</option>
              </SelectField>
              {extraMethod === 'BANK_TRANSFER' && (
                <Field
                  label="Mã giao dịch ngân hàng"
                  type="text"
                  value={extraTransferReference}
                  disabled={!canCollect || busy}
                  onChange={(event) => setExtraTransferReference(event.target.value)}
                  hint="Nhập mã giao dịch đã nhìn thấy trên tài khoản Studio."
                />
              )}
              {canCollect ? (
                <Button
                  disabled={
                    busy ||
                    details.status !== 'RETURN_INSPECTION' ||
                    !assessmentComplete ||
                    !snapshot ||
                    (parseVndAmount(snapshot.extra.remainingVnd) ?? 0) <= 0 ||
                    (extraMethod === 'BANK_TRANSFER' && !extraTransferReference.trim())
                  }
                  loading={busy}
                  onClick={() => void collectExtra()}
                >
                  Ghi nhận khoản thu bổ sung
                </Button>
              ) : (
                <Feedback tone="warning" title="Bạn chưa có quyền thu tiền">
                  Cần quyền thu thanh toán tại chi nhánh nhận đồ.
                </Feedback>
              )}
            </div>
          )}
          {canReadPayments && (
            <div className="return-refund-history" aria-live="polite">
              <h3>Trạng thái hoàn cọc</h3>
              {refundsLoading && <Feedback title="Đang tải giao dịch hoàn cọc">Đang đọc các bản ghi do máy chủ trả về.</Feedback>}
              {refundsError && (
                <Feedback tone="danger" title="Không tải được giao dịch hoàn cọc">
                  {refundsError}
                  <Button variant="secondary" disabled={busy} onClick={refreshWorkflow}>Tải lại trạng thái</Button>
                </Feedback>
              )}
              {refunds && (refunds.length ? (
                <ul className="return-refund-list">
                  {refunds.map((refund) => (
                    <li key={refund.id}>
                      <strong>{settlementMoney(refund.amountVnd)}</strong>
                      <span>{refundLabel(refund.status)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="section-help">Máy chủ chưa trả về bản ghi hoàn cọc nào cho đơn này.</p>
              ))}
              <Feedback tone="warning" title="Phương thức và thời hạn hoàn cọc cần Studio chốt">
                Chỉ hiển thị số tiền và trạng thái do máy chủ ghi nhận. Màn hình này không tạo, không đánh dấu và không xác nhận đã chuyển tiền hoàn.
              </Feedback>
            </div>
          )}
          {canComplete && (
            <div className="task-final">
              <Button
                disabled={
                  busy ||
                  !canReadPayments ||
                  snapshot?.orderId !== details.id ||
                  snapshot?.status !== 'RETURN_INSPECTION' ||
                  snapshot?.canComplete !== true ||
                  details.status !== 'RETURN_INSPECTION' ||
                  !assessmentComplete ||
                  detailsLoading ||
                  !!detailsError ||
                  refundsLoading ||
                  !!refundsError
                }
                loading={busy}
                onClick={() => void complete()}
              >
                Hoàn tất đơn theo xác nhận của máy chủ
              </Button>
              {!canReadPayments && <p role="status">Cần quyền đọc thanh toán để xác minh snapshot trước khi đóng đơn.</p>}
              {snapshot?.canComplete !== true && (
                <div className="section-help" role="status">
                  <p>Nút chỉ mở khi snapshot mới nhất từ máy chủ báo đủ điều kiện.</p>
                  {parseVndAmount(snapshot?.extra.remainingVnd) !== null &&
                    (parseVndAmount(snapshot?.extra.remainingVnd) ?? 0) > 0 && (
                      <p>Còn phải thu bổ sung: {settlementMoney(snapshot?.extra.remainingVnd)}.</p>
                    )}
                  {parseVndAmount(snapshot?.deposit.refundRemainingVnd) !== null &&
                    (parseVndAmount(snapshot?.deposit.refundRemainingVnd) ?? 0) > 0 && (
                      <p>
                        Còn phải xử lý hoàn cọc: {settlementMoney(snapshot?.deposit.refundRemainingVnd)}.
                        Trạng thái hiển thị theo máy chủ; phương thức và thời hạn hoàn vẫn cần Studio chốt.
                      </p>
                    )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {issue && (
        <Feedback tone="danger" title="Thao tác chưa hoàn tất">
          {issue}
          <Button variant="secondary" disabled={busy} onClick={refreshWorkflow}>Tải lại trạng thái, không gửi lại thao tác</Button>
        </Feedback>
      )}
      {message && <Feedback tone="success" title="Đã nhận phản hồi từ máy chủ">{message}</Feedback>}
    </section>
  );
}


export function OrderDetailShell({
  scenario,
  mode,
  go,
  initialOrderId,
  initialBranch,
  canReadPayments = true,
  canCollectPayments = true,
  canReturn = true,
  canAssessReturn = true,
  canPrepareSettlement = true,
  canCompleteSettlement = true,
}: {
  scenario: DemoScenario;
  mode: 'handover' | 'return';
  go: Navigate;
  initialOrderId: string;
  initialBranch: string;
  canReadPayments?: boolean;
  canCollectPayments?: boolean;
  canReturn?: boolean;
  canAssessReturn?: boolean;
  canPrepareSettlement?: boolean;
  canCompleteSettlement?: boolean;
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
  const [missingItems, setMissingItems] = useState<Record<string, boolean>>({});
  const [missingConfirmed, setMissingConfirmed] = useState<Record<string, boolean>>({});
  const [missingNotes, setMissingNotes] = useState<Record<string, string>>({});
  const [repairBlockedUntil, setRepairBlockedUntil] = useState<Record<string, string>>({});
  const [repairScheduleValidity, setRepairScheduleValidity] = useState<Record<string, boolean>>({});
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
  const selectedReturnItems = mode === 'return'
    ? operationItems.filter((item) =>
        (!!item.unitCode && matchedCodes.includes(item.unitCode)) || !!missingItems[item.id],
      )
    : scannedItems;
  const allReturnItemsScanned = !!order && (
    order.status === 'RETURN_INSPECTION' || selectedReturnItems.length === returnableItems.length
  );
  const requiresChecks = order
    ? (mode === 'return' ? selectedReturnItems : order.items).flatMap((item) =>
        mode === 'return'
          ? [`${item.id}-accessories`]
          : [`${item.id}-condition`, `${item.id}-accessories`],
      )
    : [];
  const accessoryReviewComplete = !realApiMode || mode !== 'return' || selectedReturnItems.every((item) =>
    (item.accessories ?? []).every((accessory) => {
      if (!accessory.id) return false;
      const review = returnAccessories[`${item.id}:${accessory.id}`];
      if (!review || review.quantityReturned.trim() === '') return false;
      const quantity = Number(review.quantityReturned);
      return Number.isInteger(quantity) && quantity >= 0 && quantity <= accessory.quantityOut &&
        (quantity === 0 || !!review.conditionIn);
    }),
  );
  const accessoryNeedsAssessment = realApiMode && mode === 'return' && selectedReturnItems.some((item) =>
    (item.accessories ?? []).some((accessory) => {
      const review = returnAccessories[`${item.id}:${accessory.id}`];
      return !!review && Number(review.quantityReturned) < accessory.quantityOut ||
        (!!review?.conditionIn && ['FAIR', 'POOR', 'DAMAGED'].includes(review.conditionIn));
    }),
  );
  const repairScheduleComplete = !realApiMode || mode !== 'return' || selectedReturnItems.every((item) => {
    if (missingItems[item.id] || !['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')) return true;
    const value = repairBlockedUntil[item.id];
    return !!value && Number.isFinite(Date.parse(value)) && repairScheduleValidity[item.id] === true;
  });
  const missingReportsComplete =
    !realApiMode ||
    mode !== 'return' ||
    selectedReturnItems.every((item) =>
      !missingItems[item.id] || (!!missingConfirmed[item.id] && !!missingNotes[item.id]?.trim()),
    );
  const allChecked =
    requiresChecks.length > 0 &&
    requiresChecks.every((key) => checks[key]) &&
    (mode === 'handover' ||
      selectedReturnItems.every((item) => !!missingItems[item.id] || !!returnConditions[item.id])) &&
    accessoryReviewComplete && repairScheduleComplete && missingReportsComplete;
  const needsAssessment =
    mode === 'return' &&
    (accessoryNeedsAssessment ||
      selectedReturnItems.some((item) => !!missingItems[item.id]) ||
      selectedReturnItems.some((item) =>
        realApiMode
          ? ['FAIR', 'POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
          : returnConditions[item.id] === 'PENDING_ASSESSMENT',
      ));
  const needsAssessmentNote =
    ((accessoryNeedsAssessment ||
      selectedReturnItems.some((item) =>
        !missingItems[item.id] &&
        (realApiMode
          ? ['FAIR', 'POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
          : returnConditions[item.id] === 'PENDING_ASSESSMENT'),
      )) &&
      !note.trim()) ||
    (mode === 'return' &&
      selectedReturnItems.some((item) =>
        !!missingItems[item.id] && (!missingConfirmed[item.id] || !missingNotes[item.id]?.trim()),
      ));
  const evidenceItems = mode === 'handover' ? order?.items ?? [] : selectedReturnItems;
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
    ? (parseVndAmount(backendSettlement?.deposit.remainingVnd) ??
      Math.max(0, (parseVndAmount(backendSettlement?.deposit.dueVnd) ?? 0) -
        (parseVndAmount(backendSettlement?.deposit.paidVnd) ?? 0)))
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
  const sameBankReferenceForBoth = rentalRemaining > 0 && depositRemaining > 0 &&
    !!transactionReferences.rental.trim() &&
    transactionReferences.rental.trim().toLocaleUpperCase() === transactionReferences.deposit.trim().toLocaleUpperCase();
  const bankReferencesComplete =
    (rentalRemaining <= 0 || !!transactionReferences.rental.trim()) &&
    (depositRemaining <= 0 || !!transactionReferences.deposit.trim()) &&
    !sameBankReferenceForBoth;
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
    setMissingItems({});
    setMissingConfirmed({});
    setMissingNotes({});
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
  const scannedEnough =
    mode === 'handover'
      ? allScanned
      : realApiMode
        ? selectedReturnItems.length > 0
        : scannedItems.length > 0;
  const previewSignature = JSON.stringify([
    scenario,
    mode,
    branch,
    order?.id,
    order?.version,
    matchedCodes,
    checks,
    returnConditions,
    missingItems,
    missingConfirmed,
    missingNotes,
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
    if (cached?.files.length === files.length && cached?.files.every((file, index) => file === files[index]))
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
      setOperationIssue(sameBankReferenceForBoth
        ? 'Mã giao dịch phải khác nhau cho tiền thuê và tiền cọc. Không dùng một giao dịch cho hai khoản.'
        : 'Nhập mã giao dịch riêng cho từng khoản còn phải thu trước khi xác nhận.');
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
      await refreshSettlement();
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
    if (!canReturn) {
      setOperationIssue('Bạn chưa có quyền nhận trả tại phạm vi chi nhánh.');
      return;
    }
    if (!order || !scannedEnough || !allChecked || !allEvidenceSelected || restricted) return;
    if (order.status !== 'ACTIVE') {
      setOperationIssue('Đơn đã ở bước kiểm tra/quyết toán. Không gửi lại thao tác nhận trả; hãy xử lý biên bản và hoàn cọc theo quyền được cấp.');
      return;
    }
    const invalidRepairSchedule = selectedReturnItems.find((item) => {
      if (missingItems[item.id] || !['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')) return false;
      const value = repairBlockedUntil[item.id];
      return !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now();
    });
    if (invalidRepairSchedule) {
      setOperationIssue(`Nhập thời điểm sửa xong trong tương lai cho bộ ${invalidRepairSchedule.unitCode ?? invalidRepairSchedule.id}.`);
      return;
    }
    setOperationBusy(true);
    setOperationIssue('');
    setResult(null);
    try {
      const items = await Promise.all(
        selectedReturnItems.map(async (item) => {
          const isMissing = !!missingItems[item.id];
          return {
            orderItemId: item.id,
            ...(isMissing
              ? {}
              : {
                  returnConditionGrade: (['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
                    ? returnConditions[item.id]
                    : returnConditions[item.id] === 'PENDING_ASSESSMENT'
                      ? 'FAIR'
                      : 'GOOD') as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED',
                }),
            isMissing,
            damageNotes: isMissing
              ? missingNotes[item.id]?.trim()
              : needsAssessment
                ? note.trim()
                : undefined,
            ...(!isMissing
              ? {
                  nextOperationalStatus: ['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
                    ? 'REPAIR' as const
                    : 'CLEANING' as const,
                  repairBlockedUntil: ['POOR', 'DAMAGED'].includes(returnConditions[item.id] ?? '')
                    ? new Date(repairBlockedUntil[item.id]).toISOString()
                    : undefined,
                }
              : {}),
            evidence: await uploadEvidence(item.id, 'RETURN'),
            accessories: (item.accessories ?? []).map((accessory) => {
              const review = returnAccessories[`${item.id}:${accessory.id}`];
              const quantityReturned = Number(review?.quantityReturned);
              return {
                accessoryId: accessory.id,
                quantityReturned,
                conditionIn:
                  quantityReturned > 0
                    ? (review?.conditionIn as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED')
                    : null,
              };
            }),
          };
        }),
      );
      await returnApiOrder(order.id, order.version, selectedReturnItems.length < returnableItems.length, note.trim(), items);
      setResult({
        text:
          selectedReturnItems.length < returnableItems.length
            ? `Đã ghi nhận ${selectedReturnItems.length}/${returnableItems.length} bộ đã trả hoặc báo thất lạc. Đơn còn bộ chưa xử lý; cọc vẫn được giữ.`
            : 'Đã ghi nhận đủ bộ đã trả hoặc báo thất lạc. Đơn đang chờ đánh giá và quyết toán cọc.',
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
        setMissingItems({});
        setMissingConfirmed({});
        setMissingNotes({});
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
            {!backendReturnReady && (
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
              <div
                className="expected-units"
                role="status"
                aria-live="polite"
                aria-label={mode === 'return' ? 'Mã bộ và tình trạng nhận trả' : 'Mã bộ cần đối chiếu'}
              >
                <span>{mode === 'return' ? 'Mã bộ và trạng thái xử lý:' : 'Mã cần đối chiếu:'}</span>
                {operationItems.map((item) => (
                  <span
                    className={
                      'barcode-chip' +
                      (matchedCodes.includes(item.unitCode ?? '') ? ' scanned' : '')
                    }
                    key={item.id}
                  >
                    {missingItems[item.id]
                      ? 'Báo thất lạc · '
                      : matchedCodes.includes(item.unitCode ?? '')
                        ? '✓ '
                        : ''}
                    {item.unitCode ?? 'Chưa gán mã'}
                  </span>
                ))}
              </div>
              {mode === 'return' && returnableItems.length > 0 && (
                <p className="section-help" role="status">
                  Đã đối chiếu hoặc báo thất lạc {selectedReturnItems.length}/{returnableItems.length} bộ còn ở khách.
                  Bộ đã ghi nhận ở lần trước không cần quét lại; cọc chỉ được quyết toán khi backend xác nhận điều kiện trả.
                </p>
              )}
            </section>
            )}
            {!backendReturnReady && (
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
                      disabled={!matchedCodes.includes(item.unitCode ?? '') && !missingItems[item.id]}
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
                    (mode === 'return' && (matchedCodes.includes(item.unitCode ?? '') || !!missingItems[item.id]))) && (
                    <label className="field file-field">
                      <span>
                        Ảnh bằng chứng {realApiMode ? '(bắt buộc)' : '(tuỳ chọn)'}
                        {mode === 'return' && missingItems[item.id] ? ' · liên quan đến thất lạc' : ''}
                      </span>
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
                          : mode === 'return' && missingItems[item.id]
                            ? 'Chọn ảnh/chứng từ liên quan đến việc xác minh thất lạc'
                            : 'Chọn ảnh tình trạng thực tế của bộ'}
                      </small>
                    </label>
                  )}
                  {mode === 'return' && realApiMode && (
                    <div className="return-missing-report">
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={!!missingItems[item.id]}
                          disabled={operationBusy || matchedCodes.includes(item.unitCode ?? '')}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setMissingItems((current) => ({ ...current, [item.id]: checked }));
                            setMissingConfirmed((current) => ({ ...current, [item.id]: false }));
                            if (!checked) {
                              setMissingNotes((current) => ({ ...current, [item.id]: '' }));
                              setEvidenceFiles((current) => ({ ...current, [item.id]: [] }));
                            }
                          }}
                        />
                        <span>Ghi nhận bộ này thất lạc, không có mặt để nhận trả</span>
                      </label>
                      {missingItems[item.id] && (
                        <>
                          <Feedback tone="warning" title="Xác nhận thao tác có ảnh hưởng tồn kho">
                            Máy chủ sẽ chuyển bộ này sang ngừng khai thác. Đính kèm bằng chứng liên quan
                            và ghi rõ thông tin xác minh trước khi lưu.
                          </Feedback>
                          <TextAreaField
                            label="Ghi chú về bộ thất lạc"
                            rows={2}
                            value={missingNotes[item.id] ?? ''}
                            disabled={operationBusy}
                            onChange={(event) => setMissingNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                          />
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={!!missingConfirmed[item.id]}
                              disabled={operationBusy || !missingNotes[item.id]?.trim()}
                              onChange={(event) => setMissingConfirmed((current) => ({ ...current, [item.id]: event.target.checked }))}
                            />
                            <span>Tôi đã xác minh và xác nhận ghi nhận thất lạc cho bộ này</span>
                          </label>
                        </>
                      )}
                    </div>
                  )}
                  {((mode === 'handover' && matchedCodes.includes(item.unitCode ?? '')) ||
                    (mode === 'return' && (matchedCodes.includes(item.unitCode ?? '') || !!missingItems[item.id]))) && (
                    <label className="field file-field">
                      <span>
                        Ảnh bằng chứng {realApiMode ? '(bắt buộc)' : '(tuỳ chọn)'}
                        {mode === 'return' && missingItems[item.id] ? ' · bằng chứng liên quan đến thất lạc' : ''}
                      </span>
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
                          : mode === 'return' && missingItems[item.id]
                            ? 'Chọn ảnh/chứng từ liên quan đến việc xác minh thất lạc'
                            : 'Chọn ảnh tình trạng thực tế của bộ'}
                      </small>
                    </label>
                  )}
                  {mode === 'return' &&
                    (matchedCodes.includes(item.unitCode ?? '') || !!missingItems[item.id]) &&
                    !missingItems[item.id] && (
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
                          label="Dự kiến sẵn sàng sau sửa chữa (bắt buộc)"
                          type="datetime-local"
                          required
                          hint="Nhập thời điểm dự kiến bộ có thể đưa vào sử dụng sau sửa chữa."
                          value={repairBlockedUntil[item.id] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            const valid = !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
                            setRepairBlockedUntil((current) => ({ ...current, [item.id]: value }));
                            setRepairScheduleValidity((current) => ({ ...current, [item.id]: valid }));
                          }}
                          error={repairBlockedUntil[item.id] && repairScheduleValidity[item.id] !== true
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
                                  label={`${accessory.name ?? `Phụ kiện ${index + 1}`} · trả ${accessory.quantityOut}`}
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
            )}
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
                        {realApiMode ? settlementMoney(backendSettlement?.rental.dueVnd) : money(rental?.amount ?? 0)}
                      </span>
                      <span>
                        <span className="collection-mobile-label">{realApiMode ? 'Đã ghi nhận' : 'Đánh dấu nhận (demo)'}</span>
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
                        {realApiMode ? settlementMoney(backendSettlement?.deposit.dueVnd) : money(deposit?.amount ?? 0)}
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
                          ? money(depositRemaining)
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
                      {realApiMode && rentalRemaining > 0 && depositRemaining > 0 && (
                        <Feedback tone="warning" title="Chuyển khoản được đối soát theo từng khoản">
                          Nhập mã giao dịch riêng cho tiền thuê và tiền cọc. Nếu khách chỉ chuyển một giao dịch gộp,
                          hãy dừng để đối soát theo quy trình đã chốt; không dùng lại cùng một mã cho cả hai khoản.
                        </Feedback>
                      )}
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
                            Còn phải thu: {settlementMoney(backendSettlement.outstandingVnd)}. Phương thức
                            và thời hạn hoàn cọc vẫn cần Studio chốt; giao diện chỉ hiển thị số tiền, trạng thái
                            máy chủ ghi nhận và điểm còn cần xử lý, không suy ra đã hoàn từ số dự kiến.
                          </>
                        ) : (
                          'Máy chủ chưa trả đủ hoặc trả sai dữ liệu tiền. Chưa thể xác nhận điều kiện hoàn tất; hãy tải lại sau khi dịch vụ quyết toán được cập nhật.'
                        )}
                      </Feedback>
                    </>
                  )}
                  {realApiMode && backendReturnReady && order && (
                    <ReturnSettlementWorkflow
                      order={order}
                      snapshot={backendSettlement}
                      canReadPayments={canReadPayments}
                      canAssess={canAssessReturn}
                      canPrepare={canPrepareSettlement}
                      canCollect={canCollectPayments}
                      canComplete={canCompleteSettlement}
                      onRefresh={() => {
                        retry();
                        void refreshSettlement();
                      }}
                      onCompleted={() => setResult({ text: 'Đơn đã được máy chủ đóng sau khi snapshot xác nhận đủ điều kiện.', signature: previewSignature })}
                    />
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
              {!backendReturnReady && <div className="task-final">
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
                    (realApiMode && mode === 'return' && !canReturn) ||
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
                {realApiMode && mode === 'return' && scannedEnough && !repairScheduleComplete && (
                  <p role="status">Với mỗi bộ được đánh giá hư hỏng nặng, nhập thời điểm dự kiến sửa xong trong tương lai.</p>
                )}
                {realApiMode && !allEvidenceSelected && (
                  <p role="status">Chọn ít nhất một ảnh bằng chứng cho mỗi bộ đã đối chiếu trước khi xác nhận.</p>
                )}
                {realApiMode && backendReturnReady && (
                  <p role="status">Đơn đã ở bước kiểm tra trả. Hãy dùng quyền quyết toán/hoàn cọc riêng; không gửi lại nhận trả.</p>
                )}
                {realApiMode && mode === 'return' && order.status === 'ACTIVE' && !canReturn && (
                  <p role="status">Bạn có quyền xem hoặc đánh giá đơn nhưng chưa có quyền nhận trả tại phạm vi chi nhánh.</p>
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
              </div>}
            </section>
          </div>
          <aside className="task-side">
            {!(realApiMode && backendReturnReady) && <MoneyBreakdown lines={order.money} title="Trạng thái tiền của đơn" />}
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
