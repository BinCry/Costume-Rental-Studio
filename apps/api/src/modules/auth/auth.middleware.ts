import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { authenticatedActorSelect, requireActor } from './authorization.js';

export const requireAuthentication: RequestHandler = async (request, response, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
  if (!match?.[1]) throw new AppError(401, 'UNAUTHENTICATED', 'A bearer access token is required');
  if (!env.JWT_ACCESS_SECRET) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured');
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(match[1], new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      requiredClaims: ['sub', 'exp', 'iat'],
      maxTokenAge: '15m',
    });
    userId = z.uuid().parse(payload.sub);
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }

  // Read permissions on every request: role changes and account locks take effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: authenticatedActorSelect,
  });
  response.locals.actor = requireActor(user ?? undefined);
  next();
};
