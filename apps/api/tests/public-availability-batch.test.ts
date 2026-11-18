import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';
process.env.JWT_ACCESS_SECRET = 'public-batch-test-key-only-not-for-production-12345';

const mocks = vi.hoisted(() => ({ availabilityBatch: vi.fn(), rentalEstimate: vi.fn() }));
vi.mock('../src/modules/public/public.service.js', () => ({
  listPublicBranches: vi.fn(),
  listPublicVariants: vi.fn(),
  getPublicVariant: vi.fn(),
  checkPublicAvailability: vi.fn(),
  checkPublicAvailabilityBatch: mocks.availabilityBatch,
}));
vi.mock('../src/modules/rentals/rental.service.js', () => ({
  createPublicRentalEstimate: mocks.rentalEstimate,
}));

const { createApp } = await import('../src/app.js');
const variantId = '10000000-0000-4000-8000-000000000001';
const branchId = '20000000-0000-4000-8000-000000000001';
const payload = {
  variantIds: [variantId],
  pickupBranchId: branchId,
  plannedStartAt: '2099-10-18T09:00:00.000Z',
  plannedDueAt: '2099-10-20T09:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.availabilityBatch.mockResolvedValue([
    {
      variantId,
      pickupBranchId: branchId,
      available: true,
      availableUnits: 2,
    },
  ]);
  mocks.rentalEstimate.mockResolvedValue({ subtotalVnd: '200000', available: true });
});

describe('public batch availability', () => {
  it('allows guest requests and parses a shared rental period once', async () => {
    const response = await request(createApp())
      .post('/api/v1/public/catalog/availability/batch')
      .send(payload)
      .expect(200);
    expect(response.body).toMatchObject({
      data: [
        {
          variantId,
          pickupBranchId: branchId,
          available: true,
          availableUnits: 2,
        },
      ],
    });
    expect(mocks.availabilityBatch).toHaveBeenCalledWith({
      variantIds: [variantId],
      pickupBranchId: branchId,
      plannedStartAt: new Date(payload.plannedStartAt),
      plannedDueAt: new Date(payload.plannedDueAt),
    });
  });

  it('rejects oversized batches and reversed dates before querying inventory', async () => {
    await request(createApp())
      .post('/api/v1/public/catalog/availability/batch')
      .send({ ...payload, variantIds: Array(51).fill(variantId) })
      .expect(400);
    await request(createApp())
      .post('/api/v1/public/catalog/availability/batch')
      .send({ ...payload, plannedDueAt: '2099-10-17T09:00:00.000Z' })
      .expect(400);
    expect(mocks.availabilityBatch).not.toHaveBeenCalled();
  });

  it('calculates a guest estimate without accepting a customer identity or promotion', async () => {
    const estimate = {
      pickupBranchId: branchId,
      plannedStartAt: payload.plannedStartAt,
      plannedDueAt: payload.plannedDueAt,
      items: [{ variantId, accessories: [] }],
    };
    await request(createApp()).post('/api/v1/public/rental-estimate').send(estimate).expect(200);
    expect(mocks.rentalEstimate).toHaveBeenCalledWith({
      ...estimate,
      plannedStartAt: new Date(estimate.plannedStartAt),
      plannedDueAt: new Date(estimate.plannedDueAt),
    });
    await request(createApp())
      .post('/api/v1/public/rental-estimate')
      .send({ ...estimate, customerUserId: variantId, promotionCode: 'PRIVATE' })
      .expect(400);
    expect(mocks.rentalEstimate).toHaveBeenCalledTimes(1);
  });
});
