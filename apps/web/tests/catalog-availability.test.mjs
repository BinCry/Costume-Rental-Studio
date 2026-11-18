const { afterEach, describe, expect, it, vi } = globalThis;

vi.mock('../src/api/client.ts', () => ({
  checkPublicAvailabilityBatch: vi.fn(),
}));

const { checkPublicAvailabilityBatch } = await import('../src/api/client.ts');
const { checkCatalogAvailability } = await import('../src/pages/catalogAvailability.ts');

afterEach(() => vi.resetAllMocks());

const catalogItem = {
  id: 'ao-dai-lina',
  apiVariants: [
    { id: 'variant-m-pink', size: 'M', color: 'Hồng phấn' },
    { id: 'variant-s-pink', size: 'S', color: 'Hồng phấn' },
  ],
};

describe('catalog variant availability', () => {
  it('shows only the size and color variants confirmed for the selected period', async () => {
    vi.mocked(checkPublicAvailabilityBatch).mockResolvedValue([
      { variantId: 'variant-m-pink', available: true },
      { variantId: 'variant-s-pink', available: false },
    ]);

    const result = await checkCatalogAvailability(
      [catalogItem],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
      'Tất cả',
      'Tất cả',
    );

    expect(result.values[catalogItem.id]).toBe('available');
    expect(result.availableVariants[catalogItem.id]).toEqual(['M / Hồng phấn']);
    expect(checkPublicAvailabilityBatch).toHaveBeenCalledTimes(1);
  });

  it('filters the availability requests by selected size and color', async () => {
    vi.mocked(checkPublicAvailabilityBatch).mockResolvedValue([
      { variantId: 'variant-s-pink', available: true },
    ]);

    const result = await checkCatalogAvailability(
      [catalogItem],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
      'S',
      'Hồng phấn',
    );

    expect(checkPublicAvailabilityBatch).toHaveBeenCalledTimes(1);
    expect(checkPublicAvailabilityBatch).toHaveBeenCalledWith(
      ['variant-s-pink'],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
    );
    expect(result.availableVariants[catalogItem.id]).toEqual(['S / Hồng phấn']);
  });

  it('does not label a model unavailable when the catalog has no variants to check', async () => {
    const result = await checkCatalogAvailability(
      [{ id: 'model-without-variants' }],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
      'Tất cả',
      'Tất cả',
    );

    expect(result.values['model-without-variants']).toBe('error');
    expect(checkPublicAvailabilityBatch).not.toHaveBeenCalled();
  });

  it('keeps availability unknown when every variant check fails', async () => {
    vi.mocked(checkPublicAvailabilityBatch).mockRejectedValue(new Error('network error'));

    const result = await checkCatalogAvailability(
      [catalogItem],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
      'Tất cả',
      'Tất cả',
    );

    expect(result.values[catalogItem.id]).toBe('error');
    expect(result.availableVariants[catalogItem.id]).toBeUndefined();
  });

  it('splits large catalogs into batches of at most 50 variants', async () => {
    const apiVariants = Array.from({ length: 51 }, (_, index) => ({
      id: `variant-${index}`, size: 'M', color: 'Đỏ',
    }));
    vi.mocked(checkPublicAvailabilityBatch).mockImplementation(async (ids) =>
      ids.map((variantId) => ({ variantId, available: true })));

    const result = await checkCatalogAvailability(
      [{ id: 'large-model', apiVariants }],
      'Chi nhánh Quận 1', '2026-10-18T09:00', '2026-10-20T09:00', 'Tất cả', 'Tất cả',
    );
    expect(checkPublicAvailabilityBatch).toHaveBeenCalledTimes(2);
    expect(checkPublicAvailabilityBatch.mock.calls.map(([ids]) => ids.length)).toEqual([50, 1]);
    expect(result.availableVariants['large-model']).toHaveLength(51);
  });
});
