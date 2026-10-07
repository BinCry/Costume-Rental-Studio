import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import { sendError } from '../http/response.js';

type HttpError = Error & {
  status?: number;
  type?: string;
  code?: string;
  meta?: { target?: unknown };
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

  // Prisma errors deliberately remain duck-typed: generated client classes may be duplicated
  // across build/test boundaries, whereas their stable codes are part of Prisma's API.
  if (httpError.code === 'P2002') {
    return new AppError(409, 'DUPLICATE_RECORD', 'A record with this value already exists', {
      target: httpError.meta?.target ?? 'unknown',
    });
  }
  if (httpError.code === 'P2025') {
    return new AppError(404, 'RECORD_NOT_FOUND', 'Requested record was not found');
  }
  if (httpError.code === 'P2003') {
    return new AppError(400, 'INVALID_REFERENCE', 'Referenced record is invalid');
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
