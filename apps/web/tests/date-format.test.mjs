const { expect, it } = globalThis;

it('formats a booking summary date without shifting the selected wall-clock time', async () => {
  const { formatLocalDateTime } = await import('../src/utils/date-format.ts');
  expect(formatLocalDateTime('2026-03-05T09:07')).toBe('05/03/2026 09:07');
  expect(formatLocalDateTime('')).toBe('');
});
