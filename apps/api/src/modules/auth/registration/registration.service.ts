import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { argon2id, hash } from 'argon2';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { prisma } from '../../../database/prisma.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { assertEmailOtpDeliveryAvailable, deliverEmailOtp } from './otp.delivery.js';
import type { RegisterCustomerInput } from './registration.schema.js';
import { accessSecret, issueSessionTokens, type SessionMetadata } from '../token.service.js';
import { lockActiveBranch } from '../../branches/branch.service.js';

const otpLifetimeMs = 5 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

function otpSecret() {
  if (!env.OTP_HASH_SECRET) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Registration is not configured');
  }
  return env.OTP_HASH_SECRET;
}

function codeHash(id: string, email: string, code: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`customer-register:${id}:${email}:${code}`)
    .digest('hex');
}

// An email lock serializes resend, verification and account creation across API instances.
async function withEmailLock<T>(
  email: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-email:${email}`}, 0))`;
    return action(tx);
  });
}

export async function requestRegistrationOtp(email: string) {
  const secret = otpSecret();
  assertEmailOtpDeliveryAvailable();
  const id = randomUUID();
  const code = randomInt(0, 1000000).toString().padStart(6, '0');
  const challenge = await withEmailLock(email, async (tx) => {
    const now = new Date();
    const previous = await tx.emailOtpChallenge.findUnique({ where: { email } });
    if (previous && now.getTime() - previous.createdAt.getTime() < resendCooldownMs) {
      throw new AppError(429, 'OTP_COOLDOWN', 'Wait 60 seconds before requesting another code');
    }
    const data = {
      id,
      email,
      codeHash: codeHash(id, email, code, secret),
      attemptCount: 0,
      expiresAt: new Date(now.getTime() + otpLifetimeMs),
      createdAt: now,
      sentAt: null,
      consumedAt: null,
    };
    return tx.emailOtpChallenge.upsert({ where: { email }, create: data, update: data });
  });
  try {
    await deliverEmailOtp(email, code, 'registration');
  } catch {
    // No sentAt means this challenge can never be used to claim an account.
    throw new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Unable to deliver the verification code');
  }
  await prisma.emailOtpChallenge.updateMany({
    where: { id, email, consumedAt: null },
    data: { sentAt: new Date() },
  });
  // Never reveal whether this email already has an account.
  return { challengeId: challenge.id, expiresIn: 300, retryAfter: 60 };
}

export async function registerCustomer(
  input: RegisterCustomerInput,
  metadata: SessionMetadata = {},
) {
  const secret = otpSecret();
  accessSecret();
  // Argon2 is intentionally outside the DB transaction to avoid holding the email lock while hashing.
  const passwordHash = await hash(input.password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  try {
    const result = await withEmailLock(input.email, async (tx) => {
      const now = new Date();
      const challenge = await tx.emailOtpChallenge.findUnique({ where: { id: input.challengeId } });
      if (
        !challenge?.sentAt ||
        challenge.email !== input.email ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attemptCount >= maxAttempts
      ) {
        return { error: 'INVALID_OTP' } as const;
      }
      const expected = codeHash(challenge.id, input.email, input.otp, secret);
      if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(expected, 'hex'))) {
        // Return rather than throw here so the failed attempt is committed.
        await tx.emailOtpChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: { increment: 1 } },
        });
        return { error: 'INVALID_OTP' } as const;
      }
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        include: {
          customer: true,
          employee: true,
          authIdentities: true,
          roleAssignments: { include: { role: true } },
        },
      });
      if (
        existing &&
        (existing.status !== 'ACTIVE' ||
          !existing.customer ||
          existing.employee ||
          existing.emailVerifiedAt ||
          existing.authIdentities.length > 0 ||
          existing.roleAssignments.some(({ role }) => role.actorGroup !== 'CUSTOMER'))
      ) {
        await tx.emailOtpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: now },
        });
        return { error: 'ACCOUNT_NOT_ELIGIBLE' } as const;
      }
      if (!existing && input.preferredBranchId) {
        await lockActiveBranch(tx, input.preferredBranchId);
      }
      const role = await tx.role.findUnique({ where: { roleCode: 'CUSTOMER' } });
      if (!role?.isActive || role.actorGroup !== 'CUSTOMER') {
        throw new AppError(503, 'REGISTRATION_UNAVAILABLE', 'Customer role is not configured');
      }
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            displayName: input.displayName,
            status: 'ACTIVE',
            passwordHash,
            emailVerifiedAt: now,
            customer: {
              create: {
                customerCode: `CUS-${randomUUID()}`,
                preferredBranchId: input.preferredBranchId,
              },
            },
          },
          include: { customer: true },
        }));
      if (existing) {
        // Conditional write also protects against credential/email changes outside this email lock.
        const claimed = await tx.user.updateMany({
          where: {
            id: existing.id,
            email: input.email,
            status: 'ACTIVE',
            emailVerifiedAt: null,
          },
          data: { passwordHash, emailVerifiedAt: now },
        });
        if (claimed.count !== 1) {
          throw new AppError(409, 'ACCOUNT_CONFLICT', 'Account changed; request a new code');
        }
      }
      const hasRole = existing?.roleAssignments.some(
        (assignment) => assignment.roleId === role.id && assignment.branchId === null,
      );
      if (!hasRole)
        await tx.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: role.id,
            branchId: null,
            assignedBy: user.id,
          },
        });
      await tx.emailOtpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      const tokens = await issueSessionTokens(tx, user.id, undefined, undefined, metadata);
      return {
        created: !existing,
        ...tokens,
        customer: {
          userId: user.id,
          customerCode: user.customer!.customerCode,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
        },
      };
    });
    if ('error' in result) {
      if (result.error === 'INVALID_OTP')
        throw new AppError(400, 'INVALID_OTP', 'Code is invalid, expired or already used');
      throw new AppError(
        409,
        'ACCOUNT_NOT_ELIGIBLE',
        'Use login or account recovery for this account',
      );
    }
    return result;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(
        409,
        'ACCOUNT_CONFLICT',
        'Account changed concurrently; request a new code',
      );
    }
    throw error;
  }
}
