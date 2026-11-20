export function rentalPeriodIssues(pickup: string, returnAt: string) {
  const start = Date.parse(pickup);
  const end = Date.parse(returnAt);
  const pickupIssue = !pickup
    ? undefined
    : !Number.isFinite(start)
      ? 'Thời điểm nhận không hợp lệ.'
      : start <= Date.now()
        ? 'Thời điểm nhận đồ phải ở trong tương lai.'
        : undefined;
  const returnIssue = !returnAt
    ? undefined
    : !Number.isFinite(end)
      ? 'Thời điểm trả không hợp lệ.'
      : end <= Date.now()
        ? 'Thời điểm trả đồ phải ở trong tương lai.'
        : pickup && end <= start
          ? 'Thời điểm trả phải sau thời điểm nhận.'
          : undefined;
  return { pickupIssue, returnIssue };
}
