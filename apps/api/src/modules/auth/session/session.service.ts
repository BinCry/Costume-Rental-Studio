import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import type { Logger } from 'pino';

import { AppError } from '../../../common/errors/app-error.js';
import { logger } from '../../../config/logger.js';
import { prisma } from '../../../database/prisma.js';
import type { CustomerActor } from '../../customers/customer.service.js';
import type { ChangePasswordInput, LoginInput } from './session.schema.js';
import {
  accessSecret,
  issueSessionTokens,
  lockUserAuthentication,
  refreshTokenHash,
  type SessionMetadata,
} from '../token.service.js';

let dummyPasswordHash: Promise<string> | undefined;
const refreshCreationSafetyWindowMs = 5_000;
function dummyHash() {
  dummyPasswordHash ??= hash(randomBytes(32).toString('hex'), {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  return dummyPasswordHash;
}

function invalidLogin() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
}

function invalidCurrentPassword() {
  return new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
}

function optionalString(value: string | null | undefined) {
  return value === null ? undefined : value;
}

export async function login(input: LoginInput, metadata: SessionMetadata = {}) {
  accessSecret();
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { employee: true },
  });
  // Unknown accounts still run Argon2 verification; responses never reveal account existence.
  const candidateHash = user?.passwordHash ?? (await dummyHash());
  let valid: boolean;
  try {
    valid = await verify(candidateHash, input.password);
  } catch {
    valid = false;
  }
  if (
    !valid ||
    !user?.passwordHash ||
    !user.emailVerifiedAt ||
    user.status !== 'ACTIVE' ||
    (user.employee && user.employee.employmentStatus !== 'ACTIVE')
  )
    throw invalidLogin();

  return prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, user.id);
    const current = await tx.user.updateMany({
      where: {
        id: user.id,
        email: input.email,
        emailVerifiedAt: { not: null },
        status: 'ACTIVE',
        passwordHash: user.passwordHash,
      },
      data: { lastLoginAt: new Date() },
    });
    if (current.count !== 1) throw invalidLogin();
    const tokens = await issueSessionTokens(tx, user.id, undefined, undefined, metadata);
    return {
      ...tokens,
      user: { id: user.id, displayName: user.displayName, phone: user.phone, email: user.email },
    };
  });
}

type RefreshFailureReason =
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_REPLAYED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_NEAR_EXPIRY'
  | 'ACCOUNT_INACTIVE'
  | 'EMPLOYEE_INACTIVE'
  | 'TOKEN_CONSUMPTION_CONFLICT';

function refreshFailure(
  reason: RefreshFailureReason,
  session?: { userId: string; familyId: string },
) {
  return {
    ok: false as const,
    reason,
    ...(session ? { userId: session.userId, familyId: session.familyId } : {}),
  };
}

export async function refresh(
  refreshToken: string,
  metadata: SessionMetadata = {},
  log: Pick<Logger, 'warn'> = logger,
) {
  accessSecret();
  const tokenHash = refreshTokenHash(refreshToken);
  const result = await prisma.$transaction(async (tx) => {
    const candidate = await tx.refreshSession.findUnique({ where: { tokenHash } });
    if (!candidate) return refreshFailure('TOKEN_NOT_FOUND');
    // All tokens in a login family serialize rotation and replay revocation across instances.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`refresh:${candidate.familyId}`}, 0))`;
    await lockUserAuthentication(tx, candidate.userId);
    const session = await tx.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { employee: true } } },
    });
    if (!session) return refreshFailure('TOKEN_NOT_FOUND');
    const now = new Date();
    if (session.usedAt || session.revokedAt) {
      // Return instead of throwing so revoking the entire family commits.
      await tx.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return refreshFailure(session.usedAt ? 'TOKEN_REPLAYED' : 'TOKEN_REVOKED', session);
    }
    const remainingMs = session.expiresAt.getTime() - now.getTime();
    const reason: RefreshFailureReason | undefined =
      remainingMs <= 0
        ? 'TOKEN_EXPIRED'
        : remainingMs <= refreshCreationSafetyWindowMs
          ? 'TOKEN_NEAR_EXPIRY'
          : session.user.status !== 'ACTIVE'
            ? 'ACCOUNT_INACTIVE'
            : session.user.employee && session.user.employee.employmentStatus !== 'ACTIVE'
              ? 'EMPLOYEE_INACTIVE'
              : undefined;
    if (reason) {
      await tx.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return refreshFailure(reason, session);
    }
    const consumed = await tx.refreshSession.updateMany({
      where: { id: session.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return refreshFailure('TOKEN_CONSUMPTION_CONFLICT', session);
    // Absolute expiry stays seven days from login, not seven extra days per refresh.
    const tokens = await issueSessionTokens(
      tx,
      session.userId,
      session.familyId,
      session.expiresAt,
      {
        deviceId: optionalString(session.deviceId) ?? metadata.deviceId,
        deviceName: optionalString(session.deviceName) ?? metadata.deviceName,
        userAgent: metadata.userAgent ?? optionalString(session.userAgent),
        ip: metadata.ip ?? optionalString(session.lastIp),
        familyCreatedAt: session.familyCreatedAt,
      },
    );
    return { ok: true as const, tokens };
  });
  if (!result.ok) {
    // Log after commit so a rejection cannot roll back family revocation.
    log.warn(
      {
        event: 'refresh_token_rejected',
        reason: result.reason,
        userId: result.userId,
        familyId: result.familyId,
      },
      'Refresh token rejected',
    );
    throw new AppError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Refresh token is invalid or expired; log in again',
    );
  }
  return result.tokens;
}

