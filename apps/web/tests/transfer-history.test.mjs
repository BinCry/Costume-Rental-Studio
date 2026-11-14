const { describe, expect, it } = globalThis;
const { newTransferHistory } = await import('../src/utils/transfer-history.ts');

describe('new stock transfer history', () => {
  it('stamps the request with the real day in Vietnam time', () => {
    // 18:30 UTC on 13/11 is already 14/11 in Vietnam.
    expect(newTransferHistory(new Date('2026-11-13T18:30:00.000Z'))).toEqual([
      '14/11 · Tạo yêu cầu',
    ]);
  });
});
