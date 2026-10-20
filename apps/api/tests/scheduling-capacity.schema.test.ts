import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  createUnitBlockSchema,
  updateUnitBlockSchema,
} from '../src/modules/scheduling/scheduling.schema.js';

const unitId = '30000000-0000-4000-8000-000000000001';
const capacityWindowId = '30000000-0000-4000-8000-000000000002';

describe('unit-block capacity fields', () => {
  it('keeps the forward migration constraints and branch-window relation', () => {
    const migration = readFileSync(
      new URL(
        '../prisma/migrations/20261020010000_remaining_operational_capacity/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN capacity_window_id UUID');
    expect(migration).toContain('ADD COLUMN remaining_effort_minutes INTEGER');
    expect(migration).toContain('REFERENCES branch_capacity_windows(id)');
    expect(migration).toContain("status <> 'PLANNED' OR remaining_effort_minutes IS NULL");
  });

  it('accepts an explicitly assigned planned workload', () => {
    const result = createUnitBlockSchema.safeParse({
      unitId,
      capacityWindowId,
      blockType: 'REPAIR',
      blockedFrom: '2026-10-20T08:00:00Z',
      blockedUntil: '2026-10-20T10:00:00Z',
      estimatedEffortMinutes: 90,
      reason: 'Repair damaged seam',
    });

    expect(result.success).toBe(true);
  });

  it('accepts zero remaining effort for an in-progress workload update', () => {
    const result = updateUnitBlockSchema.safeParse({
      remainingEffortMinutes: 0,
      expectedUpdatedAt: '2026-10-20T08:30:00Z',
    });

    expect(result.success).toBe(true);
  });

  it('does not allow remaining effort to be preloaded on a planned block', () => {
    const result = createUnitBlockSchema.safeParse({
      unitId,
      capacityWindowId,
      blockType: 'REPAIR',
      blockedFrom: '2026-10-20T08:00:00Z',
      blockedUntil: '2026-10-20T10:00:00Z',
      estimatedEffortMinutes: 90,
      remainingEffortMinutes: 0,
      reason: 'Repair damaged seam',
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative remaining effort', () => {
    const result = updateUnitBlockSchema.safeParse({
      remainingEffortMinutes: -1,
      expectedUpdatedAt: '2026-10-20T08:30:00Z',
    });

    expect(result.success).toBe(false);
  });
});
