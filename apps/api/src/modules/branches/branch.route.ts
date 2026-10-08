/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  branchIdSchema,
  branchListSchema,
  createBranchSchema,
  updateBranchSchema,
} from './branch.schema.js';
import {
  createBranch,
  deleteBranch,
  getBranch,
  listBranches,
  setBranchStatus,
  updateBranch,
} from './branch.service.js';

export const branchRouter = Router();
branchRouter.use(requireAuthentication);

branchRouter.get('/', async (req, res) => {
  const parsed = branchListSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch query');
  return sendSuccess(res, await listBranches(res.locals.actor, parsed.data), 'Branches loaded');
});
branchRouter.get('/:branchId', async (req, res) => {
  const parsed = branchIdSchema.safeParse(req.params);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch id');
  return sendSuccess(res, await getBranch(res.locals.actor, parsed.data.branchId), 'Branch loaded');
});
branchRouter.post('/', async (req, res) => {
  const parsed = createBranchSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch information');
  return sendSuccess(res, await createBranch(res.locals.actor, parsed.data), 'Branch created', 201);
});
branchRouter.patch('/:branchId', async (req, res) => {
  const params = branchIdSchema.safeParse(req.params);
  const body = updateBranchSchema.safeParse(req.body);
  if (!params.success || !body.success)
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch information');
  return sendSuccess(
    res,
    await updateBranch(res.locals.actor, params.data.branchId, body.data),
    'Branch updated',
  );
});
branchRouter.delete('/:branchId', async (req, res) => {
  const parsed = branchIdSchema.safeParse(req.params);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch id');
  await deleteBranch(res.locals.actor, parsed.data.branchId);
  return res.status(204).send();
});
branchRouter.post('/:branchId/:action', async (req, res) => {
  const params = branchIdSchema
    .extend({ action: z.enum(['activate', 'deactivate']) })
    .safeParse(req.params);
  if (!params.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid branch action');
  const status = params.data.action === 'activate' ? 'ACTIVE' : 'INACTIVE';
  return sendSuccess(
    res,
    await setBranchStatus(res.locals.actor, params.data.branchId, status),
    `Branch ${params.data.action}d`,
  );
});
