import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import {
  publicBranchListSchema,
  publicAvailabilitySchema,
  publicCatalogListSchema,
  publicResourceIdSchema,
} from './public.schema.js';
import * as service from './public.service.js';

export const publicRouter = Router();

function parse<T>(result: { success: boolean; data?: T }, message: string): T {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
}

publicRouter.get('/branches', async (req, res) =>
  sendSuccess(
    res,
    await service.listPublicBranches(
      parse(publicBranchListSchema.safeParse(req.query), 'Invalid public branch query'),
    ),
    'Public branches loaded',
  ),
);

publicRouter.get('/catalog/variants', async (req, res) =>
  sendSuccess(
    res,
    await service.listPublicVariants(
      parse(publicCatalogListSchema.safeParse(req.query), 'Invalid public catalog query'),
    ),
    'Public catalog loaded',
  ),
);

publicRouter.get('/catalog/availability', async (req, res) =>
  sendSuccess(
    res,
    await service.checkPublicAvailability(
      parse(publicAvailabilitySchema.safeParse(req.query), 'Invalid public availability query'),
    ),
    'Public availability loaded',
  ),
);

publicRouter.get('/catalog/variants/:id', async (req, res) =>
  sendSuccess(
    res,
    await service.getPublicVariant(
      parse(publicResourceIdSchema.safeParse(req.params), 'Invalid public variant id').id,
    ),
    'Public variant loaded',
  ),
);
