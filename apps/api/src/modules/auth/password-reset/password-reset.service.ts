import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { argon2id, hash } from 'argon2';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { prisma } from '../../../database/prisma.js';
import { assertEmailOtpDeliveryAvailable, deliverEmailOtp } from '../registration/otp.delivery.js';
import { lockUserAuthentication } from '../token.service.js';
import type { ResetPasswordInput, VerifyResetOtpInput } from './password-reset.schema.js';

const otpLifetimeMs = 5 * 60 * 1000;
const resetTokenLifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

function otpSecret() {
  if (!env.OTP_HASH_SECRET) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Account recovery is not configured');
  }
  return env.OTP_HASH_SECRET;
}

function otpHash(id: string, userId: string, code: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`password-reset:${id}:${userId}:${code}`)
    .digest('hex');
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function invalidOtp() {
  return new AppError(400, 'INVALID_OTP', 'Code is invalid, expired or already used');
}

function invalidReset() {
  return new AppError(
    400,
    'INVALID_PASSWORD_RESET',
    'Password reset token is invalid, expired or already used',
  );
}

export async function requestPasswordReset(email: string) {
  const secret = otpSecret();
  assertEmailOtpDeliveryAvailable();
  const id = randomUUID();
  const genericResult = { challengeId: id, expiresIn: 300, retryAfter: 60 };
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      status: true,
      passwordHash: true,
      emailVerifiedAt: true,
      employee: { select: { employmentStatus: true } },
    },
  });
  if (
    !user?.passwordHash ||
    !user.emailVerifiedAt ||
    user.status !== 'ACTIVE' ||
    (user.employee && user.employee.employmentStatus !== 'ACTIVE')
  ) {
    return genericResult;
  }

  const code = randomInt(0, 1000000).toString().padStart(6, '0');
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`password-reset:${user.id}`}, 0))`;
    const previous = await tx.passwordResetChallenge.findUnique({ where: { userId: user.id } });
    const now = new Date();
    if (previous && now.getTime() - previous.createdAt.getTime() < resendCooldownMs) {
      return false;
    }
    const data = {
      id,
      userId: user.id,
      codeHash: otpHash(id, user.id, code, secret),
      attemptCount: 0,
      expiresAt: new Date(now.getTime() + otpLifetimeMs),
      sentAt: null,
      verifiedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      consumedAt: null,
      createdAt: now,
    };
    await tx.passwordResetChallenge.upsert({
      where: { userId: user.id },
      create: data,
      update: data,
    });
    return true;
  });

  // Cooldown is intentionally indistinguishable from an unknown/ineligible email.
  if (!created) return genericResult;

  try {
    await deliverEmailOtp(email, code, 'password-reset');
  } catch {
    throw new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Unable to deliver the verification code');
  }
  await prisma.passwordResetChallenge.updateMany({
    where: { id, userId: user.id, consumedAt: null },
    data: { sentAt: new Date() },
  });
  return genericResult;
}

export async function verifyPasswordResetOtp(input: VerifyResetOtpInput) {
  const secret = otpSecret();
  const candidate = await prisma.passwordResetChallenge.findUnique({
    where: { id: input.challengeId },
    select: { userId: true },
  });
  if (!candidate) throw invalidOtp();
  const resetToken = randomBytes(32).toString('base64url');
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`password-reset:${candidate.userId}`}, 0))`;
    const challenge = await tx.passwordResetChallenge.findUnique({
      where: { id: input.challengeId },
    });
    const now = new Date();
    if (
      !challenge?.sentAt ||
      challenge.userId !== candidate.userId ||
      challenge.verifiedAt ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attemptCount >= maxAttempts
    ) {
      return { ok: false as const };
    }
    const expected = otpHash(challenge.id, challenge.userId, input.otp, secret);
    if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(expected, 'hex'))) {
      await tx.passwordResetChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 } },
      });
      return { ok: false as const };
    }
    await tx.passwordResetChallenge.update({
      where: { id: challenge.id },
      data: {
        verifiedAt: now,
        resetTokenHash: tokenHash(resetToken),
        resetTokenExpiresAt: new Date(now.getTime() + resetTokenLifetimeMs),
      },
    });
    return { ok: true as const };
  });
  if (!result.ok) throw invalidOtp();
  return { resetToken, expiresIn: 600 };
}

export async function resetPassword(input: ResetPasswordInput) {
  const hashedToken = tokenHash(input.resetToken);
  const candidate = await prisma.passwordResetChallenge.findUnique({
    where: { resetTokenHash: hashedToken },
    select: { userId: true },
  });
  if (!candidate) throw invalidReset();

  const passwordHash = await hash(input.newPassword, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const result = await prisma.$transaction(async (tx) => {
    await lockUserAuthentication(tx, candidate.userId);
    const challenge = await tx.passwordResetChallenge.findUnique({
      where: { resetTokenHash: hashedToken },
      include: { user: { include: { employee: true } } },
    });
    const now = new Date();
    if (
      !challenge?.verifiedAt ||
      !challenge.resetTokenExpiresAt ||
      challenge.resetTokenExpiresAt <= now ||
      challenge.consumedAt ||
      challenge.user.status !== 'ACTIVE' ||
      !challenge.user.emailVerifiedAt ||
      (challenge.user.employee && challenge.user.employee.employmentStatus !== 'ACTIVE')
    ) {
      return false;
    }
    const updated = await tx.user.updateMany({
      where: {
        id: challenge.userId,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
      },
      data: { passwordHash },
    });
    if (updated.count !== 1) return false;
    // A pending email change was authorized with the previous password.
    await tx.emailChangeChallenge.deleteMany({ where: { userId: challenge.userId } });
    await tx.passwordResetChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    });
    await tx.refreshSession.updateMany({
      where: { userId: challenge.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
  if (!result) throw invalidReset();
}
