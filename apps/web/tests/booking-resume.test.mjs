const { afterEach, describe, expect, it, vi } = globalThis;

const draft = {
  costumeId: 'costume-1',
  variant: 'M / Đỏ',
  quantity: 1,
  branch: 'Chi nhánh 1',
  pickup: '2026-12-01T10:00',
  returnAt: '2026-12-03T10:00',
  name: 'Khách cũ',
  phone: '0901234567',
  note: 'Giao cho người khác',
  items: [{ costumeId: 'costume-1', variant: 'M / Đỏ', quantity: 1 }],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resume a booking after login', () => {
  it('keeps the selection but clears stale contact details after 24 hours', async () => {
    const now = new Date('2026-11-18T10:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => JSON.stringify({ savedAt: now - 25 * 60 * 60 * 1000, draft }),
      },
    });
    const { readResumedBooking } = await import('../src/pages/bookingResume.ts');
    const result = readResumedBooking(new URLSearchParams('resume=1'), draft);
    expect(result?.expired).toBe(true);
    expect(result?.draft.items).toEqual(draft.items);
    expect(result?.draft.pickup).toBe(draft.pickup);
    expect(result?.draft.name).toBe('');
    expect(result?.draft.phone).toBe('');
    expect(result?.draft.note).toBe('');
  });

  it('keeps recent contact details in the same login session', async () => {
    const now = new Date('2026-11-18T10:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => JSON.stringify({ savedAt: now - 60_000, draft }),
      },
    });
    const { readResumedBooking } = await import('../src/pages/bookingResume.ts');
    const result = readResumedBooking(new URLSearchParams('resume=1'), draft);
    expect(result?.expired).toBe(false);
    expect(result?.draft.name).toBe(draft.name);
  });
});
