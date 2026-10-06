/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  assignmentSchema,
  createStaffSchema,
  staffIdSchema,
  staffListSchema,
  updateStaffSchema,
} from './staff.schema.js';
import * as service from './staff.service.js';
export const staffRouter = Router();
staffRouter.use(requireAuthentication);
const parse = <T>(result: { success: boolean; data?: T }, message: string) => {
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', message);
  return result.data as T;
};
staffRouter.get('/', async (q, r) =>
  sendSuccess(
    r,
    await service.listStaff(
      r.locals.actor,
      parse(staffListSchema.safeParse(q.query), 'Invalid staff query'),
    ),
    'Staff loaded',
  ),
);
staffRouter.get('/:userId', async (q, r) =>
  sendSuccess(
    r,
    await service.getStaff(
      r.locals.actor,
      parse(staffIdSchema.safeParse(q.params), 'Invalid staff id').userId,
    ),
    'Staff loaded',
  ),
);
staffRouter.post('/', async (q, r) =>
  sendSuccess(
    r,
    await service.createStaff(
      r.locals.actor,
      parse(createStaffSchema.safeParse(q.body), 'Invalid staff'),
    ),
    'Staff created',
    201,
  ),
);
staffRouter.patch('/:userId', async (q, r) =>
  sendSuccess(
    r,
    await service.updateStaff(
      r.locals.actor,
      parse(staffIdSchema.safeParse(q.params), 'Invalid staff id').userId,
      parse(updateStaffSchema.safeParse(q.body), 'Invalid staff'),
    ),
    'Staff updated',
  ),
);
staffRouter.post('/:userId/terminate', async (q, r) =>
  sendSuccess(
    r,
    await service.terminateStaff(
      r.locals.actor,
      parse(staffIdSchema.safeParse(q.params), 'Invalid staff id').userId,
    ),
    'Staff terminated',
  ),
);
staffRouter.post('/:userId/role-assignments', async (q, r) =>
  sendSuccess(
    r,
    await service.assignRole(
      r.locals.actor,
      parse(staffIdSchema.safeParse(q.params), 'Invalid staff id').userId,
      parse(assignmentSchema.safeParse(q.body), 'Invalid assignment'),
    ),
    'Role assigned',
    201,
  ),
);
staffRouter.delete('/:userId/role-assignments/:assignmentId', async (q, r) => {
  await service.removeAssignment(r.locals.actor, q.params.userId, q.params.assignmentId);
  return r.status(204).send();
});
