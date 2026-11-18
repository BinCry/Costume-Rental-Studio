const { describe, expect, it } = globalThis;

const { quoteNeedsConfirmation } = await import('../src/pages/quoteConfirmation.ts');

const baseline = {
  id: 'old-quote',
  available: true,
  rental: 300000,
  deposit: 200000,
  discount: 0,
  amountDueAtPickup: 500000,
  daysLabel: '2 ngày',
  policy: 'V1',
  lateGraceMinutes: 60,
  lateFeePercentPerDay: 20,
  promotionCode: undefined,
  lines: [{ variantId: 'size-m', quantity: 1, availableUnits: 2, pricePerDay: 150000 }],
};

describe('reconfirming a rental quote before sending', () => {
  it('accepts a freshly calculated equivalent quote', () => {
    expect(quoteNeedsConfirmation(baseline, { ...baseline, id: 'new-quote' })).toBe(false);
  });

  it.each([
    ['price', { rental: 320000, amountDueAtPickup: 520000 }],
    ['deposit', { deposit: 250000, amountDueAtPickup: 550000 }],
    ['availability', { available: false }],
    ['promotion', { discount: 30000, amountDueAtPickup: 470000, promotionCode: 'SALE' }],
    ['policy', { policy: 'V2' }],
    ['policy version', { policyVersionId: 'policy-id-2' }],
    ['late fee', { lateFeePercentPerDay: 30 }],
    ['per-size price', { lines: [{ ...baseline.lines[0], pricePerDay: 160000 }] }],
  ])('requires review when %s changes', (_label, change) => {
    expect(quoteNeedsConfirmation(baseline, { ...baseline, ...change })).toBe(true);
  });

  it('does not interrupt checkout when capacity changes but the selected units remain available', () => {
    expect(
      quoteNeedsConfirmation(baseline, {
        ...baseline,
        lines: [{ ...baseline.lines[0], availableUnits: 1 }],
      }),
    ).toBe(false);
  });
});
