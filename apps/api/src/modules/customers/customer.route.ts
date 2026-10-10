import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  createCustomerSchema,
  customerIdSchema,
  customerListSchema,
  updateCustomerSchema,
  updateOwnCustomerSchema,
} from './customer.schema.js';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  setCustomerStatus,
  updateCustomer,
  type CustomerActor,
} from './customer.service.js';

export const customerRouter = Router();

customerRouter.get('/', requireAuthentication, async (request, response) => {
  const parsed = customerListSchema.safeParse(request.query);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid customer query');
  return sendSuccess(
    response,
    await listCustomers(response.locals.actor as CustomerActor, parsed.data),
    'Customers loaded',
  );
});

customerRouter.get('/me', requireAuthentication, async (_request, response) =>
  sendSuccess(
    response,
    await getCustomer(response.locals.actor as CustomerActor, response.locals.actor.id),
    'Own customer profile loaded',
  ),
);

customerRouter.patch('/me', requireAuthentication, async (request, response) => {
  const body = updateOwnCustomerSchema.safeParse(request.body);
  if (!body.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid own customer profile');
  return sendSuccess(
    response,
    await updateCustomer(
      response.locals.actor as CustomerActor,
      response.locals.actor.id,
      body.data,
    ),
    'Own customer profile updated',
  );
});

customerRouter.get('/:userId', requireAuthentication, async (request, response) => {
  const parsed = customerIdSchema.safeParse(request.params);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid customer id');
  return sendSuccess(
    response,
    await getCustomer(response.locals.actor as CustomerActor, parsed.data.userId),
    'Customer loaded',
  );
});

customerRouter.post('/', requireAuthentication, async (request, response) => {
  const parsed = createCustomerSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid customer information', {
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  const result = await createCustomer(parsed.data, response.locals.actor as CustomerActor);
  return sendSuccess(
    response,
    result,
    result.created ? 'Customer created' : 'Existing customer found',
    result.created ? 201 : 200,
  );
});

customerRouter.patch('/:userId', requireAuthentication, async (request, response) => {
  const params = customerIdSchema.safeParse(request.params);
  const body = updateCustomerSchema.safeParse(request.body);
  if (!params.success || !body.success)
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid customer information');
  return sendSuccess(
    response,
    await updateCustomer(response.locals.actor as CustomerActor, params.data.userId, body.data),
    'Customer updated',
  );
});

customerRouter.post('/:userId/:action', requireAuthentication, async (request, response) => {
  const params = customerIdSchema.safeParse(request.params);
  const action = request.params.action;
  if (!params.success || (action !== 'activate' && action !== 'deactivate'))
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid customer action');
  return sendSuccess(
    response,
    await setCustomerStatus(
      response.locals.actor as CustomerActor,
      params.data.userId,
      action === 'activate' ? 'ACTIVE' : 'INACTIVE',
    ),
    'Customer status updated',
  );
});
