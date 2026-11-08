import { isProduction } from './config.ts';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_SERVER_ERROR';

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: any;
}

export interface ApiErrorResponseBody {
  error: ApiErrorDetail;
}

export class AppError extends Error {
  statusCode: number;
  code: ApiErrorCode;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ApiErrorCode = 'INTERNAL_SERVER_ERROR',
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function createApiErrorResponse(
  error: unknown,
  requestId: string,
  overrideStatus?: number
): Response {
  let status = overrideStatus || 500;
  let code: ApiErrorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred.';
  let details: any = undefined;

  if (error instanceof AppError) {
    status = overrideStatus || error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    const errorName = error.name || '';
    const errorMsg = error.message || '';

    if (
      errorName === 'ValidationError' ||
      errorName === 'EnquiryValidationError' ||
      errorMsg.includes('ValidationError')
    ) {
      status = overrideStatus || 400;
      code = 'VALIDATION_ERROR';
      message = error.message;
    } else if (
      errorName === 'NotFoundError' ||
      errorName === 'EnquiryNotFoundError' ||
      errorName === 'StaffNotFoundError' ||
      errorMsg.includes('NotFoundError')
    ) {
      status = overrideStatus || 404;
      code = 'RESOURCE_NOT_FOUND';
      message = error.message;
    } else if (
      errorName === 'DuplicateEmailError' ||
      errorName === 'DuplicateSlugError' ||
      errorName === 'LastSuperAdminError' ||
      errorMsg.includes('Duplicate')
    ) {
      status = overrideStatus || 409;
      code = 'CONFLICT';
      message = error.message;
    } else if (
      errorName === 'SelfDisableError' ||
      errorName === 'SelfEscalationError'
    ) {
      status = overrideStatus || 400;
      code = 'VALIDATION_ERROR';
      message = error.message;
    } else if (/SELECT|INSERT|UPDATE|DELETE|WHERE|FROM/i.test(errorMsg)) {
      status = overrideStatus || 500;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'A database query error occurred.';
    } else {
      message = isProduction() ? 'An internal server error occurred.' : error.message;
    }
  }

  const payload: ApiErrorResponseBody = {
    error: {
      code,
      message,
      requestId,
      ...(details && !isProduction() ? { details } : {}),
    },
  };

  const response = Response.json(payload, { status });
  response.headers.set('x-request-id', requestId);
  return response;
}
