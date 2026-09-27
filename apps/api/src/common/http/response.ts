import type { Request, Response } from 'express';

import type { ErrorDetails } from '../errors/app-error.js';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetails;
  };
  statusCode: number;
  timestamp: string;
  path: string;
  requestId: string;
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  message = 'Operation successful',
  statusCode = 200,
) {
  const body: SuccessResponse<T> = {
    success: true,
    data,
    message,
  };

  return response.status(statusCode).json(body);
}

export function sendError(
  request: Request,
  response: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorDetails,
) {
  const requestId = typeof request.id === 'string' ? request.id : 'unknown';

  const body: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    statusCode,
    timestamp: new Date().toISOString(),
    path: `${request.baseUrl}${request.path}`,
    requestId,
  };

  return response.status(statusCode).json(body);
}
