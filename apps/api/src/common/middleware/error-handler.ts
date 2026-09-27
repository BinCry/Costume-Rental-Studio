import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import { sendError } from '../http/response.js';

type HttpError = Error & {
  status?: number;
  type?: string;
};

function normalizeError(error: unknown) {
  const httpError = error as HttpError;

  if (httpError.status === 400 && httpError.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body contains invalid JSON');
  }

  if (httpError.status === 413 && httpError.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  if (error instanceof AppError) {
    return error;
  }

  return new AppError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const normalizedError = normalizeError(error);

  if (normalizedError.statusCode >= 500) {
    request.log.error({ err: error }, 'Unhandled request error');
  } else {
    request.log.warn(
      {
        errorCode: normalizedError.code,
        statusCode: normalizedError.statusCode,
      },
      'Request rejected',
    );
  }

  sendError(
    request,
    response,
    normalizedError.statusCode,
    normalizedError.code,
    normalizedError.message,
    normalizedError.details,
  );
};
