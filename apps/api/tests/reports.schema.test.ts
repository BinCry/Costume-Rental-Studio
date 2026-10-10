import { describe, expect, it } from 'vitest';

import { reportQuerySchema } from '../src/modules/reports/report.schema.js';

describe('report query schema', () => {
  it('defaults to a thirty-day range and daily grouping', () => {
    const result = reportQuerySchema.parse({});
    expect(result.groupBy).toBe('day');
    expect(result.to.getTime() - result.from.getTime()).toBe(30 * 24 * 60 * 60 * 1_000);
  });

  it('rejects invalid and excessively broad periods', () => {
    expect(
      reportQuerySchema.safeParse({
        from: '2026-10-10T00:00:00.000Z',
        to: '2026-10-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      reportQuerySchema.safeParse({
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-10-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
