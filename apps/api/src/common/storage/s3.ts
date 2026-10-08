import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import sharp from 'sharp';

import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';

export const allowedImageContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageContentType = (typeof allowedImageContentTypes)[number];

interface StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function storageConfig(): StorageConfig {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_REGION ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Object storage is not configured');
  }

  return {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

function client(endpoint: string, config: StorageConfig) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function normalizedContentType(contentType: string | undefined) {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase();
}

function hasBytes(bytes: Uint8Array, expected: readonly number[], offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function imageContentTypeForBytes(bytes: Uint8Array): AllowedImageContentType | undefined {
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  return undefined;
}

export async function normalizeImageBytes(input: {
  bytes: Uint8Array;
  contentType: AllowedImageContentType;
  maxBytes: number;
  maxDimension: number;
  maxPixels: number;
}) {
  try {
    const image = sharp(Buffer.from(input.bytes), {
      failOn: 'error',
      limitInputPixels: input.maxPixels,
    }).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > input.maxDimension ||
      metadata.height > input.maxDimension
    )
      throw new AppError(
        400,
        'INVALID_UPLOAD',
        `Image dimensions must not exceed ${input.maxDimension}px`,
      );

    let normalized: Buffer;
    if (input.contentType === 'image/jpeg')
      normalized = await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    else if (input.contentType === 'image/png')
      normalized = await image.png({ compressionLevel: 9 }).toBuffer();
    else normalized = await image.webp({ quality: 90 }).toBuffer();

    if (normalized.length > input.maxBytes)
      throw new AppError(400, 'INVALID_UPLOAD', 'Normalized image exceeds the allowed size');
    return normalized;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'INVALID_UPLOAD', 'Uploaded image could not be fully decoded');
  }
}

export function isObjectStorageConfigured() {
  return Boolean(
    env.S3_ENDPOINT &&
    env.S3_REGION &&
    env.S3_BUCKET &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY,
  );
}

export async function createPresignedPostUrl(input: {
  key: string;
  contentType: AllowedImageContentType;
}) {
  const config = storageConfig();
  const signed = await createPresignedPost(client(config.publicEndpoint, config), {
    Bucket: config.bucket,
    Key: input.key,
    Expires: env.S3_PRESIGN_TTL_SECONDS,
    Fields: { 'Content-Type': input.contentType },
    Conditions: [
      ['content-length-range', 1, env.MEDIA_MAX_UPLOAD_BYTES],
      ['eq', '$Content-Type', input.contentType],
    ],
  });

  return {
    uploadUrl: signed.url,
    fields: signed.fields,
    expiresAt: new Date(Date.now() + env.S3_PRESIGN_TTL_SECONDS * 1_000).toISOString(),
  };
}

async function normalizeAndStoreImage(input: {
  key: string;
  destinationKey: string;
  contentType: AllowedImageContentType;
  maxBytes: number;
}) {
  const config = storageConfig();
  let object: HeadObjectCommandOutput;
  try {
    object = await client(config.endpoint, config).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: input.key }),
    );
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : undefined;
    if (name === 'NotFound' || name === 'NoSuchKey')
      throw new AppError(400, 'UPLOAD_NOT_FOUND', 'The uploaded image was not found');
    throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Could not verify the uploaded image');
  }

  if (normalizedContentType(object.ContentType) !== input.contentType)
    throw new AppError(
      400,
      'INVALID_UPLOAD',
      'Uploaded image content type does not match the request',
    );
  if (!object.ContentLength || object.ContentLength > input.maxBytes)
    throw new AppError(400, 'INVALID_UPLOAD', 'Uploaded image exceeds the allowed size');

  let bytes: Uint8Array;
  try {
    const response = await client(config.endpoint, config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
      }),
    );
    if (!response.Body)
      throw new AppError(400, 'INVALID_UPLOAD', 'Uploaded image has no readable content');
    bytes = await response.Body.transformToByteArray();
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    const name = error instanceof Error ? error.name : undefined;
    if (name === 'NotFound' || name === 'NoSuchKey')
      throw new AppError(400, 'UPLOAD_NOT_FOUND', 'The uploaded image was not found');
    throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Could not inspect the uploaded image');
  }

  if (imageContentTypeForBytes(bytes.subarray(0, 16)) !== input.contentType)
    throw new AppError(
      400,
      'INVALID_UPLOAD',
      'Uploaded content is not a supported image or does not match its declared type',
    );
  if (bytes.length === 0 || bytes.length > input.maxBytes)
    throw new AppError(400, 'INVALID_UPLOAD', 'Uploaded image exceeds the allowed size');

  const normalized = await normalizeImageBytes({
    bytes,
    contentType: input.contentType,
    maxBytes: input.maxBytes,
    maxDimension: env.MEDIA_MAX_IMAGE_DIMENSION,
    maxPixels: env.MEDIA_MAX_IMAGE_PIXELS,
  });
  try {
    await client(config.endpoint, config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.destinationKey,
        Body: normalized,
        ContentType: input.contentType,
      }),
    );
  } catch {
    throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Could not normalize the uploaded image');
  }
}

export async function promoteStoredImage(input: {
  uploadKey: string;
  objectKey: string;
  contentType: AllowedImageContentType;
  maxBytes: number;
}) {
  await normalizeAndStoreImage({
    key: input.uploadKey,
    destinationKey: input.objectKey,
    contentType: input.contentType,
    maxBytes: input.maxBytes,
  });
}

// Kept for compatibility with callers that need in-place normalization.
export async function assertStoredImage(input: {
  key: string;
  contentType: AllowedImageContentType;
  maxBytes: number;
}) {
  await normalizeAndStoreImage({
    key: input.key,
    destinationKey: input.key,
    contentType: input.contentType,
    maxBytes: input.maxBytes,
  });
}

export async function deleteStoredObject(key: string) {
  const config = storageConfig();
  await client(config.endpoint, config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}

export async function listStoredObjectsPage(input: {
  prefix: string;
  continuationToken?: string;
  maxKeys?: number;
}) {
  const config = storageConfig();
  const response = await client(config.endpoint, config).send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: input.prefix,
      ContinuationToken: input.continuationToken,
      MaxKeys: input.maxKeys ?? 500,
    }),
  );
  return {
    objects: (response.Contents ?? []).flatMap((object) =>
      object.Key ? [{ key: object.Key, lastModified: object.LastModified }] : [],
    ),
    nextContinuationToken: response.NextContinuationToken,
  };
}

export function publicObjectUrl(key: string) {
  if (!env.MEDIA_PUBLIC_BASE_URL) return undefined;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return new URL(encodedKey, `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/`).toString();
}

export function imageContentTypeForKey(key: string): AllowedImageContentType | undefined {
  const extension = key.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return undefined;
}
