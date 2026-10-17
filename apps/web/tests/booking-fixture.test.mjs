const { afterEach, describe, expect, it, vi } = globalThis;
import { branches, fixtureAdapter, fixturePeriod } from '../src/fixtures/adapter.ts';

afterEach(() => vi.unstubAllGlobals());

const draft = {
  costumeId: 'ao-dai-lina',
  variant: 'M / Hồng phấn',
  quantity: 1,
  branch: branches[0],
  pickup: fixturePeriod.pickup,
  returnAt: fixturePeriod.returnAt,
  name: 'Nguyễn An',
  phone: '0900000000',
  note: '',
};

describe('booking fixture defaults', () => {
  it('uses a future rental window with the sample two-day duration', () => {
    const pickup = new Date(fixturePeriod.pickup);
    const returnAt = new Date(fixturePeriod.returnAt);

    expect(pickup.getTime()).toBeGreaterThan(Date.now());
    expect(returnAt.getTime() - pickup.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('expires the sample quote thirty minutes before pickup', async () => {
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout });
    const quote = await fixtureAdapter.getQuote(draft, 'normal');
    const [dateLabel, timeLabel] = quote.expiresAt.split(' · ');
    const [day, month, year] = dateLabel.split('/').map(Number);
    const [hours, minutes] = timeLabel.split(':').map(Number);
    const expiry = new Date(year, month - 1, day, hours, minutes);

    expect(expiry.getTime()).toBe(new Date(fixturePeriod.pickup).getTime() - 30 * 60 * 1000);
  });
});
