import { describe, expect, it } from 'vitest';

import {
  createTransferSchema,
  receiveTransferSchema,
  shipTransferSchema,
  updateTransferSchema,
} from '../src/modules/transfers/transfer.schema.js';

const sourceBranchId = '11111111-1111-4111-8111-111111111111';
const destinationBranchId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';

describe('stock transfer request schemas', () => {
  it('requires distinct branches and unique requested units', () => {
    expect(
      createTransferSchema.safeParse({
        fromBranchId: sourceBranchId,
        toBranchId: sourceBranchId,
        unitIds: [unitId, unitId],
      }).success,
    ).toBe(false);
  });

  it('requires an optimistic-lock version for a requested-transfer amendment', () => {
    expect(updateTransferSchema.safeParse({ requestNote: 'Amend request' }).success).toBe(false);
    expect(
      updateTransferSchema.safeParse({ expectedVersion: 1, requestNote: 'Amend request' }).success,
    ).toBe(true);
  });

  it('rejects duplicate shipment items', () => {
    expect(
      shipTransferSchema.safeParse({
        expectedVersion: 1,
        items: [
          { unitId, conditionOut: 'GOOD' },
          { unitId, conditionOut: 'GOOD' },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires damaged received units to go to repair', () => {
    expect(
      receiveTransferSchema.safeParse({
        expectedVersion: 1,
        items: [{ unitId, conditionIn: 'DAMAGED', receivedOperationalStatus: 'READY' }],
      }).success,
    ).toBe(false);
    expect(
      receiveTransferSchema.safeParse({
        expectedVersion: 1,
        items: [{ unitId, conditionIn: 'DAMAGED', receivedOperationalStatus: 'REPAIR' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a valid transfer request', () => {
    expect(
      createTransferSchema.safeParse({
        fromBranchId: sourceBranchId,
        toBranchId: destinationBranchId,
        unitIds: [unitId],
      }).success,
    ).toBe(true);
  });
});
