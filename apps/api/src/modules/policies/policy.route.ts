/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { policySchema } from './policy.schema.js';
import { createPolicy, getCurrentPolicy, listPolicies } from './policy.service.js';
export const policyRouter = Router();
policyRouter.use(requireAuthentication);
policyRouter.get('/', async (_q, r) =>
  sendSuccess(r, await listPolicies(r.locals.actor), 'Policies loaded'),
);
policyRouter.get('/current', async (_q, r) =>
  sendSuccess(r, await getCurrentPolicy(r.locals.actor), 'Current policy loaded'),
);
policyRouter.post('/', async (q, r) => {
  const parsed = policySchema.safeParse(q.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid policy');
  return sendSuccess(r, await createPolicy(r.locals.actor, parsed.data), 'Policy created', 201);
});
