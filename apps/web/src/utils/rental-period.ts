export function rentalPeriodIssues(pickup: string, returnAt: string) {
  const start = Date.parse(pickup);
  const end = Date.parse(returnAt);
  const pickupIssue = !pickup
    ? undefined
    : !Number.isFinite(start)
      ? 'Thời điểm nhận không hợp lệ.'
      : start < Date.now()
        ? 'Thời điểm nhận đồ không được ở quá khứ.'
        : undefined;
  const returnIssue = returnAt && (!Number.isFinite(end) || (pickup && end <= start))
    ? 'Thời điểm trả phải sau thời điểm nhận.'
    : undefined;
  return { pickupIssue, returnIssue };
}
