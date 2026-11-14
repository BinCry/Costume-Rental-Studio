export function formatCalendarDate(value: string) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Booking inputs represent wall-clock time without a timezone. */
export function formatLocalDateTime(value: string) {
  const [date, time] = value.split('T');
  return time ? `${formatCalendarDate(date)} ${time.slice(0, 5)}` : formatCalendarDate(date);
}

export function formatPolicyDate(value?: string) {
  return value ? formatCalendarDate(value) : 'Hiện hành';
}
