/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireActor } from '../auth/authorization.js';
import {
  accessorySchema,
  categorySchema,
  listCatalogSchema,
  mediaSchema,
  modelSchema,
  variantSchema,
} from './catalog.schema.js';
import * as service from './catalog.service.js';

export const catalogRouter = Router();
catalogRouter.use(requireAuthentication);
const parse = <T>(result: { success: boolean; data?: T }, message: string): T => {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
};
const action = (value: string) => {
  if (value !== 'activate' && value !== 'deactivate')
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid catalog action');
  return value === 'activate' ? ('ACTIVE' as const) : ('INACTIVE' as const);
};

catalogRouter.get('/categories', async (q, r) =>
  sendSuccess(
    r,
    await service.listCategories(
      requireActor(r.locals.actor),
      parse(listCatalogSchema.safeParse(q.query), 'Invalid catalog query'),
    ),
    'Categories loaded',
  ),
);
catalogRouter.post('/categories', async (q, r) =>
  sendSuccess(
    r,
    await service.createCategory(
      r.locals.actor,
      parse(categorySchema.safeParse(q.body), 'Invalid category'),
    ),
    'Category created',
    201,
  ),
);
catalogRouter.patch('/categories/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateCategory(
      r.locals.actor,
      q.params.id,
      parse(categorySchema.partial().safeParse(q.body), 'Invalid category'),
    ),
    'Category updated',
  ),
);
catalogRouter.post('/categories/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setCategoryStatus(r.locals.actor, q.params.id, action(q.params.action)),
    'Category status updated',
  ),
);
catalogRouter.get('/models', async (q, r) =>
  sendSuccess(
    r,
    await service.listModels(
      r.locals.actor,
      parse(listCatalogSchema.safeParse(q.query), 'Invalid catalog query'),
    ),
    'Models loaded',
  ),
);
catalogRouter.post('/models', async (q, r) =>
  sendSuccess(
    r,
    await service.createModel(
      r.locals.actor,
      parse(modelSchema.safeParse(q.body), 'Invalid model'),
    ),
    'Model created',
    201,
  ),
);
catalogRouter.patch('/models/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateModel(
      r.locals.actor,
      q.params.id,
      parse(modelSchema.partial().safeParse(q.body), 'Invalid model'),
    ),
    'Model updated',
  ),
);
catalogRouter.get('/variants', async (q, r) =>
  sendSuccess(
    r,
    await service.listVariants(
      r.locals.actor,
      parse(listCatalogSchema.safeParse(q.query), 'Invalid catalog query'),
    ),
    'Variants loaded',
  ),
);
catalogRouter.post('/variants', async (q, r) =>
  sendSuccess(
    r,
    await service.createVariant(
      r.locals.actor,
      parse(variantSchema.safeParse(q.body), 'Invalid variant'),
    ),
    'Variant created',
    201,
  ),
);
catalogRouter.patch('/variants/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateVariant(
      r.locals.actor,
      q.params.id,
      parse(variantSchema.partial().safeParse(q.body), 'Invalid variant'),
    ),
    'Variant updated',
  ),
);
catalogRouter.get('/models/:modelId/accessories', async (q, r) =>
  sendSuccess(
    r,
    await service.listAccessories(r.locals.actor, q.params.modelId),
    'Accessories loaded',
  ),
);
catalogRouter.post('/models/:modelId/accessories', async (q, r) =>
  sendSuccess(
    r,
    await service.createAccessory(
      r.locals.actor,
      q.params.modelId,
      parse(accessorySchema.safeParse(q.body), 'Invalid accessory'),
    ),
    'Accessory created',
    201,
  ),
);
catalogRouter.patch('/accessories/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateAccessory(
      r.locals.actor,
      q.params.id,
      parse(accessorySchema.partial().safeParse(q.body), 'Invalid accessory'),
    ),
    'Accessory updated',
  ),
);
catalogRouter.get('/models/:modelId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.listMedia(r.locals.actor, { modelId: q.params.modelId }),
    'Media loaded',
  ),
);
catalogRouter.post('/models/:modelId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.createMedia(
      r.locals.actor,
      { modelId: q.params.modelId },
      parse(mediaSchema.safeParse(q.body), 'Invalid media'),
    ),
    'Media created',
    201,
  ),
);
catalogRouter.get('/variants/:variantId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.listMedia(r.locals.actor, { variantId: q.params.variantId }),
    'Media loaded',
  ),
);
catalogRouter.post('/variants/:variantId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.createMedia(
      r.locals.actor,
      { variantId: q.params.variantId },
      parse(mediaSchema.safeParse(q.body), 'Invalid media'),
    ),
    'Media created',
    201,
  ),
);
catalogRouter.delete('/media/:id', async (q, r) => {
  await service.deleteMedia(r.locals.actor, q.params.id);
  return r.status(204).send();
});
catalogRouter.post('/models/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setModelStatus(r.locals.actor, q.params.id, action(q.params.action)),
    'Model status updated',
  ),
);
catalogRouter.post('/variants/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setVariantStatus(r.locals.actor, q.params.id, action(q.params.action)),
    'Variant status updated',
  ),
);