export async function listSessions(userId: string) {
  const now = new Date();
  return prisma.refreshSession.findMany({
    where: { userId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: {
      familyId: true,
      deviceId: true,
      deviceName: true,
      userAgent: true,
      lastIp: true,
      familyCreatedAt: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function logout(refreshToken: string) {
  const tokenHash = refreshTokenHash(refreshToken);
  await prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) return;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`refresh:${session.familyId}`}, 0))`;
    await tx.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function revokeSession(userId: string, familyId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`refresh:${familyId}`}, 0))`;
    await tx.refreshSession.updateMany({
      where: { userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, userId);
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const candidate = await prisma.user.findUnique({
    where: { id: userId },
    include: { employee: true },
  });
  if (
    !candidate?.passwordHash ||
    !candidate.emailVerifiedAt ||
    candidate.status !== 'ACTIVE' ||
    (candidate.employee && candidate.employee.employmentStatus !== 'ACTIVE')
  ) {
    throw invalidCurrentPassword();
  }

  let currentPasswordIsValid: boolean;
  try {
    currentPasswordIsValid = await verify(candidate.passwordHash, input.currentPassword);
  } catch {
    currentPasswordIsValid = false;
  }
  if (!currentPasswordIsValid) throw invalidCurrentPassword();
  if (input.currentPassword === input.newPassword) {
    throw new AppError(400, 'PASSWORD_UNCHANGED', 'New password must be different');
  }

  // Argon2 runs before opening the transaction so an expensive hash does not hold a DB lock.
  const passwordHash = await hash(input.newPassword, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const changed = await prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, userId);
    // Matching the hash read above prevents a concurrent credential change from being overwritten.
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        passwordHash: candidate.passwordHash,
        emailVerifiedAt: { not: null },
        status: 'ACTIVE',
      },
      data: { passwordHash },
    });
    if (updated.count !== 1) return false;
    // Re-authentication with the old password must not authorize a later email change.
    await tx.emailChangeChallenge.deleteMany({ where: { userId } });
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  });
  if (!changed) throw invalidCurrentPassword();
}

export function currentUser(actor: CustomerActor) {
  const employeeActive = actor.employee?.employmentStatus === 'ACTIVE';
  const roles = actor.roleAssignments
    .filter(
      ({ role, branchId, branch }) =>
        role.isActive &&
        (branchId === null || branch?.status === 'ACTIVE') &&
        (role.actorGroup === 'CUSTOMER' || employeeActive),
    )
    .map(({ role, branchId }) => ({
      roleCode: role.roleCode,
      name: role.name,
      actorGroup: role.actorGroup,
      branchId,
      permissions: role.rolePermissions.map(({ permission }) => ({
        code: permission.code,
        scope: permission.scope,
      })),
    }));
  return {
    id: actor.id,
    displayName: actor.displayName,
    email: actor.email,
    phone: actor.phone,
    avatarUrl: actor.avatarUrl,
    status: actor.status,
    emailVerifiedAt: actor.emailVerifiedAt,
    roles,
  };
}
