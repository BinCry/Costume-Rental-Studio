/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  changeUnitStatusSchema,
  activeRentalListSchema,
  createUnitSchema,
  eventListSchema,
  inspectUnitSchema,
  listUnitsSchema,
  retireUnitSchema,
  unitIdSchema,
  updateUnitSchema,
} from './inventory.schema.js';
import * as service from './inventory.service.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuthentication);

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}
function unitId(params: unknown) {
  return parse(unitIdSchema.safeParse(params), 'Invalid unit id').unitId;
}

inventoryRouter.get('/units', async (req, res) =>
  sendSuccess(
    res,
    await service.listUnits(
      res.locals.actor,
      parse(listUnitsSchema.safeParse(req.query), 'Invalid unit query'),
    ),
    'Units loaded',
  ),
);
inventoryRouter.get('/active-rentals', async (req, res) =>
  sendSuccess(
    res,
    await service.listActiveRentals(
      res.locals.actor,
      parse(activeRentalListSchema.safeParse(req.query), 'Invalid active rental query'),
    ),
    'Active rentals loaded',
  ),
);
inventoryRouter.post('/units', async (req, res) =>
  sendSuccess(
    res,
    await service.createUnit(
      res.locals.actor,
      parse(createUnitSchema.safeParse(req.body), 'Invalid unit'),
    ),
    'Unit created',
    201,
  ),
);
inventoryRouter.get('/units/:unitId', async (req, res) =>
  sendSuccess(res, await service.getUnit(res.locals.actor, unitId(req.params)), 'Unit loaded'),
);
inventoryRouter.patch('/units/:unitId', async (req, res) =>
  sendSuccess(
    res,
    await service.updateUnit(
      res.locals.actor,
      unitId(req.params),
      parse(updateUnitSchema.safeParse(req.body), 'Invalid unit update'),
    ),
    'Unit updated',
  ),
);
inventoryRouter.post('/units/:unitId/inspect', async (req, res) =>
  sendSuccess(
    res,
    await service.inspectUnit(
      res.locals.actor,
      unitId(req.params),
      parse(inspectUnitSchema.safeParse(req.body), 'Invalid inspection'),
    ),
    'Unit inspected',
  ),
);
inventoryRouter.post('/units/:unitId/status', async (req, res) =>
  sendSuccess(
    res,
    await service.changeUnitStatus(
      res.locals.actor,
      unitId(req.params),
      parse(changeUnitStatusSchema.safeParse(req.body), 'Invalid status transition'),
    ),
    'Unit status updated',
  ),
);
inventoryRouter.post('/units/:unitId/retire', async (req, res) =>
  sendSuccess(
    res,
    await service.retireUnit(
      res.locals.actor,
      unitId(req.params),
      parse(retireUnitSchema.safeParse(req.body), 'Invalid retirement'),
    ),
    'Unit retired',
  ),
);
inventoryRouter.get('/units/:unitId/events', async (req, res) =>
  sendSuccess(
    res,
    await service.listUnitEvents(
      res.locals.actor,
      unitId(req.params),
      parse(eventListSchema.safeParse(req.query), 'Invalid event query'),
    ),
    'Unit events loaded',
  ),
);
