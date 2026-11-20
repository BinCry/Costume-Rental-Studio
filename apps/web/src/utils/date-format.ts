export function formatCalendarDate(value: string) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Booking inputs represent wall-clock time without a timezone. */
export function formatLocalDateTime(value: string) {
  const [date, time] = value.split('T');
  return time ? `${formatCalendarDate(date)} ${time.slice(0, 5)}` : formatCalendarDate(date);
}

function toLocalDateTimeInput(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Date-time picker minimum with a short buffer to avoid selecting a time that has just passed. */
export function minimumRentalDateTime(now: number) {
  return toLocalDateTimeInput(new Date(now + 2 * 60_000));
}

/** Returns a picker minimum that is both in the future and after the selected pickup time. */
export function minimumRentalReturnDateTime(pickup: string, now: number) {
  const pickupTime = Date.parse(pickup);
  const minimumTime = Number.isFinite(pickupTime)
    ? Math.max(now + 2 * 60_000, pickupTime + 60_000)
    : now + 2 * 60_000;
  return toLocalDateTimeInput(new Date(minimumTime));
}

export function formatPolicyDate(value?: string) {
  return value ? formatCalendarDate(value) : 'Hiện hành';
}

const vietnamDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatVietnamDateTime(value?: string | Date) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = vietnamDateTime.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

export function formatVietnamDate(value?: string | Date) {
  return formatVietnamDateTime(value).slice(0, 10);
}
