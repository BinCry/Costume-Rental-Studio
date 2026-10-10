/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { reportQuerySchema } from './report.schema.js';
import * as service from './report.service.js';

export const reportRouter = Router();
reportRouter.use(requireAuthentication);

function query(value: unknown) {
  const result = reportQuerySchema.safeParse(value);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid report query');
  return result.data;
}

reportRouter.get('/overview', async (req, res) =>
  sendSuccess(
    res,
    await service.getOverview(res.locals.actor, query(req.query)),
    'Report overview loaded',
  ),
);
reportRouter.get('/revenue', async (req, res) =>
  sendSuccess(
    res,
    await service.getRevenue(res.locals.actor, query(req.query)),
    'Revenue report loaded',
  ),
);
reportRouter.get('/rentals', async (req, res) =>
  sendSuccess(
    res,
    await service.getRentals(res.locals.actor, query(req.query)),
    'Rental report loaded',
  ),
);
reportRouter.get('/payments', async (req, res) =>
  sendSuccess(
    res,
    await service.getPayments(res.locals.actor, query(req.query)),
    'Payment report loaded',
  ),
);
reportRouter.get('/inventory', async (req, res) =>
  sendSuccess(
    res,
    await service.getInventory(res.locals.actor, query(req.query)),
    'Inventory report loaded',
  ),
);
