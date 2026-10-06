import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { verify } from 'argon2';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { prisma } from '../../../database/prisma.js';
import { assertEmailOtpDeliveryAvailable, deliverEmailOtp } from '../registration/otp.delivery.js';
import { lockUserAuthentication } from '../token.service.js';
import type { ConfirmEmailChangeInput, RequestEmailChangeInput } from './email-change.schema.js';

const otpLifetimeMs = 5 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

function otpSecret() {
  if (!env.OTP_HASH_SECRET) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Email change is not configured');
  }
  return env.OTP_HASH_SECRET;
}

function otpHash(id: string, userId: string, email: string, code: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`email-change:${id}:${userId}:${email}:${code}`)
    .digest('hex');
}

function invalidCurrentPassword() {
  return new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
}

function invalidOtp() {
  return new AppError(400, 'INVALID_OTP', 'Code is invalid, expired or already used');
}

function emailInUse() {
  return new AppError(409, 'EMAIL_ALREADY_IN_USE', 'Email is already in use');
}

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function requestEmailChange(userId: string, input: RequestEmailChangeInput) {
  const secret = otpSecret();
  assertEmailOtpDeliveryAvailable();
  const candidate = await prisma.user.findUnique({
    where: { id: userId },
    include: { employee: true },
  });
  if (
    !candidate?.email ||
    !candidate.emailVerifiedAt ||
    !candidate.passwordHash ||
    candidate.status !== 'ACTIVE' ||
    (candidate.employee && candidate.employee.employmentStatus !== 'ACTIVE')
  ) {
    throw invalidCurrentPassword();
  }

  let passwordIsValid: boolean;
  try {
    passwordIsValid = await verify(candidate.passwordHash, input.currentPassword);
  } catch {
    passwordIsValid = false;
  }
  if (!passwordIsValid) throw invalidCurrentPassword();
  if (candidate.email === input.newEmail) {
    throw new AppError(400, 'EMAIL_UNCHANGED', 'New email must be different');
  }

  const id = randomUUID();
  const code = randomInt(0, 1000000).toString().padStart(6, '0');
  const challenge = await prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, userId);
    const current = await tx.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });
    if (
      !current?.email ||
      current.email !== candidate.email ||
      current.passwordHash !== candidate.passwordHash ||
      !current.emailVerifiedAt ||
      current.status !== 'ACTIVE' ||
      (current.employee && current.employee.employmentStatus !== 'ACTIVE')
    ) {
      throw new AppError(409, 'EMAIL_CHANGE_CONFLICT', 'Account changed; try again');
    }

    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-email:${input.newEmail}`}, 0))`;
    const emailOwner = await tx.user.findUnique({
      where: { email: input.newEmail },
      select: { id: true },
    });
    if (emailOwner) throw emailInUse();

    const now = new Date();
    const previous = await tx.emailChangeChallenge.findUnique({ where: { userId } });
    if (previous && now.getTime() - previous.createdAt.getTime() < resendCooldownMs) {
      throw new AppError(429, 'OTP_COOLDOWN', 'Wait 60 seconds before requesting another code');
    }
    const data = {
      id,
      userId,
      newEmail: input.newEmail,
      codeHash: otpHash(id, userId, input.newEmail, code, secret),
      attemptCount: 0,
      expiresAt: new Date(now.getTime() + otpLifetimeMs),
      sentAt: null,
      consumedAt: null,
      createdAt: now,
    };
    return tx.emailChangeChallenge.upsert({ where: { userId }, create: data, update: data });
  });

  try {
    await deliverEmailOtp(input.newEmail, code, 'email-change');
  } catch {
    throw new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Unable to deliver the verification code');
  }
  await prisma.emailChangeChallenge.updateMany({
    where: { id, userId, consumedAt: null },
    data: { sentAt: new Date() },
  });
  return { challengeId: challenge.id, expiresIn: 300, retryAfter: 60 };
}

export async function confirmEmailChange(userId: string, input: ConfirmEmailChangeInput) {
  const secret = otpSecret();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockUserAuthentication(tx, userId);
      const candidate = await tx.emailChangeChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (candidate?.userId !== userId) return { ok: false as const };

      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-email:${candidate.newEmail}`}, 0))`;
      const challenge = await tx.emailChangeChallenge.findUnique({
        where: { id: input.challengeId },
        include: { user: { include: { employee: true } } },
      });
      const now = new Date();
      if (
        !challenge?.sentAt ||
        challenge.userId !== userId ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attemptCount >= maxAttempts ||
        !challenge.user.email ||
        !challenge.user.emailVerifiedAt ||
        !challenge.user.passwordHash ||
        challenge.user.status !== 'ACTIVE' ||
        (challenge.user.employee && challenge.user.employee.employmentStatus !== 'ACTIVE')
      ) {
        return { ok: false as const };
      }

      const expected = otpHash(
        challenge.id,
        challenge.userId,
        challenge.newEmail,
        input.otp,
        secret,
      );
      if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(expected, 'hex'))) {
        await tx.emailChangeChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: { increment: 1 } },
        });
        return { ok: false as const };
      }

      const emailOwner = await tx.user.findUnique({
        where: { email: challenge.newEmail },
        select: { id: true },
      });
      if (emailOwner?.id !== undefined && emailOwner.id !== userId) {
        return { ok: false as const, reason: 'EMAIL_ALREADY_IN_USE' as const };
      }
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          email: challenge.user.email,
          emailVerifiedAt: { not: null },
          passwordHash: { not: null },
          status: 'ACTIVE',
          OR: [{ employee: { is: null } }, { employee: { is: { employmentStatus: 'ACTIVE' } } }],
        },
        data: { email: challenge.newEmail, emailVerifiedAt: now },
      });
      if (updated.count !== 1) {
        return { ok: false as const, reason: 'ACCOUNT_CHANGED' as const };
      }
      // A recovery code sent to the old email must not survive an email change.
      await tx.passwordResetChallenge.deleteMany({ where: { userId } });
      await tx.emailChangeChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { ok: true as const };
    });

    if (!result.ok) {
      if (result.reason === 'EMAIL_ALREADY_IN_USE') throw emailInUse();
      if (result.reason === 'ACCOUNT_CHANGED') {
        throw new AppError(409, 'EMAIL_CHANGE_CONFLICT', 'Account changed; request a new code');
      }
      throw invalidOtp();
    }
  } catch (error) {
    if (isUniqueConflict(error)) throw emailInUse();
    throw error;
  }
}
