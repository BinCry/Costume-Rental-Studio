/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  assignCaseSchema,
  caseIdSchema,
  changeCaseStatusSchema,
  createCaseSchema,
  createInteractionSchema,
  customerIdSchema,
  interactionListSchema,
  listCasesSchema,
  updateCaseSchema,
} from './crm.schema.js';
import * as service from './crm.service.js';

export const crmRouter = Router();
crmRouter.use(requireAuthentication);

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function caseId(params: unknown) {
  return parse(caseIdSchema.safeParse(params), 'Invalid CRM case id').caseId;
}
function customerUserId(params: unknown) {
  return parse(customerIdSchema.safeParse(params), 'Invalid customer id').customerUserId;
}

crmRouter.get('/cases', async (req, res) =>
  sendSuccess(
    res,
    await service.listCases(
      res.locals.actor,
      parse(listCasesSchema.safeParse(req.query), 'Invalid CRM case query'),
    ),
    'CRM cases loaded',
  ),
);
crmRouter.post('/cases', async (req, res) =>
  sendSuccess(
    res,
    await service.createCase(
      res.locals.actor,
      parse(createCaseSchema.safeParse(req.body), 'Invalid CRM case'),
    ),
    'CRM case created',
    201,
  ),
);
crmRouter.get('/cases/:caseId', async (req, res) =>
  sendSuccess(res, await service.getCase(res.locals.actor, caseId(req.params)), 'CRM case loaded'),
);
crmRouter.patch('/cases/:caseId', async (req, res) =>
  sendSuccess(
    res,
    await service.updateCase(
      res.locals.actor,
      caseId(req.params),
      parse(updateCaseSchema.safeParse(req.body), 'Invalid CRM case update'),
    ),
    'CRM case updated',
  ),
);
crmRouter.post('/cases/:caseId/assign', async (req, res) =>
  sendSuccess(
    res,
    await service.assignCase(
      res.locals.actor,
      caseId(req.params),
      parse(assignCaseSchema.safeParse(req.body), 'Invalid case assignment'),
    ),
    'CRM case owner updated',
  ),
);
crmRouter.post('/cases/:caseId/status', async (req, res) =>
  sendSuccess(
    res,
    await service.changeCaseStatus(
      res.locals.actor,
      caseId(req.params),
      parse(changeCaseStatusSchema.safeParse(req.body), 'Invalid case status'),
    ),
    'CRM case status updated',
  ),
);
crmRouter.get('/cases/:caseId/history', async (req, res) =>
  sendSuccess(
    res,
    await service.listCaseHistory(
      res.locals.actor,
      caseId(req.params),
      parse(interactionListSchema.safeParse(req.query), 'Invalid history query'),
    ),
    'CRM case history loaded',
  ),
);
crmRouter.get('/cases/:caseId/interactions', async (req, res) =>
  sendSuccess(
    res,
    await service.listCaseInteractions(
      res.locals.actor,
      caseId(req.params),
      parse(interactionListSchema.safeParse(req.query), 'Invalid interaction query'),
    ),
    'CRM case interactions loaded',
  ),
);
crmRouter.get('/customers/:customerUserId/interactions', async (req, res) =>
  sendSuccess(
    res,
    await service.listCustomerInteractions(
      res.locals.actor,
      customerUserId(req.params),
      parse(interactionListSchema.safeParse(req.query), 'Invalid interaction query'),
    ),
    'Customer interactions loaded',
  ),
);
crmRouter.post('/customers/:customerUserId/interactions', async (req, res) =>
  sendSuccess(
    res,
    await service.createInteraction(
      res.locals.actor,
      customerUserId(req.params),
      parse(createInteractionSchema.safeParse(req.body), 'Invalid customer interaction'),
    ),
    'Customer interaction created',
    201,
  ),
);
