import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';

const { createApp } = await import('../src/app.js');
interface OpenApiResponse {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, unknown>>;
}

describe('OpenAPI documentation', () => {
  it('serves the Catalog OpenAPI document without authentication', async () => {
    const response = await request(createApp()).get('/api/openapi.json').expect(200);
    const document = response.body as OpenApiResponse;
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('Costume Rental Studio API');
    expect(document.paths['/catalog/variants/{id}']).toBeDefined();
    expect(document.paths['/uploads/presign']).toBeDefined();
    expect(document.paths['/branches']).toBeDefined();
    expect(document.paths['/branches/{branchId}']?.delete).toBeDefined();
    expect(document.paths['/branches/{branchId}/activate']).toBeDefined();
    expect(document.paths['/branches/{branchId}/deactivate']).toBeDefined();
    expect(document.paths['/inventory/transfers']).toBeDefined();
    expect(document.paths['/inventory/transfers/{transferId}/receive']).toBeDefined();
    expect(document.paths['/reports/overview']).toBeDefined();
    expect(document.paths['/reports/revenue']).toBeDefined();
    expect(document.paths['/rentals/orders/{orderId}/extend']?.post).toBeDefined();
    expect(
      document.paths['/rentals/orders/{orderId}/items/{orderItemId}/amend']?.post,
    ).toBeDefined();
    for (const path of [
      '/catalog/categories/{id}',
      '/catalog/models/{id}',
      '/catalog/variants/{id}',
      '/catalog/accessories/{id}',
    ]) {
      expect(document.paths[path]?.delete).toBeDefined();
    }
  });

  it('serves Swagger UI', async () => {
    const response = await request(createApp())
      .get('/api/docs/')
      .expect('Content-Type', /html/)
      .expect(200);
    expect(response.text).toContain('swagger-ui-bundle.js');
  });
});
