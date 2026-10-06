import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client, type TokenPayload } from 'google-auth-library';

import { AppError } from '../../../common/errors/app-error.js';
import { env } from '../../../config/env.js';
import { prisma } from '../../../database/prisma.js';
import {
  accessSecret,
  issueSessionTokens,
  lockUserAuthentication,
  type SessionMetadata,
} from '../token.service.js';
import type { GoogleOAuthFlow } from './google-oauth.cookie.js';

const provider = 'GOOGLE';

function configuration() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError(
      503,
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google authentication is not configured',
    );
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

function client() {
  const config = configuration();
  return {
    config,
    oauth: new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri),
  };
}

function googleAuthenticationFailed() {
  return new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google authentication failed');
}

function accountUnavailable() {
  return new AppError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available');
}

function normalizeProfile(payload: TokenPayload, expectedNonce: string) {
  if (
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    payload.nonce !== expectedNonce
  ) {
    throw googleAuthenticationFailed();
  }
  const email = payload.email.trim().toLowerCase();
  if (!email || email.length > 255) throw googleAuthenticationFailed();
  const localPart = email.split('@')[0];
  const fallbackName = localPart?.length ? localPart : 'Google user';
  const googleName = payload.name?.trim();
  const displayName = (googleName?.length ? googleName : fallbackName).slice(0, 255);
  const avatarUrl =
    payload.picture?.length && payload.picture.length <= 500 ? payload.picture : undefined;
  return { subject: payload.sub, email, displayName, avatarUrl };
}

export function createGoogleAuthorization() {
  accessSecret();
  const { oauth } = client();
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const authorizationUrl = oauth.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    nonce,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { authorizationUrl, flow: { state, nonce, codeVerifier } };
}

async function verifiedGoogleProfile(code: string, flow: GoogleOAuthFlow) {
  const { config, oauth } = client();
  try {
    const { tokens } = await oauth.getToken({ code, codeVerifier: flow.codeVerifier });
    if (!tokens.id_token) throw googleAuthenticationFailed();
    const ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload) throw googleAuthenticationFailed();
    return normalizeProfile(payload, flow.nonce);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw googleAuthenticationFailed();
  }
}

type GoogleProfile = Awaited<ReturnType<typeof verifiedGoogleProfile>>;

async function loginWithGoogleProfile(profile: GoogleProfile, metadata: SessionMetadata) {
  accessSecret();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-provider:${provider}:${profile.subject}`}, 0))`;
      const linked = await tx.authIdentity.findUnique({
        where: { provider_providerSubject: { provider, providerSubject: profile.subject } },
        include: { user: { include: { employee: true } } },
      });

      if (linked) {
        await lockUserAuthentication(tx, linked.userId);
        const current = await tx.user.findUnique({
          where: { id: linked.userId },
          include: { employee: true },
        });
        if (
          current?.status !== 'ACTIVE' ||
          (current.employee?.employmentStatus ?? 'ACTIVE') !== 'ACTIVE'
        ) {
          throw accountUnavailable();
        }
        await tx.user.update({
          where: { id: current.id },
          data: {
            lastLoginAt: new Date(),
            avatarUrl: current.avatarUrl ?? profile.avatarUrl,
          },
        });
        const tokens = await issueSessionTokens(tx, current.id, undefined, undefined, metadata);
        return {
          ...tokens,
          created: false,
          activated: false,
          user: {
            id: current.id,
            displayName: current.displayName,
            email: current.email,
            phone: current.phone,
          },
        };
      }

      const candidate = await tx.user.findUnique({ where: { email: profile.email } });
      if (candidate) await lockUserAuthentication(tx, candidate.id);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`auth-email:${profile.email}`}, 0))`;
      const existing = await tx.user.findUnique({
        where: { email: profile.email },
        include: { customer: true, employee: true, authIdentities: true },
      });
      if (candidate?.id !== existing?.id) {
        throw new AppError(409, 'ACCOUNT_CONFLICT', 'Account changed; try Google login again');
      }

      const now = new Date();
      if (existing) {
        const hasAnotherGoogleIdentity = existing.authIdentities.some(
          (identity) => identity.provider === provider,
        );
        const eligibleEmployee =
          !!existing.employee &&
          existing.employee.employmentStatus === 'ACTIVE' &&
          (existing.status === 'PENDING' || existing.status === 'ACTIVE');
        const eligibleCustomer =
          !!existing.customer && !existing.employee && existing.status === 'ACTIVE';
        if (hasAnotherGoogleIdentity || (!eligibleEmployee && !eligibleCustomer)) {
          throw accountUnavailable();
        }

        await tx.authIdentity.create({
          data: {
            userId: existing.id,
            provider,
            providerSubject: profile.subject,
            emailAtLinkTime: profile.email,
          },
        });
        await tx.user.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            emailVerifiedAt: existing.emailVerifiedAt ?? now,
            avatarUrl: existing.avatarUrl ?? profile.avatarUrl,
            lastLoginAt: now,
          },
        });
        const activated = existing.status === 'PENDING';
        if (existing.employee && !existing.employee.activatedAt) {
          await tx.employee.update({
            where: { userId: existing.id },
            data: { activatedAt: now },
          });
        }
        const tokens = await issueSessionTokens(tx, existing.id, undefined, undefined, metadata);
        return {
          ...tokens,
          created: false,
          activated,
          user: {
            id: existing.id,
            displayName: existing.displayName,
            email: existing.email,
            phone: existing.phone,
          },
        };
      }

      const role = await tx.role.findUnique({ where: { roleCode: 'CUSTOMER' } });
      if (!role?.isActive || role.actorGroup !== 'CUSTOMER') {
        throw new AppError(
          503,
          'GOOGLE_REGISTRATION_UNAVAILABLE',
          'Customer role is not configured',
        );
      }
      const user = await tx.user.create({
        data: {
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          status: 'ACTIVE',
          emailVerifiedAt: now,
          lastLoginAt: now,
          authIdentities: {
            create: {
              provider,
              providerSubject: profile.subject,
              emailAtLinkTime: profile.email,
            },
          },
          customer: { create: { customerCode: `CUS-${randomUUID()}` } },
        },
      });
      await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          branchId: null,
          assignedBy: user.id,
        },
      });
      const tokens = await issueSessionTokens(tx, user.id, undefined, undefined, metadata);
      return {
        ...tokens,
        created: true,
        activated: false,
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
        },
      };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new AppError(409, 'ACCOUNT_CONFLICT', 'Account changed; try Google login again');
    }
    throw error;
  }
}

export async function completeGoogleAuthorization(
  code: string,
  returnedState: string,
  flow: GoogleOAuthFlow,
  metadata: SessionMetadata = {},
) {
  if (returnedState !== flow.state) {
    throw new AppError(400, 'INVALID_GOOGLE_OAUTH_FLOW', 'Google login flow is invalid or expired');
  }
  const profile = await verifiedGoogleProfile(code, flow);
  return loginWithGoogleProfile(profile, metadata);
}
