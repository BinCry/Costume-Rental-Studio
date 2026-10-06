/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { permissionsSchema, roleIdSchema, roleSchema } from './rbac.schema.js';
import * as service from './rbac.service.js';
export const rbacRouter = Router();
rbacRouter.use(requireAuthentication);
const parse = <T>(result: { success: boolean; data?: T }, message: string) => {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
};
rbacRouter.get('/roles', async (_q, r) =>
  sendSuccess(r, await service.listRoles(r.locals.actor), 'Roles loaded'),
);
rbacRouter.get('/permissions', async (_q, r) =>
  sendSuccess(r, await service.listPermissions(r.locals.actor), 'Permissions loaded'),
);
rbacRouter.post('/roles', async (q, r) =>
  sendSuccess(
    r,
    await service.createRole(r.locals.actor, parse(roleSchema.safeParse(q.body), 'Invalid role')),
    'Role created',
    201,
  ),
);
rbacRouter.patch('/roles/:roleId', async (q, r) =>
  sendSuccess(
    r,
    await service.updateRole(
      r.locals.actor,
      parse(roleIdSchema.safeParse(q.params), 'Invalid role id').roleId,
      parse(roleSchema.partial().safeParse(q.body), 'Invalid role'),
    ),
    'Role updated',
  ),
);
rbacRouter.put('/roles/:roleId/permissions', async (q, r) =>
  sendSuccess(
    r,
    await service.replacePermissions(
      r.locals.actor,
      parse(roleIdSchema.safeParse(q.params), 'Invalid role id').roleId,
      parse(permissionsSchema.safeParse(q.body), 'Invalid permissions').permissionIds,
    ),
    'Permissions updated',
  ),
);
