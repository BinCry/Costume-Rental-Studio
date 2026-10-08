/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Router } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireActor } from '../auth/authorization.js';
import { createPresignedUploadSchema } from './upload.schema.js';
import { createPresignedUpload } from './upload.service.js';

export const uploadRouter = Router();
uploadRouter.use(requireAuthentication);

uploadRouter.post('/presign', async (request, response) => {
  const parsed = createPresignedUploadSchema.safeParse(request.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid upload request');
  return sendSuccess(
    response,
    await createPresignedUpload(requireActor(response.locals.actor), parsed.data),
    'Upload URL created',
  );
});
