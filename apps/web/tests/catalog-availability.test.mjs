const { afterEach, describe, expect, it, vi } = globalThis;

vi.mock('../src/api/client.ts', () => ({
  checkPublicAvailability: vi.fn(),
}));

const { checkPublicAvailability } = await import('../src/api/client.ts');
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
    vi.mocked(checkPublicAvailability)
      .mockResolvedValueOnce({ available: true })
      .mockResolvedValueOnce({ available: false });

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
  });

  it('filters the availability requests by selected size and color', async () => {
    vi.mocked(checkPublicAvailability).mockResolvedValue({ available: true });

    const result = await checkCatalogAvailability(
      [catalogItem],
      'Chi nhánh Quận 1',
      '2026-10-18T09:00',
      '2026-10-20T09:00',
      'S',
      'Hồng phấn',
    );

    expect(checkPublicAvailability).toHaveBeenCalledTimes(1);
    expect(checkPublicAvailability).toHaveBeenCalledWith(
      'variant-s-pink',
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
    expect(checkPublicAvailability).not.toHaveBeenCalled();
  });

  it('keeps availability unknown when every variant check fails', async () => {
    vi.mocked(checkPublicAvailability).mockRejectedValue(new Error('network error'));

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
});
