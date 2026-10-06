import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export interface SessionMetadata {
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ip?: string;
  familyCreatedAt?: Date;
}

export function accessSecret() {
  if (!env.JWT_ACCESS_SECRET)
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured');
  return env.JWT_ACCESS_SECRET;
}

export function refreshTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// Serializes credential changes and session issuance for one user across API instances.
export async function lockUserAuthentication(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-user:${userId}`}, 0))`;
}

export async function issueAccessToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(accessSecret()));
}

export async function issueSessionTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  familyId: string = randomUUID(),
  expiresAt = new Date(Date.now() + refreshLifetimeMs),
  metadata: SessionMetadata = {},
) {
  const refreshToken = randomBytes(32).toString('base64url');
  const familyCreatedAt = metadata.familyCreatedAt ?? new Date();
  await tx.refreshSession.create({
    data: {
      userId,
      familyId,
      tokenHash: refreshTokenHash(refreshToken),
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      userAgent: metadata.userAgent,
      lastIp: metadata.ip,
      familyCreatedAt,
      expiresAt,
    },
  });
  return {
    accessToken: await issueAccessToken(userId),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    refreshExpiresIn: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}
