import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.WEB_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/costume_rental_test';

let imageContentTypeForBytes: (
  bytes: Uint8Array,
) => 'image/jpeg' | 'image/png' | 'image/webp' | undefined;
let normalizeImageBytes: (input: {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  maxBytes: number;
  maxDimension: number;
  maxPixels: number;
}) => Promise<Uint8Array>;

beforeAll(async () => {
  ({ imageContentTypeForBytes, normalizeImageBytes } = await import('../src/common/storage/s3.js'));
});

describe('S3 image inspection', () => {
  it.each([
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      'image/webp',
    ],
  ] as const)('detects supported image signatures', (bytes, expected) => {
    expect(imageContentTypeForBytes(bytes)).toBe(expected);
  });

  it('rejects content whose bytes do not identify a supported image', () => {
    expect(
      imageContentTypeForBytes(new TextEncoder().encode('<script>alert(1)</script>')),
    ).toBeUndefined();
  });

  it('fully decodes and re-encodes images without carrying metadata forward', async () => {
    const source = await sharp({
      create: { width: 12, height: 8, channels: 3, background: '#ff0000' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const normalized = await normalizeImageBytes({
      bytes: source,
      contentType: 'image/jpeg',
      maxBytes: 1_000_000,
      maxDimension: 100,
      maxPixels: 10_000,
    });
    const metadata = await sharp(normalized).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(12);
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects a corrupt file even when it starts with a JPEG signature', async () => {
    await expect(
      normalizeImageBytes({
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]),
        contentType: 'image/jpeg',
        maxBytes: 1_000_000,
        maxDimension: 100,
        maxPixels: 10_000,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
  });
});
