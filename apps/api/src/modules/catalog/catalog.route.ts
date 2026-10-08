/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireActor } from '../auth/authorization.js';
import {
  accessorySchema,
  categorySchema,
  idSchema,
  listCatalogSchema,
  mediaSchema,
  mediaUpdateSchema,
  modelSchema,
  modelUpdateSchema,
  variantSchema,
  variantUpdateSchema,
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
const id = (value: string) => parse(idSchema.safeParse({ id: value }), 'Invalid resource id').id;

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
catalogRouter.get('/categories/:id', async (q, r) =>
  sendSuccess(r, await service.getCategory(r.locals.actor, id(q.params.id)), 'Category loaded'),
);
catalogRouter.patch('/categories/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateCategory(
      r.locals.actor,
      id(q.params.id),
      parse(categorySchema.partial().safeParse(q.body), 'Invalid category'),
    ),
    'Category updated',
  ),
);
catalogRouter.post('/categories/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setCategoryStatus(r.locals.actor, id(q.params.id), action(q.params.action)),
    'Category status updated',
  ),
);
catalogRouter.delete('/categories/:id', async (q, r) => {
  await service.deleteCategory(r.locals.actor, id(q.params.id));
  return r.status(204).send();
});
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
catalogRouter.get('/models/:id', async (q, r) =>
  sendSuccess(r, await service.getModel(r.locals.actor, id(q.params.id)), 'Model loaded'),
);
catalogRouter.patch('/models/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateModel(
      r.locals.actor,
      id(q.params.id),
      parse(modelUpdateSchema.safeParse(q.body), 'Invalid model'),
    ),
    'Model updated',
  ),
);
catalogRouter.delete('/models/:id', async (q, r) => {
  await service.deleteModel(r.locals.actor, id(q.params.id));
  return r.status(204).send();
});
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
catalogRouter.get('/variants/:id', async (q, r) =>
  sendSuccess(r, await service.getVariant(r.locals.actor, id(q.params.id)), 'Variant loaded'),
);
catalogRouter.patch('/variants/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateVariant(
      r.locals.actor,
      id(q.params.id),
      parse(variantUpdateSchema.safeParse(q.body), 'Invalid variant'),
    ),
    'Variant updated',
  ),
);
catalogRouter.delete('/variants/:id', async (q, r) => {
  await service.deleteVariant(r.locals.actor, id(q.params.id));
  return r.status(204).send();
});
catalogRouter.get('/models/:modelId/accessories', async (q, r) =>
  sendSuccess(
    r,
    await service.listAccessories(r.locals.actor, id(q.params.modelId)),
    'Accessories loaded',
  ),
);
catalogRouter.post('/models/:modelId/accessories', async (q, r) =>
  sendSuccess(
    r,
    await service.createAccessory(
      r.locals.actor,
      id(q.params.modelId),
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
      id(q.params.id),
      parse(accessorySchema.partial().safeParse(q.body), 'Invalid accessory'),
    ),
    'Accessory updated',
  ),
);
catalogRouter.post('/accessories/:id/activate', async (q, r) =>
  sendSuccess(
    r,
    await service.setAccessoryStatus(r.locals.actor, id(q.params.id), true),
    'Accessory activated',
  ),
);
catalogRouter.post('/accessories/:id/deactivate', async (q, r) =>
  sendSuccess(
    r,
    await service.setAccessoryStatus(r.locals.actor, id(q.params.id), false),
    'Accessory deactivated',
  ),
);
catalogRouter.delete('/accessories/:id', async (q, r) => {
  await service.deleteAccessory(r.locals.actor, id(q.params.id));
  return r.status(204).send();
});
catalogRouter.get('/models/:modelId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.listMedia(r.locals.actor, { modelId: id(q.params.modelId) }),
    'Media loaded',
  ),
);
catalogRouter.post('/models/:modelId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.createMedia(
      r.locals.actor,
      { modelId: id(q.params.modelId) },
      parse(mediaSchema.safeParse(q.body), 'Invalid media'),
    ),
    'Media created',
    201,
  ),
);
catalogRouter.get('/variants/:variantId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.listMedia(r.locals.actor, { variantId: id(q.params.variantId) }),
    'Media loaded',
  ),
);
catalogRouter.post('/variants/:variantId/media', async (q, r) =>
  sendSuccess(
    r,
    await service.createMedia(
      r.locals.actor,
      { variantId: id(q.params.variantId) },
      parse(mediaSchema.safeParse(q.body), 'Invalid media'),
    ),
    'Media created',
    201,
  ),
);
catalogRouter.patch('/media/:id', async (q, r) =>
  sendSuccess(
    r,
    await service.updateMedia(
      r.locals.actor,
      id(q.params.id),
      parse(mediaUpdateSchema.safeParse(q.body), 'Invalid media'),
    ),
    'Media updated',
  ),
);
catalogRouter.delete('/media/:id', async (q, r) => {
  await service.deleteMedia(r.locals.actor, id(q.params.id));
  return r.status(204).send();
});
catalogRouter.post('/models/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setModelStatus(r.locals.actor, id(q.params.id), action(q.params.action)),
    'Model status updated',
  ),
);
catalogRouter.post('/variants/:id/:action', async (q, r) =>
  sendSuccess(
    r,
    await service.setVariantStatus(r.locals.actor, id(q.params.id), action(q.params.action)),
    'Variant status updated',
  ),
);
